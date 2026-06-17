#!/bin/bash
set -e

echo "[start-prod] Memulai API server di port 8080..."
NODE_ENV=production PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs &
API_PID=$!

# Tunggu API server siap (max 30 detik)
for i in $(seq 1 30); do
  if (echo >/dev/tcp/localhost/8080) 2>/dev/null; then
    echo "[start-prod] API server siap (PID: $API_PID)"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "[start-prod] ERROR: API server tidak siap dalam 30 detik"
    exit 1
  fi
  sleep 1
done

echo "[start-prod] Memulai admin portal (static preview) di port 5000..."
NODE_ENV=production PORT=5000 BASE_PATH=/ pnpm --filter @workspace/admin-portal run serve
