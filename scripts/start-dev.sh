#!/bin/bash
set -e

# Pastikan PATH menyertakan pnpm dan node (diperlukan saat workflow
# dimulai tanpa PATH lengkap dari nix shell).
export PATH="/nix/store/61lr9izijvg30pcribjdxgjxvh3bysp4-pnpm-10.26.1/bin:/nix/store/1lagpgadaybvs1n2312gysg2phjk89y8-nodejs-20.20.0-wrapped/bin:${PATH}"

# Pastikan NODE_ENV=development secara eksplisit
export NODE_ENV=development

# Cek apakah API server sudah berjalan di port 8080
# JANGAN bunuh proses yang sudah ada — artifact workflow mungkin sudah menjalankannya.
# Membunuh proses lama menyebabkan race condition: artifact workflow restart
# dan ada jeda singkat tanpa server → Vite proxy mengembalikan 502 ke browser.
if (echo >/dev/tcp/localhost/8080) 2>/dev/null; then
  echo "[start-dev] API server sudah berjalan di port 8080, menggunakan yang ada."
else
  echo "[start-dev] Memulai API server..."
  PORT=8080 pnpm --filter @workspace/api-server run dev &
  API_PID=$!
  echo "[start-dev] API server starting (PID: $API_PID)..."

  # Tunggu API server siap (max 60 detik)
  for i in $(seq 1 60); do
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
