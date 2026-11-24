-- Applied idempotently by prisma/seed.ts (and by the CI/deploy scripts after migrations).

-- 1) Audit log is append-only.
CREATE OR REPLACE FUNCTION erp_block_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;
-- @@

DROP TRIGGER IF EXISTS trg_audit_no_update ON "AuditLog";
-- @@
CREATE TRIGGER trg_audit_no_update
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION erp_block_audit_mutation();
-- @@

-- 2) Posted journal entries cannot be modified or deleted; corrections go through reversal entries.
CREATE OR REPLACE FUNCTION erp_block_posted_entry_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" = 'POSTED' THEN
    RAISE EXCEPTION 'Posted journal entries cannot be deleted; create a reversing entry';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'POSTED' THEN
    RAISE EXCEPTION 'Posted journal entries cannot be modified; create a reversing entry';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
-- @@

DROP TRIGGER IF EXISTS trg_entry_posted_immutable ON "JournalEntry";
-- @@
CREATE TRIGGER trg_entry_posted_immutable
  BEFORE UPDATE OR DELETE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION erp_block_posted_entry_mutation();
-- @@

CREATE OR REPLACE FUNCTION erp_block_posted_line_mutation() RETURNS trigger AS $$
DECLARE
  entry_status text;
BEGIN
  SELECT "status"::text INTO entry_status FROM "JournalEntry"
    WHERE "id" = COALESCE(OLD."entryId", NEW."entryId");
  IF entry_status = 'POSTED' THEN
    RAISE EXCEPTION 'Lines of a posted journal entry are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
-- @@

DROP TRIGGER IF EXISTS trg_line_posted_immutable ON "JournalLine";
-- @@
CREATE TRIGGER trg_line_posted_immutable
  BEFORE UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION erp_block_posted_line_mutation();
-- @@
