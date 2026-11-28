import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PartyLedgerService } from '../parties/party-ledger.service';

const day = (v: string): Date => new Date(`${v}T00:00:00.000Z`);
const str = (v: Prisma.Decimal | null | undefined): string => (v ?? new Prisma.Decimal(0)).toFixed(2);
const MAX_DAYS = 93;

/**
 * Online-only read models for the representative's phone: a customer's statement and the representative's own
 * performance report. Both are scoped to the signed-in user's representative profile.
 */
@Injectable()
export class RepReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: PartyLedgerService,
  ) {}

  private async profile(userId: string) {
    const rep = await this.prisma.representative.findUnique({ where: { userId }, select: { id: true, routeId: true, vehicleId: true } });
    if (!rep) throw new NotFoundException('No representative profile is linked to this user');
    return rep;
  }

  /** A customer of this representative (assigned directly or through the route): statement, balance and aging. */
  async customerStatement(userId: string, customerId: string, from?: string, to?: string) {
    const rep = await this.profile(userId);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, code: true, nameAr: true, nameEn: true, phone: true, address: true, creditLimit: true, representativeId: true, routeId: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    const mine = customer.representativeId === rep.id || (rep.routeId !== null && customer.routeId === rep.routeId);
    if (!mine) throw new ForbiddenException('This customer is not assigned to you');
    const [statement, aging] = await Promise.all([
      this.ledger.statement('CUSTOMER', customerId, { from, to }),
      this.ledger.aging('CUSTOMER', customerId),
    ]);
    return {
      customer: { ...customer, creditLimit: customer.creditLimit.toString() },
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      rows: statement.rows.slice(-200).map((r) => ({
        date: r.entryDate.toISOString().slice(0, 10),
        number: r.entryNumber,
        description: r.description,
        debit: r.debit,
        credit: r.credit,
        balance: r.balance,
      })),
      aging,
    };
  }

  async myReport(userId: string, fromIn?: string, toIn?: string) {
    const rep = await this.profile(userId);
    const today = new Date().toISOString().slice(0, 10);
    const from = day(fromIn ?? today);
    const to = day(toIn ?? today);
    if (to < from) throw new ForbiddenException('The end date is before the start date');
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_DAYS) throw new ForbiddenException(`The range is limited to ${MAX_DAYS} days`);
    const toEnd = new Date(to.getTime() + 86_399_999);

    const [invoices, collections, expenses, commission, unpaidCommission, visits] = await Promise.all([
      this.prisma.salesInvoice.groupBy({
        by: ['kind', 'paymentKind'],
        where: { representativeId: rep.id, status: 'POSTED', invoiceDate: { gte: from, lte: to } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.voucher.aggregate({
        where: { representativeId: rep.id, type: 'RECEIPT', status: 'POSTED', voucherDate: { gte: from, lte: to } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      rep.vehicleId
        ? this.prisma.voucher.aggregate({
            where: { vehicleId: rep.vehicleId, type: 'PAYMENT', status: 'POSTED', voucherDate: { gte: from, lte: to } },
            _sum: { amount: true },
            _count: { _all: true },
          })
        : Promise.resolve(null),
      this.prisma.commissionEntry.aggregate({ where: { representativeId: rep.id, createdAt: { gte: from, lte: toEnd } }, _sum: { amount: true } }),
      this.prisma.commissionEntry.aggregate({ where: { representativeId: rep.id, paidAt: null }, _sum: { amount: true } }),
      this.prisma.routeVisit.groupBy({ by: ['outcome'], where: { representativeId: rep.id, visitDate: { gte: from, lte: to } }, _count: { _all: true } }),
    ]);

    const sum = (kind: 'SALE' | 'RETURN', pay?: 'CASH' | 'CREDIT') =>
      invoices
        .filter((g) => g.kind === kind && (!pay || g.paymentKind === pay))
        .reduce((a, g) => a.plus(g._sum.total ?? 0), new Prisma.Decimal(0));
    const count = (kind: 'SALE' | 'RETURN') => invoices.filter((g) => g.kind === kind).reduce((a, g) => a + g._count._all, 0);

    return {
      from: fromIn ?? today,
      to: toIn ?? today,
      sales: { count: count('SALE'), total: str(sum('SALE')), cash: str(sum('SALE', 'CASH')), credit: str(sum('SALE', 'CREDIT')) },
      returns: { count: count('RETURN'), total: str(sum('RETURN')) },
      collections: { count: collections._count._all, total: str(collections._sum.amount) },
      expenses: { count: expenses?._count._all ?? 0, total: str(expenses?._sum.amount) },
      commission: { earnedInRange: str(commission._sum.amount), unpaidTotal: str(unpaidCommission._sum.amount) },
      visits: Object.fromEntries(visits.map((v) => [v.outcome, v._count._all])),
    };
  }
}
