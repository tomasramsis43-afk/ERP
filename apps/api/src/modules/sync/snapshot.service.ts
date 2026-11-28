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
   * `productsSince` makes the catalogue incremental. The cursor is moved back by this overlap so a row committed just
   * before the previous pull finished is never missed; the phone upserts by id, so repeats are harmless.
   */
  static readonly OVERLAP_MS = 120_000;

  async pull(userId: string, productsSince?: string) {
    // Captured BEFORE reading: the phone stores it as its next cursor, so nothing changed during this read is skipped.
    const asOf = new Date();
    const since = productsSince ? new Date(new Date(productsSince).getTime() - SnapshotService.OVERLAP_MS) : null;
    const profile = await this.reps.forUser(userId);
    const customers = await this.prisma.customer.findMany({
      where: {
        isActive: true,
        OR: [{ representativeId: profile.id }, ...(profile.routeId ? [{ routeId: profile.routeId }] : [])],
      },
      select: { id: true, code: true, nameAr: true, nameEn: true, phone: true, address: true, creditLimit: true, routeId: true },
      orderBy: { code: 'asc' },
    });
    const ids = customers.map((c) => c.id);
    const [balances, prices, products] = await Promise.all([
      this.ledger.balances('CUSTOMER', ids),
      ids.length ? this.prisma.customerPrice.findMany({ where: { customerId: { in: ids } }, select: { customerId: true, productId: true, price: true } }) : [],
      this.prisma.product.findMany({
        where: since ? { updatedAt: { gt: since } } : { isActive: true },
        select: {
          id: true, isActive: true, code: true, barcode: true, nameAr: true, nameEn: true, baseUnitId: true,
          retailPrice: true, wholesalePrice: true,
          units: { select: { unitId: true, factor: true, barcode: true } },
        },
        orderBy: { code: 'asc' },
      }),
    ]);
    return {
      serverTime: asOf.toISOString(),
      /** FULL replaces the phone's catalogue; DELTA is merged into it (inactive products are removed). */
      productsMode: since ? ('DELTA' as const) : ('FULL' as const),
      representative: {
        id: profile.id,
        code: profile.code,
        nameAr: profile.nameAr,
        nameEn: profile.nameEn,
        routeId: profile.routeId,
        vanWarehouseId: profile.vehicle?.warehouseId ?? null,
        custodyBalance: profile.custodyBalance,
      },
      customers: customers.map((c) => ({ ...c, balance: balances.get(c.id) ?? '0.00' })),
      customerPrices: prices,
      products,
      vanStock: profile.vehicleStock.map((s) => ({ productId: s.productId, quantity: s.quantity.toString() })),
    };
  }
}
