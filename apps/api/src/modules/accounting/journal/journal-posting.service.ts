import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvalidLineError, JournalLineInput, UnbalancedEntryError, validateJournal } from '@erp/accounting-engine';
import { PrismaService } from '../../../database/prisma.service';

export interface PostJournalInput {
  entryDate: Date;
  description: string;
  source: string;
  sourceId?: string;
  /** Same key => same entry. Required for automatic postings (invoices, receipts, offline sync). */
  idempotencyKey?: string;
  status?: 'DRAFT' | 'POSTED';
  createdById?: string;
  reversesId?: string;
  lines: JournalLineInput[];
}

export type Tx = Prisma.TransactionClient;

const WITH_LINES = { lines: true } satisfies Prisma.JournalEntryInclude;

/**
 * The only place journal entries are created. Every module (sales, purchases, treasury, ...)
 * posts through this service so validation, period checks and idempotency live in one place.
 */
@Injectable()
export class JournalPostingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the entry (or returns the existing one for the same idempotency key).
   * Pass `tx` to make the posting part of the caller's business transaction.
   */
  async post(input: PostJournalInput, tx?: Tx) {
    if (tx) return this.postWith(tx, input);
    try {
      return await this.prisma.$transaction((client) => this.postWith(client, input));
    } catch (e) {
      // Concurrent duplicate: the unique key rejected the second insert; return the winner.
      if (
        input.idempotencyKey &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const existing = await this.prisma.journalEntry.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: WITH_LINES,
        });
        if (existing) return { entry: existing, created: false };
      }
      throw e;
    }
  }

  async assertPeriodOpen(client: Tx, date: Date): Promise<string> {
    const period = await client.fiscalPeriod.findFirst({
      where: { startDate: { lte: date }, endDate: { gte: date } },
    });
    if (!period) throw new BadRequestException('No fiscal period covers this date');
    if (period.status !== 'OPEN') throw new BadRequestException('The fiscal period is closed');
    return period.id;
  }

  private async postWith(client: Tx, input: PostJournalInput) {
    if (input.idempotencyKey) {
      const existing = await client.journalEntry.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: WITH_LINES,
      });
      if (existing) return { entry: existing, created: false };
    }

    let validated;
    try {
      validated = validateJournal(input.lines);
    } catch (e) {
      if (e instanceof UnbalancedEntryError || e instanceof InvalidLineError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    const accountIds = [...new Set(validated.lines.map((l) => l.accountId))];
    const accounts = await client.account.findMany({ where: { id: { in: accountIds } } });
    if (accounts.length !== accountIds.length) throw new BadRequestException('Unknown account in journal lines');
    const bad = accounts.find((a) => !a.isActive || !a.isPostable);
    if (bad) throw new BadRequestException(`Account ${bad.code} is inactive or not postable`);

    const periodId = await this.assertPeriodOpen(client, input.entryDate);
    const status = input.status ?? 'POSTED';

    const entry = await client.journalEntry.create({
      data: {
        entryDate: input.entryDate,
        description: input.description,
        status,
        source: input.source,
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        reversesId: input.reversesId,
        periodId,
        createdById: input.createdById,
        postedById: status === 'POSTED' ? input.createdById : undefined,
        postedAt: status === 'POSTED' ? new Date() : undefined,
        lines: {
          create: validated.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit.toFixed(2),
            credit: l.credit.toFixed(2),
            description: l.description,
          })),
        },
      },
      include: WITH_LINES,
    });
    return { entry, created: true };
  }
}
