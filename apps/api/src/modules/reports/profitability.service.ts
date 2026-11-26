import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { toDate } from '../accounting/dto/journal.dto';

export type ProfitDimension = 'product' | 'customer' | 'area';

interface Bucket {
  key: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  quantity: number;
  revenue: number;
  cost: number;
  invoices: number;
}

/**
 * Gross profitability from posted sales documents, net of returns.
 * Revenue and cost are taken from the invoice lines exactly as they were posted.
 */
@Injectable()
export class ProfitabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async report(dimension: ProfitDimension, fromStr: string, toStr: string) {
    const from = toDate(fromStr);
    const to = toDate(toStr);
    if (from > to) throw new BadRequestException('from must not be after to');

    const lines = await this.prisma.salesInvoiceLine.findMany({
      where: { invoice: { status: 'POSTED', invoiceDate: { gte: from, lte: to } } },
      select: {
        productId: true,
        baseQty: true,
        lineNet: true,
        unitCost: true,
        invoice: {
          select: {
            id: true,
            kind: true,
            customer: {
              select: {
                id: true,
                code: true,
                nameAr: true,
                nameEn: true,
                regionId: true,
                region: { select: { id: true, nameAr: true, nameEn: true } },
              },
            },
          },
        },
        product: { select: { id: true, code: true, nameAr: true, nameEn: true } },
      },
    });

    const buckets = new Map<string, Bucket & { invoiceIds: Set<string> }>();
    const touch = (key: string, code: string, nameAr: string, nameEn: string | null) => {
      let b = buckets.get(key);
      if (!b) {
        b = { key, code, nameAr, nameEn, quantity: 0, revenue: 0, cost: 0, invoices: 0, invoiceIds: new Set<string>() };
        buckets.set(key, b);
      }
      return b;
    };

    for (const line of lines) {
      const sign = line.invoice.kind === 'RETURN' ? -1 : 1;
      let b: Bucket & { invoiceIds: Set<string> };
      if (dimension === 'product') {
        b = touch(line.productId, line.product.code, line.product.nameAr, line.product.nameEn);
      } else if (dimension === 'customer') {
        const c = line.invoice.customer;
        if (!c) continue;
        b = touch(c.id, c.code, c.nameAr, c.nameEn);
      } else {
        const r = line.invoice.customer?.region;
        if (!r) continue;
        b = touch(r.id, '', r.nameAr, r.nameEn);
      }
      b.quantity += Number(line.baseQty) * sign;
      b.revenue += Number(line.lineNet) * sign;
      b.cost += Number(line.baseQty) * Number(line.unitCost) * sign;
      b.invoiceIds.add(line.invoice.id);
    }

    const rows = [...buckets.values()]
      .map((b) => {
        const profit = b.revenue - b.cost;
        return {
          key: b.key,
          code: b.code,
          nameAr: b.nameAr,
          nameEn: b.nameEn,
          quantity: b.quantity.toFixed(4),
          revenue: b.revenue.toFixed(2),
          cost: b.cost.toFixed(2),
          profit: profit.toFixed(2),
          marginPercent: b.revenue === 0 ? '0.00' : ((profit / b.revenue) * 100).toFixed(2),
          invoices: b.invoiceIds.size,
        };
      })
      .sort((a, b) => Number(b.profit) - Number(a.profit));

    const totals = rows.reduce(
      (a, r) => {
        a.revenue += Number(r.revenue);
        a.cost += Number(r.cost);
        a.profit += Number(r.profit);
        return a;
      },
      { revenue: 0, cost: 0, profit: 0 },
    );

    return {
      from: fromStr.slice(0, 10),
      to: toStr.slice(0, 10),
      dimension,
      rows,
      totals: {
        revenue: totals.revenue.toFixed(2),
        cost: totals.cost.toFixed(2),
        profit: totals.profit.toFixed(2),
        marginPercent: totals.revenue === 0 ? '0.00' : ((totals.profit / totals.revenue) * 100).toFixed(2),
      },
    };
  }
}
