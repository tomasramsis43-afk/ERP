import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, dec, reverseLines, roundMoney } from '@erp/accounting-engine';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { toDate } from '../accounting/dto/journal.dto';
import { JournalPostingService, Tx } from '../accounting/journal/journal-posting.service';
import { AuditService } from '../audit/audit.service';
import { CloseCashboxDto } from './dto/treasury.dto';
import { FinancialAccountsService } from './financial-accounts.service';

/**
 * Cash-box day closing: compares the physical count with the ledger balance as of the closing day.
 * Any difference needs a documented reason and is posted to the custody-difference account, so the
 * ledger balance equals the counted cash afterwards. A closed day is frozen for vouchers (see
 * assertDayOpen) until the closing is reopened, newest closing first.
 */
@Injectable()
export class CashboxClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fa: FinancialAccountsService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly audit: AuditService,
  ) {}

  /** Ledger balance of a GL account including every posted line dated on or before `date`. */
  async balanceAsOf(glAccountId: string, date: Date, tx?: Tx): Promise<Decimal> {
    const client = tx ?? this.prisma;
    const [acc, sums] = await Promise.all([
      client.account.findUniqueOrThrow({ where: { id: glAccountId } }),
      client.journalLine.aggregate({
        where: { accountId: glAccountId, entry: { status: 'POSTED', entryDate: { lte: date } } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    return dec(acc.openingDebit.toString())
      .minus(acc.openingCredit.toString())
      .plus(sums._sum.debit?.toString() ?? '0')
      .minus(sums._sum.credit?.toString() ?? '0');
  }

  async preview(financialAccountId: string, dateStr: string) {
    const fa = await this.prisma.financialAccount.findUnique({ where: { id: financialAccountId } });
    if (!fa) throw new NotFoundException('Financial account not found');
    if (fa.kind !== 'CASHBOX') throw new BadRequestException('Day closing applies to cash boxes only; reconcile bank accounts instead');
    const date = toDate(dateStr);
    const last = await this.prisma.cashboxClosing.findFirst({
      where: { financialAccountId, status: 'POSTED' },
      orderBy: { closingDate: 'desc' },
    });
    return {
      financialAccountId,
      date: dateStr.slice(0, 10),
      systemBalance: (await this.balanceAsOf(fa.glAccountId, date)).toFixed(2),
      lastClosedDate: last ? last.closingDate.toISOString().slice(0, 10) : null,
    };
  }

  async close(dto: CloseCashboxDto, actorId: string) {
    const date = toDate(dto.date);
    const counted = roundMoney(dto.countedAmount);

    const closing = await this.prisma.$transaction(async (tx) => {
      const fa = await this.fa.lock(tx, dto.financialAccountId); // serializes closings and vouchers on this box
      if (fa.kind !== 'CASHBOX') throw new BadRequestException('Day closing applies to cash boxes only; reconcile bank accounts instead');

      const latest = await tx.cashboxClosing.findFirst({
        where: { financialAccountId: fa.id, status: 'POSTED' },
        orderBy: { closingDate: 'desc' },
      });
      if (latest && latest.closingDate >= date) {
        throw new ConflictException(`Cash box ${fa.code} is already closed up to ${latest.closingDate.toISOString().slice(0, 10)}`);
      }

      const system = roundMoney(await this.balanceAsOf(fa.glAccountId, date, tx));
      const diff = counted.minus(system);
      const reason = dto.reason?.trim();
      if (!diff.isZero() && !reason) {
        throw new BadRequestException(`A documented reason is required: counted ${counted.toFixed(2)} differs from the system balance ${system.toFixed(2)}`);
      }

      const row = await tx.cashboxClosing.create({
        data: {
          financialAccountId: fa.id,
          closingDate: date,
          systemBalance: system.toFixed(2),
          countedAmount: counted.toFixed(2),
          difference: diff.toFixed(2),
          reason: reason || null,
          createdById: actorId,
        },
      });

      if (!diff.isZero()) {
        const acc = await this.accounts.resolve(['CUSTODY_DIFFERENCE'], tx);
        const abs = diff.abs();
        const { entry } = await this.posting.post(
          {
            entryDate: date,
            description: `Cash box ${fa.code} closing #${row.number} ${dto.date.slice(0, 10)}: ${diff.lt(0) ? 'shortage' : 'overage'}`,
            source: 'CASHBOX_CLOSING',
            sourceId: row.id,
            idempotencyKey: `journal:cashbox-closing:${row.id}`,
            createdById: actorId,
            lines: diff.lt(0)
              ? [
                  { accountId: acc.CUSTODY_DIFFERENCE, debit: abs, credit: 0 },
                  { accountId: fa.glAccountId, debit: 0, credit: abs },
                ]
              : [
                  { accountId: fa.glAccountId, debit: abs, credit: 0 },
                  { accountId: acc.CUSTODY_DIFFERENCE, debit: 0, credit: abs },
                ],
          },
          tx,
        );
        return tx.cashboxClosing.update({ where: { id: row.id }, data: { journalEntryId: entry.id } });
      }
      return row;
    });

    await this.audit.record({
      userId: actorId,
      action: 'CLOSE_CASHBOX_DAY',
      entity: 'CashboxClosing',
      entityId: closing.id,
      newData: { number: closing.number, date: dto.date.slice(0, 10), difference: closing.difference.toString() },
      reason: closing.reason ?? undefined,
    });
    return closing;
  }

  /** Reopens the newest closing of a cash box (reverses its difference entry). Older closings stay frozen. */
  async reopen(id: string, reason: string, actorId: string) {
    const closing = await this.prisma.$transaction(async (tx) => {
      const c = await tx.cashboxClosing.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('Cashbox closing not found');
      const fa = await this.fa.lock(tx, c.financialAccountId);
      const fresh = await tx.cashboxClosing.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== 'POSTED') throw new ConflictException('This closing is already reopened');
      const newer = await tx.cashboxClosing.findFirst({
        where: { financialAccountId: fa.id, status: 'POSTED', closingDate: { gt: fresh.closingDate } },
      });
      if (newer) throw new ConflictException('Reopen the most recent closing first');

      if (fresh.journalEntryId) {
        const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: fresh.journalEntryId }, include: { lines: true } });
        if (fresh.difference.gt(0)) await this.fa.assertCanPay(tx, fa, dec(fresh.difference.toString())); // reversing an overage removes cash
        await this.posting.post(
          {
            entryDate: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
            description: `Reopening of cash box closing #${fresh.number}: ${reason}`,
            source: 'CASHBOX_CLOSING_CANCEL',
            sourceId: id,
            idempotencyKey: `cancel:cashbox-closing:${id}`,
            reversesId: entry.id,
            createdById: actorId,
            lines: reverseLines(entry.lines.map((l) => ({ accountId: l.accountId, debit: l.debit.toString(), credit: l.credit.toString() }))),
          },
          tx,
        );
      }
      return tx.cashboxClosing.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() } });
    });
    await this.audit.record({
      userId: actorId,
      action: 'REOPEN_CASHBOX_DAY',
      entity: 'CashboxClosing',
      entityId: id,
      oldData: { status: 'POSTED' },
      newData: { status: 'CANCELLED' },
      reason,
    });
    return closing;
  }

  async list(p: PageParams, f: { financialAccountId?: string; status?: string }) {
    const where: Prisma.CashboxClosingWhereInput = {
      ...(f.financialAccountId ? { financialAccountId: f.financialAccountId } : {}),
      ...(f.status === 'POSTED' || f.status === 'CANCELLED' ? { status: f.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cashboxClosing.findMany({ where, orderBy: { number: 'desc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.cashboxClosing.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  /** Throws if any of the accounts was closed on or after `date`. Call after locking the accounts. */
  static async assertDayOpen(tx: Tx, accountIds: string[], date: Date): Promise<void> {
    const hit = await tx.cashboxClosing.findFirst({
      where: { financialAccountId: { in: accountIds }, status: 'POSTED', closingDate: { gte: date } },
      include: { financialAccount: { select: { code: true } } },
    });
    if (hit) {
      throw new ConflictException(
        `Cash box ${hit.financialAccount.code} is closed up to ${hit.closingDate.toISOString().slice(0, 10)}; reopen the closing to post on ${date.toISOString().slice(0, 10)}`,
      );
    }
  }
}
