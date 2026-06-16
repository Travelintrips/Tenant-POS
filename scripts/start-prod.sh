#!/bin/bash
set -e

echo "[prod] Memulai API server di port 8080..."
PORT=8080 NODE_ENV=production pnpm --filter @workspace/api-server run start &
API_PID=$!

# Tunggu API server siap
for i in $(seq 1 30); do
  if (echo >/dev/tcp/localhost/8080) 2>/dev/null; then
    echo "[prod] API server siap di port 8080"
    break
  fi
  sleep 1
done

echo "[prod] Memulai admin portal (preview) di port 5000..."
PORT=5000 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/admin-portal run serve
