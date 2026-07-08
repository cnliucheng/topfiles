#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/opt/topfiles/data}"
BACKUP_DIR="${BACKUP_DIR:-/opt/topfiles/backups}"
DB_PATH="${DB_PATH:-/opt/topfiles/data/data.db}"
KEEP_DAYS="${KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

ts=$(date +%Y%m%d-%H%M%S)
dest="$BACKUP_DIR/data-$ts.db"

echo "[backup] backing up $DB_PATH → $dest"
sqlite3 "$DB_PATH" ".backup '$dest'"

find "$BACKUP_DIR" -name 'data-*.db' -mtime +$KEEP_DAYS -delete
echo "[backup] done. kept last $KEEP_DAYS days"
