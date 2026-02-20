#!/usr/bin/env bash
set -euo pipefail

HTTP_URL="${1:-http://127.0.0.1:8080}"
HTTPS_URL="${2:-https://127.0.0.1:8443}"

echo "[smoke] http_url=${HTTP_URL}"
echo "[smoke] https_url=${HTTPS_URL}"

check_code_http() {
  local name="$1"
  local url="$2"
  local expected="$3"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  if [[ "$code" != "$expected" ]]; then
    echo "[smoke][FAIL] $name expected=$expected got=$code url=$url"
    return 1
  fi
  echo "[smoke][OK]   $name code=$code"
}

check_code_https() {
  local name="$1"
  local url="$2"
  local expected="$3"
  local code
  code=$(curl -k -s -o /dev/null -w '%{http_code}' "$url")
  if [[ "$code" != "$expected" ]]; then
    echo "[smoke][FAIL] $name expected=$expected got=$code url=$url"
    return 1
  fi
  echo "[smoke][OK]   $name code=$code"
}

check_code_http "http_to_https_redirect" "$HTTP_URL/" "301"
check_code_https "api_health" "$HTTPS_URL/api/health" "200"
check_code_https "login_page" "$HTTPS_URL/login" "200"
check_code_https "painel" "$HTTPS_URL/painel/" "200"
check_code_https "admin" "$HTTPS_URL/admin/" "200"

PAINEL_ASSET=$(curl -k -sS "$HTTPS_URL/painel/" | grep -oE '/painel/assets/[^" ]+\.(js|css)' | head -n1)
ADMIN_ASSET=$(curl -k -sS "$HTTPS_URL/admin/" | grep -oE '/admin/assets/[^" ]+\.(js|css)' | head -n1)
NEXT_ASSET=$(curl -k -sS "$HTTPS_URL/login" | grep -oE '/login/_next/static/[^" ]+\.(js|css)' | head -n1)

if [[ -z "$PAINEL_ASSET" || -z "$ADMIN_ASSET" || -z "$NEXT_ASSET" ]]; then
  echo "[smoke][FAIL] could not extract asset paths"
  exit 1
fi

check_code_https "painel_asset" "$HTTPS_URL$PAINEL_ASSET" "200"
check_code_https "admin_asset" "$HTTPS_URL$ADMIN_ASSET" "200"
check_code_https "next_asset" "$HTTPS_URL$NEXT_ASSET" "200"

if [[ -n "${SMOKE_AUTH_EMAIL:-}" && -n "${SMOKE_AUTH_PASSWORD:-}" ]]; then
  echo "[smoke] auth_refresh_flow email=$SMOKE_AUTH_EMAIL"

  LOGIN_JSON=""
  LOGIN_CODE=""
  for _ in $(seq 1 6); do
    TMP_FILE="$(mktemp)"
    LOGIN_CODE=$(curl -k -sS -o "$TMP_FILE" -w '%{http_code}' -X POST "$HTTPS_URL/api/auth/login" \
      -H 'Content-Type: application/json' \
      --data "{\"email\":\"$SMOKE_AUTH_EMAIL\",\"password\":\"$SMOKE_AUTH_PASSWORD\"}")
    LOGIN_JSON="$(cat "$TMP_FILE")"
    rm -f "$TMP_FILE"
    if [[ "$LOGIN_CODE" == "429" ]]; then
      sleep 2
      continue
    fi
    break
  done

  if [[ "$LOGIN_CODE" != "200" ]]; then
    echo "[smoke][FAIL] login failed code=$LOGIN_CODE body=$LOGIN_JSON"
    exit 1
  fi

  ACCESS_TOKEN=$(printf '%s' "$LOGIN_JSON" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(d.token||'')")
  REFRESH_TOKEN=$(printf '%s' "$LOGIN_JSON" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(d.refreshToken||'')")

  if [[ -z "$ACCESS_TOKEN" || -z "$REFRESH_TOKEN" ]]; then
    echo "[smoke][FAIL] login did not return token + refreshToken"
    exit 1
  fi

  REFRESH_JSON=$(curl -k -sS -X POST "$HTTPS_URL/api/auth/refresh" \
    -H 'Content-Type: application/json' \
    --data "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
  NEXT_ACCESS=$(printf '%s' "$REFRESH_JSON" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(d.token||'')")
  NEXT_REFRESH=$(printf '%s' "$REFRESH_JSON" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(d.refreshToken||'')")

  if [[ -z "$NEXT_ACCESS" || -z "$NEXT_REFRESH" ]]; then
    echo "[smoke][FAIL] refresh did not rotate token pair"
    exit 1
  fi

  AUTH_CODE=$(curl -k -s -o /dev/null -w '%{http_code}' "$HTTPS_URL/api/users" -H "Authorization: Bearer $NEXT_ACCESS")
  if [[ "$AUTH_CODE" != "200" ]]; then
    echo "[smoke][FAIL] refreshed access token unauthorized code=$AUTH_CODE"
    exit 1
  fi

  LOGOUT_CODE=$(curl -k -s -o /dev/null -w '%{http_code}' -X POST "$HTTPS_URL/api/auth/logout" \
    -H 'Content-Type: application/json' \
    --data "{\"refreshToken\":\"$NEXT_REFRESH\"}")
  if [[ "$LOGOUT_CODE" != "204" ]]; then
    echo "[smoke][FAIL] logout failed code=$LOGOUT_CODE"
    exit 1
  fi

  POST_LOGOUT_CODE=$(curl -k -s -o /dev/null -w '%{http_code}' -X POST "$HTTPS_URL/api/auth/refresh" \
    -H 'Content-Type: application/json' \
    --data "{\"refreshToken\":\"$NEXT_REFRESH\"}")
  if [[ "$POST_LOGOUT_CODE" != "401" ]]; then
    echo "[smoke][FAIL] revoked refresh token should be rejected code=$POST_LOGOUT_CODE"
    exit 1
  fi

  echo "[smoke][OK]   auth_refresh_flow"
else
  echo "[smoke] auth_refresh_flow skipped (set SMOKE_AUTH_EMAIL and SMOKE_AUTH_PASSWORD)"
fi

FIRST_CODE=$(curl -k -s -o /dev/null -w '%{http_code}' -X POST "$HTTPS_URL/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"x","password":"y"}')
LAST_CODE="$FIRST_CODE"
for _ in $(seq 1 24); do
  LAST_CODE=$(curl -k -s -o /dev/null -w '%{http_code}' -X POST "$HTTPS_URL/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"x","password":"y"}')
done

echo "[smoke] rate_limit first=$FIRST_CODE last=$LAST_CODE"
if [[ "$LAST_CODE" != "429" || ( "$FIRST_CODE" != "401" && "$FIRST_CODE" != "429" ) ]]; then
  echo "[smoke][FAIL] login rate limit behavior unexpected"
  exit 1
fi

echo "[smoke][OK]   rate_limit"

echo "[smoke] all checks passed"
