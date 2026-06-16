---
name: Dist stale – artifact API server workflow
description: Cara benar rebuild dan restart API server agar dist baru dipakai
---

## Rule
Setelah mengedit source API server (terutama routes/index.ts), SELALU restart workflow `artifacts/api-server: API Server` secara langsung — jangan andalkan `Start application`.

**Why:**
`start-dev.sh` memeriksa apakah port 8080 sudah aktif. Jika artifact API server sudah berjalan, script SKIP build ulang. Akibatnya dist lama terus dipakai meski source sudah berubah.

**How to apply:**
1. Edit source
2. `pnpm --filter @workspace/api-server run build` (opsional, untuk verifikasi)
3. Restart workflow `artifacts/api-server: API Server` via restart_workflow tool
4. Tunggu ~10 detik, lalu curl `/api/healthz`
