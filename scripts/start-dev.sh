#!/bin/bash
set -e

# Bebaskan port 8080 dari proses sebelumnya (artifact workflow lama, dll)
fuser -k 8080/tcp 2>/dev/null || true
sleep 0.5

echo "[start-dev] Memulai API server..."
PORT=8080 pnpm --filter @workspace/api-server run dev &
API_PID=$!
echo "[start-dev] API server starting (PID: $API_PID)..."

# Tunggu API server siap
for i in $(seq 1 60); do
  if (echo >/dev/tcp/localhost/8080) 2>/dev/null; then
    echo "[start-dev] API server siap di port 8080"
    break
  fi
  sleep 1
done

# Mulai admin portal di foreground (Replit menunggu port 5000)
echo "[start-dev] Memulai admin portal di port 5000..."
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/admin-portal run dev
