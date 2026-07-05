#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# printdash backend — Postgres setup (Phase 0)
# Run AFTER setup-ubuntu.sh, on the SAME Ubuntu server as the backend.
# Replaces Railway — self-hosted, localhost-only, matches existing
# setup-ubuntu.sh conventions (systemd service, /etc/printdash/env).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DB_NAME="printdash"
DB_USER="printdash_app"
DB_PASS="${1:?Usage: sudo ./02-postgres-setup.sh <strong-db-password>}"
ENV_FILE="/etc/printdash/env"

echo "=== Installing Postgres 16 ==="
apt-get update -y
apt-get install -y postgresql-16

echo "=== Locking to localhost only — backend runs on this same box ==="
PG_CONF="/etc/postgresql/16/main/postgresql.conf"
sed -i "s/^#listen_addresses.*/listen_addresses = 'localhost'/" "$PG_CONF"
systemctl restart postgresql

echo "=== Creating DB + role ==="
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL

echo "=== Writing DATABASE_URL into ${ENV_FILE} ==="
# asyncpg driver, matches backend/app/core/database.py create_async_engine()
if ! grep -q "^DATABASE_URL=" "$ENV_FILE" 2>/dev/null; then
  echo "DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}" >> "$ENV_FILE"
else
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}#" "$ENV_FILE"
fi

echo "=== Running Alembic migrations ==="
cd /opt/printdash-backend/backend
sudo -u printdash .venv/bin/alembic upgrade head

echo "=== Daily backup cron -> Cloudflare R2 (requires rclone remote 'r2fofus' configured) ==="
cat > /opt/printdash-backend/backend/backup-db.sh <<'BACKUP'
#!/bin/bash
set -euo pipefail
STAMP=$(date +%F)
DUMP="/tmp/printdash_${STAMP}.sql.gz"
sudo -u postgres pg_dump printdash | gzip > "$DUMP"
rclone copy "$DUMP" r2fofus:fofus-backups/postgres/
rm "$DUMP"
BACKUP
chmod +x /opt/printdash-backend/backend/backup-db.sh
( crontab -l 2>/dev/null; echo "0 3 * * * /opt/printdash-backend/backend/backup-db.sh >> /var/log/printdash-backup.log 2>&1" ) | crontab -

echo ""
echo "=== Done ==="
echo "Restart backend to pick up new DATABASE_URL:"
echo "  systemctl restart printdash-backend"
echo ""
echo "NOTE: farm_store.py (JSONL) is still the live data path — models exist"
echo "and tables are now migrated, but orders/printers/messages endpoints"
echo "have NOT been rewired to the DB yet. That's the next task, not this one."
