#!/bin/bash
set -e

echo "[build-prod] Mulai proses build production..."

# Coba gunakan pnpm dari Nix store jika tersedia (lingkungan Replit dev)
NIX_PNPM="/nix/store/61lr9izijvg30pcribjdxgjxvh3bysp4-pnpm-10.26.1/bin/pnpm"
if [ -x "$NIX_PNPM" ]; then
  export PATH="$(dirname "$NIX_PNPM"):$PATH"
  echo "[build-prod] pnpm ditemukan di Nix store: $(pnpm --version)"
elif command -v pnpm &>/dev/null; then
  echo "[build-prod] pnpm ditemukan di PATH: $(pnpm --version)"
else
  echo "[build-prod] pnpm tidak ditemukan, install via npm..."
  npm install -g pnpm
  echo "[build-prod] pnpm terinstall: $(pnpm --version)"
fi

echo "[build-prod] Install dependencies..."
pnpm install --frozen-lockfile

echo "[build-prod] Build API server..."
pnpm --filter @workspace/api-server run build

echo "[build-prod] Build admin portal..."
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/admin-portal run build

echo "[build-prod] Build selesai."
