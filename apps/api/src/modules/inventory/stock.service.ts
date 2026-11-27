import { BadRequestException, Injectable } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { Decimal, dec, roundQty } from '@erp/accounting-engine';
import { Tx } from '../accounting/journal/journal-posting.service';

export interface ApplyMovementInput {
  type: MovementType;
  direction: 'IN' | 'OUT';
  warehouseId: string;
  productId: string;
  /** Positive quantity in BASE units. */
  quantity: Decimal;
  /** Cost per base unit for IN movements. OUT movements always use the current average cost. */
  unitCost?: Decimal;
  movementDate: Date;
  source: string;
  sourceId?: string;
  idempotencyKey?: string;
  note?: string;
  createdById?: string;
  /** Batch/lot identifier carried on inbound transactions. */
  batchNo?: string;
  /** Expiry date for FEFO consumption. */
  expiryDate?: Date;
}

export interface ConsumedLayer {
  layerId: string;
  quantity: Decimal;
  batchNo: string | null;
  expiryDate: Date | null;
}

/**
 * The only writer of StockBalance / StockMovement. Guarantees:
 *  - stock never goes negative (guarded UPDATE + CHECK constraint),
 *  - weighted-average cost is updated under a row lock,
 *  - the same idempotency key never moves stock twice.
 * Always call inside a transaction together with the matching journal posting.
 */
@Injectable()
export class StockService {
  /** Locks balance rows in a global order so concurrent multi-line operations cannot deadlock. */
  async lockBalances(tx: Tx, pairs: { warehouseId: string; productId: string }[]): Promise<void> {
    const unique = [...new Map(pairs.map((p) => [`${p.warehouseId}:${p.productId}`, p])).values()].sort((a, b) =>
      `${a.warehouseId}:${a.productId}`.localeCompare(`${b.warehouseId}:${b.productId}`),
    );
    for (const p of unique) {
      await tx.$executeRaw`INSERT INTO "StockBalance" ("warehouseId", "productId", "quantity")
        VALUES (${p.warehouseId}, ${p.productId}, 0) ON CONFLICT ("warehouseId", "productId") DO NOTHING`;
    }
    for (const p of unique) {
      await tx.$queryRaw`SELECT 1 FROM "StockBalance"
        WHERE "warehouseId" = ${p.warehouseId} AND "productId" = ${p.productId} FOR UPDATE`;
    }
  }

  async apply(tx: Tx, input: ApplyMovementInput) {
    if (input.idempotencyKey) {
      const existing = await tx.stockMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return { movement: existing, created: false };
    }
    const qty = roundQty(input.quantity);
    if (qty.lte(0)) throw new BadRequestException('Movement quantity must be greater than zero');

    const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse || !warehouse.isActive) throw new BadRequestException('Warehouse not found or inactive');

    const rows = await tx.$queryRaw<{ avgCost: Prisma.Decimal }[]>`
      SELECT "avgCost" FROM "Product" WHERE "id" = ${input.productId} FOR UPDATE`;
    if (rows.length === 0) throw new BadRequestException('Product not found');
    const avgCost = dec(rows[0].avgCost.toString());

