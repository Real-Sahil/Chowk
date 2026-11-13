#!/usr/bin/env bash
# Usage: DATABASE_URL_UNPOOLED=... CHOWK_APP_PASSWORD=... bash scripts/bootstrap-app-role.sh
# Creates/updates the runtime login role. The password is passed via a psql variable, never logged or committed.
set -euo pipefail
: "${DATABASE_URL_UNPOOLED:?direct (unpooled) owner connection string required}"
: "${CHOWK_APP_PASSWORD:?runtime role password required (generate with: openssl rand -base64 36)}"
here="$(cd "$(dirname "$0")/.." && pwd)"
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -q -f "$here/sql/001_roles_and_context.sql"
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -q -v pw="$CHOWK_APP_PASSWORD" <<'SQL'
select format('alter role chowk_app login password %L', :'pw') \gexec
SQL
echo "chowk_app ready"
