import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChequeDirection, Prisma } from '@prisma/client';
import { roundMoney } from '@erp/accounting-engine';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { toDate } from '../accounting/dto/journal.dto';
import { JournalPostingService } from '../accounting/journal/journal-posting.service';
import { AuditService } from '../audit/audit.service';
import { BounceChequeDto, IncomingChequeDto, OutgoingChequeDto, SettleChequeDto } from './dto/treasury.dto';
import { FinancialAccountsService } from './financial-accounts.service';

/**
 * Cheque lifecycle (every step posts its own journal entry):
 *  incoming  received  : Dr Cheques Under Collection / Cr Receivables(customer)
 *            collected : Dr Bank / Cr Cheques Under Collection
 *            bounced   : Dr Receivables(customer) / Cr Cheques Under Collection
 *  outgoing  issued    : Dr Payables(supplier) / Cr Cheques Payable
 *            cleared   : Dr Cheques Payable / Cr Bank
 *            bounced   : Dr Cheques Payable / Cr Payables(supplier)
 */
@Injectable()
export class ChequesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fa: FinancialAccountsService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly audit: AuditService,
  ) {}

  receive(dto: IncomingChequeDto, actorId: string) {
    return this.guardIdempotency(dto.idempotencyKey, () => this.receiveOnce(dto, actorId));
  }

  issue(dto: OutgoingChequeDto, actorId: string) {
    return this.guardIdempotency(dto.idempotencyKey, () => this.issueOnce(dto, actorId));
  }

  private async guardIdempotency<T>(key: string, run: () => Promise<T>) {
    try {
      return await run();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.cheque.findUnique({ where: { idempotencyKey: key } });
        if (existing) return existing as unknown as T;
      }
      throw e;
    }
  }

  private async receiveOnce(dto: IncomingChequeDto, actorId: string) {
    const amount = roundMoney(dto.amount);
    const received = toDate(dto.receivedDate);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.cheque.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return { cheque: existing, created: false };
      if (!(await tx.customer.findUnique({ where: { id: dto.customerId }, select: { id: true } }))) {
        throw new BadRequestException('Customer not found');
      }
      const cheque = await tx.cheque.create({
        data: {
          direction: 'INCOMING',
          chequeNumber: dto.chequeNumber,
          bankName: dto.bankName,
          dueDate: toDate(dto.dueDate),
          receivedDate: received,
          amount: amount.toFixed(2),
          partyType: 'CUSTOMER',
          partyId: dto.customerId,
          idempotencyKey: dto.idempotencyKey,
          note: dto.note,
          createdById: actorId,
        },
      });
      const acc = await this.accounts.resolve(['CHEQUES_UNDER_COLLECTION', 'RECEIVABLES'], tx);
      const { entry } = await this.posting.post(
        {
          entryDate: received,
          description: `Cheque ${dto.chequeNumber} received (${dto.bankName})`,
          source: 'CHEQUE_RECEIVED',
          sourceId: cheque.id,
          idempotencyKey: `journal:cheque-open:${cheque.id}`,
          createdById: actorId,
          lines: [
            { accountId: acc.CHEQUES_UNDER_COLLECTION, debit: amount, credit: 0 },
            { accountId: acc.RECEIVABLES, debit: 0, credit: amount, partyType: 'CUSTOMER', partyId: dto.customerId },
          ],
        },
        tx,
      );
      return { cheque: await tx.cheque.update({ where: { id: cheque.id }, data: { openJournalEntryId: entry.id } }), created: true };
    });
    if (result.created) {
      await this.audit.record({ userId: actorId, action: 'RECEIVE_CHEQUE', entity: 'Cheque', entityId: result.cheque.id, newData: { amount: amount.toFixed(2), number: dto.chequeNumber } });
    }
    return result.cheque;
  }

  private async issueOnce(dto: OutgoingChequeDto, actorId: string) {
    const amount = roundMoney(dto.amount);
    const issued = toDate(dto.issueDate);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.cheque.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return { cheque: existing, created: false };
      if (!(await tx.supplier.findUnique({ where: { id: dto.supplierId }, select: { id: true } }))) {
        throw new BadRequestException('Supplier not found');
      }
      const bank = await tx.financialAccount.findUnique({ where: { id: dto.financialAccountId } });
      if (!bank || bank.kind !== 'BANK' || !bank.isActive) throw new BadRequestException('Cheques are drawn on an active bank account');
      const cheque = await tx.cheque.create({
        data: {
          direction: 'OUTGOING',
          chequeNumber: dto.chequeNumber,
          bankName: bank.bankName ?? bank.nameEn,
          dueDate: toDate(dto.dueDate),
          receivedDate: issued,
          amount: amount.toFixed(2),
          partyType: 'SUPPLIER',
          partyId: dto.supplierId,
          financialAccountId: bank.id,
          idempotencyKey: dto.idempotencyKey,
          note: dto.note,
          createdById: actorId,
        },
      });
      const acc = await this.accounts.resolve(['PAYABLES', 'CHEQUES_PAYABLE'], tx);
      const { entry } = await this.posting.post(
        {
          entryDate: issued,
          description: `Cheque ${dto.chequeNumber} issued`,
          source: 'CHEQUE_ISSUED',
          sourceId: cheque.id,
          idempotencyKey: `journal:cheque-open:${cheque.id}`,
          createdById: actorId,
          lines: [
            { accountId: acc.PAYABLES, debit: amount, credit: 0, partyType: 'SUPPLIER', partyId: dto.supplierId },
            { accountId: acc.CHEQUES_PAYABLE, debit: 0, credit: amount },
          ],
        },
        tx,
      );
      return { cheque: await tx.cheque.update({ where: { id: cheque.id }, data: { openJournalEntryId: entry.id } }), created: true };
    });
    if (result.created) {
      await this.audit.record({ userId: actorId, action: 'ISSUE_CHEQUE', entity: 'Cheque', entityId: result.cheque.id, newData: { amount: amount.toFixed(2), number: dto.chequeNumber } });
    }
    return result.cheque;
  }

  async settle(id: string, dto: SettleChequeDto, actorId: string) {
    const date = toDate(dto.date);
    const cheque = await this.prisma.$transaction(async (tx) => {
      const c = await this.claim(tx, id);
      const amount = roundMoney(c.amount.toString());
      const acc = await this.accounts.resolve(['CHEQUES_UNDER_COLLECTION', 'CHEQUES_PAYABLE'], tx);

      let bankId: string;
      if (c.direction === 'INCOMING') {
        if (!dto.financialAccountId) throw new BadRequestException('financialAccountId (the receiving bank) is required');
        bankId = dto.financialAccountId;
      } else {
        bankId = c.financialAccountId!;
      }
      const bank = await this.fa.lock(tx, bankId);
      if (bank.kind !== 'BANK') throw new BadRequestException('The settlement account must be a bank account');
      const { entry } = await this.posting.post(
        {
          entryDate: date,
          description: `Cheque ${c.chequeNumber} ${c.direction === 'INCOMING' ? 'collected' : 'cleared'}`,
          source: 'CHEQUE_SETTLED',
          sourceId: id,
          idempotencyKey: `journal:cheque-settle:${id}`,
          createdById: actorId,
          lines:
            c.direction === 'INCOMING'
              ? [
                  { accountId: bank.glAccountId, debit: amount, credit: 0 },
                  { accountId: acc.CHEQUES_UNDER_COLLECTION, debit: 0, credit: amount },
                ]
              : [
                  { accountId: acc.CHEQUES_PAYABLE, debit: amount, credit: 0 },
                  { accountId: bank.glAccountId, debit: 0, credit: amount },
                ],
        },
        tx,
      );
      return tx.cheque.update({
        where: { id },
        data: { status: 'SETTLED', settledAt: new Date(), settleJournalEntryId: entry.id, financialAccountId: bank.id },
      });
    });
    await this.audit.record({ userId: actorId, action: 'SETTLE_CHEQUE', entity: 'Cheque', entityId: id, oldData: { status: 'PENDING' }, newData: { status: 'SETTLED' } });
    return cheque;
  }

  async bounce(id: string, dto: BounceChequeDto, actorId: string) {
    const date = toDate(dto.date);
    const cheque = await this.prisma.$transaction(async (tx) => {
      const c = await this.claim(tx, id);
      const amount = roundMoney(c.amount.toString());
      const acc = await this.accounts.resolve(['CHEQUES_UNDER_COLLECTION', 'CHEQUES_PAYABLE', 'RECEIVABLES', 'PAYABLES'], tx);
      const incoming = c.direction === 'INCOMING';
      const { entry } = await this.posting.post(
        {
          entryDate: date,
          description: `Cheque ${c.chequeNumber} bounced: ${dto.reason}`,
          source: 'CHEQUE_BOUNCED',
          sourceId: id,
          idempotencyKey: `journal:cheque-settle:${id}`,
          createdById: actorId,
          lines: incoming
            ? [
                { accountId: acc.RECEIVABLES, debit: amount, credit: 0, partyType: 'CUSTOMER', partyId: c.partyId },
                { accountId: acc.CHEQUES_UNDER_COLLECTION, debit: 0, credit: amount },
              ]
            : [
                { accountId: acc.CHEQUES_PAYABLE, debit: amount, credit: 0 },
                { accountId: acc.PAYABLES, debit: 0, credit: amount, partyType: 'SUPPLIER', partyId: c.partyId },
              ],
        },
        tx,
      );
      return tx.cheque.update({ where: { id }, data: { status: 'BOUNCED', settledAt: new Date(), settleJournalEntryId: entry.id, note: dto.reason } });
    });
    await this.audit.record({ userId: actorId, action: 'BOUNCE_CHEQUE', entity: 'Cheque', entityId: id, oldData: { status: 'PENDING' }, newData: { status: 'BOUNCED' }, reason: dto.reason });
    return cheque;
  }

  /** Atomically takes a PENDING cheque: of two racing settle/bounce calls only one can win. */
  private async claim(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Cheque" WHERE "id" = ${id} FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Cheque not found');
    const c = await tx.cheque.findUniqueOrThrow({ where: { id } });
    if (c.status !== 'PENDING') throw new ConflictException(`Cheque is already ${c.status.toLowerCase()}`);
    return c;
  }

  async list(p: PageParams, f: { direction?: ChequeDirection; status?: string; partyId?: string; dueFrom?: string; dueTo?: string }) {
    const where: Prisma.ChequeWhereInput = {
      ...(f.direction ? { direction: f.direction } : {}),
      ...(f.status === 'PENDING' || f.status === 'SETTLED' || f.status === 'BOUNCED' ? { status: f.status } : {}),
      ...(f.partyId ? { partyId: f.partyId } : {}),
      ...(f.dueFrom || f.dueTo
        ? { dueDate: { ...(f.dueFrom ? { gte: toDate(f.dueFrom) } : {}), ...(f.dueTo ? { lte: toDate(f.dueTo) } : {}) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cheque.findMany({ where, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }], skip: p.skip, take: p.pageSize }),
      this.prisma.cheque.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
}
