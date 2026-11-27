import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal, JournalLineInput, dec, roundMoney } from '@erp/accounting-engine';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SystemAccountsService } from '../accounts/system-accounts.service';
import { toDate } from '../dto/journal.dto';
import { CreateOpeningBalancesDto } from '../dto/opening-balance.dto';
import { JournalPostingService } from '../journal/journal-posting.service';

/**
 * Opening balances for customers and suppliers. Every balance is a balanced journal entry:
 * customers debit RECEIVABLES / credit OPENING_EQUITY, suppliers credit PAYABLES /
 * debit OPENING_EQUITY. Lines carry the party tag so statements and ageing include them.
 */
@Injectable()
export class OpeningBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateOpeningBalancesDto, actorId: string) {
    const date = toDate(dto.date);
    const key = dto.idempotencyKey ? `opening-balances:${dto.idempotencyKey}` : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const acc = await this.accounts.resolve(['RECEIVABLES', 'PAYABLES', 'OPENING_EQUITY'], tx);
      const lines: JournalLineInput[] = [];
      let customerTotal = new Decimal(0);
      let supplierTotal = new Decimal(0);

      for (const l of dto.lines) {
        const amount = roundMoney(dec(l.amount));
        if (amount.lte(0)) throw new BadRequestException('Opening balance amount must be greater than zero');

        const party =
          l.partyType === 'CUSTOMER'
            ? await tx.customer.findUnique({ where: { id: l.partyId }, select: { isActive: true } })
            : await tx.supplier.findUnique({ where: { id: l.partyId }, select: { isActive: true } });
        if (!party || !party.isActive) throw new BadRequestException(`${l.partyType} not found or inactive`);

        const tag = { partyType: l.partyType, partyId: l.partyId, description: l.description };
        if (l.partyType === 'CUSTOMER') {
          lines.push({ accountId: acc.RECEIVABLES, debit: amount, credit: 0, ...tag });
          customerTotal = customerTotal.plus(amount);
        } else {
          lines.push({ accountId: acc.PAYABLES, debit: 0, credit: amount, ...tag });
          supplierTotal = supplierTotal.plus(amount);
        }
      }

      // Separate debit/credit equity lines (validateJournal requires exactly one non-zero side per line).
      if (supplierTotal.gt(0)) {
        lines.push({ accountId: acc.OPENING_EQUITY, debit: supplierTotal, credit: 0, description: dto.note ?? 'Opening balances' });
      }
      if (customerTotal.gt(0)) {
        lines.push({ accountId: acc.OPENING_EQUITY, debit: 0, credit: customerTotal, description: dto.note ?? 'Opening balances' });
      }

      return this.posting.post(
        {
          entryDate: date,
          description: dto.note ?? 'Opening balances',
          source: 'OPENING_BALANCE',
          idempotencyKey: key,
          createdById: actorId,
          lines,
        },
        tx,
      );
    });

    if (result.created) {
      await this.audit.record({
        userId: actorId,
        action: 'OPENING_BALANCE',
        entity: 'JournalEntry',
        entityId: result.entry.id,
        newData: { number: result.entry.number, lines: dto.lines.length },
      });
    }
    return result.entry;
  }
}
