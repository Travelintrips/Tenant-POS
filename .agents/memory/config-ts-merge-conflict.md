---
name: config.ts merge conflict recurring
description: lib/db/src/config.ts terus kena git merge conflict — harus selalu di-overwrite penuh
---

## Aturan

`lib/db/src/config.ts` adalah file yang sangat sering kena git merge conflict karena ada versi lama di git history. Setiap kali file ini rusak, **jangan edit parsial** — selalu overwrite penuh dengan `write` tool.

**Isi yang benar (versi final):**
- Satu fungsi `parseDbUrl` (bukan dua)
- `isProduction` check berdasarkan `NODE_ENV`
- Production → `SUPABASE_PG_URL_PROD` ?? `SUPABASE_PG_URL` ?? `DATABASE_URL`
- Development → `SUPABASE_PG_URL` ?? `DATABASE_URL`
- `isSupabase` check dari URL string
- Export `dbConfig` dengan `url`, `parsed`, `ssl`, `env`

**Why:** File ini ada di dua branch berbeda dengan implementasi berbeda; tiap checkpoint/merge memunculkan conflict marker `<<<<<<<`, `=======`, `>>>>>>>` yang menyebabkan TypeScript error dan API server gagal build.

**How to apply:** Jika ada laporan API error atau build failure, cek file ini dulu. Jika ada conflict marker, overwrite penuh dengan versi bersih di atas.
