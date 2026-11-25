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

  async pull(userId: string) {
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
        where: { isActive: true },
        select: {
          id: true, code: true, barcode: true, nameAr: true, nameEn: true, baseUnitId: true,
          retailPrice: true, wholesalePrice: true,
          units: { select: { unitId: true, factor: true, barcode: true } },
        },
        orderBy: { code: 'asc' },
      }),
    ]);
    return {
      serverTime: new Date().toISOString(),
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
