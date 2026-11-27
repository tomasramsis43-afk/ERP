import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, dec, roundMoney } from '@erp/accounting-engine';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';
import { AuditService } from '../audit/audit.service';
import { UnitConversionService } from '../catalog/unit-conversion.service';
import { CreateSalesOrderDto } from './dto/sales.dto';

type Tx = Prisma.TransactionClient;

/**
 * Quotations and sales orders. They commit nothing: no stock, no money, no customer balance. Goods leave
 * through a sales invoice that references a confirmed ORDER; the invoiced quantity is always derived from the
 * POSTED invoices, so cancelling an invoice automatically reopens the order.
 */
@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion: UnitConversionService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSalesOrderDto, user: AuthUser) {
    const [warehouse, customer] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } }),
      this.prisma.customer.findUnique({ where: { id: dto.customerId } }),
    ]);
    if (!warehouse || !warehouse.isActive) throw new BadRequestException('Warehouse not found or inactive');
    if (!customer || !customer.isActive) throw new BadRequestException('Customer not found or inactive');
    const docDate = toDate(dto.docDate);
    const validUntil = dto.validUntil ? toDate(dto.validUntil) : null;
    if (validUntil && validUntil < docDate) throw new BadRequestException('Valid-until date cannot be before the document date');

    const order = await this.prisma.$transaction(async (tx) => {
      const rows: Prisma.SalesOrderLineCreateManySalesOrderInput[] = [];
      let subtotal = new Decimal(0);
      for (const l of dto.lines) {
        const product = await tx.product.findUnique({ where: { id: l.productId } });
        if (!product || !product.isActive) throw new BadRequestException('Product not found or inactive');
        const enteredQty = dec(l.quantity);
        const baseQty = await this.conversion.toBaseQty(l.productId, l.unitId, l.quantity, tx);
        let unitPrice: Decimal;
        if (l.unitPrice !== undefined) unitPrice = dec(l.unitPrice);
        else {
          const special = await tx.customerPrice.findUnique({ where: { customerId_productId: { customerId: customer.id, productId: l.productId } } });
          unitPrice = dec((special?.price ?? product.retailPrice).toString()).times(baseQty.div(enteredQty));
        }
        const gross = enteredQty.times(unitPrice);
        const discount = dec(l.discount ?? '0');
        if (discount.gt(gross)) throw new BadRequestException('Discount cannot exceed the line amount');
        if (unitPrice.lte(0)) throw new BadRequestException('Price must be greater than zero');
        const lineNet = roundMoney(gross.minus(discount));
        subtotal = subtotal.plus(lineNet);
        rows.push({ productId: l.productId, unitId: l.unitId, enteredQty: enteredQty.toFixed(4), baseQty: baseQty.toFixed(4), unitPrice: unitPrice.toFixed(4), discount: discount.toFixed(2), lineNet: lineNet.toFixed(2) });
      }
      return tx.salesOrder.create({
        data: { kind: dto.kind, customerId: customer.id, warehouseId: warehouse.id, docDate, validUntil, subtotal: subtotal.toFixed(2), note: dto.note, createdById: user.id, lines: { create: rows } },
      });
    });
    await this.audit.record({ userId: user.id, action: dto.kind === 'ORDER' ? 'CREATE_SALES_ORDER' : 'CREATE_QUOTATION', entity: 'SalesOrder', entityId: order.id, newData: { number: order.number, subtotal: order.subtotal.toString() } });
    return this.get(order.id);
  }

  /** The customer accepted the quotation: it becomes an order that invoices can reference. */
  async confirm(id: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const o = await tx.salesOrder.findUnique({ where: { id } });
      if (!o) throw new NotFoundException('Document not found');
      if (o.kind !== 'QUOTATION') throw new ConflictException('Only a quotation can be confirmed');
      if (o.status !== 'OPEN') throw new ConflictException('Only an open quotation can be confirmed');
      const today = toDate(new Date().toISOString().slice(0, 10));
      if (o.validUntil && o.validUntil < today) throw new ConflictException('The quotation has expired');
      await tx.salesOrder.update({ where: { id }, data: { kind: 'ORDER' } });
    });
    await this.audit.record({ userId: user.id, action: 'CONFIRM_QUOTATION', entity: 'SalesOrder', entityId: id, oldData: { kind: 'QUOTATION' }, newData: { kind: 'ORDER' } });
    return this.get(id);
  }

  async cancel(id: string, reason: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const o = await tx.salesOrder.findUnique({ where: { id } });
      if (!o) throw new NotFoundException('Document not found');
      if (o.status !== 'OPEN') throw new ConflictException('Only a document with no invoices can be cancelled');
      await tx.salesOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
    });
    await this.audit.record({ userId: user.id, action: 'CANCEL_SALES_ORDER', entity: 'SalesOrder', entityId: id, reason });
    return this.get(id);
  }

  /** Row lock so two concurrent invoices cannot both pass the remaining-quantity check. */
  async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "SalesOrder" WHERE "id" = ${id} FOR UPDATE`;
  }

  async quantities(tx: Tx, orderId: string) {
    const lines = await tx.salesOrderLine.findMany({ where: { salesOrderId: orderId } });
    const done = await tx.salesInvoiceLine.groupBy({
      by: ['productId'],
      where: { invoice: { salesOrderId: orderId, status: 'POSTED', kind: 'SALE' } },
      _sum: { baseQty: true },
    });
    const invoiced = new Map(done.map((r) => [r.productId, dec(r._sum.baseQty?.toString() ?? '0')]));
    const ordered = new Map<string, Decimal>();
    for (const l of lines) ordered.set(l.productId, (ordered.get(l.productId) ?? new Decimal(0)).plus(dec(l.baseQty.toString())));
    return [...ordered.entries()].map(([productId, o]) => {
      const r = invoiced.get(productId) ?? new Decimal(0);
      return { productId, ordered: o, invoiced: r, remaining: Decimal.max(o.minus(r), 0) };
    });
  }

  async refreshStatus(tx: Tx, orderId: string) {
    const order = await tx.salesOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status === 'CANCELLED') return;
    const q = await this.quantities(tx, orderId);
    const any = q.some((l) => l.invoiced.gt(0));
    const full = q.every((l) => l.remaining.isZero());
    const status = full ? 'INVOICED' : any ? 'PARTIALLY_INVOICED' : 'OPEN';
    if (status !== order.status) await tx.salesOrder.update({ where: { id: orderId }, data: { status } });
  }

  async get(id: string) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: { select: { code: true, nameAr: true } },
        warehouse: { select: { code: true, nameAr: true, nameEn: true } },
        lines: { include: { product: { select: { code: true, nameAr: true, nameEn: true } } } },
        invoices: { select: { id: true, number: true, invoiceDate: true, status: true, total: true }, orderBy: { number: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Document not found');
    const q = await this.quantities(this.prisma, id);
    return {
      ...order,
      progress: q.map((l) => ({ productId: l.productId, ordered: l.ordered.toFixed(4), invoiced: l.invoiced.toFixed(4), remaining: l.remaining.toFixed(4) })),
    };
  }

  async list(p: PageParams, f: { customerId?: string; status?: string; kind?: string }) {
    const where: Prisma.SalesOrderWhereInput = {
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.kind === 'QUOTATION' || f.kind === 'ORDER' ? { kind: f.kind } : {}),
      ...(['OPEN', 'PARTIALLY_INVOICED', 'INVOICED', 'CANCELLED'].includes(f.status ?? '') ? { status: f.status as never } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include: { customer: { select: { code: true, nameAr: true } }, warehouse: { select: { code: true, nameAr: true, nameEn: true } }, _count: { select: { lines: true } } },
        orderBy: { number: 'desc' },
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
}
