import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PartyLedgerService } from '../parties/party-ledger.service';
import { RepresentativesService } from '../representatives/representatives.service';

/**
 * Everything a representative's phone needs to work offline: their customers (with balances and
 * special prices), the product catalogue with unit conversions, and the stock on their van.
 */
@Injectable()
export class SnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reps: RepresentativesService,
    private readonly ledger: PartyLedgerService,
  ) {}

  /**
   * Without `since` the answer is the full snapshot. With a valid `since` (the serverTime of the last successful pull)
   * the catalogue and customer records are limited to rows changed since then, while balances, prices, van stock and the
   * list of customer ids are always complete (balances come from the ledger, which does not touch the customer row).
   * The server clock is read before any query, and the window overlaps by a minute, so a change committed while the
   * pull runs is delivered by this pull or the next one. Merging by id on the device makes the overlap harmless.
   */
  async pull(userId: string, since?: string) {
    const serverTime = new Date();
    const sinceDate = parseSince(since);
    const changedAfter = sinceDate ? { updatedAt: { gt: new Date(sinceDate.getTime() - OVERLAP_MS) } } : {};
    const profile = await this.reps.forUser(userId);
    const scope = { isActive: true, OR: [{ representativeId: profile.id }, ...(profile.routeId ? [{ routeId: profile.routeId }] : [])] };
    const select = { id: true, code: true, nameAr: true, nameEn: true, phone: true, address: true, creditLimit: true, routeId: true } as const;
    const allCustomers = await this.prisma.customer.findMany({ where: scope, select: { ...select, updatedAt: true }, orderBy: { code: 'asc' } });
    const customers = sinceDate ? allCustomers.filter((c) => c.updatedAt.getTime() > sinceDate.getTime() - OVERLAP_MS) : allCustomers;
    const ids = allCustomers.map((c) => c.id);
    const [balances, prices, products] = await Promise.all([
      this.ledger.balances('CUSTOMER', ids),
      ids.length ? this.prisma.customerPrice.findMany({ where: { customerId: { in: ids } }, select: { customerId: true, productId: true, price: true } }) : [],
      this.prisma.product.findMany({
        where: sinceDate ? changedAfter : { isActive: true },
        select: {
          isActive: true,
          id: true, code: true, barcode: true, nameAr: true, nameEn: true, baseUnitId: true,
          retailPrice: true, wholesalePrice: true,
          units: { select: { unitId: true, factor: true, barcode: true } },
        },
        orderBy: { code: 'asc' },
      }),
    ]);
    const base = {
      serverTime: serverTime.toISOString(),
      representative: {
        id: profile.id,
        code: profile.code,
        nameAr: profile.nameAr,
        nameEn: profile.nameEn,
        routeId: profile.routeId,
        vanWarehouseId: profile.vehicle?.warehouseId ?? null,
        custodyBalance: profile.custodyBalance,
      },
      customerPrices: prices,
      vanStock: profile.vehicleStock.map((s) => ({ productId: s.productId, quantity: s.quantity.toString() })),
    };
    const strip = <T extends { updatedAt?: Date }>(c: T) => {
      const { updatedAt: _u, ...rest } = c;
      return rest;
    };
    if (!sinceDate) {
      return {
        mode: 'FULL' as const,
        ...base,
        customers: customers.map((c) => ({ ...strip(c), balance: balances.get(c.id) ?? '0.00' })),
        products: products.map(({ isActive: _a, ...rest }) => rest),
      };
    }
    return {
      mode: 'DELTA' as const,
      since: sinceDate.toISOString(),
      ...base,
      customers: customers.map((c) => ({ ...strip(c), balance: balances.get(c.id) ?? '0.00' })),
      customerIds: ids,
      customerBalances: ids.map((id) => ({ id, balance: balances.get(id) ?? '0.00' })),
      products: products.filter((p) => p.isActive).map(({ isActive: _a, ...rest }) => rest),
      removedProductIds: products.filter((p) => !p.isActive).map((p) => p.id),
    };
  }
}

const OVERLAP_MS = 60_000;

/** An unusable `since` (missing, malformed, in the future) means "send everything": always safe. */
function parseSince(since?: string): Date | null {
  if (!since) return null;
  const d = new Date(since);
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() ? null : d;
}
