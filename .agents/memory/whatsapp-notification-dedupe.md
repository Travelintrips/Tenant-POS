---
name: WhatsApp notification dedupe
description: Constraint and decision for preventing duplicate Fonnte notifications from overlapping payment flows.
---

Fonnte tidak menyediakan idempotency key. Satu pembayaran dapat melewati lebih dari satu jalur post-commit, sehingga notifikasi grup harus memakai kunci deduplikasi berbasis nomor kuitansi/invoice dan nominal.

**Why:** Pengiriman fire-and-forget dan beberapa endpoint pembayaran dapat membuat event yang sama diproses lebih dari sekali, sementara Fonnte tetap menerima setiap request sebagai pesan baru.

**How to apply:** Pertahankan deduplikasi sebelum memanggil Fonnte untuk notifikasi grup, dan hilangkan duplikasi tujuan admin setelah normalisasi nomor. Kegagalan boleh dicoba ulang, tetapi status sukses atau pending tidak boleh dikirim ulang dalam cooldown.