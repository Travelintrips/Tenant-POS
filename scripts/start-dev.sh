#!/bin/bash
set -e

# Start API server in background
PORT=8080 pnpm --filter @workspace/api-server run dev &
API_PID=$!

echo "[start-dev] API server starting (PID: $API_PID)..."

# Wait for API server on port 8080
for i in $(seq 1 30); do
  if curl -sf http://localhost:8080/ > /dev/null 2>&1; then
    echo "[start-dev] API server ready on port 8080"
    break
  fi
  sleep 1
done

# Start admin portal in foreground (Replit waits on port 5000)
echo "[start-dev] Starting admin portal on port 5000..."
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/admin-portal run dev
