import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, dec, roundMoney } from '@erp/accounting-engine';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { JournalPostingService } from '../accounting/journal/journal-posting.service';
import { toDate } from '../accounting/dto/journal.dto';
import { AuditService } from '../audit/audit.service';
import { UnitConversionService } from '../catalog/unit-conversion.service';
import { AdjustmentDto, OpeningStockDto, StockLineDto, TransferDto } from './dto/inventory.dto';
import { StockService } from './stock.service';

interface ResolvedLine {
  productId: string;
  qty: Decimal; // base units
  unitCost?: Decimal; // per base unit
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly conversion: UnitConversionService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Warehouse-to-warehouse transfer. Loading a vehicle is a transfer, never a sale:
   * only the balance-sheet classification changes (Inventory -> Vehicle Stock) and
   * nothing touches revenue or cost of goods sold.
   */
  async transfer(dto: TransferDto, actorId: string) {
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException('Source and destination must differ');
    const date = toDate(dto.date);
    const key = dto.idempotencyKey ? `transfer:${dto.idempotencyKey}` : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      if (key) {
        const existing = await tx.stockTransfer.findUnique({ where: { idempotencyKey: key }, include: { lines: true } });
        if (existing) return { transfer: existing, created: false };
      }
      const [from, to] = await Promise.all([
        tx.warehouse.findUnique({ where: { id: dto.fromWarehouseId } }),
        tx.warehouse.findUnique({ where: { id: dto.toWarehouseId } }),
      ]);
      if (!from || !to) throw new BadRequestException('Warehouse not found');

      const lines = await this.resolveLines(tx, dto.lines);
      await this.stock.lockBalances(
        tx,
        lines.flatMap((l) => [
          { warehouseId: from.id, productId: l.productId },
          { warehouseId: to.id, productId: l.productId },
        ]),
      );

      const transfer = await tx.stockTransfer.create({
        data: {
          fromWarehouseId: from.id,
          toWarehouseId: to.id,
          transferDate: date,
          note: dto.note,
          idempotencyKey: key,
          createdById: actorId,
          lines: { create: [] },
        },
      });

      let valueMoved = new Decimal(0);
      for (const l of lines) {
        const out = await this.stock.apply(tx, {
          type: 'TRANSFER_OUT',
          direction: 'OUT',
          warehouseId: from.id,
          productId: l.productId,
          quantity: l.qty,
          movementDate: date,
          source: 'TRANSFER',
          sourceId: transfer.id,
          createdById: actorId,
        });
        const cost = dec(out.movement.unitCost.toString());
        await this.stock.apply(tx, {
          type: 'TRANSFER_IN',
          direction: 'IN',
          warehouseId: to.id,
          productId: l.productId,
          quantity: l.qty,
          unitCost: cost,
          movementDate: date,
          source: 'TRANSFER',
          sourceId: transfer.id,
          createdById: actorId,
        });
        await tx.stockTransferLine.create({
          data: { transferId: transfer.id, productId: l.productId, quantity: l.qty.toFixed(4), unitCost: cost.toFixed(4) },
        });
        valueMoved = valueMoved.plus(l.qty.times(cost));
      }

      // Reclassify only when stock crosses the main-stock / vehicle-stock boundary.
      const fromVehicle = from.type === 'VEHICLE';
      const toVehicle = to.type === 'VEHICLE';
      const value = roundMoney(valueMoved);
      if (fromVehicle !== toVehicle && value.gt(0)) {
        const acc = await this.accounts.resolve(['INVENTORY', 'VEHICLE_STOCK'], tx);
        await this.posting.post(
          {
            entryDate: date,
            description: `Stock transfer #${transfer.number}: ${from.code} -> ${to.code}`,
            source: 'STOCK_TRANSFER',
            sourceId: transfer.id,
            idempotencyKey: `journal:transfer:${transfer.id}`,
            createdById: actorId,
            lines: toVehicle
              ? [
                  { accountId: acc.VEHICLE_STOCK, debit: value, credit: 0 },
                  { accountId: acc.INVENTORY, debit: 0, credit: value },
                ]
              : [
                  { accountId: acc.INVENTORY, debit: value, credit: 0 },
                  { accountId: acc.VEHICLE_STOCK, debit: 0, credit: value },
                ],
          },
          tx,
        );
      }
      return { transfer: await tx.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: { lines: true } }), created: true };
    });

    if (result.created) {
      await this.audit.record({
        userId: actorId,
        action: 'TRANSFER',
        entity: 'StockTransfer',
        entityId: result.transfer.id,
        newData: { number: result.transfer.number, from: dto.fromWarehouseId, to: dto.toWarehouseId },
      });
    }
    return result.transfer;
  }

  /** Opening stock: Dr Inventory / Cr Opening Balance Equity at the stated cost. */
  async openingStock(dto: OpeningStockDto, actorId: string) {
    const date = toDate(dto.date);
    const key = dto.idempotencyKey ? `opening:${dto.idempotencyKey}` : undefined;
    const result = await this.prisma.$transaction(async (tx) => {
      const lines = await this.resolveLines(tx, dto.lines, true);
      await this.stock.lockBalances(tx, lines.map((l) => ({ warehouseId: dto.warehouseId, productId: l.productId })));
      let total = new Decimal(0);
      let created = false;
      for (const [i, l] of lines.entries()) {
        const r = await this.stock.apply(tx, {
          type: 'OPENING',
          direction: 'IN',
          warehouseId: dto.warehouseId,
          productId: l.productId,
          quantity: l.qty,
          unitCost: l.unitCost,
          movementDate: date,
          source: 'OPENING_STOCK',
          idempotencyKey: key ? `${key}:${i}` : undefined,
          note: dto.note,
          createdById: actorId,
        });
        if (r.created) {
          created = true;
          total = total.plus(l.qty.times(l.unitCost ?? 0));
        }
      }
      const value = roundMoney(total);
      if (value.gt(0)) {
        const acc = await this.accounts.resolve(['INVENTORY', 'OPENING_EQUITY'], tx);
        await this.posting.post(
          {
            entryDate: date,
            description: 'Opening stock',
            source: 'OPENING_STOCK',
            idempotencyKey: key ? `journal:${key}` : undefined,
            createdById: actorId,
            lines: [
              { accountId: acc.INVENTORY, debit: value, credit: 0 },
              { accountId: acc.OPENING_EQUITY, debit: 0, credit: value },
            ],
          },
          tx,
        );
      }
      return { created, value: value.toFixed(2) };
    });
    if (result.created) {
      await this.audit.record({
        userId: actorId,
        action: 'OPENING_STOCK',
        entity: 'Warehouse',
        entityId: dto.warehouseId,
        newData: { value: result.value, lines: dto.lines.length },
      });
    }
    return result;
  }

  /** Stock-take correction with a mandatory reason; valued at average cost. */
  async adjust(dto: AdjustmentDto, actorId: string) {
    const date = toDate(dto.date);
    const key = dto.idempotencyKey ? `adjust:${dto.idempotencyKey}` : undefined;
    const direction = dto.direction;
    const result = await this.prisma.$transaction(async (tx) => {
      const lines = await this.resolveLines(tx, dto.lines);
      await this.stock.lockBalances(tx, lines.map((l) => ({ warehouseId: dto.warehouseId, productId: l.productId })));
      let total = new Decimal(0);
      let created = false;
      for (const [i, l] of lines.entries()) {
        const r = await this.stock.apply(tx, {
          type: direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          direction,
          warehouseId: dto.warehouseId,
          productId: l.productId,
          quantity: l.qty,
          movementDate: date,
          source: 'ADJUSTMENT',
          idempotencyKey: key ? `${key}:${i}` : undefined,
          note: dto.reason,
          createdById: actorId,
        });
        if (r.created) {
          created = true;
          total = total.plus(l.qty.times(r.movement.unitCost.toString()));
        }
      }
      const value = roundMoney(total);
      if (value.gt(0)) {
        const acc = await this.accounts.resolve(['INVENTORY', 'INVENTORY_ADJUSTMENT'], tx);
        await this.posting.post(
          {
            entryDate: date,
            description: `Inventory adjustment (${direction}): ${dto.reason}`,
            source: 'STOCK_ADJUSTMENT',
            idempotencyKey: key ? `journal:${key}` : undefined,
            createdById: actorId,
            lines:
              direction === 'IN'
                ? [
                    { accountId: acc.INVENTORY, debit: value, credit: 0 },
                    { accountId: acc.INVENTORY_ADJUSTMENT, debit: 0, credit: value },
                  ]
                : [
                    { accountId: acc.INVENTORY_ADJUSTMENT, debit: value, credit: 0 },
                    { accountId: acc.INVENTORY, debit: 0, credit: value },
                  ],
          },
          tx,
        );
      }
      return { created, value: value.toFixed(2) };
    });
    if (result.created) {
      await this.audit.record({
        userId: actorId,
        action: 'ADJUST_STOCK',
        entity: 'Warehouse',
        entityId: dto.warehouseId,
        newData: { direction, value: result.value },
        reason: dto.reason,
      });
    }
    return result;
  }

  async balances(p: PageParams, f: { warehouseId?: string; productId?: string; lowOnly?: boolean }) {
    const where: Prisma.StockBalanceWhereInput = {
      ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
      ...(f.productId ? { productId: f.productId } : {}),
    };
    // Low-stock filtering compares against each product's reorder level, so it is done in SQL.
    if (f.lowOnly) {
      const rows = await this.prisma.$queryRaw<{ warehouseId: string; productId: string }[]>`
        SELECT b."warehouseId", b."productId" FROM "StockBalance" b
        JOIN "Product" p ON p."id" = b."productId"
        WHERE p."isActive" AND p."reorderLevel" > 0 AND b."quantity" <= p."reorderLevel"
          ${f.warehouseId ? Prisma.sql`AND b."warehouseId" = ${f.warehouseId}` : Prisma.empty}
        ORDER BY b."quantity" ASC LIMIT ${p.pageSize} OFFSET ${p.skip}`;
      const items = await this.prisma.stockBalance.findMany({
        where: { OR: rows.map((r) => ({ warehouseId: r.warehouseId, productId: r.productId })) },
        include: { product: { select: { code: true, nameAr: true, nameEn: true, reorderLevel: true } }, warehouse: { select: { code: true } } },
      });
      return { items, page: p.page, pageSize: p.pageSize };
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockBalance.findMany({
        where,
        include: { product: { select: { code: true, nameAr: true, nameEn: true, avgCost: true } }, warehouse: { select: { code: true } } },
        orderBy: [{ warehouseId: 'asc' }, { productId: 'asc' }],
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.stockBalance.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async movements(p: PageParams, f: { warehouseId?: string; productId?: string; from?: string; to?: string }) {
    const where: Prisma.StockMovementWhereInput = {
      ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
      ...(f.productId ? { productId: f.productId } : {}),
      ...(f.from || f.to
        ? { movementDate: { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { code: true, nameAr: true, nameEn: true } },
          warehouse: { select: { code: true, nameAr: true, nameEn: true } },
        },
        orderBy: { number: 'desc' },
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  private async resolveLines(tx: Prisma.TransactionClient, lines: StockLineDto[], requireCost = false): Promise<ResolvedLine[]> {
    const resolved: ResolvedLine[] = [];
    for (const l of lines) {
      const qty = await this.conversion.toBaseQty(l.productId, l.unitId, l.quantity, tx);
      let unitCost: Decimal | undefined;
      if (l.unitCost !== undefined) {
        // Cost entered per `unitId`; store per base unit.
        unitCost = dec(l.unitCost).times(dec(l.quantity)).div(qty);
      } else if (requireCost) {
        throw new BadRequestException('unitCost is required for opening stock');
      }
      resolved.push({ productId: l.productId, qty, unitCost });
    }
    return resolved;
  }
}
