#!/usr/bin/env bash
# Restores a backup into the database named by DATABASE_URL, REPLACING its contents.
# Usage: DATABASE_URL=postgresql://... infrastructure/scripts/restore.sh <file.dump> --yes-replace-everything
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
FILE="${1:?usage: restore.sh <file.dump> --yes-replace-everything}"
if [[ "${2:-}" != "--yes-replace-everything" ]]; then
  echo "Refusing to run: this drops and recreates every table in the target database." >&2
  echo "Re-run with --yes-replace-everything once you are sure." >&2
  exit 2
fi
[[ -f "$FILE" ]] || { echo "no such file: $FILE" >&2; exit 1; }
URL="${DATABASE_URL%%\?*}"

pg_restore --list "$FILE" > /dev/null
pg_restore --clean --if-exists --no-owner --single-transaction --dbname "$URL" "$FILE"
echo "restored $FILE"
