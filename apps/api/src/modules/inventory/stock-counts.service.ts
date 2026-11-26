import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, dec, roundMoney } from '@erp/accounting-engine';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { JournalPostingService } from '../accounting/journal/journal-posting.service';
import { toDate } from '../accounting/dto/journal.dto';
import { AuditService } from '../audit/audit.service';
import { CreateStockCountDto, SetCountsDto } from './dto/stock-count.dto';
import { StockService } from './stock.service';

/**
 * Physical inventory counts. A count is a worksheet (DRAFT) until it is approved; approval books every
 * difference between the counted quantity and the CURRENT system balance as a stock adjustment, through
 * the same StockService and journal accounts as manual adjustments, inside one transaction.
 */
@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateStockCountDto, actorId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse || !warehouse.isActive) throw new BadRequestException('Warehouse not found or inactive');
    const open = await this.prisma.stockCount.findFirst({ where: { warehouseId: dto.warehouseId, status: 'DRAFT' } });
    if (open) throw new ConflictException(`Warehouse already has an open count (#${open.number})`);

    const balances = await this.prisma.stockBalance.findMany({
      where: { warehouseId: dto.warehouseId, ...(dto.productIds ? { productId: { in: dto.productIds } } : {}) },
    });
    const bal = new Map(balances.map((b) => [b.productId, b.quantity.toString()]));
    let productIds = dto.productIds ? [...new Set(dto.productIds)] : balances.map((b) => b.productId);
    if (dto.productIds) {
      const found = await this.prisma.product.count({ where: { id: { in: productIds } } });
      if (found !== productIds.length) throw new BadRequestException('One or more products do not exist');
    }
    productIds = productIds.sort();

    const created = await this.prisma.stockCount.create({
      data: {
        warehouseId: dto.warehouseId,
        countDate: toDate(dto.countDate),
        note: dto.note,
        createdById: actorId,
        lines: { create: productIds.map((productId) => ({ productId, systemQty: bal.get(productId) ?? '0' })) },
      },
    });
    await this.audit.record({ userId: actorId, action: 'CREATE_STOCK_COUNT', entity: 'StockCount', entityId: created.id, newData: { number: created.number, lines: productIds.length } });
    return this.get(created.id);
  }

  async setCounts(id: string, dto: SetCountsDto, actorId: string) {
    const count = await this.prisma.stockCount.findUnique({ where: { id } });
    if (!count) throw new NotFoundException('Stock count not found');
    if (count.status !== 'DRAFT') throw new ConflictException('Only an open count can be edited');
    const ids = dto.lines.map((l) => l.productId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate product in the count lines');
    const products = await this.prisma.product.count({ where: { id: { in: ids } } });
    if (products !== ids.length) throw new BadRequestException('One or more products do not exist');

    await this.prisma.$transaction(async (tx) => {
      const status = await tx.stockCount.findUniqueOrThrow({ where: { id }, select: { status: true } });
      if (status.status !== 'DRAFT') throw new ConflictException('Only an open count can be edited');
      for (const l of dto.lines) {
        const existing = await tx.stockCountLine.findUnique({ where: { stockCountId_productId: { stockCountId: id, productId: l.productId } } });
        if (existing) {
          await tx.stockCountLine.update({ where: { id: existing.id }, data: { countedQty: l.countedQty } });
        } else {
          const b = await tx.stockBalance.findUnique({ where: { warehouseId_productId: { warehouseId: count.warehouseId, productId: l.productId } } });
          await tx.stockCountLine.create({ data: { stockCountId: id, productId: l.productId, systemQty: b?.quantity.toString() ?? '0', countedQty: l.countedQty } });
        }
      }
    });
    await this.audit.record({ userId: actorId, action: 'COUNT_STOCK_LINES', entity: 'StockCount', entityId: id, newData: { lines: dto.lines.length } });
    return this.get(id);
  }

  async approve(id: string, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // The status flip is the guard against double approval (concurrent requests lose here).
      const flipped = await tx.stockCount.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'APPROVED', approvedById: actorId, approvedAt: new Date() },
      });
      if (flipped.count === 0) {
        const exists = await tx.stockCount.findUnique({ where: { id }, select: { id: true } });
        if (!exists) throw new NotFoundException('Stock count not found');
        throw new ConflictException('Only an open count can be approved');
      }
      const count = await tx.stockCount.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      const counted = count.lines.filter((l) => l.countedQty !== null);
      if (counted.length === 0) throw new BadRequestException('No line has been counted yet');

      await this.stock.lockBalances(tx, counted.map((l) => ({ warehouseId: count.warehouseId, productId: l.productId })));
      let inValue: Decimal = new Decimal(0);
      let outValue: Decimal = new Decimal(0);
      let adjusted = 0;
      for (const l of counted.sort((a, b) => a.productId.localeCompare(b.productId))) {
        const current = await tx.stockBalance.findUnique({ where: { warehouseId_productId: { warehouseId: count.warehouseId, productId: l.productId } } });
        const diff = dec(l.countedQty!.toString()).minus(dec(current?.quantity.toString() ?? '0'));
        if (diff.isZero()) continue;
        const direction = diff.gt(0) ? 'IN' : 'OUT';
        const r = await this.stock.apply(tx, {
          type: direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          direction,
          warehouseId: count.warehouseId,
          productId: l.productId,
          quantity: diff.abs(),
          movementDate: count.countDate,
          source: 'STOCK_COUNT',
          sourceId: id,
          idempotencyKey: `count:${id}:${l.productId}`,
          note: `Stock count #${count.number}`,
          createdById: actorId,
        });
        adjusted++;
        const value = diff.abs().times(r.movement.unitCost.toString());
        if (direction === 'IN') inValue = inValue.plus(value);
        else outValue = outValue.plus(value);
      }
      const acc = await this.accounts.resolve(['INVENTORY', 'INVENTORY_ADJUSTMENT'], tx);
      const inV = roundMoney(inValue);
      const outV = roundMoney(outValue);
      if (inV.gt(0)) {
        await this.posting.post({
          entryDate: count.countDate,
          description: `Stock count #${count.number} surplus`,
          source: 'STOCK_COUNT',
          sourceId: id,
          idempotencyKey: `journal:count:${id}:in`,
          createdById: actorId,
          lines: [
            { accountId: acc.INVENTORY, debit: inV, credit: 0 },
            { accountId: acc.INVENTORY_ADJUSTMENT, debit: 0, credit: inV },
          ],
        }, tx);
      }
      if (outV.gt(0)) {
        await this.posting.post({
          entryDate: count.countDate,
          description: `Stock count #${count.number} shortage`,
          source: 'STOCK_COUNT',
          sourceId: id,
          idempotencyKey: `journal:count:${id}:out`,
          createdById: actorId,
          lines: [
            { accountId: acc.INVENTORY_ADJUSTMENT, debit: outV, credit: 0 },
            { accountId: acc.INVENTORY, debit: 0, credit: outV },
          ],
        }, tx);
      }
      return { number: count.number, adjusted, surplusValue: inV.toFixed(2), shortageValue: outV.toFixed(2) };
    });
    await this.audit.record({ userId: actorId, action: 'APPROVE_STOCK_COUNT', entity: 'StockCount', entityId: id, newData: result });
    return { ...(await this.get(id)), result };
  }

  async cancel(id: string, actorId: string) {
    const r = await this.prisma.stockCount.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'CANCELLED' } });
    if (r.count === 0) {
      const exists = await this.prisma.stockCount.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException('Stock count not found');
      throw new ConflictException('Only an open count can be cancelled');
    }
    await this.audit.record({ userId: actorId, action: 'CANCEL_STOCK_COUNT', entity: 'StockCount', entityId: id });
    return this.get(id);
  }

  async get(id: string) {
    const c = await this.prisma.stockCount.findUnique({
      where: { id },
      include: {
        warehouse: { select: { code: true, nameAr: true, nameEn: true } },
        lines: { include: { product: { select: { code: true, nameAr: true, nameEn: true, avgCost: true } } }, orderBy: { product: { code: 'asc' } } },
      },
    });
    if (!c) throw new NotFoundException('Stock count not found');
    return c;
  }

  async list(p: PageParams, f: { warehouseId?: string; status?: string }) {
    const where: Prisma.StockCountWhereInput = {
      ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
      ...(f.status === 'DRAFT' || f.status === 'APPROVED' || f.status === 'CANCELLED' ? { status: f.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockCount.findMany({
        where,
        include: { warehouse: { select: { code: true, nameAr: true, nameEn: true } }, _count: { select: { lines: true } } },
        orderBy: { number: 'desc' },
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.stockCount.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
}
