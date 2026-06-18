#!/bin/bash
set -e
# Script production: jalankan API server yang sudah di-build dengan node langsung.
# Tidak membutuhkan pnpm — hanya node yang diperlukan di container production.
cd /home/runner/workspace
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
