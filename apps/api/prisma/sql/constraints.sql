-- Applied idempotently by prisma/seed.ts. Statements are separated by "-- @@" markers.

-- Stock can never go negative at database level (the engine also checks, this is the safety net).
ALTER TABLE "StockBalance" DROP CONSTRAINT IF EXISTS chk_stock_non_negative;
-- @@
ALTER TABLE "StockBalance" ADD CONSTRAINT chk_stock_non_negative CHECK ("quantity" >= 0);
-- @@

-- Unit conversion factors must be positive.
ALTER TABLE "ProductUnit" DROP CONSTRAINT IF EXISTS chk_unit_factor_positive;
-- @@
ALTER TABLE "ProductUnit" ADD CONSTRAINT chk_unit_factor_positive CHECK ("factor" > 0);
-- @@

-- Stock movement ledger is append-only.
CREATE OR REPLACE FUNCTION erp_block_movement_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'StockMovement is append-only';
END;
$$ LANGUAGE plpgsql;
-- @@
DROP TRIGGER IF EXISTS trg_movement_append_only ON "StockMovement";
-- @@
CREATE TRIGGER trg_movement_append_only
  BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION erp_block_movement_mutation();
-- @@
