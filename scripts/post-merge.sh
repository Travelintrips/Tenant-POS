#!/bin/bash
set -e

export PATH="/nix/store/61lr9izijvg30pcribjdxgjxvh3bysp4-pnpm-10.26.1/bin:/nix/store/1lagpgadaybvs1n2312gysg2phjk89y8-nodejs-20.20.0-wrapped/bin:${PATH}"

echo "[post-merge] Installing dependencies..."
pnpm install --frozen-lockfile=false

echo "[post-merge] Done."
