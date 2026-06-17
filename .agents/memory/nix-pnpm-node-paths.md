---
name: nix pnpm and node paths for workflow
description: Path lengkap ke pnpm dan node di nix store untuk dipakai di start-dev.sh dan workflow commands
---

## Masalah

Workflow baru yang distart via `bash scripts/start-dev.sh` tidak punya pnpm di PATH.
Artifact workflows (e.g., `pnpm --filter @workspace/admin-portal run dev`) masih bisa menemukan pnpm karena Replit workflow runner menyediakan PATH sendiri untuk command langsung.
Tapi subprocess dari bash script tidak mewarisi PATH lengkap tersebut.

## Solusi

Tambahkan pnpm dan node secara eksplisit ke PATH di awal `scripts/start-dev.sh`:

```bash
export PATH="/nix/store/61lr9izijvg30pcribjdxgjxvh3bysp4-pnpm-10.26.1/bin:/nix/store/jfar9wnj6kvr0gr6klh1gk7vgckkfr5j-nodejs-20.20.0/bin:${PATH}"
```

Lokasi ditemukan dari environment proses vite yang masih berjalan:
- **pnpm**: `/nix/store/61lr9izijvg30pcribjdxgjxvh3bysp4-pnpm-10.26.1/bin/pnpm`
- **node (v20.20.0)**: `/nix/store/jfar9wnj6kvr0gr6klh1gk7vgckkfr5j-nodejs-20.20.0/bin/node`

## Cara mencari path baru jika hash berubah

```bash
pgrep -a node  # lihat proses node yang berjalan
cat /proc/$(pgrep -f "vite" | head -1)/environ | tr '\0' '\n' | grep "^PATH="
```

PATH dari proses vite/pnpm yang berjalan akan menunjukkan lokasi pnpm dan node terbaru.

**Why:** Nix store hashes berubah ketika versi pnpm/node diupdate di replit.nix. Harus dicari ulang jika tiba-tiba pnpm not found setelah package update.
