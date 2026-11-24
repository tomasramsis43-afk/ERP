import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal, dec, roundQty } from '@erp/accounting-engine';
import { PrismaService } from '../../database/prisma.service';

/**
 * Converts quantities entered in any product unit into BASE units.
 * Stock is only ever stored in base units, so conversions cannot drift between units.
 */
@Injectable()
export class UnitConversionService {
  constructor(private readonly prisma: PrismaService) {}

  async toBaseQty(
    productId: string,
    unitId: string | undefined,
    quantity: string | number,
    tx?: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const client = tx ?? this.prisma;
    const qty = dec(quantity);
    if (qty.lte(0)) throw new BadRequestException('Quantity must be greater than zero');

    const product = await client.product.findUnique({
      where: { id: productId },
      select: { baseUnitId: true, units: { select: { unitId: true, factor: true } } },
    });
    if (!product) throw new BadRequestException('Product not found');
    if (!unitId || unitId === product.baseUnitId) return roundQty(qty);

    const pu = product.units.find((u) => u.unitId === unitId);
    if (!pu) throw new BadRequestException('Unit is not defined for this product');
    const base = qty.times(pu.factor.toString());
    if (!base.eq(roundQty(base))) {
      throw new BadRequestException('Quantity does not convert to a whole number of base units precisely');
    }
    return roundQty(base);
  }
}
