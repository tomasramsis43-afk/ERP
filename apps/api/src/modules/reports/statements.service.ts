import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal, dec } from '@erp/accounting-engine';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';

export interface StatementRow {
  code: string;
  nameAr: string;
  nameEn: string;
  amount: string;
}

const ZERO = () => new Decimal(0);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const assertRange = (from: Date, to: Date) => {
  if (from > to) throw new BadRequestException('from must not be after to');
};

/**
 * Financial statements are derived from POSTED journal lines only (never from invoices).
 * Sign convention: every amount is shown in the account's natural direction.
 */
@Injectable()
export class StatementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Net movement per account (debit − credit) inside a date window, with opening balances optionally added. */
  private async nets(from: Date | undefined, to: Date, withOpening: boolean, excludeClosing = false) {
    const [accounts, sums] = await Promise.all([
      this.prisma.account.findMany({ where: { isPostable: true }, orderBy: { code: 'asc' } }),
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          entry: {
            status: 'POSTED',
            entryDate: { ...(from ? { gte: from } : {}), lte: to },
            ...(excludeClosing ? { source: { not: 'YEAR_END_CLOSE' } } : {}),
          },
        },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const byId = new Map(sums.map((s) => [s.accountId, s._sum]));
    return accounts.map((a) => {
      const s = byId.get(a.id);
      let net = dec(s?.debit?.toString() ?? '0').minus(dec(s?.credit?.toString() ?? '0'));
      if (withOpening) net = net.plus(dec(a.openingDebit.toString())).minus(dec(a.openingCredit.toString()));
      return { account: a, net };
    });
  }

  private rows(items: { account: { code: string; nameAr: string; nameEn: string }; net: Decimal }[], sign: 1 | -1): StatementRow[] {
    return items
      .filter((i) => !i.net.isZero())
      .map((i) => ({ code: i.account.code, nameAr: i.account.nameAr, nameEn: i.account.nameEn, amount: i.net.times(sign).toFixed(2) }));
  }

  private sum(rows: StatementRow[]): Decimal {
    return rows.reduce((a, r) => a.plus(r.amount), ZERO());
  }

  /** Simple VAT declaration: output VAT (sales) minus input VAT (purchases) for a period. */
  async vatDeclaration(fromStr: string, toStr: string): Promise<{ from: string; to: string; outputVat: string; inputVat: string; netVat: string }> {
    const f = toDate(fromStr);
    const t = toDate(toStr);
    assertRange(f, t);
    const [sales, purchases] = await Promise.all([
      this.prisma.salesInvoice.aggregate({ where: { status: 'POSTED', invoiceDate: { gte: f, lte: t } }, _sum: { vatTotal: true } }),
      this.prisma.purchaseInvoice.aggregate({ where: { status: 'POSTED', invoiceDate: { gte: f, lte: t } }, _sum: { vatTotal: true } }),
    ]);
    const output = dec(sales._sum.vatTotal?.toString() ?? '0');
    const input = dec(purchases._sum.vatTotal?.toString() ?? '0');
    return { from: fromStr, to: toStr, outputVat: output.toFixed(2), inputVat: input.toFixed(2), netVat: output.minus(input).toFixed(2) };
  }

  async incomeStatement(fromStr: string, toStr: string) {
    const from = toDate(fromStr);
    const to = toDate(toStr);
    assertRange(from, to);
    const items = await this.nets(from, to, false, true); // year-end closing entries are not trading results
    const revenue = this.rows(items.filter((i) => i.account.type === 'REVENUE'), -1); // credit-natural; returns net off
    const expenses = items.filter((i) => i.account.type === 'EXPENSE');
    const cogs = this.rows(expenses.filter((i) => i.account.code.startsWith('51')), 1);
    const opex = this.rows(expenses.filter((i) => !i.account.code.startsWith('51')), 1);
    const totalRevenue = this.sum(revenue);
    const totalCogs = this.sum(cogs);
    const grossProfit = totalRevenue.minus(totalCogs);
    const totalOpex = this.sum(opex);
    const netProfit = grossProfit.minus(totalOpex);
    return {
      from: iso(from),
      to: iso(to),
      revenue,
      totalRevenue: totalRevenue.toFixed(2),
      costOfGoodsSold: cogs,
      totalCostOfGoodsSold: totalCogs.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      operatingExpenses: opex,
      totalOperatingExpenses: totalOpex.toFixed(2),
      netProfit: netProfit.toFixed(2),
    };
  }

  /** Assets = Liabilities + Equity, where equity includes cumulative profit not yet closed to an equity account. */
  async balanceSheet(asOfStr: string) {
    const asOf = toDate(asOfStr);
    const items = await this.nets(undefined, asOf, true);
    const assets = this.rows(items.filter((i) => i.account.type === 'ASSET'), 1);
    const liabilities = this.rows(items.filter((i) => i.account.type === 'LIABILITY'), -1);
    const equity = this.rows(items.filter((i) => i.account.type === 'EQUITY'), -1);
    const profit = items
      .filter((i) => i.account.type === 'REVENUE' || i.account.type === 'EXPENSE')
      .reduce((a, i) => a.minus(i.net), ZERO()); // credit − debit over all P&L accounts
    const totalAssets = this.sum(assets);
    const totalLiabilities = this.sum(liabilities);
    const totalEquity = this.sum(equity).plus(profit);
    return {
      asOf: iso(asOf),
      assets,
      totalAssets: totalAssets.toFixed(2),
      liabilities,
      totalLiabilities: totalLiabilities.toFixed(2),
      equity,
      currentEarnings: profit.toFixed(2),
      totalEquity: totalEquity.toFixed(2),
      totalLiabilitiesAndEquity: totalLiabilities.plus(totalEquity).toFixed(2),
      balanced: totalAssets.eq(totalLiabilities.plus(totalEquity)),
    };
  }

  /**
   * Direct-method cash flow over every cash box, bank and representative custody account:
   * what moved the money, grouped by the kind of document that posted it.
   */
  async cashFlow(fromStr: string, toStr: string) {
    const from = toDate(fromStr);
    const to = toDate(toStr);
    assertRange(from, to);
    const cashAccounts = await this.prisma.financialAccount.findMany({ select: { glAccountId: true } });
    const ids = cashAccounts.map((c) => c.glAccountId);
    const [openingLines, accountsOpening, movements] = await Promise.all([
      this.prisma.journalLine.aggregate({
        where: { accountId: { in: ids }, entry: { status: 'POSTED', entryDate: { lt: from } } },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.account.aggregate({ where: { id: { in: ids } }, _sum: { openingDebit: true, openingCredit: true } }),
      this.prisma.journalLine.findMany({
        where: { accountId: { in: ids }, entry: { status: 'POSTED', entryDate: { gte: from, lte: to } } },
        select: { debit: true, credit: true, entry: { select: { source: true } } },
      }),
    ]);
    const opening = dec(openingLines._sum.debit?.toString() ?? '0')
      .minus(openingLines._sum.credit?.toString() ?? '0')
      .plus(accountsOpening._sum.openingDebit?.toString() ?? '0')
      .minus(accountsOpening._sum.openingCredit?.toString() ?? '0');

    const bySource = new Map<string, { inflow: Decimal; outflow: Decimal }>();
    for (const m of movements) {
      const row = bySource.get(m.entry.source) ?? { inflow: ZERO(), outflow: ZERO() };
      row.inflow = row.inflow.plus(m.debit.toString());
      row.outflow = row.outflow.plus(m.credit.toString());
      bySource.set(m.entry.source, row);
    }
    const lines = [...bySource.entries()]
      .map(([source, v]) => ({ source, inflow: v.inflow.toFixed(2), outflow: v.outflow.toFixed(2), net: v.inflow.minus(v.outflow).toFixed(2) }))
      .sort((a, b) => a.source.localeCompare(b.source));
    const inflow = [...bySource.values()].reduce((a, v) => a.plus(v.inflow), ZERO());
    const outflow = [...bySource.values()].reduce((a, v) => a.plus(v.outflow), ZERO());
    return {
      from: iso(from),
      to: iso(to),
      openingCash: opening.toFixed(2),
      lines,
      totalInflow: inflow.toFixed(2),
      totalOutflow: outflow.toFixed(2),
      netChange: inflow.minus(outflow).toFixed(2),
      closingCash: opening.plus(inflow).minus(outflow).toFixed(2),
    };
  }
}
