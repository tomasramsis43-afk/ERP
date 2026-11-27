import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dec, roundMoney } from '@erp/accounting-engine';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';
import { AuditService } from '../audit/audit.service';
import { UnitConversionService } from '../catalog/unit-conversion.service';
import { PurchasesService } from '../purchases/purchases.service';
import { PaymentKindDto } from '../sales/dto/sales.dto';
import { CreatePurchaseOrderDto } from './dto/orders.dto';

const INCLUDE = {
  lines: true,
  supplier: { select: { code: true, nameAr: true } },
} satisfies Prisma.PurchaseOrderInclude;

/**
 * Purchase orders. No stock or ledger effect until convert() creates the purchase invoice
 * through PurchasesService, which is the single place that receives stock and posts the entry,
 * so stock is never counted twice for one order.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion: UnitConversionService,
    private readonly purchases: PurchasesService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreatePurchaseOrderDto, user: AuthUser) {
    if (dto.expectedDate && toDate(dto.expectedDate) < toDate(dto.docDate)) {
      throw new BadRequestException('expectedDate cannot be before the document date');
    }
    const [supplier, warehouse] = await Promise.all([
      this.prisma.supplier.findUnique({ where: { id: dto.supplierId } }),
      this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } }),
    ]);
    if (!supplier || !supplier.isActive) throw new BadRequestException('Supplier not found or inactive');
    if (!warehouse || !warehouse.isActive) throw new BadRequestException('Warehouse not found or inactive');

    const lines = [];
    let subtotal = dec('0');
    for (const l of dto.lines) {
      const enteredQty = dec(l.quantity);
      await this.conversion.toBaseQty(l.productId, l.unitId, l.quantity); // validates product + unit
      const product = await this.prisma.product.findUnique({ where: { id: l.productId } });
      if (!product || !product.isActive) throw new BadRequestException('Product not found or inactive');
      const unitPrice = dec(l.unitPrice);
      if (unitPrice.lte(0)) throw new BadRequestException('Price must be greater than zero');
      const lineNet = roundMoney(enteredQty.times(unitPrice));
      subtotal = subtotal.plus(lineNet);
      lines.push({
        productId: l.productId,
        unitId: l.unitId ?? null,
        enteredQty: enteredQty.toString(),
        unitPrice: unitPrice.toString(),
        lineNet: lineNet.toString(),
      });
    }

    const order = await this.prisma.purchaseOrder.create({
      data: {
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        docDate: toDate(dto.docDate),
        expectedDate: dto.expectedDate ? toDate(dto.expectedDate) : null,
        paymentKind: dto.paymentKind,
        subtotal: roundMoney(subtotal).toString(),
        shippingCost: dec(dto.shippingCost ?? '0').toString(),
        note: dto.note ?? null,
        createdById: user.id,
        lines: { create: lines },
      },
      include: INCLUDE,
    });
    await this.audit.record({
      userId: user.id,
      action: 'CREATE_PURCHASE_ORDER',
      entity: 'PurchaseOrder',
      entityId: order.id,
      newData: { number: order.number, subtotal: order.subtotal.toString() },
    });
    return order;
  }

  async confirm(id: string, user: AuthUser) {
    const res = await this.prisma.purchaseOrder.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'CONFIRMED' } });
    if (res.count === 0) {
      await this.get(id);
      throw new ConflictException('Only a draft order can be confirmed');
    }
    await this.audit.record({
      userId: user.id,
      action: 'CONFIRM',
      entity: 'PurchaseOrder',
      entityId: id,
      oldData: { status: 'DRAFT' },
      newData: { status: 'CONFIRMED' },
    });
    return this.get(id);
  }

  async cancel(id: string, reason: string, user: AuthUser) {
    const res = await this.prisma.purchaseOrder.updateMany({
      where: { id, status: { in: ['DRAFT', 'CONFIRMED'] } },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
    if (res.count === 0) {
      await this.get(id);
      throw new ConflictException('Only a draft or confirmed order can be cancelled');
    }
    await this.audit.record({
      userId: user.id,
      action: 'CANCEL',
      entity: 'PurchaseOrder',
      entityId: id,
      newData: { status: 'CANCELLED' },
      reason,
    });
    return this.get(id);
  }

  /** Receives the goods by creating the purchase invoice. Idempotent per order. */
  async convert(id: string, user: AuthUser) {
    const order = await this.get(id);
    if (order.status === 'CONVERTED') throw new ConflictException('Order was already converted');
    if (order.status !== 'CONFIRMED') throw new ConflictException('Only a confirmed order can be converted');

    const invoice = await this.purchases.createInvoice(
      {
        idempotencyKey: `purchase-order-${order.id}`,
        invoiceDate: new Date().toISOString().slice(0, 10),
        supplierId: order.supplierId,
        warehouseId: order.warehouseId,
        paymentKind: order.paymentKind as PaymentKindDto,
        shippingCost: order.shippingCost.toString(),
        note: `#${order.number}${order.note ? ` - ${order.note}` : ''}`,
        lines: order.lines.map((l) => ({
          productId: l.productId,
          unitId: l.unitId ?? undefined,
          quantity: l.enteredQty.toString(),
          unitPrice: l.unitPrice.toString(),
        })),
      },
      user,
    );

    await this.prisma.purchaseOrder.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: { status: 'CONVERTED', invoiceId: invoice.id },
    });
    await this.audit.record({
      userId: user.id,
      action: 'CONVERT_TO_INVOICE',
      entity: 'PurchaseOrder',
      entityId: id,
      oldData: { status: 'CONFIRMED' },
      newData: { status: 'CONVERTED', invoiceId: invoice.id },
    });
    return { order: await this.get(id), invoice };
  }

  async list(p: PageParams, f: { status?: string; supplierId?: string; from?: string; to?: string }) {
    const statuses = ['DRAFT', 'CONFIRMED', 'CONVERTED', 'CANCELLED'];
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(f.status && statuses.includes(f.status) ? { status: f.status as Prisma.PurchaseOrderWhereInput['status'] } : {}),
      ...(f.supplierId ? { supplierId: f.supplierId } : {}),
      ...(f.from || f.to
        ? { docDate: { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include: { supplier: { select: { code: true, nameAr: true } } },
        orderBy: { number: 'desc' },
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: INCLUDE });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}
