#!/usr/bin/env bash
# Logical backup of the ERP database (custom format, compressed, restorable with restore.sh).
# Usage: DATABASE_URL=postgresql://... infrastructure/scripts/backup.sh [backup_dir] [keep_days]
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
DIR="${1:-./backups}"
KEEP_DAYS="${2:-14}"
URL="${DATABASE_URL%%\?*}" # pg tools do not understand ?schema=public

mkdir -p "$DIR"
FILE="$DIR/erp-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --file "$FILE.partial" "$URL"
mv "$FILE.partial" "$FILE" # a half-written file never looks like a finished backup
pg_restore --list "$FILE" > /dev/null # the archive must be readable
echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Retention: only prune files this script produced.
find "$DIR" -maxdepth 1 -name 'erp-*.dump' -mtime +"$KEEP_DAYS" -print -delete
