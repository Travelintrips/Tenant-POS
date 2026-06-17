#!/bin/bash
set -e

echo "[build-prod] Building API server..."
pnpm --filter @workspace/api-server run build

echo "[build-prod] Building admin portal (production)..."
NODE_ENV=production PORT=5000 BASE_PATH=/ pnpm --filter @workspace/admin-portal run build

echo "[build-prod] ✅ Semua build selesai."
