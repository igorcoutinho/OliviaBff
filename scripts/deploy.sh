#!/usr/bin/env bash
# =============================================================================
# Deploy manual — api.minhasfotos.net
# Uso: ./scripts/deploy.sh
# Pré-requisito: ver DEPLOY.md
# =============================================================================
set -euo pipefail

DOMAIN="api.minhasfotos.net"
USERNAME="u384431467"
SSH_HOST="srv542.hstgr.io"
SSH_PORT="65002"
ARCHIVE="/tmp/olivia-bff.zip"
SSH_KEY="${HOSTINGER_SSH_KEY_FILE:-$HOME/.ssh/hostinger_deploy}"
API_BASE="https://developers.hostinger.com"
API_TOKEN="${HOSTINGER_API_TOKEN:?Defina HOSTINGER_API_TOKEN no ambiente}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── 1. Compilar TypeScript ────────────────────────────────────────────────────
echo "==> [1/5] Compilando TypeScript..."
cd "$ROOT_DIR"
npx tsc
echo "    Compilação OK"

# ── 2. Empacotar ─────────────────────────────────────────────────────────────
echo "==> [2/5] Empacotando backend..."
rm -f "$ARCHIVE"
zip -r "$ARCHIVE" . \
  -x "node_modules/*" \
  -x ".git/*" \
  -x ".github/*" \
  -x ".env" \
  -x ".env.*" \
  -x "*.zip" \
  -x ".DS_Store" \
  -x "uploads/*" \
  -x "data/*"
echo "    Archive: $(du -sh "$ARCHIVE" | cut -f1)"

# ── 3. Upload via SFTP ────────────────────────────────────────────────────────
echo "==> [3/5] Enviando via SFTP (porta ${SSH_PORT})..."
if [[ ! -f "$SSH_KEY" ]]; then
  echo "ERRO: Chave SSH não encontrada em $SSH_KEY — veja DEPLOY.md"
  exit 1
fi
chmod 600 "$SSH_KEY"
printf "put %s domains/%s/public_html/olivia-bff.zip\nquit\n" \
  "$ARCHIVE" "$DOMAIN" | \
  sftp -P "$SSH_PORT" \
    -i "$SSH_KEY" \
    -o StrictHostKeyChecking=no \
    -o LogLevel=ERROR \
    -b - \
    "$USERNAME@$SSH_HOST"
echo "    Upload concluído"

# ── 4. Triggar build via API ──────────────────────────────────────────────────
echo "==> [4/5] Iniciando build na Hostinger..."
BUILD_JSON=$(curl -sS -X POST \
  "$API_BASE/api/hosting/v1/accounts/$USERNAME/websites/$DOMAIN/nodejs/builds" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "node_version": 20,
    "app_type": "express",
    "root_directory": ".",
    "output_directory": ".",
    "build_script": "",
    "entry_file": "dist/index.js",
    "package_manager": "npm",
    "source_type": "archive",
    "source_options": { "archive_path": "olivia-bff.zip" }
  }')

BUILD_UUID=$(echo "$BUILD_JSON" | python3 -c \
  'import json,sys; d=json.load(sys.stdin); print(d.get("uuid") or d.get("data",{}).get("uuid",""))')
if [[ -z "$BUILD_UUID" ]]; then
  echo "ERRO ao iniciar build:"
  echo "$BUILD_JSON"
  exit 1
fi
echo "    Build UUID: $BUILD_UUID"

# ── 5. Aguardar build ─────────────────────────────────────────────────────────
echo "==> [5/5] Aguardando build..."
for i in $(seq 1 40); do
  sleep 15
  STATE=$(curl -sS \
    "$API_BASE/api/hosting/v1/accounts/$USERNAME/websites/$DOMAIN/nodejs/builds?per_page=3" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Accept: application/json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
arr=d.get('data',d)
arr=arr if isinstance(arr,list) else arr.get('data',[])
m=next((x for x in arr if x.get('uuid')=='$BUILD_UUID'),None)
print((m or {}).get('state',''))
")
  echo "    tentativa $i — ${STATE:-aguardando}"
  if [[ "$STATE" == "completed" ]]; then
    echo ""
    echo "✅  Deploy concluído!"
    sleep 8
    curl -sS "https://$DOMAIN/api/health"
    echo ""
    exit 0
  fi
  if [[ "$STATE" == "failed" ]]; then
    echo "❌  Build falhou. Verifique os logs no hPanel."
    exit 1
  fi
done

echo "⏱  Timeout — verifique o build $BUILD_UUID no hPanel"
exit 1
