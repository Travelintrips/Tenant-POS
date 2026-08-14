#!/bin/bash
set -e

export PATH="/nix/store/61lr9izijvg30pcribjdxgjxvh3bysp4-pnpm-10.26.1/bin:/nix/store/1lagpgadaybvs1n2312gysg2phjk89y8-nodejs-20.20.0-wrapped/bin:${PATH}"

echo "[post-merge] Installing dependencies..."
pnpm install --frozen-lockfile=false

echo "[post-merge] Freeing port 8080 if occupied..."
fuser -k 8080/tcp 2>/dev/null || true
sleep 0.3

echo "[post-merge] Running database migrations..."
pnpm --filter @workspace/db run migrate

echo "[post-merge] Done."
