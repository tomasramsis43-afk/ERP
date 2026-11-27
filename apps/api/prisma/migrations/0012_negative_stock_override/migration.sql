-- Oversells are now an approval workflow: StockService keeps a guarded UPDATE for
-- normal users and only allows a negative balance for inventory:override_negative
-- holders who supply a recorded reason. Remove the blanket database check.
ALTER TABLE "StockBalance" DROP CONSTRAINT IF EXISTS chk_stock_non_negative;
