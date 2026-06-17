#!/bin/bash
set -e

# Pastikan PATH menyertakan pnpm dan node (diperlukan saat workflow
# dimulai tanpa PATH lengkap dari nix shell).
export PATH="/nix/store/61lr9izijvg30pcribjdxgjxvh3bysp4-pnpm-10.26.1/bin:/nix/store/jfar9wnj6kvr0gr6klh1gk7vgckkfr5j-nodejs-20.20.0/bin:${PATH}"

# Bebaskan port 8080 dari proses sebelumnya (artifact workflow lama, dll)
fuser -k 8080/tcp 2>/dev/null || true
sleep 0.5
# Pastikan NODE_ENV=development secara eksplisit agar tidak ada ambiguitas
# antara development dan production environment.
export NODE_ENV=development

# Cek apakah port 8080 sudah aktif (gunakan TCP, bukan HTTP status)
if (echo >/dev/tcp/localhost/8080) 2>/dev/null; then
  echo "[start-dev] API server sudah berjalan di port 8080, lewati."
else
  echo "[start-dev] Memulai API server..."
  PORT=8080 pnpm --filter @workspace/api-server run dev &
  API_PID=$!
  echo "[start-dev] API server starting (PID: $API_PID)..."

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
