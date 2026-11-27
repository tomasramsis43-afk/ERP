import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseDocKind } from '@prisma/client';
import { Decimal, JournalLineInput, dec, reverseLines, roundMoney } from '@erp/accounting-engine';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { PageParams } from '../../common/utils/pagination';
import { VatService } from '../../common/utils/vat.service';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { toDate } from '../accounting/dto/journal.dto';
import { JournalPostingService, Tx } from '../accounting/journal/journal-posting.service';
import { AuditService } from '../audit/audit.service';
import { UnitConversionService } from '../catalog/unit-conversion.service';
import { StockService } from '../inventory/stock.service';
import { CreatePurchaseInvoiceDto } from './dto/purchases.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

interface PricedLine {
  productId: string;
  unitId?: string;
  enteredQty: Decimal;
  baseQty: Decimal;
  unitPrice: Decimal;
  lineNet: Decimal;
}

const INCLUDE = { lines: true, supplier: { select: { code: true, nameAr: true } } } satisfies Prisma.PurchaseInvoiceInclude;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly conversion: UnitConversionService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly vat: VatService,
    private readonly audit: AuditService,
    private readonly orders: PurchaseOrdersService,
  ) {}

  createInvoice(dto: CreatePurchaseInvoiceDto, user: AuthUser) {
    return this.create('PURCHASE', dto, user);
  }

  createReturn(dto: CreatePurchaseInvoiceDto, user: AuthUser) {
    if (dto.shippingCost && Number(dto.shippingCost) > 0) {
      throw new BadRequestException('Shipping cost is not allowed on a purchase return');
    }
    return this.create('RETURN', dto, user);
  }

  /** Concurrent retries with the same key: the loser hits the unique index and gets the winner's document. */
  private async create(kind: PurchaseDocKind, dto: CreatePurchaseInvoiceDto, user: AuthUser) {
    try {
      return await this.createOnce(kind, dto, user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.purchaseInvoice.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: INCLUDE,
        });
        if (existing) return existing;
      }
      throw e;
    }
  }

  private async createOnce(kind: PurchaseDocKind, dto: CreatePurchaseInvoiceDto, user: AuthUser) {
    const date = toDate(dto.invoiceDate);
    const shipping = dec(dto.shippingCost ?? '0');

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseInvoice.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: INCLUDE });
      if (existing) return { invoice: existing, created: false };

      const [warehouse, supplier] = await Promise.all([
        tx.warehouse.findUnique({ where: { id: dto.warehouseId } }),
        tx.supplier.findUnique({ where: { id: dto.supplierId } }),
      ]);
      if (!warehouse || !warehouse.isActive) throw new BadRequestException('Warehouse not found or inactive');
      if (!supplier || !supplier.isActive) throw new BadRequestException('Supplier not found or inactive');

      const priced: PricedLine[] = [];
      for (const l of dto.lines) {
        const product = await tx.product.findUnique({ where: { id: l.productId }, select: { isActive: true } });
        if (!product || !product.isActive) throw new BadRequestException('Product not found or inactive');
        const enteredQty = dec(l.quantity);
        const baseQty = await this.conversion.toBaseQty(l.productId, l.unitId, l.quantity, tx);
        const unitPrice = dec(l.unitPrice);
        priced.push({ productId: l.productId, unitId: l.unitId, enteredQty, baseQty, unitPrice, lineNet: roundMoney(enteredQty.times(unitPrice)) });
      }
      if (dto.purchaseOrderId) await this.checkAgainstOrder(tx, kind, dto, supplier.id, warehouse.id, priced);
      const subtotal = priced.reduce((a, l) => a.plus(l.lineNet), new Decimal(0));
      if (subtotal.lte(0)) throw new BadRequestException('Document total must be greater than zero');
      const vatTotal = this.vat.compute(subtotal, await this.vat.config(tx));
      const total = subtotal.plus(vatTotal);

      const invoice = await tx.purchaseInvoice.create({
        data: {
          kind,
          supplierId: supplier.id,
          warehouseId: warehouse.id,
          invoiceDate: date,
          paymentKind: dto.paymentKind,
          subtotal: subtotal.toFixed(2),
          shippingCost: shipping.toFixed(2),
          vatTotal: vatTotal.toFixed(2),
          total: total.toFixed(2),
          supplierRef: dto.supplierRef,
          idempotencyKey: dto.idempotencyKey,
          purchaseOrderId: dto.purchaseOrderId,
          note: dto.note,
          createdById: user.id,
        },
      });

      await this.stock.lockBalances(tx, priced.map((l) => ({ warehouseId: warehouse.id, productId: l.productId })));
      const rows: Prisma.PurchaseInvoiceLineCreateManyInput[] = [];
      let inventoryValue = new Decimal(0); // value credited to / debited from inventory
      for (const [i, l] of priced.entries()) {
        // Landed cost: shipping is spread over lines in proportion to their value.
        const share = shipping.gt(0) ? shipping.times(l.lineNet).div(subtotal) : new Decimal(0);
        let unitCost: Decimal;
        if (kind === 'PURCHASE') {
          unitCost = l.lineNet.plus(share).div(l.baseQty);
          await this.stock.apply(tx, {
            type: 'PURCHASE_IN',
            direction: 'IN',
            warehouseId: warehouse.id,
            productId: l.productId,
            quantity: l.baseQty,
            unitCost,
            movementDate: date,
            source: 'PURCHASE_INVOICE',
            sourceId: invoice.id,
            idempotencyKey: `pinv:${invoice.id}:${i}`,
            createdById: user.id,
          });
          inventoryValue = inventoryValue.plus(l.lineNet).plus(share);
        } else {
          const r = await this.stock.apply(tx, {
            type: 'PURCHASE_RETURN_OUT',
            direction: 'OUT',
            warehouseId: warehouse.id,
            productId: l.productId,
            quantity: l.baseQty,
            movementDate: date,
            source: 'PURCHASE_INVOICE',
            sourceId: invoice.id,
            idempotencyKey: `pinv:${invoice.id}:${i}`,
            createdById: user.id,
          });
          unitCost = dec(r.movement.unitCost.toString());
          inventoryValue = inventoryValue.plus(l.baseQty.times(unitCost));
        }
        rows.push({
          invoiceId: invoice.id,
          productId: l.productId,
          unitId: l.unitId,
          enteredQty: l.enteredQty.toFixed(4),
          baseQty: l.baseQty.toFixed(4),
          unitPrice: l.unitPrice.toFixed(4),
          lineNet: l.lineNet.toFixed(2),
          unitCost: unitCost.toFixed(4),
        });
      }
      await tx.purchaseInvoiceLine.createMany({ data: rows });
      if (dto.purchaseOrderId) await this.orders.refreshStatus(tx, dto.purchaseOrderId);

      const entry = await this.postJournal(tx, kind, invoice.id, invoice.number, date, dto, {
        subtotal,
        vat: vatTotal,
        total,
        shipping,
        inventoryValue: roundMoney(inventoryValue),
      }, supplier.id, user.id);

      const saved = await tx.purchaseInvoice.update({ where: { id: invoice.id }, data: { journalEntryId: entry.id }, include: INCLUDE });
      return { invoice: saved, created: true };
    });

    if (result.created) {
      await this.audit.record({
        userId: user.id,
        action: kind === 'PURCHASE' ? 'CREATE_PURCHASE' : 'CREATE_PURCHASE_RETURN',
        entity: 'PurchaseInvoice',
        entityId: result.invoice.id,
        newData: { number: result.invoice.number, total: result.invoice.total.toString() },
      });
    }
    return result.invoice;
  }

  /** A receipt must match its order (supplier, warehouse) and never exceed what is still outstanding. */
  private async checkAgainstOrder(tx: Tx, kind: PurchaseDocKind, dto: CreatePurchaseInvoiceDto, supplierId: string, warehouseId: string, priced: PricedLine[]) {
    const orderId = dto.purchaseOrderId!;
    if (kind !== 'PURCHASE') throw new BadRequestException('A purchase return cannot reference a purchase order');
    await this.orders.lock(tx, orderId);
    const order = await tx.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new BadRequestException('Purchase order not found');
    if (order.status === 'CANCELLED' || order.status === 'RECEIVED') throw new ConflictException('Purchase order is not open for receiving');
    if (order.supplierId !== supplierId) throw new BadRequestException('Supplier does not match the purchase order');
    if (order.warehouseId !== warehouseId) throw new BadRequestException('Warehouse does not match the purchase order');
    const remaining = new Map((await this.orders.quantities(tx, orderId)).map((q) => [q.productId, q.remaining]));
    const incoming = new Map<string, Decimal>();
    for (const l of priced) incoming.set(l.productId, (incoming.get(l.productId) ?? new Decimal(0)).plus(l.baseQty));
    for (const [productId, qty] of incoming) {
      const left = remaining.get(productId);
      if (left === undefined) throw new BadRequestException('Product is not on the purchase order');
      if (qty.gt(left)) throw new BadRequestException(`Received quantity exceeds the outstanding order quantity (remaining ${left.toFixed(4)})`);
    }
  }

  async cancel(id: string, reason: string, user: AuthUser) {
    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'POSTED') throw new ConflictException('Document is already cancelled');
      const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
      // Reversing a purchase takes the goods back out; this fails if they were already sold.
      await this.stock.reverseMovements(tx, 'PURCHASE_INVOICE', id, today, user.id, {
        reverseOfIn: 'PURCHASE_RETURN_OUT',
        reverseOfOut: 'PURCHASE_IN',
      });
      if (inv.journalEntryId) {
        const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: inv.journalEntryId }, include: { lines: true } });
        await this.posting.post(
          {
            entryDate: today,
            description: `Cancellation of purchase document #${inv.number}: ${reason}`,
            source: 'PURCHASE_CANCEL',
            sourceId: id,
            idempotencyKey: `cancel:purchase:${id}`,
            reversesId: entry.id,
            createdById: user.id,
            lines: reverseLines(
              entry.lines.map((l) => ({
                accountId: l.accountId,
                debit: l.debit.toString(),
                credit: l.credit.toString(),
                partyType: (l.partyType as 'CUSTOMER' | 'SUPPLIER' | null) ?? undefined,
                partyId: l.partyId ?? undefined,
              })),
            ),
          },
          tx,
        );
      }
      const cancelled = await tx.purchaseInvoice.update({
        where: { id },
        data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() },
        include: INCLUDE,
      });
      // The goods are no longer received: reopen the order's remaining quantities.
      if (inv.purchaseOrderId) {
        await this.orders.lock(tx, inv.purchaseOrderId);
        await this.orders.refreshStatus(tx, inv.purchaseOrderId);
      }
      return cancelled;
    });
    await this.audit.record({
      userId: user.id,
      action: 'CANCEL',
      entity: 'PurchaseInvoice',
      entityId: id,
      oldData: { status: 'POSTED' },
      newData: { status: 'CANCELLED' },
      reason,
    });
    return invoice;
  }

  async list(p: PageParams, f: { kind?: PurchaseDocKind; supplierId?: string; status?: string; from?: string; to?: string }) {
    const where: Prisma.PurchaseInvoiceWhereInput = {
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.supplierId ? { supplierId: f.supplierId } : {}),
      ...(f.status === 'POSTED' || f.status === 'CANCELLED' ? { status: f.status } : {}),
      ...(f.from || f.to
        ? { invoiceDate: { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.findMany({
        where,
        include: { supplier: { select: { code: true, nameAr: true } } },
        orderBy: { number: 'desc' },
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const inv = await this.prisma.purchaseInvoice.findUnique({ where: { id }, include: INCLUDE });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  private async postJournal(
    tx: Tx,
    kind: PurchaseDocKind,
    invoiceId: string,
    number: number,
    date: Date,
    dto: CreatePurchaseInvoiceDto,
    a: { subtotal: Decimal; vat: Decimal; total: Decimal; shipping: Decimal; inventoryValue: Decimal },
    supplierId: string,
    actorId: string,
  ) {
    const acc = await this.accounts.resolve(
      ['CASH', 'PAYABLES', 'INVENTORY', 'VAT_RECEIVABLE', 'INVENTORY_ADJUSTMENT'],
      tx,
    );
    const credit = dto.paymentKind === 'CREDIT';
    const settle = credit ? acc.PAYABLES : acc.CASH;
    const party = credit ? { partyType: 'SUPPLIER' as const, partyId: supplierId } : {};
    const lines: JournalLineInput[] = [];

    if (kind === 'PURCHASE') {
      lines.push({ accountId: acc.INVENTORY, debit: a.inventoryValue, credit: 0 });
      if (a.vat.gt(0)) lines.push({ accountId: acc.VAT_RECEIVABLE, debit: a.vat, credit: 0 });
      lines.push({ accountId: settle, debit: 0, credit: a.total, ...party });
      if (a.shipping.gt(0)) lines.push({ accountId: acc.CASH, debit: 0, credit: a.shipping });
    } else {
      // Supplier credit at the invoice price; inventory leaves at cost; the gap is booked as an adjustment.
      lines.push({ accountId: settle, debit: a.total, credit: 0, ...party });
      lines.push({ accountId: acc.INVENTORY, debit: 0, credit: a.inventoryValue });
      if (a.vat.gt(0)) lines.push({ accountId: acc.VAT_RECEIVABLE, debit: 0, credit: a.vat });
      const gap = roundMoney(a.subtotal.minus(a.inventoryValue));
      if (gap.gt(0)) lines.push({ accountId: acc.INVENTORY_ADJUSTMENT, debit: 0, credit: gap });
      if (gap.lt(0)) lines.push({ accountId: acc.INVENTORY_ADJUSTMENT, debit: gap.abs(), credit: 0 });
    }

    const { entry } = await this.posting.post(
      {
        entryDate: date,
        description: `${kind === 'PURCHASE' ? 'Purchase invoice' : 'Purchase return'} #${number}`,
        source: kind === 'PURCHASE' ? 'PURCHASE_INVOICE' : 'PURCHASE_RETURN',
        sourceId: invoiceId,
        idempotencyKey: `journal:purchase:${invoiceId}`,
        createdById: actorId,
        lines,
      },
      tx,
    );
    return entry;
  }
}
