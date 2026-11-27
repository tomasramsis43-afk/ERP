import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal, JournalLineInput, dec } from '@erp/accounting-engine';
import { AuthUser } from '../../../common/decorators/auth.decorators';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SystemAccountsService } from '../accounts/system-accounts.service';
import { JournalPostingService } from '../journal/journal-posting.service';

/** Journal source of the two closing entries; the income statement leaves these out. */
export const YEAR_END_SOURCE = 'YEAR_END_CLOSE';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Year-end closing. Zeroes every revenue and expense account for a fiscal period into
 * "Profit and Loss" (entry 1) and moves that result to "Retained Earnings" (entry 2).
 * Both entries are dated on the last day of the period and are posted in one transaction,
 * through the shared posting service (balance check, open-period check, idempotency).
 * Corrections are done with the normal reversal of the posted entries, never by editing.
 */
@Injectable()
export class YearEndService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly audit: AuditService,
  ) {}

  private keys(periodId: string) {
    return { first: `year-end-close-${periodId}-1`, second: `year-end-close-${periodId}-2` };
  }

  private async loadPeriod(periodId: string) {
    const period = await this.prisma.fiscalPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Fiscal period not found');
    return period;
  }

  /** Per revenue/expense account: debit − credit inside the period, ignoring earlier closing entries. */
  private async balances(start: Date, end: Date) {
    const [accounts, sums] = await Promise.all([
      this.prisma.account.findMany({ where: { isPostable: true, type: { in: ['REVENUE', 'EXPENSE'] } }, orderBy: { code: 'asc' } }),
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          account: { type: { in: ['REVENUE', 'EXPENSE'] } },
          entry: { status: 'POSTED', entryDate: { gte: start, lte: end }, source: { not: YEAR_END_SOURCE } },
        },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const byId = new Map(sums.map((s) => [s.accountId, s._sum]));
    return accounts
      .map((a) => {
        const s = byId.get(a.id);
        return { account: a, net: dec(s?.debit?.toString() ?? '0').minus(dec(s?.credit?.toString() ?? '0')) };
      })
      .filter((x) => !x.net.isZero());
  }

  async preview(periodId: string) {
    const period = await this.loadPeriod(periodId);
    const rows = await this.balances(period.startDate, period.endDate);
    const profit = rows.reduce((a, r) => a.minus(r.net), new Decimal(0)); // credit − debit
    const closed = await this.prisma.journalEntry.count({ where: { idempotencyKey: this.keys(periodId).first } });
    return {
      period: { id: period.id, name: period.name, startDate: iso(period.startDate), endDate: iso(period.endDate), status: period.status },
      alreadyClosed: closed > 0,
      accounts: rows.map((r) => ({ code: r.account.code, nameAr: r.account.nameAr, nameEn: r.account.nameEn, type: r.account.type, balance: r.net.toFixed(2) })),
      netProfit: profit.toFixed(2),
    };
  }

  async close(periodId: string, user: AuthUser) {
    const period = await this.loadPeriod(periodId);
    if (period.status !== 'OPEN') throw new BadRequestException('Close the entries while the fiscal period is still open, then close the period');
    const keys = this.keys(periodId);
    if ((await this.prisma.journalEntry.count({ where: { idempotencyKey: keys.first } })) > 0) {
      throw new ConflictException('This fiscal period already has closing entries');
    }

    const rows = await this.balances(period.startDate, period.endDate);
    if (rows.length === 0) throw new BadRequestException('There is nothing to close in this period');
    const acc = await this.accounts.resolve(['PROFIT_LOSS', 'RETAINED_EARNINGS']);
    const label = period.name;

    const result = await this.prisma.$transaction(async (tx) => {
      // Entry 1: zero each revenue/expense account against Profit and Loss.
      const lines1: JournalLineInput[] = [];
      let net = new Decimal(0); // debit − credit of all closed accounts
      for (const r of rows) {
        net = net.plus(r.net);
        lines1.push(r.net.gt(0)
          ? { accountId: r.account.id, debit: '0', credit: r.net.toFixed(2), description: 'Year-end close' }
          : { accountId: r.account.id, debit: r.net.abs().toFixed(2), credit: '0', description: 'Year-end close' });
      }
      // net > 0 means expenses exceeded revenue (a loss): P&L is debited; otherwise credited.
      if (!net.isZero()) {
        lines1.push(net.gt(0)
          ? { accountId: acc.PROFIT_LOSS, debit: net.toFixed(2), credit: '0' }
          : { accountId: acc.PROFIT_LOSS, debit: '0', credit: net.abs().toFixed(2) });
      }
      const first = await this.posting.post(
        { entryDate: period.endDate, description: `Year-end closing: ${label}`, source: YEAR_END_SOURCE, sourceId: periodId, idempotencyKey: keys.first, createdById: user.id, lines: lines1 },
        tx,
      );

      // Entry 2: move the result from Profit and Loss to Retained Earnings.
      let second = null;
      if (!net.isZero()) {
        const amount = net.abs().toFixed(2);
        const lines2: JournalLineInput[] = net.gt(0)
          ? [
              { accountId: acc.RETAINED_EARNINGS, debit: amount, credit: '0' },
              { accountId: acc.PROFIT_LOSS, debit: '0', credit: amount },
            ]
          : [
              { accountId: acc.PROFIT_LOSS, debit: amount, credit: '0' },
              { accountId: acc.RETAINED_EARNINGS, debit: '0', credit: amount },
            ];
        second = await this.posting.post(
          { entryDate: period.endDate, description: `Transfer to retained earnings: ${label}`, source: YEAR_END_SOURCE, sourceId: periodId, idempotencyKey: keys.second, createdById: user.id, lines: lines2 },
          tx,
        );
      }
      return { first: first.entry, second: second?.entry ?? null, netProfit: net.negated().toFixed(2) };
    });

    await this.audit.record({
      userId: user.id,
      action: 'YEAR_END_CLOSE',
      entity: 'FiscalPeriod',
      entityId: periodId,
      newData: { netProfit: result.netProfit, entries: [result.first.number, result.second?.number ?? null] },
    });
    return result;
  }
}