    let unitCost: Decimal;
    let consumed: ConsumedLayer[] = [];
    if (input.direction === 'IN') {
      unitCost = input.unitCost ? dec(input.unitCost) : avgCost;
      if (input.type !== 'TRANSFER_IN') await this.updateAverageCost(tx, input.productId, avgCost, qty, unitCost);
      await tx.$executeRaw`INSERT INTO "StockBalance" ("warehouseId", "productId", "quantity")
        VALUES (${input.warehouseId}, ${input.productId}, ${qty.toFixed(4)}::numeric)
        ON CONFLICT ("warehouseId", "productId")
        DO UPDATE SET "quantity" = "StockBalance"."quantity" + EXCLUDED."quantity"`;
      await tx.stockLayer.create({
        data: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: qty.toFixed(4),
          remaining: qty.toFixed(4),
          unitCost: unitCost.toFixed(4),
          receivedAt: input.movementDate,
          source: input.source,
          sourceId: input.sourceId,
          batchNo: input.batchNo,
          expiryDate: input.expiryDate,
        },
      });
    } else {
      unitCost = avgCost;
      const updated = await tx.$executeRaw`UPDATE "StockBalance"
        SET "quantity" = "quantity" - ${qty.toFixed(4)}::numeric
        WHERE "warehouseId" = ${input.warehouseId} AND "productId" = ${input.productId}
          AND "quantity" >= ${qty.toFixed(4)}::numeric`;
      if (updated === 0) {
        throw new BadRequestException(`Insufficient stock in warehouse ${warehouse.code}`);
      }
      consumed = await this.consumeLayers(tx, input.warehouseId, input.productId, qty);
    }

    const movement = await tx.stockMovement.create({
      data: {
        type: input.type,
        warehouseId: input.warehouseId,
        productId: input.productId,
        quantity: (input.direction === 'IN' ? qty : qty.negated()).toFixed(4),
        unitCost: unitCost.toFixed(4),
        movementDate: input.movementDate,
        source: input.source,
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        note: input.note,
        createdById: input.createdById,
      },
    });
    return { movement, created: true, layers: consumed };
  }

  /**
   * Consumes cost layers FEFO (expiry first, then oldest receipt). Legacy stock that predates
   * layers is still sellable: this is best-effort and never blocks an OUT movement.
   */
  private async consumeLayers(tx: Tx, warehouseId: string, productId: string, qty: Decimal): Promise<ConsumedLayer[]> {
    const layers = await tx.stockLayer.findMany({
      where: { warehouseId, productId, remaining: { gt: 0 } },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }, { createdAt: 'asc' }],
    });
    let left = qty;
    const out: ConsumedLayer[] = [];
    for (const layer of layers) {
      if (left.lte(0)) break;
      const available = dec(layer.remaining.toString());
      const take = available.gte(left) ? left : available;
      const updated = await tx.stockLayer.updateMany({
        where: { id: layer.id, remaining: { gte: take.toFixed(4) } },
        data: { remaining: { decrement: take.toFixed(4) } },
      });
      if (updated.count === 0) continue;
      out.push({ layerId: layer.id, quantity: take, batchNo: layer.batchNo, expiryDate: layer.expiryDate });
      left = left.minus(take);
    }
    return out;
  }

  /**
   * Cancels a document's stock effect by writing equal and opposite movements (the ledger is never edited).
   * IN movements are reversed with OUT (which fails if the stock was already sold), and vice versa.
   */
  async reverseMovements(
    tx: Tx,
    source: string,
    sourceId: string,
    date: Date,
    actorId: string,
    types: { reverseOfIn: MovementType; reverseOfOut: MovementType },
  ): Promise<void> {
    const original = await tx.stockMovement.findMany({ where: { source, sourceId }, orderBy: { number: 'asc' } });
    await this.lockBalances(tx, original.map((m) => ({ warehouseId: m.warehouseId, productId: m.productId })));
    for (const m of original) {
      const isIn = m.quantity.gt(0);
      await this.apply(tx, {
        type: isIn ? types.reverseOfIn : types.reverseOfOut,
        direction: isIn ? 'OUT' : 'IN',
        warehouseId: m.warehouseId,
        productId: m.productId,
        quantity: dec(m.quantity.toString()).abs(),
        unitCost: dec(m.unitCost.toString()),
        movementDate: date,
        source: `${source}_CANCEL`,
        sourceId,
        idempotencyKey: `cancel:${m.id}`,
        createdById: actorId,
      });
    }
  }

  private async updateAverageCost(tx: Tx, productId: string, oldAvg: Decimal, inQty: Decimal, inCost: Decimal) {
    const [{ total }] = await tx.$queryRaw<{ total: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM("quantity"), 0) AS total FROM "StockBalance" WHERE "productId" = ${productId}`;
    const onHand = dec(total.toString());
    const newQty = onHand.plus(inQty);
    const newAvg = onHand.times(oldAvg).plus(inQty.times(inCost)).div(newQty).toDecimalPlaces(4);
    await tx.product.update({ where: { id: productId }, data: { avgCost: newAvg.toFixed(4) } });
  }
}
