import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { JournalLineInput, UnbalancedEntryError, InvalidLineError, dec, validateJournal } from '@erp/accounting-engine';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { toDate } from '../dto/journal.dto';
import { CreateRecurringJournalDto } from '../dto/recurring-journal.dto';
import { JournalPostingService } from '../journal/journal-posting.service';

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class RecurringJournalsService implements OnModuleInit {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: JournalPostingService,
    private readonly audit: AuditService,
  ) {}

  /** Hourly check for due templates. Idempotency keys make multiple app instances safe. */
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runDue(new Date(), 'system');
    }, 60 * 60 * 1000);
    this.timer.unref?.();
  }

  async create(dto: CreateRecurringJournalDto, actorId: string) {
    const lines = dto.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description }));
    try {
      validateJournal(lines);
    } catch (e) {
      if (e instanceof UnbalancedEntryError || e instanceof InvalidLineError) throw new BadRequestException(e.message);
      throw e;
    }
    if (dto.frequency === 'MONTHLY' && !dto.dayOfMonth) throw new BadRequestException('dayOfMonth is required for MONTHLY templates');
    if (dto.frequency === 'WEEKLY' && dto.dayOfWeek === undefined) throw new BadRequestException('dayOfWeek is required for WEEKLY templates');

    const template = await this.prisma.recurringJournal.create({
      data: {
        code: dto.code,
        description: dto.description,
        frequency: dto.frequency,
        dayOfMonth: dto.dayOfMonth,
        dayOfWeek: dto.dayOfWeek,
        nextRunDate: toDate(dto.nextRunDate),
        createdById: actorId,
        lines: {
          create: dto.lines.map((l) => ({
            accountId: l.accountId,
            debit: dec(l.debit).toFixed(2),
            credit: dec(l.credit).toFixed(2),
            description: l.description,
          })),
        },
      },
      include: { lines: true },
    });
    await this.audit.record({
      userId: actorId,
      action: 'CREATE_RECURRING_JOURNAL',
      entity: 'RecurringJournal',
      entityId: template.id,
      newData: { code: template.code, frequency: template.frequency },
    });
    return template;
  }

  list() {
    return this.prisma.recurringJournal.findMany({ include: { lines: true }, orderBy: { code: 'asc' } });
  }

  /** Posts a template once for its due date; replaying the same date is idempotent. */
  async run(id: string, dateStr: string | undefined, actorId: string) {
    const template = await this.prisma.recurringJournal.findUnique({ where: { id }, include: { lines: true } });
    if (!template) throw new NotFoundException('Recurring journal not found');
    if (!template.isActive) throw new BadRequestException('Recurring journal is inactive');

    const date = dateStr ? toDate(dateStr) : template.nextRunDate;
    const result = await this.prisma.$transaction(async (tx) => {
      const lines: JournalLineInput[] = template.lines.map((l) => ({
        accountId: l.accountId,
        debit: dec(l.debit.toString()),
        credit: dec(l.credit.toString()),
        description: l.description ?? undefined,
      }));
      const posted = await this.posting.post(
        {
          entryDate: date,
          description: template.description,
          source: 'RECURRING',
          sourceId: template.id,
          idempotencyKey: `recurring:${template.id}:${dateKey(date)}`,
          createdById: actorId,
          lines,
        },
        tx,
      );
      if (posted.created) {
        await tx.recurringJournal.update({
          where: { id },
          data: { lastRunDate: date, nextRunDate: this.nextDate(date, template.frequency, template.dayOfMonth, template.dayOfWeek) },
        });
      }
      return posted;
    });

    if (result.created) {
      await this.audit.record({
        userId: actorId,
        action: 'RUN_RECURRING_JOURNAL',
        entity: 'RecurringJournal',
        entityId: id,
        newData: { entryId: result.entry.id, date: dateKey(date) },
      });
    }
    return result.entry;
  }

  /** Called by the scheduler (and manually); each template/date is posted at most once. */
  async runDue(asOf = new Date(), actorId = 'system') {
    const due = await this.prisma.recurringJournal.findMany({
      where: { isActive: true, nextRunDate: { lte: asOf } },
      orderBy: { nextRunDate: 'asc' },
    });
    const out = [];
    for (const t of due) {
      try {
        out.push({ id: t.id, entryId: (await this.run(t.id, dateKey(t.nextRunDate), actorId)).id });
      } catch (e) {
        out.push({ id: t.id, error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }
    return out;
  }

  private nextDate(from: Date, frequency: string, dayOfMonth: number | null, dayOfWeek: number | null): Date {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    if (frequency === 'DAILY') {
      d.setDate(d.getDate() + 1);
      return d;
    }
    if (frequency === 'WEEKLY') {
      d.setDate(d.getDate() + 7);
      const target = dayOfWeek ?? d.getDay();
      d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
      return d;
    }
    d.setMonth(d.getMonth() + 1);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dayOfMonth ?? d.getDate(), daysInMonth));
    return d;
  }
}
