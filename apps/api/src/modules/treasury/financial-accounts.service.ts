import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, dec, roundMoney } from '@erp/accounting-engine';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { toDate } from '../accounting/dto/journal.dto';
import { JournalPostingService, Tx } from '../accounting/journal/journal-posting.service';
import { AuditService } from '../audit/audit.service';
import { CreateFinancialAccountDto } from './dto/treasury.dto';

@Injectable()
export class FinancialAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const items = await this.prisma.financialAccount.findMany({ orderBy: { code: 'asc' } });
    const balances = await this.balances(items.map((i) => i.glAccountId));
    return items.map((i) => ({ ...i, balance: balances.get(i.glAccountId) ?? '0.00' }));
  }

  async get(id: string) {
    const fa = await this.prisma.financialAccount.findUnique({ where: { id } });
    if (!fa) throw new NotFoundException('Financial account not found');
    return { ...fa, balance: (await this.glBalance(fa.glAccountId)).toFixed(2) };
  }

  /** Balance straight from posted journal lines (plus the GL account's own opening balance). */
  async glBalance(glAccountId: string, tx?: Tx): Promise<Decimal> {
    const client = tx ?? this.prisma;
    const [acc, sums] = await Promise.all([
      client.account.findUniqueOrThrow({ where: { id: glAccountId } }),
      client.journalLine.aggregate({
        where: { accountId: glAccountId, entry: { status: 'POSTED' } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    return dec(acc.openingDebit.toString())
      .minus(acc.openingCredit.toString())
      .plus(sums._sum.debit?.toString() ?? '0')
      .minus(sums._sum.credit?.toString() ?? '0');
  }

  private async balances(glIds: string[]): Promise<Map<string, string>> {
    if (glIds.length === 0) return new Map();
    const [accs, sums] = await Promise.all([
      this.prisma.account.findMany({ where: { id: { in: glIds } } }),
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { accountId: { in: glIds }, entry: { status: 'POSTED' } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const out = new Map<string, string>();
    for (const a of accs) {
      const s = sums.find((x) => x.accountId === a.id)?._sum;
      out.set(
        a.id,
        dec(a.openingDebit.toString())
          .minus(a.openingCredit.toString())
          .plus(s?.debit?.toString() ?? '0')
          .minus(s?.credit?.toString() ?? '0')
          .toFixed(2),
      );
    }
    return out;
  }

  /** Serializes concurrent money movements on one account (row lock held until the transaction ends). */
  async lock(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FinancialAccount" WHERE "id" = ${id} FOR UPDATE`;
    if (rows.length === 0) throw new BadRequestException('Financial account not found');
    const fa = await tx.financialAccount.findUniqueOrThrow({ where: { id } });
    if (!fa.isActive) throw new BadRequestException(`Financial account ${fa.code} is inactive`);
    return fa;
  }

  /** Cash boxes cannot go negative; banks may be overdrawn. */
  async assertCanPay(tx: Tx, fa: { kind: string; code: string; glAccountId: string }, amount: Decimal): Promise<void> {
    if (fa.kind !== 'CASHBOX') return;
    const balance = await this.glBalance(fa.glAccountId, tx);
    if (balance.lt(amount)) {
      throw new BadRequestException(`Insufficient funds in cash box ${fa.code}: balance ${balance.toFixed(2)}, needed ${amount.toFixed(2)}`);
    }
  }

  async create(dto: CreateFinancialAccountDto, actorId: string) {
    if (await this.prisma.financialAccount.findUnique({ where: { code: dto.code } })) {
      throw new ConflictException('Code already exists');
    }
    const fa = await this.prisma.$transaction((tx) => this.createInTx(tx, dto, actorId));
    await this.audit.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'FinancialAccount',
      entityId: fa.id,
      newData: { code: fa.code, kind: fa.kind, opening: dto.openingBalance ?? '0' } as Prisma.InputJsonValue,
    });
    return fa;
  }

  /**
   * Creates the cash box / bank account and its dedicated GL account inside the caller's transaction.
   * `glParentCode`/`glPrefix` let other modules (e.g. representative custody) place it elsewhere in the chart.
   */
  async createInTx(
    tx: Tx,
    dto: CreateFinancialAccountDto,
    actorId: string,
    opts: { glParentCode?: string; glPrefix?: string } = {},
  ) {
    if (dto.kind === 'BANK' && !dto.bankName) throw new BadRequestException('bankName is required for bank accounts');
    const opening = roundMoney(dto.openingBalance ?? '0');
    const prefix = opts.glPrefix ?? (dto.kind === 'BANK' ? '1102' : '1101');
    const parent = await tx.account.findUniqueOrThrow({ where: { code: opts.glParentCode ?? '11' } });
    const gl = await tx.account.create({
      data: {
        code: `${prefix}.${dto.code}`,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        type: 'ASSET',
        normalBalance: 'DEBIT',
        parentId: parent.id,
        isPostable: true,
      },
    });
    const created = await tx.financialAccount.create({
      data: {
        code: dto.code,
        kind: dto.kind,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        glAccountId: gl.id,
      },
    });
    if (opening.gt(0)) {
      const acc = await this.accounts.resolve(['OPENING_EQUITY'], tx);
      await this.posting.post(
        {
          entryDate: toDate(dto.openingDate ?? new Date().toISOString()),
          description: `Opening balance: ${dto.code}`,
          source: 'OPENING_BALANCE',
          sourceId: created.id,
          idempotencyKey: `opening:fa:${created.id}`,
          createdById: actorId,
          lines: [
            { accountId: gl.id, debit: opening, credit: 0 },
            { accountId: acc.OPENING_EQUITY, debit: 0, credit: opening },
          ],
        },
        tx,
      );
    }
    return created;
  }
}
