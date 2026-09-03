#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${HOSTINGER_DOMAIN:-api.minhasfotos.net}"
USERNAME="${HOSTINGER_USERNAME:-u384431467}"
API_BASE="${HOSTINGER_API_BASE:-https://developers.hostinger.com}"
TOKEN="${HOSTINGER_API_TOKEN:?Defina HOSTINGER_API_TOKEN}"
ARCHIVE_NAME="${HOSTINGER_ARCHIVE_NAME:-olivia-bff.zip}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="$(mktemp -d)"
ARCHIVE_PATH="${WORKDIR}/${ARCHIVE_NAME}"

cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "==> Empacotando backend"
(
  cd "$ROOT_DIR"
  zip -r "$ARCHIVE_PATH" . \
    -x "node_modules/*" \
    -x ".git/*" \
    -x ".github/*" \
    -x ".env" \
    -x ".env.*" \
    -x "*.zip" \
    -x ".DS_Store" \
    -x "uploads/*" \
    -x "data/*"
)

SIZE="$(wc -c < "$ARCHIVE_PATH" | tr -d ' ')"
echo "==> Archive: ${ARCHIVE_NAME} (${SIZE} bytes)"

echo "==> Gerando URL de upload"
UPLOAD_JSON="$(curl -sS -X POST "${API_BASE}/api/hosting/v1/files/upload-urls" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{\"username\":\"${USERNAME}\",\"domain\":\"${DOMAIN}\"}")"

URL="$(echo "$UPLOAD_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d.get("data",d); print(p.get("url") or p.get("upload_url") or "")')"
AUTH_KEY="$(echo "$UPLOAD_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d.get("data",d); print(p.get("auth_key") or p.get("authKey") or "")')"
REST_AUTH_KEY="$(echo "$UPLOAD_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d.get("data",d); print(p.get("rest_auth_key") or p.get("restAuthKey") or "")')"

if [[ -z "$URL" || -z "$AUTH_KEY" || -z "$REST_AUTH_KEY" ]]; then
  echo "Falha ao obter credenciais de upload:"
  echo "$UPLOAD_JSON"
  exit 1
fi

TARGET="${URL%/}/${ARCHIVE_NAME}?override=true"

echo "==> Criando upload TUS"
CREATE_CODE="$(curl -sS -o /tmp/hostinger-tus-create.txt -w "%{http_code}" -X POST "$TARGET" \
  -H "X-Auth: ${AUTH_KEY}" \
  -H "X-Auth-Rest: ${REST_AUTH_KEY}" \
  -H "Tus-Resumable: 1.0.0" \
  -H "Upload-Length: ${SIZE}" \
  -H "Upload-Offset: 0")"

if [[ "$CREATE_CODE" != "201" && "$CREATE_CODE" != "200" ]]; then
  echo "Falha ao criar upload TUS (HTTP ${CREATE_CODE})"
  cat /tmp/hostinger-tus-create.txt || true
  exit 1
fi

echo "==> Enviando archive"
PATCH_CODE="$(curl -sS -o /tmp/hostinger-tus-patch.txt -w "%{http_code}" -X PATCH "$TARGET" \
  -H "X-Auth: ${AUTH_KEY}" \
  -H "X-Auth-Rest: ${REST_AUTH_KEY}" \
  -H "Tus-Resumable: 1.0.0" \
  -H "Content-Type: application/offset+octet-stream" \
  -H "Upload-Offset: 0" \
  --data-binary @"${ARCHIVE_PATH}")"

if [[ "$PATCH_CODE" != "204" && "$PATCH_CODE" != "200" ]]; then
  echo "Falha no upload TUS (HTTP ${PATCH_CODE})"
  cat /tmp/hostinger-tus-patch.txt || true
  exit 1
fi

echo "==> Iniciando build Node.js"
BUILD_JSON="$(curl -sS -X POST \
  "${API_BASE}/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{
    \"node_version\": 20,
    \"app_type\": \"express\",
    \"root_directory\": \".\",
    \"output_directory\": \".\",
    \"build_script\": \"\",
    \"entry_file\": \"src/index.js\",
    \"package_manager\": \"npm\",
    \"source_type\": \"archive\",
    \"source_options\": { \"archive_path\": \"${ARCHIVE_NAME}\" }
  }")"

BUILD_UUID="$(echo "$BUILD_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d.get("data",d); print(p.get("uuid") or "")')"
BUILD_STATE="$(echo "$BUILD_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d.get("data",d); print(p.get("state") or "")')"

if [[ -z "$BUILD_UUID" ]]; then
  echo "Falha ao iniciar build:"
  echo "$BUILD_JSON"
  exit 1
fi

echo "==> Build iniciado: ${BUILD_UUID} (${BUILD_STATE})"

for _ in $(seq 1 60); do
  sleep 5
  LOGS_JSON="$(curl -sS \
    "${API_BASE}/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds/${BUILD_UUID}/logs" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Accept: application/json")"

  STATE="$(curl -sS \
    "${API_BASE}/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds?per_page=5" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Accept: application/json" | python3 -c "import json,sys; d=json.load(sys.stdin); items=(d.get('data') or d); 
arr=items if isinstance(items,list) else items.get('data',[]);
match=next((x for x in arr if x.get('uuid')=='${BUILD_UUID}'), None);
print((match or {}).get('state',''))")"

  echo "… estado: ${STATE:-desconhecido}"

  if [[ "$STATE" == "completed" ]]; then
    echo "==> Deploy concluído"
    echo "$LOGS_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d.get("data",d); print(p.get("logs") or d.get("logs") or "")' | tail -n 40
    exit 0
  fi

  if [[ "$STATE" == "failed" ]]; then
    echo "==> Build falhou"
    echo "$LOGS_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d.get("data",d); print(p.get("logs") or d.get("logs") or json.dumps(d,indent=2))'
    exit 1
  fi
done

echo "Timeout aguardando build ${BUILD_UUID}"
exit 1
