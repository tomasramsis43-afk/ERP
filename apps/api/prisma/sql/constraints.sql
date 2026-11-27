-- Applied idempotently by prisma/seed.ts (one statement per marker line below).

-- Negative stock is an approval workflow (inventory:override_negative + recorded reason).
-- The database CHECK was removed in migration 0012; the guarded UPDATE in StockService
-- still blocks every unapproved oversell.

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
