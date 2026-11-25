import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JournalLineInput, dec, reverseLines, roundMoney } from '@erp/accounting-engine';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { toDate } from '../accounting/dto/journal.dto';
import { JournalPostingService, Tx } from '../accounting/journal/journal-posting.service';
import { AuditService } from '../audit/audit.service';
import { CreateVoucherDto } from './dto/treasury.dto';
import { FinancialAccountsService } from './financial-accounts.service';

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fa: FinancialAccountsService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateVoucherDto, actorId: string) {
    try {
      return await this.createOnce(dto, actorId);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.voucher.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (existing) return existing;
      }
      throw e;
    }
  }

  private async createOnce(dto: CreateVoucherDto, actorId: string) {
    this.validateShape(dto);
    const date = toDate(dto.date);
    const amount = roundMoney(dto.amount);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.voucher.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return { voucher: existing, created: false };

      // Lock in a fixed order so two transfers in opposite directions cannot deadlock.
      const ids = [dto.financialAccountId, dto.toFinancialAccountId].filter((x): x is string => Boolean(x)).sort();
      const locked = new Map<string, Awaited<ReturnType<FinancialAccountsService['lock']>>>();
      for (const id of ids) locked.set(id, await this.fa.lock(tx, id));
      const from = locked.get(dto.financialAccountId)!;
      const to = dto.toFinancialAccountId ? locked.get(dto.toFinancialAccountId)! : undefined;

      if (dto.representativeId) {
        const rep = await tx.representative.findUnique({ where: { id: dto.representativeId } });
        if (!rep || !rep.isActive) throw new BadRequestException('Representative not found or inactive');
        if (dto.type === 'RECEIPT' && from.id !== rep.financialAccountId) {
          throw new BadRequestException("A representative's collections must go into their custody account");
        }
      }
      if (dto.type !== 'RECEIPT') await this.fa.assertCanPay(tx, from, amount);

      const counter = await this.resolveCounter(tx, dto);
      const lines = this.buildLines(dto, from.glAccountId, to?.glAccountId, counter, amount);

      const voucher = await tx.voucher.create({
        data: {
          type: dto.type,
          voucherDate: date,
          amount: amount.toFixed(2),
          financialAccountId: from.id,
          toFinancialAccountId: to?.id,
          partyType: dto.partyType,
          partyId: dto.partyId,
          counterAccountId: dto.counterAccountId,
          description: dto.description,
          idempotencyKey: dto.idempotencyKey,
          representativeId: dto.representativeId,
          vehicleId: dto.vehicleId,
          expenseCategory: dto.expenseCategory,
          createdById: actorId,
        },
      });
      const { entry } = await this.posting.post(
        {
          entryDate: date,
          description: `${dto.type} #${voucher.number}: ${dto.description}`,
          source: `VOUCHER_${dto.type}`,
          sourceId: voucher.id,
          idempotencyKey: `journal:voucher:${voucher.id}`,
          createdById: actorId,
          lines,
        },
        tx,
      );
      return { voucher: await tx.voucher.update({ where: { id: voucher.id }, data: { journalEntryId: entry.id } }), created: true };
    });

    if (result.created) {
      await this.audit.record({
        userId: actorId,
        action: `CREATE_${dto.type}`,
        entity: 'Voucher',
        entityId: result.voucher.id,
        newData: { number: result.voucher.number, amount: amount.toFixed(2) },
      });
    }
    return result.voucher;
  }

  async cancel(id: string, reason: string, actorId: string) {
    const voucher = await this.prisma.$transaction(async (tx) => {
      const v = await tx.voucher.findUnique({ where: { id } });
      if (!v) throw new NotFoundException('Voucher not found');
      if (v.status !== 'POSTED') throw new ConflictException('Voucher is already cancelled');

      // Cancelling takes money back out of the account that received it.
      const outAccountId = v.type === 'RECEIPT' ? v.financialAccountId : v.type === 'TRANSFER' ? v.toFinancialAccountId : null;
      if (outAccountId) {
        const fa = await this.fa.lock(tx, outAccountId);
        await this.fa.assertCanPay(tx, fa, dec(v.amount.toString()));
      }
      if (v.journalEntryId) {
        const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: v.journalEntryId }, include: { lines: true } });
        const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
        await this.posting.post(
          {
            entryDate: today,
            description: `Cancellation of voucher #${v.number}: ${reason}`,
            source: 'VOUCHER_CANCEL',
            sourceId: id,
            idempotencyKey: `cancel:voucher:${id}`,
            reversesId: entry.id,
            createdById: actorId,
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
      return tx.voucher.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() } });
    });
    await this.audit.record({
      userId: actorId,
      action: 'CANCEL',
      entity: 'Voucher',
      entityId: id,
      oldData: { status: 'POSTED' },
      newData: { status: 'CANCELLED' },
      reason,
    });
    return voucher;
  }

  async list(p: PageParams, f: { type?: string; financialAccountId?: string; partyId?: string; representativeId?: string; status?: string; from?: string; to?: string }) {
    const where: Prisma.VoucherWhereInput = {
      ...(f.type === 'RECEIPT' || f.type === 'PAYMENT' || f.type === 'TRANSFER' ? { type: f.type } : {}),
      ...(f.financialAccountId ? { OR: [{ financialAccountId: f.financialAccountId }, { toFinancialAccountId: f.financialAccountId }] } : {}),
      ...(f.partyId ? { partyId: f.partyId } : {}),
      ...(f.representativeId ? { representativeId: f.representativeId } : {}),
      ...(f.status === 'POSTED' || f.status === 'CANCELLED' ? { status: f.status } : {}),
      ...(f.from || f.to
        ? { voucherDate: { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.voucher.findMany({ where, orderBy: { number: 'desc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.voucher.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const v = await this.prisma.voucher.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Voucher not found');
    return v;
  }

  private validateShape(dto: CreateVoucherDto): void {
    const hasParty = Boolean(dto.partyType || dto.partyId);
    if (hasParty && !(dto.partyType && dto.partyId)) throw new BadRequestException('partyType and partyId must be set together');
    if (dto.type === 'TRANSFER') {
      if (!dto.toFinancialAccountId) throw new BadRequestException('A transfer needs toFinancialAccountId');
      if (dto.toFinancialAccountId === dto.financialAccountId) throw new BadRequestException('Source and destination must differ');
      if (hasParty || dto.counterAccountId) throw new BadRequestException('A transfer cannot have a party or counter account');
      return;
    }
    if (dto.toFinancialAccountId) throw new BadRequestException('toFinancialAccountId is only for transfers');
    if ((dto.vehicleId || dto.expenseCategory) && dto.type !== 'PAYMENT') {
      throw new BadRequestException('Vehicle expenses are payments');
    }
    if (hasParty === Boolean(dto.counterAccountId)) {
      throw new BadRequestException('Provide either a party (customer/supplier) or a counterAccountId, not both or neither');
    }
  }

  private async resolveCounter(tx: Tx, dto: CreateVoucherDto): Promise<string | undefined> {
    if (dto.type === 'TRANSFER') return undefined;
    if (dto.partyType && dto.partyId) {
      const exists =
        dto.partyType === 'CUSTOMER'
          ? await tx.customer.findUnique({ where: { id: dto.partyId }, select: { id: true } })
          : await tx.supplier.findUnique({ where: { id: dto.partyId }, select: { id: true } });
      if (!exists) throw new BadRequestException(`${dto.partyType.toLowerCase()} not found`);
      const acc = await this.accounts.resolve([dto.partyType === 'CUSTOMER' ? 'RECEIVABLES' : 'PAYABLES'], tx);
      return dto.partyType === 'CUSTOMER' ? acc.RECEIVABLES : acc.PAYABLES;
    }
    const counter = await tx.account.findUnique({ where: { id: dto.counterAccountId! } });
    if (!counter || !counter.isActive || !counter.isPostable) throw new BadRequestException('Counter account is missing, inactive or not postable');
    const isMoneyAccount = await tx.financialAccount.findUnique({ where: { glAccountId: counter.id }, select: { id: true } });
    if (isMoneyAccount) throw new BadRequestException('Use a transfer to move money between cash boxes and banks');
    return counter.id;
  }

  private buildLines(dto: CreateVoucherDto, fromGl: string, toGl: string | undefined, counter: string | undefined, amount: ReturnType<typeof dec>): JournalLineInput[] {
    const party = dto.partyType && dto.partyId ? { partyType: dto.partyType, partyId: dto.partyId } : {};
    switch (dto.type) {
      case 'RECEIPT':
        return [
          { accountId: fromGl, debit: amount, credit: 0 },
          { accountId: counter!, debit: 0, credit: amount, ...party },
        ];
      case 'PAYMENT':
        return [
          { accountId: counter!, debit: amount, credit: 0, ...party },
          { accountId: fromGl, debit: 0, credit: amount },
        ];
      default:
        return [
          { accountId: toGl!, debit: amount, credit: 0 },
          { accountId: fromGl, debit: 0, credit: amount },
        ];
    }
  }
}
