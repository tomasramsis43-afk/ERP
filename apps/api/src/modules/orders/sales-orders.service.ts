import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SalesOrderKind } from '@prisma/client';
import { dec, roundMoney } from '@erp/accounting-engine';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';
import { AuditService } from '../audit/audit.service';
import { UnitConversionService } from '../catalog/unit-conversion.service';
import { SalesService } from '../sales/sales.service';
import { PaymentKindDto } from '../sales/dto/sales.dto';
import { CreateSalesOrderDto } from './dto/orders.dto';

const INCLUDE = {
  lines: true,
  customer: { select: { code: true, nameAr: true } },
} satisfies Prisma.SalesOrderInclude;

const OPEN_STATUSES = ['DRAFT', 'CONFIRMED'] as const;

/**
 * Quotations and sales orders. These documents never move stock or post to the ledger:
 * only the sales invoice created by convert() does (through SalesService, so credit limits,
 * stock checks, pricing permissions and the accounting entries all apply there).
 */
@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion: UnitConversionService,
    private readonly sales: SalesService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSalesOrderDto, user: AuthUser) {
    if (dto.lines.some((l) => l.discount && Number(l.discount) > 0) && !user.permissions.includes('sales:discount')) {
      throw new ForbiddenException('Discounts require sales:discount');
    }
    if (dto.validUntil && toDate(dto.validUntil) < toDate(dto.docDate)) {
      throw new BadRequestException('validUntil cannot be before the document date');
    }

    const [customer, warehouse] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: dto.customerId } }),
      this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } }),
    ]);
    if (!customer || !customer.isActive) throw new BadRequestException('Customer not found or inactive');
    if (!warehouse || !warehouse.isActive) throw new BadRequestException('Warehouse not found or inactive');

    const priced = [];
    let subtotal = dec('0');
    let discountTotal = dec('0');
    for (const l of dto.lines) {
      const enteredQty = dec(l.quantity);
      const baseQty = await this.conversion.toBaseQty(l.productId, l.unitId, l.quantity);
      const factor = baseQty.div(enteredQty);

      const product = await this.prisma.product.findUnique({ where: { id: l.productId } });
      if (!product || !product.isActive) throw new BadRequestException('Product not found or inactive');
      const special = await this.prisma.customerPrice.findUnique({
        where: { customerId_productId: { customerId: dto.customerId, productId: l.productId } },
      });
      const baseDefault = special?.price ?? (dto.priceList === 'WHOLESALE' ? product.wholesalePrice : product.retailPrice);
      const defaultPrice = dec(baseDefault.toString()).times(factor);

      let unitPrice = defaultPrice;
      if (l.unitPrice !== undefined) {
        unitPrice = dec(l.unitPrice);
        if (!unitPrice.eq(defaultPrice) && !user.permissions.includes('sales:edit_price')) {
          throw new ForbiddenException('Changing prices requires sales:edit_price');
        }
      }
      if (unitPrice.lte(0)) throw new BadRequestException('Price must be greater than zero');

      const gross = roundMoney(enteredQty.times(unitPrice));
      const discount = dec(l.discount ?? '0');
      if (discount.gt(gross)) throw new BadRequestException('Discount cannot exceed the line amount');
      subtotal = subtotal.plus(gross);
      discountTotal = discountTotal.plus(discount);
      priced.push({
        productId: l.productId,
        unitId: l.unitId ?? null,
        enteredQty: enteredQty.toString(),
        unitPrice: unitPrice.toString(),
        discount: discount.toString(),
        lineNet: roundMoney(gross.minus(discount)).toString(),
      });
    }

    const order = await this.prisma.salesOrder.create({
      data: {
        kind: dto.kind as SalesOrderKind,
        customerId: dto.customerId,
        warehouseId: dto.warehouseId,
        representativeId: dto.representativeId ?? null,
        docDate: toDate(dto.docDate),
        validUntil: dto.validUntil ? toDate(dto.validUntil) : null,
        paymentKind: dto.paymentKind,
        subtotal: roundMoney(subtotal).toString(),
        discountTotal: roundMoney(discountTotal).toString(),
        total: roundMoney(subtotal.minus(discountTotal)).toString(),
        note: dto.note ?? null,
        createdById: user.id,
        lines: { create: priced },
      },
      include: INCLUDE,
    });
    await this.audit.record({
      userId: user.id,
      action: dto.kind === 'QUOTE' ? 'CREATE_QUOTE' : 'CREATE_SALES_ORDER',
      entity: 'SalesOrder',
      entityId: order.id,
      newData: { number: order.number, total: order.total.toString() },
    });
    return order;
  }

  async confirm(id: string, user: AuthUser) {
    const res = await this.prisma.salesOrder.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'CONFIRMED' } });
    if (res.count === 0) {
      await this.get(id); // 404 when missing
      throw new ConflictException('Only a draft document can be confirmed');
    }
    await this.audit.record({
      userId: user.id,
      action: 'CONFIRM',
      entity: 'SalesOrder',
      entityId: id,
      oldData: { status: 'DRAFT' },
      newData: { status: 'CONFIRMED' },
    });
    return this.get(id);
  }

  async cancel(id: string, reason: string, user: AuthUser) {
    const res = await this.prisma.salesOrder.updateMany({
      where: { id, status: { in: [...OPEN_STATUSES] } },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
    if (res.count === 0) {
      await this.get(id);
      throw new ConflictException('Only a draft or confirmed document can be cancelled');
    }
    await this.audit.record({
      userId: user.id,
      action: 'CANCEL',
      entity: 'SalesOrder',
      entityId: id,
      newData: { status: 'CANCELLED' },
      reason,
    });
    return this.get(id);
  }

  /**
   * Turns a confirmed document into a posted sales invoice. The invoice idempotency key is derived
   * from the document id, so a retry or a double click can never create a second invoice.
   */
  async convert(id: string, user: AuthUser) {
    const order = await this.get(id);
    if (order.status === 'CONVERTED') throw new ConflictException('Document was already converted');
    if (order.status !== 'CONFIRMED') throw new ConflictException('Only a confirmed document can be converted');
    const today = new Date().toISOString().slice(0, 10);
    if (order.validUntil && order.validUntil.toISOString().slice(0, 10) < today) {
      throw new BadRequestException('The quotation has expired');
    }

    const invoice = await this.sales.createInvoice(
      {
        idempotencyKey: `sales-order-${order.id}`,
        invoiceDate: today,
        paymentKind: order.paymentKind as PaymentKindDto,
        customerId: order.customerId,
        warehouseId: order.warehouseId,
        representativeId: order.representativeId ?? undefined,
        note: `#${order.number}${order.note ? ` - ${order.note}` : ''}`,
        lines: order.lines.map((l) => ({
          productId: l.productId,
          unitId: l.unitId ?? undefined,
          quantity: l.enteredQty.toString(),
          unitPrice: l.unitPrice.toString(),
          discount: l.discount.toString(),
        })),
      },
      user,
    );

    await this.prisma.salesOrder.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: { status: 'CONVERTED', invoiceId: invoice.id },
    });
    await this.audit.record({
      userId: user.id,
      action: 'CONVERT_TO_INVOICE',
      entity: 'SalesOrder',
      entityId: id,
      oldData: { status: 'CONFIRMED' },
      newData: { status: 'CONVERTED', invoiceId: invoice.id },
    });
    return { order: await this.get(id), invoice };
  }

  async list(
    p: PageParams,
    f: { kind?: string; status?: string; customerId?: string; from?: string; to?: string },
  ) {
    const kinds = ['QUOTE', 'ORDER'];
    const statuses = ['DRAFT', 'CONFIRMED', 'CONVERTED', 'CANCELLED'];
    const where: Prisma.SalesOrderWhereInput = {
      ...(f.kind && kinds.includes(f.kind) ? { kind: f.kind as SalesOrderKind } : {}),
      ...(f.status && statuses.includes(f.status) ? { status: f.status as Prisma.SalesOrderWhereInput['status'] } : {}),
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.from || f.to
        ? { docDate: { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include: { customer: { select: { code: true, nameAr: true } } },
        orderBy: { number: 'desc' },
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const order = await this.prisma.salesOrder.findUnique({ where: { id }, include: INCLUDE });
    if (!order) throw new NotFoundException('Document not found');
    return order;
  }
}
