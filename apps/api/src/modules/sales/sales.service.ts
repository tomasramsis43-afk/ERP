import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SalesDocKind } from '@prisma/client';
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
import { PartyLedgerService } from '../parties/party-ledger.service';
import { CreateSalesInvoiceDto, CreateSalesReturnDto } from './dto/sales.dto';
import { SalesOrdersService } from './sales-orders.service';

interface PricedLine {
  productId: string;
  unitId?: string;
  enteredQty: Decimal;
  baseQty: Decimal;
  unitPrice: Decimal;
  discount: Decimal;
  lineGross: Decimal;
  lineNet: Decimal;
}

const INCLUDE = { lines: true, customer: { select: { code: true, nameAr: true } } } satisfies Prisma.SalesInvoiceInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly conversion: UnitConversionService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly vat: VatService,
    private readonly parties: PartyLedgerService,
    private readonly audit: AuditService,
    private readonly orders: SalesOrdersService,
  ) {}

  createInvoice(dto: CreateSalesInvoiceDto, user: AuthUser) {
    return this.create('SALE', dto, user);
  }

  createReturn(dto: CreateSalesReturnDto, user: AuthUser) {
    return this.create('RETURN', dto, user);
  }

  /** Concurrent retries with the same key: the loser hits the unique index and gets the winner's document. */
  private async create(kind: SalesDocKind, dto: CreateSalesReturnDto, user: AuthUser) {
    try {
      return await this.createOnce(kind, dto, user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.salesInvoice.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: INCLUDE,
        });
        if (existing) return existing;
      }
      throw e;
    }
  }

  private async createOnce(kind: SalesDocKind, dto: CreateSalesReturnDto, user: AuthUser) {
    this.assertPermissions(dto, user);
    const date = toDate(dto.invoiceDate);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.salesInvoice.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: INCLUDE });
      if (existing) return { invoice: existing, created: false };

      const warehouse = await tx.warehouse.findUnique({ where: { id: dto.warehouseId } });
      if (!warehouse || !warehouse.isActive) throw new BadRequestException('Warehouse not found or inactive');

      const custodyGl = await this.repCustodyAccount(tx, dto, warehouse, user);

      const customer = dto.customerId ? await tx.customer.findUnique({ where: { id: dto.customerId } }) : null;
      if (dto.customerId && (!customer || !customer.isActive)) throw new BadRequestException('Customer not found or inactive');
      if (dto.paymentKind === 'CREDIT' && !customer) throw new BadRequestException('A credit document requires a customer');

      const original = kind === 'RETURN' && dto.originalInvoiceId ? await this.loadOriginal(tx, dto) : null;

      const order = dto.salesOrderId ? await this.loadOrder(tx, kind, dto, customer?.id, warehouse.id) : null;
      const priced = await this.priceLines(tx, dto, customer?.id, user, kind, order?.agreed);
      if (order) await this.checkOrderQuantities(tx, order.id, priced);
      const subtotal = priced.reduce((a, l) => a.plus(l.lineGross), new Decimal(0));
      const discountTotal = priced.reduce((a, l) => a.plus(l.discount), new Decimal(0));
      const net = subtotal.minus(discountTotal);
      const vatCfg = await this.vat.config(tx);
      const vatTotal = this.vat.compute(net, vatCfg);
      const total = net.plus(vatTotal);
      if (total.lte(0)) throw new BadRequestException('Document total must be greater than zero');

      let creditOverride: { balance: Decimal; limit: string } | null = null;
      if (kind === 'SALE' && dto.paymentKind === 'CREDIT' && customer) {
        const balance = await this.parties.balance('CUSTOMER', customer.id, tx);
        const limit = customer.creditLimit.toString();
        if (balance.plus(total).gt(limit)) {
          const msg = `Credit limit exceeded: balance ${balance.toFixed(2)} + ${total.toFixed(2)} > limit ${limit}`;
          if (!user.permissions.includes('sales:override_credit_limit')) throw new BadRequestException(msg);
          if (!dto.creditOverrideReason?.trim()) {
            throw new BadRequestException(`${msg}. Overriding the limit needs a recorded reason (creditOverrideReason)`);
          }
          creditOverride = { balance, limit };
        }
      }

      const invoice = await tx.salesInvoice.create({
        data: {
          kind,
          customerId: customer?.id,
          warehouseId: warehouse.id,
          invoiceDate: date,
          paymentKind: dto.paymentKind,
          subtotal: roundMoney(subtotal).toFixed(2),
          discountTotal: roundMoney(discountTotal).toFixed(2),
          vatTotal: vatTotal.toFixed(2),
          total: roundMoney(total).toFixed(2),
          originalInvoiceId: original?.id,
          condition: kind === 'RETURN' ? dto.condition ?? 'GOOD' : 'GOOD',
          idempotencyKey: dto.idempotencyKey,
          representativeId: dto.representativeId,
          salesOrderId: dto.salesOrderId,
          note: dto.note,
          createdById: user.id,
        },
      });

      await this.stock.lockBalances(tx, priced.map((l) => ({ warehouseId: warehouse.id, productId: l.productId })));
      let costTotal = new Decimal(0);
      const lineRows: Prisma.SalesInvoiceLineCreateManyInput[] = [];
      for (const [i, l] of priced.entries()) {
        const unitCost = await this.moveStock(tx, kind, invoice, warehouse.id, l, original?.id, user.id, i);
        costTotal = costTotal.plus(l.baseQty.times(unitCost));
        lineRows.push({
          invoiceId: invoice.id,
          productId: l.productId,
          unitId: l.unitId,
          enteredQty: l.enteredQty.toFixed(4),
          baseQty: l.baseQty.toFixed(4),
          unitPrice: l.unitPrice.toFixed(4),
          discount: l.discount.toFixed(2),
          lineNet: roundMoney(l.lineNet).toFixed(2),
          unitCost: unitCost.toFixed(4),
        });
      }
      await tx.salesInvoiceLine.createMany({ data: lineRows });
      if (creditOverride) {
        await tx.creditOverride.create({
          data: {
            invoiceId: invoice.id,
            customerId: customer!.id,
            balanceBefore: roundMoney(creditOverride.balance).toFixed(2),
            invoiceTotal: roundMoney(total).toFixed(2),
            creditLimit: creditOverride.limit,
            reason: dto.creditOverrideReason!.trim(),
            approvedById: user.id,
          },
        });
      }
      if (dto.salesOrderId) await this.orders.refreshStatus(tx, dto.salesOrderId);

      const cost = roundMoney(costTotal);
      const entry = await this.postJournal(tx, kind, invoice.id, invoice.number, date, dto, warehouse.type, custodyGl, {
        net: roundMoney(net),
        vat: vatTotal,
        total: roundMoney(total),
        cost,
      }, customer?.id, user.id);

      const saved = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { costTotal: cost.toFixed(2), journalEntryId: entry.id },
        include: INCLUDE,
      });
      return { invoice: saved, created: true };
    });

    if (result.created) {
      await this.audit.record({
        userId: user.id,
        action: kind === 'SALE' ? 'CREATE_SALE' : 'CREATE_SALE_RETURN',
        entity: 'SalesInvoice',
        entityId: result.invoice.id,
        newData: { number: result.invoice.number, total: result.invoice.total.toString(), paymentKind: dto.paymentKind },
      });
      const override = await this.prisma.creditOverride.findUnique({ where: { invoiceId: result.invoice.id } });
      if (override) {
        await this.audit.record({
          userId: user.id,
          action: 'CREDIT_LIMIT_OVERRIDE',
          entity: 'SalesInvoice',
          entityId: result.invoice.id,
          newData: { balanceBefore: override.balanceBefore.toString(), invoiceTotal: override.invoiceTotal.toString(), creditLimit: override.creditLimit.toString() },
          reason: override.reason,
        });
      }
    }
    return result.invoice;
  }

  async cancel(id: string, reason: string, user: AuthUser) {
    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.salesInvoice.findUnique({ where: { id } });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'POSTED') throw new ConflictException('Document is already cancelled');
      if (inv.kind === 'SALE') {
        const returns = await tx.salesInvoice.count({ where: { originalInvoiceId: id, status: 'POSTED' } });
        if (returns) throw new ConflictException('Cancel the linked returns first');
      }
      const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
      await this.stock.reverseMovements(tx, 'SALES_INVOICE', id, today, user.id, {
        reverseOfIn: 'SALE_OUT',
        reverseOfOut: 'SALE_RETURN_IN',
      });
      if (inv.journalEntryId) {
        const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: inv.journalEntryId }, include: { lines: true } });
        await this.posting.post(
          {
            entryDate: today,
            description: `Cancellation of sales document #${inv.number}: ${reason}`,
            source: 'SALES_CANCEL',
            sourceId: id,
            idempotencyKey: `cancel:sales:${id}`,
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
      const cancelled = await tx.salesInvoice.update({
        where: { id },
        data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() },
        include: INCLUDE,
      });
      // The goods are back: reopen the order's remaining quantities.
      if (inv.salesOrderId) {
        await this.orders.lock(tx, inv.salesOrderId);
        await this.orders.refreshStatus(tx, inv.salesOrderId);
      }
      return cancelled;
    });
    await this.audit.record({
      userId: user.id,
      action: 'CANCEL',
      entity: 'SalesInvoice',
      entityId: id,
      oldData: { status: 'POSTED' },
      newData: { status: 'CANCELLED' },
      reason,
    });
    return invoice;
  }

  async list(p: PageParams, f: { kind?: SalesDocKind; customerId?: string; status?: string; from?: string; to?: string; representativeId?: string }) {
    const where: Prisma.SalesInvoiceWhereInput = {
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.representativeId ? { representativeId: f.representativeId } : {}),
      ...(f.status === 'POSTED' || f.status === 'CANCELLED' ? { status: f.status } : {}),
      ...(f.from || f.to
        ? { invoiceDate: { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesInvoice.findMany({
        where,
        include: { customer: { select: { code: true, nameAr: true } } },
        orderBy: { number: 'desc' },
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const inv = await this.prisma.salesInvoice.findUnique({ where: { id }, include: INCLUDE });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  // ---- internals ------------------------------------------------------

  private assertPermissions(dto: CreateSalesInvoiceDto, user: AuthUser): void {
    if (dto.paymentKind === 'CREDIT' && !user.permissions.includes('sales:credit_sale')) {
      throw new ForbiddenException('Credit sales require sales:credit_sale');
    }
    if (dto.lines.some((l) => l.discount && Number(l.discount) > 0) && !user.permissions.includes('sales:discount')) {
      throw new ForbiddenException('Discounts require sales:discount');
    }
  }

  private async loadOriginal(tx: Tx, dto: CreateSalesReturnDto) {
    const original = await tx.salesInvoice.findUnique({ where: { id: dto.originalInvoiceId! }, include: { lines: true } });
    if (!original || original.kind !== 'SALE' || original.status !== 'POSTED') {
      throw new BadRequestException('Original invoice not found or not returnable');
    }
    if (dto.customerId && original.customerId && dto.customerId !== original.customerId) {
      throw new BadRequestException('Return customer differs from the original invoice');
    }
    return original;
  }

  /** An invoice fulfilling an order must match its customer/warehouse; the order's agreed prices need no price-edit right. */
  private async loadOrder(tx: Tx, kind: SalesDocKind, dto: CreateSalesInvoiceDto, customerId: string | undefined, warehouseId: string) {
    if (kind !== 'SALE') throw new BadRequestException('A sales return cannot reference a sales order');
    await this.orders.lock(tx, dto.salesOrderId!);
    const order = await tx.salesOrder.findUnique({ where: { id: dto.salesOrderId! }, include: { lines: true } });
    if (!order) throw new BadRequestException('Sales order not found');
    if (order.kind !== 'ORDER') throw new ConflictException('A quotation must be confirmed before it can be invoiced');
    if (order.status === 'CANCELLED' || order.status === 'INVOICED') throw new ConflictException('Sales order is not open for invoicing');
    if (order.customerId !== customerId) throw new BadRequestException('Customer does not match the sales order');
    if (order.warehouseId !== warehouseId) throw new BadRequestException('Warehouse does not match the sales order');
    const agreed = new Map<string, Decimal>();
    for (const l of order.lines) agreed.set(`${l.productId}|${l.unitId ?? ''}`, dec(l.unitPrice.toString()));
    return { id: order.id, agreed };
  }

  private async checkOrderQuantities(tx: Tx, orderId: string, priced: PricedLine[]) {
    const remaining = new Map((await this.orders.quantities(tx, orderId)).map((q) => [q.productId, q.remaining]));
    const incoming = new Map<string, Decimal>();
    for (const l of priced) incoming.set(l.productId, (incoming.get(l.productId) ?? new Decimal(0)).plus(l.baseQty));
    for (const [productId, qty] of incoming) {
      const left = remaining.get(productId);
      if (left === undefined) throw new BadRequestException('Product is not on the sales order');
      if (qty.gt(left)) throw new BadRequestException(`Invoiced quantity exceeds the outstanding order quantity (remaining ${left.toFixed(4)})`);
    }
  }

  private async priceLines(tx: Tx, dto: CreateSalesInvoiceDto, customerId: string | undefined, user: AuthUser, kind: SalesDocKind, agreed?: Map<string, Decimal>) {
    const out: PricedLine[] = [];
    for (const l of dto.lines) {
      const enteredQty = dec(l.quantity);
      const baseQty = await this.conversion.toBaseQty(l.productId, l.unitId, l.quantity, tx);
      const factor = baseQty.div(enteredQty);

      const product = await tx.product.findUnique({ where: { id: l.productId } });
      if (!product || !product.isActive) throw new BadRequestException('Product not found or inactive');
      const special = customerId
        ? await tx.customerPrice.findUnique({ where: { customerId_productId: { customerId, productId: l.productId } } })
        : null;
      const baseDefault = special?.price ?? (dto.priceList === 'WHOLESALE' ? product.wholesalePrice : product.retailPrice);
      const defaultPrice = dec(baseDefault.toString()).times(factor);

      let unitPrice = defaultPrice;
      if (l.unitPrice !== undefined) {
        unitPrice = dec(l.unitPrice);
        const agreedPrice = agreed?.get(`${l.productId}|${l.unitId ?? ''}`);
        if (!unitPrice.eq(defaultPrice) && !(agreedPrice && unitPrice.eq(agreedPrice)) && !user.permissions.includes('sales:edit_price')) {
          throw new ForbiddenException('Changing prices requires sales:edit_price');
        }
      }
      const lineGross = enteredQty.times(unitPrice);
      const discount = dec(l.discount ?? '0');
      if (discount.gt(lineGross)) throw new BadRequestException('Discount cannot exceed the line amount');
      if (kind === 'SALE' && unitPrice.lte(0)) throw new BadRequestException('Price must be greater than zero');
      out.push({
        productId: l.productId,
        unitId: l.unitId,
        enteredQty,
        baseQty,
        unitPrice,
        discount,
        lineGross: roundMoney(lineGross),
        lineNet: roundMoney(lineGross.minus(discount)),
      });
    }
    return out;
  }

  /** Moves stock for one line and returns the cost per base unit used for COGS. */
  private async moveStock(
    tx: Tx,
    kind: SalesDocKind,
    invoice: { id: string; invoiceDate: Date; condition: string },
    warehouseId: string,
    l: PricedLine,
    originalId: string | undefined,
    actorId: string,
    index: number,
  ): Promise<Decimal> {
    const key = `sinv:${invoice.id}:${index}`;
    if (kind === 'SALE') {
      const r = await this.stock.apply(tx, {
        type: 'SALE_OUT',
        direction: 'OUT',
        warehouseId,
        productId: l.productId,
        quantity: l.baseQty,
        movementDate: invoice.invoiceDate,
        source: 'SALES_INVOICE',
        sourceId: invoice.id,
        idempotencyKey: key,
        createdById: actorId,
      });
      return dec(r.movement.unitCost.toString());
    }

    // Return: use the cost the goods were sold at when the original is known, else current average.
    let unitCost: Decimal | undefined;
    if (originalId) {
      const origLines = await tx.salesInvoiceLine.findMany({ where: { invoiceId: originalId, productId: l.productId } });
      if (origLines.length === 0) throw new BadRequestException('Returned product is not on the original invoice');
      const sold = origLines.reduce((a, x) => a.plus(x.baseQty.toString()), new Decimal(0));
      const prior = await tx.salesInvoiceLine.findMany({
        where: { productId: l.productId, invoice: { originalInvoiceId: originalId, status: 'POSTED' } },
      });
      const returned = prior.reduce((a, x) => a.plus(x.baseQty.toString()), new Decimal(0));
      if (returned.plus(l.baseQty).gt(sold)) throw new BadRequestException('Returned quantity exceeds the quantity sold');
      unitCost = origLines.reduce((a, x) => a.plus(dec(x.unitCost.toString()).times(x.baseQty.toString())), new Decimal(0)).div(sold);
    }
    if (!unitCost) {
      const p = await tx.product.findUniqueOrThrow({ where: { id: l.productId }, select: { avgCost: true } });
      unitCost = dec(p.avgCost.toString());
    }
    if (invoice.condition === 'GOOD') {
      await this.stock.apply(tx, {
        type: 'SALE_RETURN_IN',
        direction: 'IN',
        warehouseId,
        productId: l.productId,
        quantity: l.baseQty,
        unitCost,
        movementDate: invoice.invoiceDate,
        source: 'SALES_INVOICE',
        sourceId: invoice.id,
        idempotencyKey: key,
        createdById: actorId,
      });
    }
    return unitCost;
  }

  /** Validates the representative of a document and returns the GL account of their cash custody. */
  private async repCustodyAccount(
    tx: Tx,
    dto: CreateSalesReturnDto,
    warehouse: { id: string; type: string },
    user: AuthUser,
  ): Promise<string | undefined> {
    if (!dto.representativeId) {
      if (warehouse.type === 'VEHICLE') throw new BadRequestException('Sales from a vehicle warehouse require a representative');
      return undefined;
    }
    const rep = await tx.representative.findUnique({
      where: { id: dto.representativeId },
      include: { vehicle: true, financialAccount: true },
    });
    if (!rep || !rep.isActive) throw new BadRequestException('Representative not found or inactive');
    if (rep.userId && rep.userId !== user.id && !user.permissions.includes('representatives:approve')) {
      throw new ForbiddenException('A representative can only sell on their own behalf');
    }
    if (!rep.vehicle || rep.vehicle.warehouseId !== warehouse.id) {
      throw new BadRequestException("A representative sells only from their own vehicle's warehouse");
    }
    return rep.financialAccount.glAccountId;
  }

  private async postJournal(
    tx: Tx,
    kind: SalesDocKind,
    invoiceId: string,
    number: number,
    date: Date,
    dto: CreateSalesReturnDto,
    warehouseType: string,
    custodyGl: string | undefined,
    amounts: { net: Decimal; vat: Decimal; total: Decimal; cost: Decimal },
    customerId: string | undefined,
    actorId: string,
  ) {
    const acc = await this.accounts.resolve(
      ['CASH', 'RECEIVABLES', 'SALES', 'SALES_RETURNS', 'VAT_PAYABLE', 'COGS', 'INVENTORY', 'VEHICLE_STOCK'],
      tx,
    );
    const stockAccount = warehouseType === 'VEHICLE' ? acc.VEHICLE_STOCK : acc.INVENTORY;
    const party = dto.paymentKind === 'CREDIT' && customerId ? { partyType: 'CUSTOMER' as const, partyId: customerId } : {};
    // Cash taken by a representative goes into their custody, not the main cash box.
    const settle = dto.paymentKind === 'CREDIT' ? acc.RECEIVABLES : custodyGl ?? acc.CASH;
    const lines: JournalLineInput[] = [];

    if (kind === 'SALE') {
      lines.push({ accountId: settle, debit: amounts.total, credit: 0, ...party });
      lines.push({ accountId: acc.SALES, debit: 0, credit: amounts.net });
      if (amounts.vat.gt(0)) lines.push({ accountId: acc.VAT_PAYABLE, debit: 0, credit: amounts.vat });
      if (amounts.cost.gt(0)) {
        lines.push({ accountId: acc.COGS, debit: amounts.cost, credit: 0 });
        lines.push({ accountId: stockAccount, debit: 0, credit: amounts.cost });
      }
    } else {
      lines.push({ accountId: acc.SALES_RETURNS, debit: amounts.net, credit: 0 });
      if (amounts.vat.gt(0)) lines.push({ accountId: acc.VAT_PAYABLE, debit: amounts.vat, credit: 0 });
      lines.push({ accountId: settle, debit: 0, credit: amounts.total, ...party });
      // Damaged goods are not restocked, so their cost stays in COGS.
      if ((dto.condition ?? 'GOOD') === 'GOOD' && amounts.cost.gt(0)) {
        lines.push({ accountId: stockAccount, debit: amounts.cost, credit: 0 });
        lines.push({ accountId: acc.COGS, debit: 0, credit: amounts.cost });
      }
    }

    const { entry } = await this.posting.post(
      {
        entryDate: date,
        description: `${kind === 'SALE' ? 'Sales invoice' : 'Sales return'} #${number}`,
        source: kind === 'SALE' ? 'SALES_INVOICE' : 'SALES_RETURN',
        sourceId: invoiceId,
        idempotencyKey: `journal:sales:${invoiceId}`,
        createdById: actorId,
        lines,
      },
      tx,
    );
    return entry;
  }
}
