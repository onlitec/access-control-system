#!/usr/bin/env bash
set -euo pipefail

HTTPS_URL="${1:-https://127.0.0.1:8443}"
API_BASE="${HTTPS_URL%/}/api"
AUTH_EMAIL="${BACKEND_CONTRACT_EMAIL:-security.test@local}"
AUTH_PASSWORD="${BACKEND_CONTRACT_PASSWORD:-ChangeMe123!}"

TMP_DIR="$(mktemp -d)"
TOKEN=""
REFRESH_TOKEN=""
PROVIDER_ID=""
PROVIDER_TAG="contract-provider-$(date +%s)-$RANDOM"
PROVIDER_DOC="$(date +%s%N | cut -c1-11)"

cleanup() {
  if [[ -n "$PROVIDER_ID" && -n "$TOKEN" ]]; then
    curl -k -sS -o /dev/null -X DELETE \
      "$API_BASE/service-providers/$PROVIDER_ID" \
      -H "Authorization: Bearer $TOKEN" || true
  fi

  if [[ -n "$REFRESH_TOKEN" ]]; then
    curl -k -sS -o /dev/null -X POST \
      "$API_BASE/auth/logout" \
      -H 'Content-Type: application/json' \
      --data "{\"refreshToken\":\"$REFRESH_TOKEN\"}" || true
  fi

  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "[backend-contract] https_url=$HTTPS_URL"
echo "[backend-contract] api_base=$API_BASE"

LOGIN_CODE=""
for _ in $(seq 1 6); do
  LOGIN_CODE=$(curl -k -sS -o "$TMP_DIR/login.json" -w '%{http_code}' -X POST "$API_BASE/auth/login" \
    -H 'Content-Type: application/json' \
    --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")
  if [[ "$LOGIN_CODE" == "429" ]]; then
    sleep 2
    continue
  fi
  break
done

if [[ "$LOGIN_CODE" != "200" ]]; then
  echo "[backend-contract][FAIL] login failed code=$LOGIN_CODE"
  cat "$TMP_DIR/login.json"
  exit 1
fi

TOKEN=$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(j.token||'')" "$TMP_DIR/login.json")
REFRESH_TOKEN=$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(j.refreshToken||'')" "$TMP_DIR/login.json")

if [[ -z "$TOKEN" || -z "$REFRESH_TOKEN" ]]; then
  echo "[backend-contract][FAIL] missing token/refreshToken from login"
  cat "$TMP_DIR/login.json"
  exit 1
fi

echo "[backend-contract][OK] login"

TOWERS_CODE=$(curl -k -sS -o "$TMP_DIR/towers.json" -w '%{http_code}' "$API_BASE/towers/active" \
  -H "Authorization: Bearer $TOKEN")
if [[ "$TOWERS_CODE" != "200" ]]; then
  echo "[backend-contract][FAIL] towers active code=$TOWERS_CODE"
  cat "$TMP_DIR/towers.json"
  exit 1
fi
node -e "const fs=require('fs');const towers=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!Array.isArray(towers)||towers.length===0){throw new Error('no towers');}if(towers.some(t=>!t.id||!t.name||t.is_active!==true)){throw new Error('invalid tower payload');}" "$TMP_DIR/towers.json"
echo "[backend-contract][OK] towers/active"

cat > "$TMP_DIR/provider-create.json" <<EOF
{
  "full_name": "$PROVIDER_TAG",
  "document": "$PROVIDER_DOC",
  "service_type": "ContractTestService",
  "provider_type": "temporary",
  "tower": "Tower A",
  "valid_from": "2026-02-20",
  "valid_until": "2026-02-21",
  "notes": "backend contract test"
}
EOF

CREATE_CODE=$(curl -k -sS -o "$TMP_DIR/provider-create-resp.json" -w '%{http_code}' -X POST "$API_BASE/service-providers" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data "@$TMP_DIR/provider-create.json")
if [[ "$CREATE_CODE" != "201" ]]; then
  echo "[backend-contract][FAIL] create provider code=$CREATE_CODE"
  cat "$TMP_DIR/provider-create-resp.json"
  exit 1
fi

PROVIDER_ID=$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!j.id){throw new Error('missing provider id');}if(j.provider_type!=='temporary'){throw new Error('unexpected provider_type on create');}process.stdout.write(j.id)" "$TMP_DIR/provider-create-resp.json")
echo "[backend-contract][OK] create service-provider id=$PROVIDER_ID"

LIST_CODE=$(curl -k -sS -o "$TMP_DIR/provider-list.json" -w '%{http_code}' "$API_BASE/service-providers?page=1&limit=20&search=$PROVIDER_TAG" \
  -H "Authorization: Bearer $TOKEN")
if [[ "$LIST_CODE" != "200" ]]; then
  echo "[backend-contract][FAIL] list providers code=$LIST_CODE"
  cat "$TMP_DIR/provider-list.json"
  exit 1
fi
node -e "const fs=require('fs');const id=process.argv[2];const body=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!Array.isArray(body.data)){throw new Error('missing data array');}if(typeof body.count!=='number'){throw new Error('missing count');}if(!body.data.some(p=>p.id===id)){throw new Error('created provider not found');}" "$TMP_DIR/provider-list.json" "$PROVIDER_ID"
echo "[backend-contract][OK] list service-providers"

cat > "$TMP_DIR/provider-patch.json" <<EOF
{
  "provider_type": "fixed",
  "company_name": "Contract Test Company"
}
EOF

PATCH_CODE=$(curl -k -sS -o "$TMP_DIR/provider-patch-resp.json" -w '%{http_code}' -X PATCH "$API_BASE/service-providers/$PROVIDER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data "@$TMP_DIR/provider-patch.json")
if [[ "$PATCH_CODE" != "200" ]]; then
  echo "[backend-contract][FAIL] patch provider code=$PATCH_CODE"
  cat "$TMP_DIR/provider-patch-resp.json"
  exit 1
fi
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(j.provider_type!=='fixed'){throw new Error('provider_type not updated');}if(j.company_name!=='Contract Test Company'){throw new Error('company_name not updated');}" "$TMP_DIR/provider-patch-resp.json"
echo "[backend-contract][OK] patch service-provider"

cat > "$TMP_DIR/provider-invalid-type.json" <<EOF
{
  "full_name": "${PROVIDER_TAG}-invalid-type",
  "document": "$PROVIDER_DOC",
  "service_type": "ContractTestService",
  "provider_type": "invalid_value"
}
EOF

INVALID_TYPE_CODE=$(curl -k -sS -o "$TMP_DIR/provider-invalid-type-resp.json" -w '%{http_code}' -X POST "$API_BASE/service-providers" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data "@$TMP_DIR/provider-invalid-type.json")
if [[ "$INVALID_TYPE_CODE" != "400" ]]; then
  echo "[backend-contract][FAIL] invalid provider_type should return 400, got=$INVALID_TYPE_CODE"
  cat "$TMP_DIR/provider-invalid-type-resp.json"
  exit 1
fi
echo "[backend-contract][OK] invalid provider_type validation"

cat > "$TMP_DIR/provider-invalid-tower.json" <<EOF
{
  "full_name": "${PROVIDER_TAG}-invalid-tower",
  "document": "$PROVIDER_DOC",
  "service_type": "ContractTestService",
  "provider_type": "temporary",
  "tower": "Tower Does Not Exist"
}
EOF

INVALID_TOWER_CODE=$(curl -k -sS -o "$TMP_DIR/provider-invalid-tower-resp.json" -w '%{http_code}' -X POST "$API_BASE/service-providers" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data "@$TMP_DIR/provider-invalid-tower.json")
if [[ "$INVALID_TOWER_CODE" != "400" ]]; then
  echo "[backend-contract][FAIL] invalid tower should return 400, got=$INVALID_TOWER_CODE"
  cat "$TMP_DIR/provider-invalid-tower-resp.json"
  exit 1
fi
echo "[backend-contract][OK] invalid tower validation"

DASH_CODE=$(curl -k -sS -o "$TMP_DIR/dashboard-stats.json" -w '%{http_code}' "$API_BASE/dashboard/stats" \
  -H "Authorization: Bearer $TOKEN")
if [[ "$DASH_CODE" != "200" ]]; then
  echo "[backend-contract][FAIL] dashboard stats code=$DASH_CODE"
  cat "$TMP_DIR/dashboard-stats.json"
  exit 1
fi
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(typeof j.totalProviders!=='number'){throw new Error('totalProviders must be number');}if(j.totalProviders<0){throw new Error('totalProviders must be >= 0');}" "$TMP_DIR/dashboard-stats.json"
echo "[backend-contract][OK] dashboard stats totalProviders"

SNAPSHOT_CODE=$(curl -k -sS -o "$TMP_DIR/security-metrics-snapshot.json" -w '%{http_code}' -X POST "$API_BASE/security/metrics/snapshots" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}')
if [[ "$SNAPSHOT_CODE" != "201" ]]; then
  echo "[backend-contract][FAIL] create metrics snapshot code=$SNAPSHOT_CODE"
  cat "$TMP_DIR/security-metrics-snapshot.json"
  exit 1
fi
SNAPSHOT_ID=$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!j.snapshot||!j.snapshot.id){throw new Error('missing snapshot.id');}process.stdout.write(j.snapshot.id)" "$TMP_DIR/security-metrics-snapshot.json")
echo "[backend-contract][OK] create metrics snapshot id=$SNAPSHOT_ID"

HISTORY_CODE=$(curl -k -sS -o "$TMP_DIR/security-metrics-history.json" -w '%{http_code}' "$API_BASE/security/metrics/history?windowHours=24&limit=20" \
  -H "Authorization: Bearer $TOKEN")
if [[ "$HISTORY_CODE" != "200" ]]; then
  echo "[backend-contract][FAIL] metrics history code=$HISTORY_CODE"
  cat "$TMP_DIR/security-metrics-history.json"
  exit 1
fi
node -e "const fs=require('fs');const snapshotId=process.argv[2];const body=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(typeof body.count!=='number'){throw new Error('missing count');}if(!Array.isArray(body.data)){throw new Error('missing data array');}if(!body.data.some(p=>p.id===snapshotId)){throw new Error('snapshot id not found in history');}" "$TMP_DIR/security-metrics-history.json" "$SNAPSHOT_ID"
echo "[backend-contract][OK] metrics history"

DELETE_CODE=$(curl -k -sS -o "$TMP_DIR/provider-delete-resp.txt" -w '%{http_code}' -X DELETE "$API_BASE/service-providers/$PROVIDER_ID" \
  -H "Authorization: Bearer $TOKEN")
if [[ "$DELETE_CODE" != "204" ]]; then
  echo "[backend-contract][FAIL] delete provider code=$DELETE_CODE"
  cat "$TMP_DIR/provider-delete-resp.txt"
  exit 1
fi
PROVIDER_ID=""
echo "[backend-contract][OK] delete service-provider"

POST_DELETE_LIST_CODE=$(curl -k -sS -o "$TMP_DIR/provider-list-after-delete.json" -w '%{http_code}' "$API_BASE/service-providers?page=1&limit=20&search=$PROVIDER_TAG" \
  -H "Authorization: Bearer $TOKEN")
if [[ "$POST_DELETE_LIST_CODE" != "200" ]]; then
  echo "[backend-contract][FAIL] post-delete list code=$POST_DELETE_LIST_CODE"
  cat "$TMP_DIR/provider-list-after-delete.json"
  exit 1
fi
node -e "const fs=require('fs');const tag=process.argv[2];const body=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!Array.isArray(body.data)){throw new Error('missing data array');}if(body.data.some(p=>p.full_name===tag)){throw new Error('provider still present after delete');}" "$TMP_DIR/provider-list-after-delete.json" "$PROVIDER_TAG"
echo "[backend-contract][OK] post-delete verification"

echo "[backend-contract] all checks passed"
