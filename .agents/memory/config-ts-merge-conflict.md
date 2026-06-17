---
name: config.ts merge conflict recurring
description: lib/db/src/config.ts terus kena duplicate const rawUrl — ALWAYS overwrite penuh, verifikasi setelah write
---

## Aturan

`lib/db/src/config.ts` adalah file yang sangat sering kena git merge conflict atau sisa kode lama. Setiap kali file ini rusak, **jangan edit parsial** — selalu overwrite penuh dengan `write` tool, lalu **baca kembali hasilnya** untuk memastikan tidak ada sisa kode lama.

**Why:** File ini ada di history dengan berbagai versi (duplicate const rawUrl, resolveDbUrl() style, nested ternary style). Terkadang write tool menimpa file tapi baris 15+ masih menyimpan sisa versi lama, menyebabkan esbuild error "symbol rawUrl already declared".

**How to apply:**
1. Overwrite penuh dengan write tool
2. Langsung `read` file untuk verifikasi tidak ada duplikat const rawUrl
3. Jika ada sisa kode lama (biasanya mulai dari baris 15+), write lagi

**Isi yang benar (struktur final):**
- `const isProduction` di baris 1
- Satu `const rawUrl = (isProduction ? ... : ...).trim()` — tidak ada fungsi resolveDbUrl
- Production → `SUPABASE_PG_URL_PROD` ??error
- Development → `DATABASE_URL` → `SUPABASE_PG_URL` → `SUPABASE_DATABASE_URL` ??error
- `const isSupabase` (string check dari rawUrl)
- `function parseDbUrl` (satu fungsi, bukan dua)
- `const parsedUrl`
- `export const dbConfig` (url, parsed, ssl, env)
- Total ~42 baris, TIDAK ADA baris resolveDbUrl atau duplicate rawUrl
