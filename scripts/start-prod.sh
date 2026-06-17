#!/bin/bash
set -e

echo "[start-prod] Memulai server production (API + frontend) di port 8080..."
exec NODE_ENV=production PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs
