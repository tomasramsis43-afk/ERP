import { Injectable } from '@nestjs/common';
import { Decimal, dec } from '@erp/accounting-engine';
import { PrismaService } from '../../database/prisma.service';

const num = (v: { toString(): string } | null | undefined) => dec(v?.toString() ?? '0');
const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Every figure is read from posted data; nothing here is a placeholder. */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const today = dayStart(new Date());
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const trendFrom = addDays(today, -13);

    const [salesToday, salesMonth, purchasesMonth, trendRows, topCustomers, topProducts, cash, receivable, payable, inventory, lowStock, cheques] =
      await Promise.all([
        this.netSales(today, today),
        this.netSales(monthStart, today),
        this.prisma.purchaseInvoice.aggregate({
          where: { kind: 'PURCHASE', status: 'POSTED', invoiceDate: { gte: monthStart, lte: today } },
          _sum: { total: true },
        }),
        this.prisma.salesInvoice.groupBy({
          by: ['invoiceDate', 'kind'],
          where: { status: 'POSTED', invoiceDate: { gte: trendFrom, lte: today } },
          _sum: { total: true },
        }),
        this.prisma.salesInvoice.groupBy({
          by: ['customerId'],
          where: { kind: 'SALE', status: 'POSTED', invoiceDate: { gte: monthStart, lte: today }, customerId: { not: null } },
          _sum: { total: true },
          orderBy: { _sum: { total: 'desc' } },
          take: 5,
        }),
        this.prisma.salesInvoiceLine.groupBy({
          by: ['productId'],
          where: { invoice: { kind: 'SALE', status: 'POSTED', invoiceDate: { gte: monthStart, lte: today } } },
          _sum: { baseQty: true, lineNet: true },
          orderBy: { _sum: { lineNet: 'desc' } },
          take: 5,
        }),
        this.cashPositions(),
        this.partyTotal('CUSTOMER'),
        this.partyTotal('SUPPLIER'),
        this.prisma.$queryRaw<{ value: string }[]>`
          SELECT COALESCE(SUM(b."quantity" * p."avgCost"), 0)::text AS value
          FROM "StockBalance" b JOIN "Product" p ON p."id" = b."productId"`,
        this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) AS count FROM (
            SELECT p."id" FROM "Product" p
            LEFT JOIN "StockBalance" b ON b."productId" = p."id"
            WHERE p."isActive" = true AND p."reorderLevel" > 0
            GROUP BY p."id", p."reorderLevel"
            HAVING COALESCE(SUM(b."quantity"), 0) < p."reorderLevel") t`,
        this.prisma.cheque.groupBy({
          by: ['direction'],
          where: { status: 'PENDING', dueDate: { lte: addDays(today, 7) } },
          _count: true,
          _sum: { amount: true },
        }),
      ]);

    const [customers, products] = await Promise.all([
      this.prisma.customer.findMany({ where: { id: { in: topCustomers.map((c) => c.customerId!) } }, select: { id: true, code: true, nameAr: true, nameEn: true } }),
      this.prisma.product.findMany({ where: { id: { in: topProducts.map((p) => p.productId) } }, select: { id: true, code: true, nameAr: true, nameEn: true } }),
    ]);

    const trend = new Map<string, Decimal>();
    for (let i = 0; i < 14; i++) trend.set(addDays(trendFrom, i).toISOString().slice(0, 10), new Decimal(0));
    for (const r of trendRows) {
      const k = r.invoiceDate.toISOString().slice(0, 10);
      const sign = r.kind === 'RETURN' ? -1 : 1;
      trend.set(k, (trend.get(k) ?? new Decimal(0)).plus(num(r._sum.total).times(sign)));
    }

    return {
      generatedAt: new Date().toISOString(),
      sales: { today: salesToday.toFixed(2), month: salesMonth.toFixed(2) },
      purchasesMonth: num(purchasesMonth._sum.total).toFixed(2),
      salesTrend: [...trend.entries()].map(([date, amount]) => ({ date, amount: amount.toFixed(2) })),
      cash,
      receivables: receivable.toFixed(2),
      payables: payable.toFixed(2),
      inventoryValue: num(inventory[0]?.value).toFixed(2),
      lowStockProducts: Number(lowStock[0]?.count ?? 0),
      chequesDueWithin7Days: cheques.map((c) => ({ direction: c.direction, count: c._count, amount: num(c._sum.amount).toFixed(2) })),
      topCustomers: topCustomers.map((c) => ({
        customer: customers.find((x) => x.id === c.customerId),
        total: num(c._sum.total).toFixed(2),
      })),
      topProducts: topProducts.map((p) => ({
        product: products.find((x) => x.id === p.productId),
        quantity: num(p._sum.baseQty).toFixed(4),
        revenue: num(p._sum.lineNet).toFixed(2),
      })),
    };
  }

  private async netSales(from: Date, to: Date): Promise<Decimal> {
    const rows = await this.prisma.salesInvoice.groupBy({
      by: ['kind'],
      where: { status: 'POSTED', invoiceDate: { gte: from, lte: to } },
      _sum: { total: true },
    });
    return rows.reduce((a, r) => a.plus(num(r._sum.total).times(r.kind === 'RETURN' ? -1 : 1)), new Decimal(0));
  }

  private async partyTotal(type: 'CUSTOMER' | 'SUPPLIER'): Promise<Decimal> {
    const s = await this.prisma.journalLine.aggregate({
      where: { partyType: type, entry: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    });
    const net = num(s._sum.debit).minus(num(s._sum.credit));
    return type === 'CUSTOMER' ? net : net.negated();
  }

  /** Cash boxes (including representative custody) and banks, from their GL accounts. */
  private async cashPositions() {
    const fa = await this.prisma.financialAccount.findMany({ select: { kind: true, glAccountId: true } });
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { accountId: { in: fa.map((f) => f.glAccountId) }, entry: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    });
    const gl = await this.prisma.account.findMany({
      where: { id: { in: fa.map((f) => f.glAccountId) } },
      select: { id: true, openingDebit: true, openingCredit: true },
    });
    let cashbox = new Decimal(0);
    let bank = new Decimal(0);
    for (const f of fa) {
      const s = sums.find((x) => x.accountId === f.glAccountId)?._sum;
      const o = gl.find((g) => g.id === f.glAccountId);
      const bal = num(s?.debit).minus(num(s?.credit)).plus(num(o?.openingDebit)).minus(num(o?.openingCredit));
      if (f.kind === 'BANK') bank = bank.plus(bal);
      else cashbox = cashbox.plus(bal);
    }
    return { cashboxes: cashbox.toFixed(2), banks: bank.toFixed(2), total: cashbox.plus(bank).toFixed(2) };
  }
}
