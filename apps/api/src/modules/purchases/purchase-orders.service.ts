import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, dec, roundMoney } from '@erp/accounting-engine';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';
import { AuditService } from '../audit/audit.service';
import { UnitConversionService } from '../catalog/unit-conversion.service';
import { CreatePurchaseOrderDto } from './dto/purchases.dto';

type Tx = Prisma.TransactionClient;

/** Purchase orders: a commitment to buy. Receipt is recorded by purchase invoices that reference the order. */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion: UnitConversionService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreatePurchaseOrderDto, user: AuthUser) {
    const [warehouse, supplier] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } }),
      this.prisma.supplier.findUnique({ where: { id: dto.supplierId } }),
    ]);
    if (!warehouse || !warehouse.isActive) throw new BadRequestException('Warehouse not found or inactive');
    if (!supplier || !supplier.isActive) throw new BadRequestException('Supplier not found or inactive');
    const orderDate = toDate(dto.orderDate);
    const expectedDate = dto.expectedDate ? toDate(dto.expectedDate) : null;
    if (expectedDate && expectedDate < orderDate) throw new BadRequestException('Expected date cannot be before the order date');

    const order = await this.prisma.$transaction(async (tx) => {
      const rows: Prisma.PurchaseOrderLineCreateManyPurchaseOrderInput[] = [];
      let subtotal = new Decimal(0);
      for (const l of dto.lines) {
        const product = await tx.product.findUnique({ where: { id: l.productId }, select: { isActive: true } });
        if (!product || !product.isActive) throw new BadRequestException('Product not found or inactive');
        const enteredQty = dec(l.quantity);
        const baseQty = await this.conversion.toBaseQty(l.productId, l.unitId, l.quantity, tx);
        const unitPrice = dec(l.unitPrice);
        const lineNet = roundMoney(enteredQty.times(unitPrice));
        subtotal = subtotal.plus(lineNet);
        rows.push({ productId: l.productId, unitId: l.unitId, enteredQty: enteredQty.toFixed(4), baseQty: baseQty.toFixed(4), unitPrice: unitPrice.toFixed(4), lineNet: lineNet.toFixed(2) });
      }
      return tx.purchaseOrder.create({
        data: { supplierId: supplier.id, warehouseId: warehouse.id, orderDate, expectedDate, subtotal: subtotal.toFixed(2), note: dto.note, createdById: user.id, lines: { create: rows } },
      });
    });
    await this.audit.record({ userId: user.id, action: 'CREATE_PURCHASE_ORDER', entity: 'PurchaseOrder', entityId: order.id, newData: { number: order.number, subtotal: order.subtotal.toString() } });
    return this.get(order.id);
  }

  async cancel(id: string, reason: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Purchase order not found');
      if (order.status !== 'OPEN') throw new ConflictException('Only an order with no receipts can be cancelled');
      await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
    });
    await this.audit.record({ userId: user.id, action: 'CANCEL_PURCHASE_ORDER', entity: 'PurchaseOrder', entityId: id, reason });
    return this.get(id);
  }

  /** Row lock so two concurrent receipts cannot both pass the remaining-quantity check. */
  async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE`;
  }

  /** Ordered / received / remaining per product (base units). Received comes only from POSTED purchase invoices. */
  async quantities(tx: Tx, orderId: string) {
    const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: orderId } });
    const received = await tx.purchaseInvoiceLine.groupBy({
      by: ['productId'],
      where: { invoice: { purchaseOrderId: orderId, status: 'POSTED', kind: 'PURCHASE' } },
      _sum: { baseQty: true },
    });
    const recv = new Map(received.map((r) => [r.productId, dec(r._sum.baseQty?.toString() ?? '0')]));
    const ordered = new Map<string, Decimal>();
    for (const l of lines) ordered.set(l.productId, (ordered.get(l.productId) ?? new Decimal(0)).plus(dec(l.baseQty.toString())));
    return [...ordered.entries()].map(([productId, o]) => {
      const r = recv.get(productId) ?? new Decimal(0);
      return { productId, ordered: o, received: r, remaining: Decimal.max(o.minus(r), 0) };
    });
  }

  /** Recomputes OPEN / PARTIALLY_RECEIVED / RECEIVED from the posted receipts. Cancelled orders are untouched. */
  async refreshStatus(tx: Tx, orderId: string) {
    const order = await tx.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status === 'CANCELLED') return;
    const q = await this.quantities(tx, orderId);
    const any = q.some((l) => l.received.gt(0));
    const full = q.every((l) => l.remaining.isZero());
    const status = full ? 'RECEIVED' : any ? 'PARTIALLY_RECEIVED' : 'OPEN';
    if (status !== order.status) await tx.purchaseOrder.update({ where: { id: orderId }, data: { status } });
  }

  async get(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { code: true, nameAr: true } },
        warehouse: { select: { code: true, nameAr: true, nameEn: true } },
        lines: { include: { product: { select: { code: true, nameAr: true, nameEn: true } } } },
        invoices: { select: { id: true, number: true, invoiceDate: true, status: true, total: true }, orderBy: { number: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    const q = await this.quantities(this.prisma, id);
    return {
      ...order,
      progress: q.map((l) => ({ productId: l.productId, ordered: l.ordered.toFixed(4), received: l.received.toFixed(4), remaining: l.remaining.toFixed(4) })),
    };
  }

  async list(p: PageParams, f: { supplierId?: string; status?: string }) {
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(f.supplierId ? { supplierId: f.supplierId } : {}),
      ...(['OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].includes(f.status ?? '') ? { status: f.status as never } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include: { supplier: { select: { code: true, nameAr: true } }, warehouse: { select: { code: true, nameAr: true, nameEn: true } }, _count: { select: { lines: true } } },
        orderBy: { number: 'desc' },
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
}
