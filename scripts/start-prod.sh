#!/bin/bash
set -e
# Script production: jalankan API server yang sudah di-build dengan node langsung.
# Tidak membutuhkan pnpm — hanya node yang diperlukan di container production.

# Cari root project relatif terhadap lokasi script ini
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[start-prod] Project root: $PROJECT_ROOT"
echo "[start-prod] Node: $(node --version)"

DIST="$PROJECT_ROOT/artifacts/api-server/dist/index.mjs"
if [ ! -f "$DIST" ]; then
  echo "[start-prod] ERROR: dist tidak ditemukan di $DIST"
  echo "[start-prod] Pastikan scripts/build-prod.sh sudah dijalankan lebih dulu."
  exit 1
fi

cd "$PROJECT_ROOT"
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
