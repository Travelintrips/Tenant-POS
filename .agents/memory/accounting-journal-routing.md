---
name: Accounting journal routing
description: Batas domain antara jurnal POS Sport Center dan jurnal pembayaran invoice tenant.
---

Gunakan jalur jurnal POS hanya untuk transaksi domain Sport Center POS. Semua pembayaran yang terhubung ke invoice tenant harus memakai jalur jurnal tenant-payment, termasuk OCR, pembayaran manual, konsolidasi, dan rekonsiliasi bank.

**Why:** Kedua jalur dapat menghasilkan identitas sumber numerik yang sama. Memanggil keduanya untuk satu payment dapat membuat jurnal ganda atau membuat idempotency mempertahankan jurnal yang lebih dulu diposting ke company yang salah.

**How to apply:** Tentukan domain dari relasi bisnis, bukan prefix kuitansi. Untuk payment ber-invoice, resolve company dari invoice terlebih dahulu dan fail closed jika owner canonical tidak tersedia. Duplicate checks harus membatasi source domain, bukan hanya numeric payment ID.