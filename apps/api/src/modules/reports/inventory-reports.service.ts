import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal, dec } from '@erp/accounting-engine';
import { PrismaService } from '../../database/prisma.service';
import { SystemAccountsService } from '../accounting/accounts/system-accounts.service';

const num = (v: { toString(): string } | null | undefined) => dec(v?.toString() ?? '0');
const fmt = (d: Decimal, places = 2) => d.toFixed(places);

/**
 * Operational inventory reports. Every figure comes from stock balances and posted ledger data;
 * valuation is reconciled against the inventory accounts so a mismatch is visible, not hidden.
 */
@Injectable()
export class InventoryReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemAccounts: SystemAccountsService,
  ) {}

  /** Quantity x weighted-average cost per warehouse and product, plus the GL comparison. */
  async valuation(warehouseId?: string) {
    const balances = await this.prisma.stockBalance.findMany({
      where: { quantity: { not: 0 }, ...(warehouseId ? { warehouseId } : {}) },
      select: {
        warehouseId: true,
        productId: true,
        quantity: true,
        warehouse: { select: { code: true, nameAr: true, nameEn: true, type: true } },
        product: { select: { code: true, nameAr: true, nameEn: true, avgCost: true } },
      },
      orderBy: [{ warehouseId: 'asc' }, { productId: 'asc' }],
    });

    let total = dec(0);
    let vehicleTotal = dec(0);
    const rows = balances.map((b) => {
      const value = num(b.quantity).mul(num(b.product.avgCost));
      total = total.plus(value);
      if (b.warehouse.type === 'VEHICLE') vehicleTotal = vehicleTotal.plus(value);
      return {
        warehouseId: b.warehouseId,
        warehouseCode: b.warehouse.code,
        warehouseNameAr: b.warehouse.nameAr,
        warehouseNameEn: b.warehouse.nameEn,
        productId: b.productId,
        productCode: b.product.code,
        productNameAr: b.product.nameAr,
        productNameEn: b.product.nameEn,
        quantity: fmt(num(b.quantity), 4),
        avgCost: fmt(num(b.product.avgCost), 4),
        value: fmt(value),
      };
    });

    const glComparison = warehouseId ? null : await this.glComparison(total.minus(vehicleTotal), vehicleTotal);
    return { totalValue: fmt(total), rows, glComparison };
  }

  /** Products at or below their reorder level, summed across warehouses (or one warehouse). */
  async lowStock(warehouseId?: string) {
    const products = await this.prisma.product.findMany({
      where: { isActive: true, reorderLevel: { gt: 0 } },
      select: {
        id: true,
        code: true,
        nameAr: true,
        nameEn: true,
        reorderLevel: true,
        balances: { where: warehouseId ? { warehouseId } : {}, select: { quantity: true } },
      },
    });
    return products
      .map((p) => {
        const onHand = p.balances.reduce((s, b) => s.plus(num(b.quantity)), dec(0));
        const reorder = num(p.reorderLevel);
        return {
          productId: p.id,
          code: p.code,
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          onHand: fmt(onHand, 4),
          reorderLevel: fmt(reorder, 4),
          shortfall: fmt(reorder.minus(onHand), 4),
          isLow: onHand.lte(reorder),
        };
      })
      .filter((r) => r.isLow)
      .sort((a, b) => Number(b.shortfall) - Number(a.shortfall));
  }

  /** Products with stock on hand but no sale in the last `days` days. */
  async slowMoving(days = 90) {
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new BadRequestException('days must be an integer between 1 and 3650');
    const since = new Date(Date.now() - days * 86_400_000);

    const [stocked, sold] = await Promise.all([
      this.prisma.stockBalance.groupBy({ by: ['productId'], where: { quantity: { gt: 0 } }, _sum: { quantity: true } }),
      this.prisma.stockMovement.groupBy({
        by: ['productId'],
        where: { type: 'SALE_OUT', movementDate: { gte: since } },
        _max: { movementDate: true },
      }),
    ]);
    const soldIds = new Set(sold.map((s) => s.productId));
    const idle = stocked.filter((s) => !soldIds.has(s.productId));
    if (idle.length === 0) return { days, rows: [] };

    const [products, lastSale] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: idle.map((i) => i.productId) } },
        select: { id: true, code: true, nameAr: true, nameEn: true, avgCost: true },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['productId'],
        where: { type: 'SALE_OUT', productId: { in: idle.map((i) => i.productId) } },
        _max: { movementDate: true },
      }),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const lastById = new Map(lastSale.map((l) => [l.productId, l._max.movementDate]));

    const rows = idle
      .map((i) => {
        const p = byId.get(i.productId);
        if (!p) return null;
        const qty = num(i._sum.quantity);
        const last = lastById.get(i.productId) ?? null;
        return {
          productId: p.id,
          code: p.code,
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          quantity: fmt(qty, 4),
          value: fmt(qty.mul(num(p.avgCost))),
          lastSaleDate: last ? last.toISOString().slice(0, 10) : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => Number(b.value) - Number(a.value));
    return { days, rows };
  }

  /** Stock valuation vs. the ledger: main/branch stock vs INVENTORY, vehicle stock vs VEHICLE_STOCK. */
  private async glComparison(stockValue: Decimal, vehicleValue: Decimal) {
    const acc = await this.systemAccounts.resolve(['INVENTORY', 'VEHICLE_STOCK']);
    const [inventory, vehicle] = await Promise.all([this.glBalance(acc.INVENTORY), this.glBalance(acc.VEHICLE_STOCK)]);
    return {
      inventory: { stockValue: fmt(stockValue), glBalance: fmt(inventory), difference: fmt(stockValue.minus(inventory)) },
      vehicleStock: { stockValue: fmt(vehicleValue), glBalance: fmt(vehicle), difference: fmt(vehicleValue.minus(vehicle)) },
    };
  }

  /** Debit-normal balance of an account and all of its descendants, posted entries only. */
  private async glBalance(accountId: string): Promise<Decimal> {
    const ids = [accountId];
    let frontier = [accountId];
    while (frontier.length) {
      const children = await this.prisma.account.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
      frontier = children.map((c) => c.id);
      ids.push(...frontier);
    }
    const agg = await this.prisma.journalLine.aggregate({
      where: { accountId: { in: ids }, entry: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    });
    return num(agg._sum.debit).minus(num(agg._sum.credit));
  }
}
