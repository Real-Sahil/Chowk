#!/usr/bin/env bash
# Verifies a DEPLOYED Chowk web app end to end. Creates a throwaway guest, exercises the API, then deletes it.
# Usage: bash apps/web/scripts/verify-deployment.sh https://your-app.vercel.app
set -uo pipefail
BASE="${1:?usage: verify-deployment.sh <https://deployment-url>}"; BASE="${BASE%/}"
J=$(mktemp); FAIL=0
t() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then echo "PASS  $name"; else echo "FAIL  $name"; FAIL=1; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$@"; }
echo "Target: $BASE   (first request may be slow: Neon/Vercel cold start)"
t "health: app reaches the database"            bash -c "curl -fs --max-time 60 '$BASE/api/health' | grep -q '\"ok\":true'"
t "unauthenticated profile -> 401"              bash -c "[[ \$(curl -s -o /dev/null -w '%{http_code}' '$BASE/api/profile') == 401 ]]"
t "automatic guest session (no login)"          bash -c "curl -s -c $J -X POST -H 'origin: $BASE' '$BASE/api/session' | grep -q '\"created\":true'"
t "cookie is HttpOnly + Secure"                 bash -c "grep -q HttpOnly $J && grep -qi 'TRUE.*session_token' $J"
t "second visit reuses session"                 bash -c "curl -s -b $J -c $J -X POST -H 'origin: $BASE' '$BASE/api/session' | grep -q '\"created\":false'"
t "guest profile exists in Neon"                bash -c "curl -s -b $J '$BASE/api/profile' | grep -q '\"isGuest\":true'"
t "profile + consent write (RLS as chowk_app)"  bash -c "curl -s -b $J -X PATCH -H 'content-type: application/json' -d '{\"displayName\":\"Deploy Check\",\"acceptTerms\":{\"version\":\"v1\"}}' '$BASE/api/profile' | grep -q 'Deploy Check'"
t "role escalation rejected (400)"              bash -c "[[ \$(curl -s -b $J -X PATCH -H 'content-type: application/json' -d '{\"role\":\"admin\"}' -o /dev/null -w '%{http_code}' '$BASE/api/profile') == 400 ]]"
t "cross-origin account delete blocked (403)"   bash -c "[[ \$(curl -s -b $J -X DELETE -H 'origin: https://evil.example' -o /dev/null -w '%{http_code}' '$BASE/api/account') == 403 ]]"
t "security headers present"                    bash -c "h=\$(curl -sI '$BASE/'); echo \"\$h\" | grep -qi 'x-content-type-options: nosniff' && echo \"\$h\" | grep -qi 'x-frame-options: DENY'"
t "account deletion cleans up"                  bash -c "curl -s -b $J -X DELETE -H 'origin: $BASE' '$BASE/api/account' | grep -q '\"deleted\":true'"
t "deleted session no longer valid (401)"       bash -c "[[ \$(curl -s -b $J -o /dev/null -w '%{http_code}' '$BASE/api/profile') == 401 ]]"
[[ $FAIL == 0 ]] && echo "ALL CHECKS PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
