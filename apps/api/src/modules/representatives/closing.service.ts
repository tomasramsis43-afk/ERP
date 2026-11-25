import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Decimal, dec, roundMoney, roundQty } from '@erp/accounting-engine';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { toDate } from '../accounting/dto/journal.dto';
import { JournalPostingService, Tx } from '../accounting/journal/journal-posting.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../inventory/stock.service';
import { FinancialAccountsService } from '../treasury/financial-accounts.service';
import { CommissionsService } from './commissions.service';
import { CloseDayDto } from './dto/representatives.dto';

interface LineFigures {
  openingQty: Decimal;
  loadedQty: Decimal;
  soldQty: Decimal;
  returnedQty: Decimal;
  damagedQty: Decimal;
  unloadedQty: Decimal;
  expectedQty: Decimal;
}

type RepWithLinks = Prisma.RepresentativeGetPayload<{ include: { vehicle: true; financialAccount: true } }>;

const zero = () => new Decimal(0);

/**
 * Daily closing of a representative: reconciles the van's goods against the stock ledger and
 * the custody cash against the books, books any shortage/surplus, hands the cash over to the
 * main cash box and accrues commission. A day can be closed once, in order.
 */
@Injectable()
export class ClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly financial: FinancialAccountsService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly commissions: CommissionsService,
    private readonly audit: AuditService,
  ) {}

  /** What the books say for the day, before the representative counts anything. */
  async preview(repId: string, dateStr: string, user: AuthUser) {
    const date = toDate(dateStr);
    const rep = await this.loadRep(this.prisma, repId, user);
    const g = await this.gather(this.prisma, rep, date);
    const products = await this.prisma.product.findMany({
      where: { id: { in: [...g.lines.keys()] } },
      select: { id: true, code: true, nameAr: true, nameEn: true },
    });
    return {
      date: dateStr,
      openingCash: g.openingCash.toFixed(2),
      expectedCash: g.expectedCash.toFixed(2),
      salesCash: g.salesCash.toFixed(2),
      salesCredit: g.salesCredit.toFixed(2),
      salesReturns: g.salesReturns.toFixed(2),
      collections: g.collections.toFixed(2),
      loadedValue: g.loadedValue.toFixed(2),
      lines: [...g.lines.entries()].map(([productId, f]) => ({
        product: products.find((p) => p.id === productId),
        productId,
        ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, (v as Decimal).toFixed(4)])),
      })),
    };
  }

  async close(repId: string, dto: CloseDayDto, user: AuthUser) {
    const date = toDate(dto.date);
    if (date > toDate(new Date().toISOString())) throw new BadRequestException('Cannot close a future day');
    const declared = roundMoney(dto.declaredCash);

    const closing = await this.prisma.$transaction(async (tx) => {
      const rep = await this.loadRep(tx, repId, user);
      if (await tx.repClosing.findUnique({ where: { representativeId_closingDate: { representativeId: repId, closingDate: date } } })) {
        throw new ConflictException('This day is already closed');
      }
      await this.assertInOrder(tx, rep, date);

      const main = await tx.financialAccount.findUnique({ where: { code: 'MAIN' } });
      if (!main) throw new BadRequestException('The main cash box (code MAIN) is not configured');
      // Lock in id order, the same order vouchers use, so closings and transfers cannot deadlock.
      for (const id of [rep.financialAccountId, main.id].sort()) await this.financial.lock(tx, id);

      const g = await this.gather(tx, rep, date);
      const counted = await this.readCounts(tx, dto, g.lines);
      const closingId = randomUUID();
      const van = rep.vehicle!.warehouseId;

      // ---- stock: bring the ledger to the physical count --------------------
      const diffs = new Map<string, Decimal>();
      for (const [productId, f] of g.lines) diffs.set(productId, (counted.get(productId) ?? zero()).minus(f.expectedQty));
      for (const [productId, c] of counted) if (!g.lines.has(productId)) diffs.set(productId, c);
      const changed = [...diffs.entries()].filter(([, d]) => !d.isZero());
      await this.stock.lockBalances(tx, changed.map(([productId]) => ({ warehouseId: van, productId })));
      let stockDiffValue = zero();
      for (const [productId, diff] of changed) {
        const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { avgCost: true } });
        const avg = dec(product.avgCost.toString());
        await this.stock.apply(tx, {
          type: diff.lt(0) ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
          direction: diff.lt(0) ? 'OUT' : 'IN',
          warehouseId: van,
          productId,
          quantity: diff.abs(),
          unitCost: avg,
          movementDate: date,
          source: 'REP_CLOSING',
          sourceId: closingId,
          idempotencyKey: `closing:${closingId}:${productId}`,
          note: 'Daily closing count difference',
          createdById: user.id,
        });
        stockDiffValue = stockDiffValue.plus(diff.times(avg));
      }
      stockDiffValue = roundMoney(stockDiffValue);

      const acc = await this.accounts.resolve(['VEHICLE_STOCK', 'CUSTODY_DIFFERENCE'], tx);
      if (!stockDiffValue.isZero()) {
        const abs = stockDiffValue.abs();
        await this.posting.post(
          {
            entryDate: date,
            description: `Vehicle stock count difference ${rep.code} ${dto.date}`,
            source: 'REP_CLOSING_STOCK',
            sourceId: closingId,
            idempotencyKey: `journal:closing-stock:${closingId}`,
            createdById: user.id,
            lines: stockDiffValue.lt(0)
              ? [
                  { accountId: acc.CUSTODY_DIFFERENCE, debit: abs, credit: 0 },
                  { accountId: acc.VEHICLE_STOCK, debit: 0, credit: abs },
                ]
              : [
                  { accountId: acc.VEHICLE_STOCK, debit: abs, credit: 0 },
                  { accountId: acc.CUSTODY_DIFFERENCE, debit: 0, credit: abs },
                ],
          },
          tx,
        );
      }

      // ---- cash: settle the custody account to the main cash box --------------
      const expectedCash = g.expectedCash;
      const cashDiff = declared.minus(expectedCash);
      const cashLines = [];
      if (expectedCash.gt(0)) cashLines.push({ accountId: (await this.glOf(tx, rep.financialAccountId)), debit: 0, credit: expectedCash });
      if (declared.gt(0)) cashLines.push({ accountId: main.glAccountId, debit: declared, credit: 0 });
      if (cashDiff.lt(0)) cashLines.push({ accountId: acc.CUSTODY_DIFFERENCE, debit: cashDiff.abs(), credit: 0 });
      if (cashDiff.gt(0)) cashLines.push({ accountId: acc.CUSTODY_DIFFERENCE, debit: 0, credit: cashDiff });
      if (cashLines.length >= 2) {
        const { entry } = await this.posting.post(
          {
            entryDate: date,
            description: `Daily closing cash settlement ${rep.code} ${dto.date}`,
            source: 'REP_CLOSING_CASH',
            sourceId: closingId,
            idempotencyKey: `journal:closing-cash:${closingId}`,
            createdById: user.id,
            lines: cashLines,
          },
          tx,
        );
        if (declared.gt(0)) {
          await tx.voucher.create({
            data: {
              type: 'TRANSFER',
              voucherDate: date,
              amount: declared.toFixed(2),
              financialAccountId: rep.financialAccountId,
              toFinancialAccountId: main.id,
              description: `Daily closing hand-over ${rep.code} ${dto.date}`,
              idempotencyKey: `closing:${closingId}`,
              representativeId: rep.id,
              journalEntryId: entry.id,
              createdById: user.id,
            },
          });
        }
      }

      // ---- commission -------------------------------------------------------
      const commissionTotal = await this.commissions.accrue(tx, rep.id, date, closingId);

      const created = await tx.repClosing.create({
        data: {
          id: closingId,
          representativeId: rep.id,
          closingDate: date,
          salesCash: g.salesCash.toFixed(2),
          salesCredit: g.salesCredit.toFixed(2),
          salesReturns: g.salesReturns.toFixed(2),
          collections: g.collections.toFixed(2),
          openingCash: g.openingCash.toFixed(2),
          expectedCash: expectedCash.toFixed(2),
          declaredCash: declared.toFixed(2),
          cashDifference: cashDiff.toFixed(2),
          loadedValue: g.loadedValue.toFixed(2),
          stockDifferenceValue: stockDiffValue.toFixed(2),
          commissionTotal: commissionTotal.toFixed(2),
          createdById: user.id,
          lines: {
            create: [...diffs.keys()].map((productId) => {
              const f = g.lines.get(productId);
              const c = counted.get(productId) ?? zero();
              return {
                productId,
                openingQty: (f?.openingQty ?? zero()).toFixed(4),
                loadedQty: (f?.loadedQty ?? zero()).toFixed(4),
                soldQty: (f?.soldQty ?? zero()).toFixed(4),
                returnedQty: (f?.returnedQty ?? zero()).toFixed(4),
                damagedQty: (f?.damagedQty ?? zero()).toFixed(4),
                unloadedQty: (f?.unloadedQty ?? zero()).toFixed(4),
                expectedQty: (f?.expectedQty ?? zero()).toFixed(4),
                countedQty: c.toFixed(4),
                differenceQty: diffs.get(productId)!.toFixed(4),
              };
            }),
          },
        },
        include: { lines: true },
      });
      return created;
    });

    await this.audit.record({
      userId: user.id,
      action: 'CLOSE_DAY',
      entity: 'RepClosing',
      entityId: closing.id,
      newData: {
        representativeId: repId,
        date: dto.date,
        cashDifference: closing.cashDifference.toString(),
        stockDifferenceValue: closing.stockDifferenceValue.toString(),
      },
    });
    return closing;
  }

  async list(repId: string, p: PageParams) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.repClosing.findMany({ where: { representativeId: repId }, orderBy: { closingDate: 'desc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.repClosing.count({ where: { representativeId: repId } }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const c = await this.prisma.repClosing.findUnique({ where: { id }, include: { lines: true } });
    if (!c) throw new NotFoundException('Closing not found');
    return c;
  }

  // ---- internals --------------------------------------------------------

  private async loadRep(db: Tx, repId: string, user: AuthUser): Promise<RepWithLinks> {
    const rep = await db.representative.findUnique({ where: { id: repId }, include: { vehicle: true, financialAccount: true } });
    if (!rep) throw new NotFoundException('Representative not found');
    // Representatives may only work with their own day; managers with representatives:approve see everyone.
    if (!user.permissions.includes('representatives:approve') && rep.userId !== user.id) {
      throw new ForbiddenException('You can only access your own closing');
    }
    if (!rep.isActive) throw new BadRequestException('Representative is inactive');
    if (!rep.vehicle) throw new BadRequestException('The representative has no vehicle assigned');
    return rep;
  }

  private async assertInOrder(tx: Tx, rep: RepWithLinks, date: Date): Promise<void> {
    const van = rep.vehicle!.warehouseId;
    const [invoices, vouchers, moves, later] = await Promise.all([
      tx.salesInvoice.count({ where: { representativeId: rep.id, invoiceDate: { gt: date } } }),
      tx.voucher.count({ where: { representativeId: rep.id, voucherDate: { gt: date } } }),
      tx.stockMovement.count({ where: { warehouseId: van, movementDate: { gt: date } } }),
      tx.repClosing.count({ where: { representativeId: rep.id, closingDate: { gt: date } } }),
    ]);
    if (invoices + vouchers + moves + later > 0) {
      throw new BadRequestException('There is activity after this date: close days in order, oldest first');
    }
  }

  private async glOf(tx: Tx, financialAccountId: string): Promise<string> {
    return (await tx.financialAccount.findUniqueOrThrow({ where: { id: financialAccountId } })).glAccountId;
  }

  /** Counted quantities per product; every product the books say is on the van must be counted. */
  private async readCounts(tx: Tx, dto: CloseDayDto, lines: Map<string, LineFigures>): Promise<Map<string, Decimal>> {
    const counted = new Map<string, Decimal>();
    for (const c of dto.counts) {
      if (counted.has(c.productId)) throw new BadRequestException('A product is counted twice');
      counted.set(c.productId, roundQty(c.quantity));
    }
    const known = await tx.product.findMany({ where: { id: { in: [...counted.keys()] } }, select: { id: true } });
    if (known.length !== counted.size) throw new BadRequestException('Unknown product in the count');
    const missing = [...lines.entries()].filter(([id, f]) => f.expectedQty.gt(0) && !counted.has(id)).map(([id]) => id);
    if (missing.length) {
      const names = await tx.product.findMany({ where: { id: { in: missing } }, select: { code: true } });
      throw new BadRequestException(`Count is missing for: ${names.map((n) => n.code).join(', ')}`);
    }
    return counted;
  }

  /** Reads the stock ledger and the books for the representative's day. */
  private async gather(db: Tx, rep: RepWithLinks, date: Date) {
    const van = rep.vehicle!.warehouseId;
    const custodyGl = rep.financialAccount.glAccountId;
    const lines = new Map<string, LineFigures>();
    const line = (productId: string): LineFigures => {
      let l = lines.get(productId);
      if (!l) {
        l = { openingQty: zero(), loadedQty: zero(), soldQty: zero(), returnedQty: zero(), damagedQty: zero(), unloadedQty: zero(), expectedQty: zero() };
        lines.set(productId, l);
      }
      return l;
    };

    const [opening, day, damaged, invoiceTotals, receipts, loaded, openingCashRows, account, custody] = await Promise.all([
      db.stockMovement.groupBy({ by: ['productId'], where: { warehouseId: van, movementDate: { lt: date } }, _sum: { quantity: true } }),
      db.stockMovement.groupBy({ by: ['productId', 'type'], where: { warehouseId: van, movementDate: date }, _sum: { quantity: true } }),
      db.salesInvoiceLine.groupBy({
        by: ['productId'],
        where: { invoice: { representativeId: rep.id, invoiceDate: date, status: 'POSTED', kind: 'RETURN', condition: 'DAMAGED' } },
        _sum: { baseQty: true },
      }),
      db.salesInvoice.groupBy({
        by: ['kind', 'paymentKind'],
        where: { representativeId: rep.id, invoiceDate: date, status: 'POSTED' },
        _sum: { total: true },
      }),
      db.voucher.aggregate({
        where: { representativeId: rep.id, voucherDate: date, status: 'POSTED', type: 'RECEIPT' },
        _sum: { amount: true },
      }),
      db.stockMovement.findMany({ where: { warehouseId: van, movementDate: date, type: 'TRANSFER_IN' }, select: { quantity: true, unitCost: true } }),
      db.journalLine.aggregate({
        where: { accountId: custodyGl, entry: { status: 'POSTED', entryDate: { lt: date } } },
        _sum: { debit: true, credit: true },
      }),
      db.account.findUniqueOrThrow({ where: { id: custodyGl } }),
      db.journalLine.aggregate({ where: { accountId: custodyGl, entry: { status: 'POSTED' } }, _sum: { debit: true, credit: true } }),
    ]);

    for (const r of opening) line(r.productId).openingQty = dec(r._sum.quantity?.toString() ?? '0');
    for (const r of day) {
      const q = dec(r._sum.quantity?.toString() ?? '0');
      const l = line(r.productId);
      if (r.type === 'TRANSFER_IN') l.loadedQty = l.loadedQty.plus(q);
      else if (r.type === 'TRANSFER_OUT') l.unloadedQty = l.unloadedQty.plus(q.abs());
      else if (r.type === 'SALE_OUT') l.soldQty = l.soldQty.plus(q.abs());
      else if (r.type === 'SALE_RETURN_IN') l.returnedQty = l.returnedQty.plus(q);
    }
    for (const r of damaged) line(r.productId).damagedQty = dec(r._sum.baseQty?.toString() ?? '0');
    // Expected = everything the ledger says is on the van at the end of the day.
    const dayNet = new Map<string, Decimal>();
    for (const r of day) dayNet.set(r.productId, (dayNet.get(r.productId) ?? zero()).plus(r._sum.quantity?.toString() ?? '0'));
    for (const [productId, l] of lines) l.expectedQty = l.openingQty.plus(dayNet.get(productId) ?? zero());

    let salesCash = zero();
    let salesCredit = zero();
    let salesReturns = zero();
    for (const r of invoiceTotals) {
      const t = dec(r._sum.total?.toString() ?? '0');
      if (r.kind === 'RETURN') salesReturns = salesReturns.plus(t);
      else if (r.paymentKind === 'CASH') salesCash = salesCash.plus(t);
      else salesCredit = salesCredit.plus(t);
    }
    const sumNet = (s: { debit: Prisma.Decimal | null; credit: Prisma.Decimal | null }, base: Decimal) =>
      base.plus(s.debit?.toString() ?? '0').minus(s.credit?.toString() ?? '0');
    const accOpening = dec(account.openingDebit.toString()).minus(account.openingCredit.toString());

    return {
      lines,
      salesCash: roundMoney(salesCash),
      salesCredit: roundMoney(salesCredit),
      salesReturns: roundMoney(salesReturns),
      collections: roundMoney(dec(receipts._sum.amount?.toString() ?? '0')),
      loadedValue: roundMoney(loaded.reduce((a, m) => a.plus(dec(m.quantity.toString()).times(m.unitCost.toString())), zero())),
      openingCash: roundMoney(sumNet(openingCashRows._sum, accOpening)),
      expectedCash: roundMoney(sumNet(custody._sum, accOpening)),
    };
  }
}
