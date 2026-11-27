-- Additive migration: cost layers for FIFO valuation.
-- Safe on existing databases: creates table + indexes only, no data changes.

CREATE TABLE IF NOT EXISTS "StockLayer" (
  "id"            TEXT        NOT NULL,
  "productId"     TEXT        NOT NULL,
  "warehouseId"   TEXT        NOT NULL,
  "quantity"      DECIMAL(18,4) NOT NULL,
  "remaining"     DECIMAL(18,4) NOT NULL,
  "unitCost"      DECIMAL(18,4) NOT NULL,
  "receivedAt"    TIMESTAMP(3) NOT NULL,
  "source"        TEXT        NOT NULL,
  "sourceId"      TEXT,
  "batchNo"       TEXT,
  "expiryDate"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockLayer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockLayer_product_warehouse_received_idx"
  ON "StockLayer" ("productId", "warehouseId", "receivedAt");

CREATE INDEX IF NOT EXISTS "StockLayer_source_idx"
  ON "StockLayer" ("source", "sourceId");

ALTER TABLE "StockLayer"
  ADD CONSTRAINT "StockLayer_product_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockLayer"
  ADD CONSTRAINT "StockLayer_warehouse_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Back-fill: one layer per product/warehouse with positive stock at weighted-average cost.
-- Idempotent: only inserts when no layer exists yet for that product/warehouse.
INSERT INTO "StockLayer" ("id", "productId", "warehouseId", "quantity", "remaining", "unitCost", "receivedAt", "source")
SELECT gen_random_uuid()::text, sb."productId", sb."warehouseId", sb."quantity", sb."quantity", p."avgCost", NOW(), 'OPENING_BACKFILL'
FROM "StockBalance" sb
JOIN "Product" p ON p."id" = sb."productId"
WHERE sb."quantity" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "StockLayer" sl
    WHERE sl."productId" = sb."productId" AND sl."warehouseId" = sb."warehouseId"
  );