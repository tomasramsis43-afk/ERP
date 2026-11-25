#!/usr/bin/env bash
# Proves a backup is usable: restores it into a throwaway database and checks the books still balance.
# Usage: ADMIN_DATABASE_URL=postgresql://user:pw@host:5432/postgres infrastructure/scripts/verify-backup.sh <file.dump>
set -euo pipefail

: "${ADMIN_DATABASE_URL:?set ADMIN_DATABASE_URL (a URL with CREATEDB rights)}"
FILE="${1:?usage: verify-backup.sh <file.dump>}"
ADMIN="${ADMIN_DATABASE_URL%%\?*}"
TMP="erp_verify_$$"
BASE="${ADMIN%/*}"

cleanup() { psql "$ADMIN" -qc "DROP DATABASE IF EXISTS \"$TMP\"" > /dev/null || true; }
trap cleanup EXIT

psql "$ADMIN" -qc "CREATE DATABASE \"$TMP\""
pg_restore --no-owner --dbname "$BASE/$TMP" "$FILE"
DIFF=$(psql "$BASE/$TMP" -Atc "SELECT COALESCE(SUM(l.debit) - SUM(l.credit), 0) FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id = l.\"entryId\" WHERE e.status = 'POSTED'")
if [[ "$DIFF" != "0" && "$DIFF" != "0.00" ]]; then
  echo "BACKUP INVALID: posted journals are out of balance by $DIFF" >&2
  exit 1
fi
echo "backup verified: restored cleanly and posted journals balance"
