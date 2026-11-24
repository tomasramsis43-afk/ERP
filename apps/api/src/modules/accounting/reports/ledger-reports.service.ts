import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, dec } from '@erp/accounting-engine';
import { PrismaService } from '../../../database/prisma.service';
import { toDate } from '../dto/journal.dto';

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: string;
  openingBalance: string; // signed: debit positive
  movementDebit: string;
  movementCredit: string;
  closingDebit: string;
  closingCredit: string;
}

interface LedgerRaw {
  id: string;
  entryId: string;
  entryNumber: number;
  entryDate: Date;
  description: string;
  lineDescription: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  runningBalance: Prisma.Decimal;
}

/** Reads posted journal lines only: statements never come from invoices directly. */
@Injectable()
export class LedgerReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async trialBalance(asOf?: string) {
    const upTo = asOf ? toDate(asOf) : new Date();
    const [accounts, sums] = await Promise.all([
      this.prisma.account.findMany({ where: { isPostable: true }, orderBy: { code: 'asc' } }),
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { entry: { status: 'POSTED', entryDate: { lte: upTo } } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const byAccount = new Map(sums.map((s) => [s.accountId, s._sum]));

    const rows: TrialBalanceRow[] = [];
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    for (const a of accounts) {
      const s = byAccount.get(a.id);
      const movementDebit = dec(s?.debit?.toString() ?? '0');
      const movementCredit = dec(s?.credit?.toString() ?? '0');
      const opening = dec(a.openingDebit.toString()).minus(dec(a.openingCredit.toString()));
      const closing = opening.plus(movementDebit).minus(movementCredit);
      if (opening.isZero() && movementDebit.isZero() && movementCredit.isZero()) continue;

      const closingDebit = closing.gt(0) ? closing : new Decimal(0);
      const closingCredit = closing.lt(0) ? closing.abs() : new Decimal(0);
      totalDebit = totalDebit.plus(closingDebit);
      totalCredit = totalCredit.plus(closingCredit);
      rows.push({
        accountId: a.id,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        type: a.type,
        openingBalance: opening.toFixed(2),
        movementDebit: movementDebit.toFixed(2),
        movementCredit: movementCredit.toFixed(2),
        closingDebit: closingDebit.toFixed(2),
        closingCredit: closingCredit.toFixed(2),
      });
    }
    return {
      asOf: upTo.toISOString().slice(0, 10),
      rows,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      balanced: totalDebit.eq(totalCredit),
    };
  }

  /** General ledger of one account with a running balance (opening + movements), server-paginated. */
  async accountLedger(accountId: string, p: { from?: string; to?: string; page: number; pageSize: number }) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');

    const opening = account.openingDebit.minus(account.openingCredit);
    const to = p.to ? toDate(p.to) : toDate('9999-12-31');
    const from = p.from ? toDate(p.from) : toDate('0001-01-01');
    const offset = (p.page - 1) * p.pageSize;

    const rows = await this.prisma.$queryRaw<LedgerRaw[]>`
      SELECT * FROM (
        SELECT l."id", e."id" AS "entryId", e."number" AS "entryNumber", e."entryDate",
               e."description", l."description" AS "lineDescription", l."debit", l."credit",
               ${opening} + SUM(l."debit" - l."credit")
                 OVER (ORDER BY e."entryDate", e."number", l."id") AS "runningBalance"
        FROM "JournalLine" l
        JOIN "JournalEntry" e ON e."id" = l."entryId"
        WHERE l."accountId" = ${accountId} AND e."status" = 'POSTED' AND e."entryDate" <= ${to}
      ) t
      WHERE t."entryDate" >= ${from}
      ORDER BY t."entryDate", t."entryNumber", t."id"
      LIMIT ${p.pageSize} OFFSET ${offset}`;

    const total = await this.prisma.journalLine.count({
      where: { accountId, entry: { status: 'POSTED', entryDate: { gte: from, lte: to } } },
    });
    return {
      account: { id: account.id, code: account.code, nameAr: account.nameAr, nameEn: account.nameEn },
      openingBalance: opening.toFixed(2),
      items: rows.map((r) => ({
        ...r,
        debit: r.debit.toString(),
        credit: r.credit.toString(),
        runningBalance: r.runningBalance.toString(),
      })),
      total,
      page: p.page,
      pageSize: p.pageSize,
    };
  }
}
