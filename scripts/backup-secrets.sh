#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# backup-secrets.sh — Simpan semua secrets ke file .env.local
#
# PENTING: File .env.local ada di .gitignore — TIDAK akan ter-push ke git.
# Jalankan script ini setelah menambah secrets baru di panel Replit Secrets.
#
# Cara pakai:
#   bash scripts/backup-secrets.sh          — simpan ke .env.local
#   bash scripts/backup-secrets.sh restore  — restore ke Replit Secrets
# ═══════════════════════════════════════════════════════════════════
set -e

BACKUP_FILE=".env.local"

save() {
  echo "# Mall Admin Portal — Secrets Backup" > "$BACKUP_FILE"
  echo "# Di-generate oleh scripts/backup-secrets.sh pada $(date '+%Y-%m-%d %H:%M')" >> "$BACKUP_FILE"
  echo "# JANGAN commit file ini ke git (sudah ada di .gitignore)" >> "$BACKUP_FILE"
  echo "" >> "$BACKUP_FILE"

  VARS=(
    SESSION_SECRET
    SUPABASE_URL
    SUPABASE_ANON_KEY
    SUPABASE_SERVICE_ROLE_KEY
    SUPABASE_PG_URL
    SUPABASE_DATABASE_URL
    FONNTE_TOKEN
    FONNTE_API_KEY
    FONNTE_SENDER
    FONNTE_ADMIN_WA
    SUPABASE_STORAGE_BUCKET
    GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET
    GOOGLE_SERVICE_ACCOUNT_JSON
    FONNTE_WEBHOOK_SECRET
  )

  SAVED=0
  MISSING=0

  for VAR in "${VARS[@]}"; do
    VAL="${!VAR}"
    if [ -n "$VAL" ]; then
      # Escape nilai untuk shell — gunakan single quote, escape single quote dalam nilai
      ESCAPED=$(printf "%s" "$VAL" | sed "s/'/'\\\\''/g")
      echo "${VAR}='${ESCAPED}'" >> "$BACKUP_FILE"
      SAVED=$((SAVED + 1))
    else
      echo "# ${VAR}=" >> "$BACKUP_FILE"
      MISSING=$((MISSING + 1))
    fi
  done

  chmod 600 "$BACKUP_FILE"
  echo "✅ Backup selesai: $SAVED secrets tersimpan, $MISSING kosong"
  echo "   File: $BACKUP_FILE"
}

restore() {
  if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ File $BACKUP_FILE tidak ditemukan. Jalankan 'bash scripts/backup-secrets.sh' dulu."
    exit 1
  fi

  echo "ℹ️  File .env.local ditemukan. Untuk restore secrets ke Replit:"
  echo ""
  echo "   Secrets TIDAK bisa di-set otomatis via script — Replit memerlukan input manual."
  echo "   Buka panel Secrets Replit dan masukkan nilai dari file .env.local ini."
  echo ""
  echo "Isi .env.local saat ini:"
  grep -v "^#" "$BACKUP_FILE" | grep -v "^$" | sed 's/=.*/=<tersimpan>/'
}

case "${1:-save}" in
  save|backup) save ;;
  restore)     restore ;;
  *)
    echo "Usage: bash scripts/backup-secrets.sh [save|restore]"
    exit 1
    ;;
esac
