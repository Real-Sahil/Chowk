#!/usr/bin/env bash
# Starts a throwaway local PostgreSQL cluster, bootstraps chowk_app, runs vitest against it, tears down.
# CI alternative: provide TEST_OWNER_URL + DATABASE_URL (restricted role) for a service container and call vitest directly.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -n "${TEST_OWNER_URL:-}" && -n "${DATABASE_URL:-}" && -n "${AUTH_DATABASE_URL:-}" ]]; then if [[ $# -gt 0 ]]; then exec "$@"; else exec pnpm --dir "$here" exec vitest run --root "$here"; fi; fi
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[[ -x "$BIN/initdb" ]] || { echo "PostgreSQL server binaries not found; set TEST_OWNER_URL/DATABASE_URL instead" >&2; exit 2; }
D="$(mktemp -d /tmp/chowk-pg.XXXXXX)"; PORT=55433; PW="test-$(date +%s)"
run_as() { if [[ $EUID -eq 0 ]]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[[ $EUID -eq 0 ]] && { id postgres >/dev/null 2>&1 || useradd -m postgres; chown postgres "$D"; }
cleanup() { run_as "$BIN/pg_ctl -D $D/pg stop -m fast >/dev/null 2>&1" || true; rm -rf "$D"; }
trap cleanup EXIT
run_as "$BIN/initdb -D $D/pg -A trust >/dev/null && $BIN/pg_ctl -D $D/pg -o '-p $PORT -k $D' -l $D/pg.log -w start >/dev/null"
export TEST_OWNER_URL="postgres://postgres@127.0.0.1:$PORT/postgres"
psql "$TEST_OWNER_URL" -q -v ON_ERROR_STOP=1 -c "create database chowk_test" >/dev/null
export TEST_OWNER_URL="postgres://postgres@127.0.0.1:$PORT/chowk_test"
psql "$TEST_OWNER_URL" -q -v ON_ERROR_STOP=1 -f "$here/sql/001_roles_and_context.sql"
psql "$TEST_OWNER_URL" -q -v ON_ERROR_STOP=1 -c "alter role chowk_app login password '$PW'" -c "alter role chowk_auth login password '$PW'"
# Apply the REAL Drizzle migrations (tables + RLS + functions) with the owner role, exactly as production does.
DATABASE_URL_UNPOOLED="$TEST_OWNER_URL" pnpm --dir "$here" exec tsx "$here/scripts/migrate.ts"
export DATABASE_URL="postgres://chowk_app:$PW@127.0.0.1:$PORT/chowk_test" AUTH_DATABASE_URL="postgres://chowk_auth:$PW@127.0.0.1:$PORT/chowk_test" APP_ENV=test
if [[ $# -gt 0 ]]; then "$@"; else pnpm --dir "$here" exec vitest run --root "$here"; fi
