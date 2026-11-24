import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvalidLineError, UnbalancedEntryError, reverseLines, validateJournal } from '@erp/accounting-engine';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateJournalDto, ReverseJournalDto, toDate } from '../dto/journal.dto';
import { JournalPostingService } from './journal-posting.service';

export interface JournalFilter {
  page: number;
  pageSize: number;
  status?: 'DRAFT' | 'POSTED';
  source?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: JournalPostingService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateJournalDto, actorId: string) {
    const { entry } = await this.posting.post({
      entryDate: toDate(dto.entryDate),
      description: dto.description,
      source: 'MANUAL',
      status: dto.post ? 'POSTED' : 'DRAFT',
      createdById: actorId,
      lines: dto.lines,
    });
    await this.audit.record({
      userId: actorId,
      action: dto.post ? 'CREATE_POST' : 'CREATE_DRAFT',
      entity: 'JournalEntry',
      entityId: entry.id,
      newData: { number: entry.number, description: entry.description },
    });
    return entry;
  }

  async postDraft(id: string, actorId: string) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.status !== 'DRAFT') throw new ConflictException('Only draft entries can be posted');

    // Re-run the shared validation on stored lines before the entry becomes immutable.
    try {
      validateJournal(
        entry.lines.map((l) => ({ accountId: l.accountId, debit: l.debit.toString(), credit: l.credit.toString() })),
      );
    } catch (e) {
      if (e instanceof UnbalancedEntryError || e instanceof InvalidLineError) throw new BadRequestException(e.message);
      throw e;
    }

    const posted = await this.prisma.$transaction(async (tx) => {
      await this.posting.assertPeriodOpen(tx, entry.entryDate);
      return tx.journalEntry.update({
        where: { id },
        data: { status: 'POSTED', postedById: actorId, postedAt: new Date() },
        include: { lines: true },
      });
    });
    await this.audit.record({
      userId: actorId,
      action: 'POST',
      entity: 'JournalEntry',
      entityId: id,
      oldData: { status: 'DRAFT' },
      newData: { status: 'POSTED' },
    });
    return posted;
  }

  /** Corrections never edit a posted entry: they add an equal and opposite one, linked and audited. */
  async reverse(id: string, dto: ReverseJournalDto, actorId: string) {
    const original = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true, reversal: true },
    });
    if (!original) throw new NotFoundException('Journal entry not found');
    if (original.status !== 'POSTED') throw new BadRequestException('Only posted entries can be reversed');
    if (original.reversal) throw new ConflictException('Entry has already been reversed');

    const { entry, created } = await this.posting.post({
      entryDate: dto.entryDate ? toDate(dto.entryDate) : original.entryDate,
      description: `Reversal of #${original.number}: ${dto.reason}`,
      source: 'REVERSAL',
      sourceId: original.id,
      idempotencyKey: `reversal:${original.id}`,
      reversesId: original.id,
      createdById: actorId,
      lines: reverseLines(
        original.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit.toString(),
          credit: l.credit.toString(),
          description: l.description ?? undefined,
        })),
      ),
    });
    if (created) {
      await this.audit.record({
        userId: actorId,
        action: 'REVERSE',
        entity: 'JournalEntry',
        entityId: original.id,
        newData: { reversalId: entry.id, reversalNumber: entry.number },
        reason: dto.reason,
      });
    }
    return entry;
  }

  async list(f: JournalFilter) {
    const where: Prisma.JournalEntryWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.source ? { source: f.source } : {}),
      ...(f.from || f.to
        ? { entryDate: { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        orderBy: { number: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { items, total, page: f.page, pageSize: f.pageSize };
  }

  async get(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: { include: { account: { select: { code: true, nameAr: true, nameEn: true } } } } },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }
}
