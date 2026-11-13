#!/usr/bin/env bash
# Smoke test of the BUILT Next.js server over real HTTP. Run via: bash ../../packages/db/scripts/with-test-db.sh bash scripts/smoke.sh
set -euo pipefail
PORT=3999; BASE="http://localhost:$PORT"
export BETTER_AUTH_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n=+/')" BETTER_AUTH_URL="$BASE" APP_ENV=test GUEST_MODE_ENABLED=true
pnpm exec next start -p $PORT >/tmp/chowk-next.log 2>&1 & PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -fs "$BASE/api/health" >/dev/null 2>&1 && break; sleep 0.5; done
J=$(mktemp); ok() { echo "PASS: $1"; }; bad() { echo "FAIL: $1"; tail -20 /tmp/chowk-next.log; exit 1; }
[[ "$(curl -s $BASE/api/health)" == '{"ok":true}' ]] && ok "health reaches the database as chowk_app" || bad health
[[ "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/profile)" == 401 ]] && ok "profile requires a session (401)" || bad unauth
curl -s -c $J -H "origin: $BASE" -H 'content-type: application/json' -d '{}' $BASE/api/auth/sign-in/anonymous -o /dev/null -w '%{http_code}\n' | grep -q 200 && ok "guest sign-in" || bad guest
grep -q HttpOnly $J && ok "session cookie is HttpOnly" || bad httponly
curl -s -b $J $BASE/api/profile | grep -q '"isGuest":true' && ok "guest profile auto-created" || bad profile
curl -s -b $J -X PATCH -H 'content-type: application/json' -d '{"displayName":"Smoke Tester","avatarKey":"saffron","acceptTerms":{"version":"v1"},"acceptPrivacy":{"version":"v1"}}' $BASE/api/profile | grep -q '"displayName":"Smoke Tester"' && ok "profile creation + consent" || bad patch
[[ "$(curl -s -b $J -X PATCH -H 'content-type: application/json' -d '{"role":"admin"}' -o /dev/null -w '%{http_code}' $BASE/api/profile)" == 400 ]] && ok "role escalation rejected (400)" || bad escalate
[[ "$(curl -s -b $J -X PUT -H 'content-type: application/json' -d '{"name":"Smoke Char","appearance":{"skin":"tone-1","outfit":"teal","accessory":"cap"}}' -o /dev/null -w '%{http_code}' $BASE/api/character)" == 200 ]] && ok "character saved" || bad character
[[ "$(curl -s -b $J -X DELETE -H 'origin: https://evil.example' -o /dev/null -w '%{http_code}' $BASE/api/account)" == 403 ]] && ok "cross-origin account deletion blocked (403)" || bad csrf
curl -s -b $J -X DELETE -H "origin: $BASE" $BASE/api/account | grep -q '"deleted":true' && ok "account deleted" || bad delete
[[ "$(curl -s -b $J -o /dev/null -w '%{http_code}' $BASE/api/profile)" == 401 ]] && ok "old session no longer valid" || bad session
echo "SMOKE OK"
