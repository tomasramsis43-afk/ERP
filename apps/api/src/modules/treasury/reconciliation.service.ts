import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal, dec } from '@erp/accounting-engine';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';
import { AuditService } from '../audit/audit.service';
import { ReconcileDto } from './dto/treasury.dto';
import { FinancialAccountsService } from './financial-accounts.service';

/**
 * Bank reconciliation: the accountant ticks the ledger lines that appear on the bank statement.
 * The ticked lines plus everything reconciled before must equal the statement balance exactly.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fa: FinancialAccountsService,
    private readonly audit: AuditService,
  ) {}

  async unreconciled(id: string, p: PageParams) {
    const bank = await this.bank(id);
    const where = { accountId: bank.glAccountId, reconciled: null, entry: { status: 'POSTED' as const } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.journalLine.findMany({
        where,
        include: { entry: { select: { number: true, entryDate: true, description: true } } },
        orderBy: [{ entry: { entryDate: 'asc' } }, { id: 'asc' }],
        skip: p.skip,
        take: p.pageSize,
      }),
      this.prisma.journalLine.count({ where }),
    ]);
    return { reconciledBalance: (await this.reconciledBalance(this.prisma, bank.glAccountId)).toFixed(2), items, total, page: p.page, pageSize: p.pageSize };
  }

  async reconcile(id: string, dto: ReconcileDto, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const bank = await this.fa.lock(tx, id);
      if (bank.kind !== 'BANK') throw new BadRequestException('Only bank accounts can be reconciled');

      const ids = [...new Set(dto.journalLineIds)];
      const lines = await tx.journalLine.findMany({
        where: { id: { in: ids } },
        include: { reconciled: true, entry: { select: { status: true } } },
      });
      if (lines.length !== ids.length) throw new BadRequestException('Unknown journal line in selection');
      for (const l of lines) {
        if (l.accountId !== bank.glAccountId) throw new BadRequestException('A selected line does not belong to this bank account');
        if (l.entry.status !== 'POSTED') throw new BadRequestException('Only posted lines can be reconciled');
        if (l.reconciled) throw new BadRequestException('A selected line is already reconciled');
      }
      const before = await this.reconciledBalance(tx, bank.glAccountId);
      const selected = lines.reduce((a, l) => a.plus(l.debit.toString()).minus(l.credit.toString()), new Decimal(0));
      const after = before.plus(selected);
      const statement = dec(dto.statementBalance);
      if (!after.eq(statement)) {
        throw new BadRequestException(
          `Does not reconcile: ledger ${after.toFixed(2)} vs statement ${statement.toFixed(2)} (difference ${statement.minus(after).toFixed(2)})`,
        );
      }
      const rec = await tx.bankReconciliation.create({
        data: {
          financialAccountId: bank.id,
          statementDate: toDate(dto.statementDate),
          statementBalance: statement.toFixed(2),
          createdById: actorId,
          lines: { create: ids.map((journalLineId) => ({ journalLineId })) },
        },
      });
      return { id: rec.id, lines: ids.length, reconciledBalance: after.toFixed(2) };
    });
    await this.audit.record({ userId: actorId, action: 'RECONCILE', entity: 'FinancialAccount', entityId: id, newData: result });
    return result;
  }

  async history(id: string) {
    await this.bank(id);
    return this.prisma.bankReconciliation.findMany({
      where: { financialAccountId: id },
      orderBy: { statementDate: 'desc' },
      take: 100,
      include: { _count: { select: { lines: true } } },
    });
  }

  private async bank(id: string) {
    const bank = await this.prisma.financialAccount.findUnique({ where: { id } });
    if (!bank) throw new NotFoundException('Financial account not found');
    return bank;
  }

  private async reconciledBalance(client: Pick<PrismaService, 'journalLine' | 'account'>, glAccountId: string): Promise<Decimal> {
    const [acc, sums] = await Promise.all([
      client.account.findUniqueOrThrow({ where: { id: glAccountId } }),
      client.journalLine.aggregate({
        where: { accountId: glAccountId, reconciled: { isNot: null }, entry: { status: 'POSTED' } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    return dec(acc.openingDebit.toString())
      .minus(acc.openingCredit.toString())
      .plus(sums._sum.debit?.toString() ?? '0')
      .minus(sums._sum.credit?.toString() ?? '0');
  }
}
