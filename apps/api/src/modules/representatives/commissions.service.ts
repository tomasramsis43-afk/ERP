import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, dec, roundMoney } from '@erp/accounting-engine';
import { PageParams } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';
import { toDate } from '../accounting/dto/journal.dto';
import { JournalPostingService, Tx } from '../accounting/journal/journal-posting.service';
import { AuditService } from '../audit/audit.service';
import { FinancialAccountsService } from '../treasury/financial-accounts.service';
import { PayCommissionsDto } from './dto/representatives.dto';
import { RuleLike, pickRule } from './commission-resolver';

interface NewEntry {
  sourceKey: string;
  sourceType: string;
  sourceId: string;
  amount: Decimal;
}

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financial: FinancialAccountsService,
    private readonly posting: JournalPostingService,
    private readonly accounts: SystemAccountsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Accrues commission for the representative's documents dated `date`, and claws back commission
   * on documents cancelled since. Runs inside the daily-closing transaction. Each document has a
   * unique source key, so it can never be commissioned twice. Returns the signed total accrued.
   */
  async accrue(tx: Tx, repId: string, date: Date, closingId: string): Promise<Decimal> {
    const rules = (await tx.commissionRule.findMany({
      where: { isActive: true, OR: [{ representativeId: null }, { representativeId: repId }] },
    })).map((r) => ({ ...r, ratePercent: r.ratePercent.toString() })) as RuleLike[];

    const entries: NewEntry[] = [];

    const invoices = await tx.salesInvoice.findMany({
      where: { representativeId: repId, invoiceDate: date, status: 'POSTED' },
      include: { lines: true, customer: { select: { regionId: true } } },
    });
    for (const inv of invoices) {
      let total = new Decimal(0);
      for (const line of inv.lines) {
        const rule = pickRule(
          rules,
          { representativeId: repId, productId: line.productId, customerId: inv.customerId, geoAreaId: inv.customer?.regionId },
          ['SALES', 'MARGIN'],
        );
        if (!rule) continue;
        const net = dec(line.lineNet.toString());
        const base =
          rule.basis === 'MARGIN' ? Decimal.max(0, net.minus(dec(line.baseQty.toString()).times(line.unitCost.toString()))) : net;
        total = total.plus(base.times(rule.ratePercent).div(100));
      }
      const amount = roundMoney(inv.kind === 'RETURN' ? total.negated() : total);
      if (!amount.isZero()) {
        entries.push({
          sourceKey: `${inv.kind === 'SALE' ? 'SALES_INVOICE' : 'SALES_RETURN'}:${inv.id}`,
          sourceType: inv.kind === 'SALE' ? 'SALES_INVOICE' : 'SALES_RETURN',
          sourceId: inv.id,
          amount,
        });
      }
    }

    const receipts = await tx.voucher.findMany({
      where: { representativeId: repId, voucherDate: date, status: 'POSTED', type: 'RECEIPT', partyType: 'CUSTOMER' },
    });
    if (receipts.length) {
      const customers = await tx.customer.findMany({
        where: { id: { in: receipts.map((r) => r.partyId!) } },
        select: { id: true, regionId: true },
      });
      for (const v of receipts) {
        const rule = pickRule(
          rules,
          { representativeId: repId, customerId: v.partyId, geoAreaId: customers.find((c) => c.id === v.partyId)?.regionId },
          ['COLLECTIONS'],
        );
        if (!rule) continue;
        const amount = roundMoney(dec(v.amount.toString()).times(rule.ratePercent).div(100));
        if (!amount.isZero()) entries.push({ sourceKey: `VOUCHER:${v.id}`, sourceType: 'VOUCHER', sourceId: v.id, amount });
      }
    }

    entries.push(...(await this.clawbacks(tx, repId)));

    // Never write the same document twice.
    const existing = new Set(
      (await tx.commissionEntry.findMany({ where: { sourceKey: { in: entries.map((e) => e.sourceKey) } }, select: { sourceKey: true } })).map((e) => e.sourceKey),
    );
    const fresh = entries.filter((e) => !existing.has(e.sourceKey));
    const total = fresh.reduce((a, e) => a.plus(e.amount), new Decimal(0));
    if (fresh.length === 0) return total;

    let journalEntryId: string | undefined;
    if (!total.isZero()) {
      const acc = await this.accounts.resolve(['COMMISSION_EXPENSE', 'ACCRUED_LIABILITIES'], tx);
      const abs = total.abs();
      const { entry } = await this.posting.post(
        {
          entryDate: date,
          description: `Representative commission accrual (closing ${closingId.slice(0, 8)})`,
          source: 'COMMISSION_ACCRUAL',
          sourceId: closingId,
          idempotencyKey: `journal:closing-commission:${closingId}`,
          lines: total.gt(0)
            ? [
                { accountId: acc.COMMISSION_EXPENSE, debit: abs, credit: 0 },
                { accountId: acc.ACCRUED_LIABILITIES, debit: 0, credit: abs },
              ]
            : [
                { accountId: acc.ACCRUED_LIABILITIES, debit: abs, credit: 0 },
                { accountId: acc.COMMISSION_EXPENSE, debit: 0, credit: abs },
              ],
        },
        tx,
      );
      journalEntryId = entry.id;
    }
    await tx.commissionEntry.createMany({
      data: fresh.map((e) => ({
        representativeId: repId,
        sourceKey: e.sourceKey,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        amount: e.amount.toFixed(2),
        closingId,
        journalEntryId,
      })),
    });
    return total;
  }

  /** Commission already booked on a document that has since been cancelled is taken back. */
  private async clawbacks(tx: Tx, repId: string): Promise<NewEntry[]> {
    const [invoices, vouchers] = await Promise.all([
      tx.salesInvoice.findMany({ where: { representativeId: repId, status: 'CANCELLED' }, select: { id: true, kind: true } }),
      tx.voucher.findMany({ where: { representativeId: repId, status: 'CANCELLED', type: 'RECEIPT' }, select: { id: true } }),
    ]);
    const keys = [
      ...invoices.map((i) => `${i.kind === 'SALE' ? 'SALES_INVOICE' : 'SALES_RETURN'}:${i.id}`),
      ...vouchers.map((v) => `VOUCHER:${v.id}`),
    ];
    if (keys.length === 0) return [];
    const [original, reversals] = await Promise.all([
      tx.commissionEntry.findMany({ where: { sourceKey: { in: keys } } }),
      tx.commissionEntry.findMany({ where: { sourceKey: { in: keys.map((k) => `REVERSAL:${k}`) } }, select: { sourceKey: true } }),
    ]);
    const reversed = new Set(reversals.map((r) => r.sourceKey));
    return original
      .filter((o) => !reversed.has(`REVERSAL:${o.sourceKey}`))
      .map((o) => ({ sourceKey: `REVERSAL:${o.sourceKey}`, sourceType: 'REVERSAL', sourceId: o.sourceId, amount: dec(o.amount.toString()).negated() }));
  }

  async list(repId: string, p: PageParams, paid?: string) {
    const where: Prisma.CommissionEntryWhereInput = {
      representativeId: repId,
      ...(paid === 'true' ? { paidAt: { not: null } } : paid === 'false' ? { paidAt: null } : {}),
    };
    const [items, total, unpaid] = await this.prisma.$transaction([
      this.prisma.commissionEntry.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.pageSize }),
      this.prisma.commissionEntry.count({ where }),
      this.prisma.commissionEntry.aggregate({ where: { representativeId: repId, paidAt: null }, _sum: { amount: true } }),
    ]);
    return { items, total, unpaidTotal: (unpaid._sum.amount ?? 0).toString(), page: p.page, pageSize: p.pageSize };
  }

  /** Pays every unpaid commission of the representative in one voucher (idempotent, serialized by the account lock). */
  async pay(repId: string, dto: PayCommissionsDto, actorId: string) {
    try {
      return await this.payOnce(repId, dto, actorId);
    } catch (e) {
      // A racing duplicate of the same operation: the winner's voucher is the answer.
      const existing = await this.prisma.voucher.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return existing;
      throw e;
    }
  }

  private async payOnce(repId: string, dto: PayCommissionsDto, actorId: string) {
    const date = toDate(dto.date);
    const result = await this.prisma.$transaction(async (tx) => {
      const prior = await tx.voucher.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (prior) return { voucher: prior, created: false };

      const rep = await tx.representative.findUnique({ where: { id: repId } });
      if (!rep) throw new NotFoundException('Representative not found');
      const fa = await this.financial.lock(tx, dto.financialAccountId);
      const unpaid = await tx.commissionEntry.findMany({ where: { representativeId: repId, paidAt: null } });
      const total = roundMoney(unpaid.reduce((a, e) => a.plus(e.amount.toString()), new Decimal(0)));
      if (total.lte(0)) throw new BadRequestException('No unpaid commission to pay');
      await this.financial.assertCanPay(tx, fa, total);

      const acc = await this.accounts.resolve(['ACCRUED_LIABILITIES'], tx);
      const voucher = await tx.voucher.create({
        data: {
          type: 'PAYMENT',
          voucherDate: date,
          amount: total.toFixed(2),
          financialAccountId: fa.id,
          counterAccountId: acc.ACCRUED_LIABILITIES,
          description: `Commission payout: ${rep.code}`,
          idempotencyKey: dto.idempotencyKey,
          representativeId: repId,
          createdById: actorId,
        },
      });
      const { entry } = await this.posting.post(
        {
          entryDate: date,
          description: `Commission payout ${rep.code} (voucher #${voucher.number})`,
          source: 'COMMISSION_PAYOUT',
          sourceId: voucher.id,
          idempotencyKey: `journal:voucher:${voucher.id}`,
          createdById: actorId,
          lines: [
            { accountId: acc.ACCRUED_LIABILITIES, debit: total, credit: 0 },
            { accountId: fa.glAccountId, debit: 0, credit: total },
          ],
        },
        tx,
      );
      await tx.commissionEntry.updateMany({
        where: { id: { in: unpaid.map((e) => e.id) }, paidAt: null },
        data: { paidAt: new Date(), paymentVoucherId: voucher.id },
      });
      return { voucher: await tx.voucher.update({ where: { id: voucher.id }, data: { journalEntryId: entry.id } }), created: true };
    });
    if (result.created) {
      await this.audit.record({ userId: actorId, action: 'PAY_COMMISSIONS', entity: 'Representative', entityId: repId, newData: { amount: result.voucher.amount.toString() } });
    }
    return result.voucher;
  }
}
