/**
 * The date value for every payment source remains tenant_payments.paid_at.
 * This helper only describes what that existing value means to the user.
 */
export function getPaymentDateLabel(sourceType: string | null | undefined): string {
  switch (sourceType?.trim().toLowerCase()) {
    case "ocr":
    case "ocr_upload":
    case "upload":
    case "proof":
    case "payment_proof":
      return "Tanggal Disetujui";
    case "bank":
    case "bank_recon":
    case "bank-reconciliation":
    case "reconciliation":
      return "Tanggal Transaksi Bank";
    case "pos":
    case "manual":
    default:
      return "Tanggal Pembayaran";
  }
}