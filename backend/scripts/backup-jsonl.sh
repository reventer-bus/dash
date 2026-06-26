#!/usr/bin/env bash
#
# backup-jsonl.sh — copy JSONL data files + attachments to a backup dir.
# Designed to run via cron every hour. Keeps the last 24 hourly snapshots.
#
# Usage:
#   ./backup-jsonl.sh                     # uses MAKER_AI_DIR env or /tmp/maker-ai
#   MAKER_AI_DIR=/var/lib/maker-ai ./backup-jsonl.sh
#
# Cron entry (every hour at :05):
#   5 * * * * /home/reventer/work/social-media-manager1/backend/scripts/backup-jsonl.sh >> /var/log/maker-ai-backup.log 2>&1
#
# Or via Hermes cron (see cronjob tool).

set -euo pipefail

SOURCE_DIR="${MAKER_AI_DIR:-/tmp/maker-ai}"
BACKUP_ROOT="${MAKER_AI_BACKUP_DIR:-$SOURCE_DIR/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

echo "[$(date -Iseconds)] Starting backup: $SOURCE_DIR → $BACKUP_DIR"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Copy spec files (orders, printers, spools, feedback JSONL)
if [ -d "$SOURCE_DIR/spec" ]; then
  cp -a "$SOURCE_DIR/spec" "$BACKUP_DIR/spec"
  echo "  Copied spec/ — $(find "$BACKUP_DIR/spec" -name '*.jsonl' | wc -l) JSONL files"
else
  echo "  WARNING: $SOURCE_DIR/spec does not exist — nothing to back up"
fi

# Copy attachments (photos, 3D models, documents)
if [ -d "$SOURCE_DIR/uploads" ]; then
  mkdir -p "$BACKUP_DIR/uploads"
  cp -a "$SOURCE_DIR/uploads/." "$BACKUP_DIR/uploads/"
  echo "  Copied uploads/ — $(find "$BACKUP_DIR/uploads" -type f | wc -l) files"
fi

# Write a manifest for verification
{
  echo "backup_timestamp=$TIMESTAMP"
  echo "source_dir=$SOURCE_DIR"
  echo "jsonl_files=$(find "$BACKUP_DIR" -name '*.jsonl' | wc -l)"
  echo "attachment_files=$(find "$BACKUP_DIR/uploads" -type f 2>/dev/null | wc -l || echo 0)"
  echo "total_size_kb=$(du -sk "$BACKUP_DIR" | cut -f1)"
} > "$BACKUP_DIR/manifest.txt"

echo "  Manifest written: $BACKUP_DIR/manifest.txt"

# Prune: keep only the last 24 backup directories
PRUNED=0
if [ -d "$BACKUP_ROOT" ]; then
  OLD_DIRS=$(ls -1 "$BACKUP_ROOT" | grep -E '^[0-9]{8}_[0-9]{6}$' | sort | head -n -24)
  for old in $OLD_DIRS; do
    rm -rf "$BACKUP_ROOT/$old"
    PRUNED=$((PRUNED + 1))
  done
fi

if [ "$PRUNED" -gt 0 ]; then
  echo "  Pruned $PRUNED old backup(s) — keeping last 24"
fi

echo "[$(date -Iseconds)] Backup complete: $BACKUP_DIR ($(du -sh "$BACKUP_DIR" | cut -f1))"