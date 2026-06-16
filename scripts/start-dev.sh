#!/bin/bash
set -e

# Cek apakah port 8080 sudah aktif (gunakan TCP, bukan HTTP status)
if (echo >/dev/tcp/localhost/8080) 2>/dev/null; then
  echo "[start-dev] API server sudah berjalan di port 8080, lewati."
else
  echo "[start-dev] Memulai API server..."
  PORT=8080 pnpm --filter @workspace/api-server run dev &
  API_PID=$!
  echo "[start-dev] API server starting (PID: $API_PID)..."

  # Tunggu API server siap
  for i in $(seq 1 30); do
    if (echo >/dev/tcp/localhost/8080) 2>/dev/null; then
      echo "[start-dev] API server siap di port 8080"
      break
    fi
    sleep 1
  done
fi

# Mulai admin portal di foreground (Replit menunggu port 5000)
echo "[start-dev] Memulai admin portal di port 5000..."
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/admin-portal run dev
