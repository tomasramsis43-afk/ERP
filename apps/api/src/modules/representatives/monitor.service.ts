import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal } from '@erp/accounting-engine';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';

const num = (v: { toString(): string } | null | undefined) => new Decimal(v?.toString() ?? '0');

/** A one-screen picture of every active representative for a given day. */
@Injectable()
export class MonitorService {
  constructor(private readonly prisma: PrismaService) {}

  async day(dateStr?: string) {
    const date = toDate(dateStr ?? new Date().toISOString());
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');

    const reps = await this.prisma.representative.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: {
        id: true, code: true, nameAr: true, nameEn: true, phone: true, routeId: true,
        route: { select: { code: true, nameAr: true, nameEn: true } },
        vehicle: { select: { plateNumber: true } },
        financialAccount: { select: { glAccountId: true } },
      },
    });
    const ids = reps.map((r) => r.id);
    const glIds = reps.map((r) => r.financialAccount.glAccountId);

    const [invoices, receipts, visits, closings, custody, plan, lastInvoice, lastVoucher] = await Promise.all([
      this.prisma.salesInvoice.groupBy({
        by: ['representativeId', 'kind', 'paymentKind'],
        where: { representativeId: { in: ids }, invoiceDate: date, status: 'POSTED' },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.voucher.groupBy({
        by: ['representativeId'],
        where: { representativeId: { in: ids }, voucherDate: date, status: 'POSTED', type: 'RECEIPT' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.routeVisit.groupBy({
        by: ['representativeId', 'outcome'],
        where: { representativeId: { in: ids }, visitDate: date },
        _count: { _all: true },
      }),
      this.prisma.repClosing.findMany({
        where: { representativeId: { in: ids }, closingDate: date },
        select: { representativeId: true, cashDifference: true, stockDifferenceValue: true, declaredCash: true },
      }),
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { accountId: { in: glIds }, entry: { status: 'POSTED' } },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.customer.groupBy({
        by: ['routeId'],
        where: { routeId: { in: reps.map((r) => r.routeId).filter((x): x is string => !!x) }, isActive: true },
        _count: { _all: true },
      }),
      this.prisma.salesInvoice.groupBy({ by: ['representativeId'], where: { representativeId: { in: ids }, invoiceDate: date }, _max: { createdAt: true } }),
      this.prisma.voucher.groupBy({ by: ['representativeId'], where: { representativeId: { in: ids }, voucherDate: date }, _max: { createdAt: true } }),
    ]);
    const lastVisit = await this.prisma.routeVisit.groupBy({ by: ['representativeId'], where: { representativeId: { in: ids }, visitDate: date }, _max: { visitedAt: true } });

    const rows = reps.map((r) => {
      let cash = new Decimal(0), credit = new Decimal(0), returns = new Decimal(0), invoiceCount = 0;
      for (const i of invoices.filter((x) => x.representativeId === r.id)) {
        const t = num(i._sum.total);
        if (i.kind === 'RETURN') returns = returns.plus(t);
        else {
          invoiceCount += i._count._all;
          if (i.paymentKind === 'CASH') cash = cash.plus(t); else credit = credit.plus(t);
        }
      }
      const rc = receipts.find((x) => x.representativeId === r.id);
      const byOutcome: Record<string, number> = {};
      let visited = 0;
      for (const v of visits.filter((x) => x.representativeId === r.id)) { byOutcome[v.outcome] = v._count._all; visited += v._count._all; }
      const closing = closings.find((c) => c.representativeId === r.id);
      const c = custody.find((x) => x.accountId === r.financialAccount.glAccountId);
      const times = [
        lastInvoice.find((x) => x.representativeId === r.id)?._max.createdAt,
        lastVoucher.find((x) => x.representativeId === r.id)?._max.createdAt,
        lastVisit.find((x) => x.representativeId === r.id)?._max.visitedAt,
      ].filter((t): t is Date => !!t);
      return {
        id: r.id, code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, phone: r.phone,
        route: r.route, plateNumber: r.vehicle?.plateNumber ?? null,
        visits: { done: visited, planned: plan.find((p) => p.routeId === r.routeId)?._count._all ?? 0, byOutcome },
        sales: { cash: cash.toFixed(2), credit: credit.toFixed(2), returns: returns.toFixed(2), net: cash.plus(credit).minus(returns).toFixed(2), invoices: invoiceCount },
        collections: { amount: num(rc?._sum.amount).toFixed(2), count: rc?._count._all ?? 0 },
        custodyBalance: num(c?._sum.debit).minus(num(c?._sum.credit)).toFixed(2),
        dayClosed: Boolean(closing),
        closing: closing ? { cashDifference: num(closing.cashDifference).toFixed(2), stockDifferenceValue: num(closing.stockDifferenceValue).toFixed(2) } : null,
        lastActivityAt: times.length ? new Date(Math.max(...times.map((t) => t.getTime()))).toISOString() : null,
      };
    });

    const sum = (f: (r: (typeof rows)[number]) => string) => rows.reduce((a, r) => a.plus(f(r)), new Decimal(0)).toFixed(2);
    return {
      date: date.toISOString().slice(0, 10),
      totals: {
        representatives: rows.length,
        active: rows.filter((r) => r.lastActivityAt).length,
        closed: rows.filter((r) => r.dayClosed).length,
        visits: rows.reduce((a, r) => a + r.visits.done, 0),
        salesNet: sum((r) => r.sales.net),
        collections: sum((r) => r.collections.amount),
        custodyBalance: sum((r) => r.custodyBalance),
      },
      representatives: rows,
    };
  }
}
