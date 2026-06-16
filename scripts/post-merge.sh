#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Bebaskan port sebelum migration (hindari konflik jika server lama masih jalan)
fuser -k 8080/tcp 2>/dev/null || true
sleep 0.3
pnpm --filter @workspace/db run migrate
