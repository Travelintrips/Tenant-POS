import { useState, useRef } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, Upload, CheckCircle, XCircle, FileImage, Loader2, Sparkles, Info, Phone, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

function formatRupiah(val: string | number | null | undefined) {
  if (val == null || val === "") return "Rp 0";
  const num = typeof val === "string" ? parseFloat(val) : val;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);
}

function formatTanggal(val: string | null | undefined) {
  if (!val) return "-";
  return new Date(val).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

interface InvoiceInfo {
  id: number;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: string;
  tenantName: string;
  ownerName: string;
  unitCode: string;
  alreadyPaid: boolean;
}

interface ScanResult {
  extractedAmount: number | null;
  confidence: number;
  rawText: string;
}

interface MallInfo {
  mallName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export default function PaymentProofUpload() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("transfer");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ receiptNumber: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // OCR state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [ocrFilled, setOcrFilled] = useState(false);

  const { data: invoice, isLoading, error } = useQuery<InvoiceInfo>({
    queryKey: ["pay-invoice", token],
    queryFn: async () => {
      const res = await fetch(`/api/pay/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Gagal memuat data invoice");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const { data: mallInfo } = useQuery<MallInfo>({
    queryKey: ["pay-mall-info"],
    queryFn: async () => {
      const res = await fetch("/api/pay/mall-info");
      if (!res.ok) return { mallName: "Manajemen Mall", phone: null, email: null, address: null };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  async function scanProof(file: File) {
    setScanning(true);
    setScanResult(null);
    setOcrFilled(false);
    try {
      const form = new FormData();
      form.append("proof", file);
      const res = await fetch(`/api/pay/${token}/scan-proof`, { method: "POST", body: form });
      if (!res.ok) return;
      const data: ScanResult = await res.json();
      setScanResult(data);
      if (data.extractedAmount && data.extractedAmount > 0) {
        setAmount(String(data.extractedAmount));
        setOcrFilled(true);
      }
    } catch {
      // gagal scan → tidak apa-apa, user bisa isi manual
    } finally {
      setScanning(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setProofFile(file);
    setScanResult(null);
    setOcrFilled(false);
    if (file && file.type.startsWith("image/")) {
      setProofPreview(URL.createObjectURL(file));
    } else {
      setProofPreview(null);
    }
    if (file) {
      scanProof(file);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const numAmount = parseFloat(amount.replace(/\D/g, ""));
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      setSubmitError("Masukkan jumlah pembayaran yang valid");
      return;
    }
    if (!proofFile) {
      setSubmitError("Bukti pembayaran wajib diupload");
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("amount", String(numAmount));
      form.append("paymentMethod", paymentMethod);
      if (referenceNumber) form.append("referenceNumber", referenceNumber);
      if (notes) form.append("notes", notes);
      form.append("proof", proofFile);
      // Kirim data OCR untuk logging
      if (scanResult?.extractedAmount) form.append("ocrExtractedAmount", String(scanResult.extractedAmount));
      if (scanResult?.rawText) form.append("ocrRawText", scanResult.rawText.slice(0, 500));
      if (scanResult?.confidence) form.append("ocrConfidence", String(scanResult.confidence));

      const res = await fetch(`/api/pay/${token}/proof`, {
        method: "POST",
        body: form,
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(body.error ?? "Gagal mengirim bukti pembayaran");
        return;
      }
      setSubmitSuccess({ receiptNumber: body.receiptNumber });
    } catch {
      setSubmitError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invoice) {
    const phone = mallInfo?.phone;
    const waPhone = phone?.replace(/^0/, "62").replace(/\D/g, "");
    const waLink = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent("Halo, link pembayaran saya tidak valid. Mohon bantuan.")}`
      : null;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md space-y-4">
          <Card>
            <CardContent className="pt-8 pb-6 text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Link Tidak Valid</h2>
              <p className="text-muted-foreground text-sm mb-4">
                {(error as Error)?.message ?? "Link pembayaran tidak ditemukan atau sudah tidak aktif."}
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
                <p className="text-xs text-amber-800 font-medium mb-1">Kemungkinan penyebab:</p>
                <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                  <li>Link sudah kadaluarsa atau telah diganti</li>
                  <li>Link dikirim dari sistem yang berbeda</li>
                  <li>Invoice sudah dibatalkan</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {(mallInfo?.phone || mallInfo?.email) && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-sm font-medium text-slate-700 mb-3 text-center">
                  Hubungi {mallInfo?.mallName ?? "Pengelola Mall"} untuk link baru
                </p>
                <div className="space-y-2">
                  {phone && waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                    >
                      <MessageCircle className="h-4 w-4 flex-shrink-0" />
                      <span>Chat WhatsApp ({phone})</span>
                    </a>
                  )}
                  {phone && !waLink && (
                    <a
                      href={`tel:${phone}`}
                      className="flex items-center gap-2 w-full border rounded-lg px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Phone className="h-4 w-4 flex-shrink-0" />
                      <span>{phone}</span>
                    </a>
                  )}
                  {mallInfo?.email && (
                    <a
                      href={`mailto:${mallInfo.email}`}
                      className="flex items-center gap-2 w-full border rounded-lg px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Mail className="h-4 w-4 flex-shrink-0" />
                      <span>{mallInfo.email}</span>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (invoice.alreadyPaid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Invoice Sudah Lunas</h2>
            <p className="text-muted-foreground text-sm">
              Invoice <strong>{invoice.invoiceNumber}</strong> sudah berstatus lunas. Terima kasih!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Bukti Berhasil Dikirim!</h2>
            <p className="text-muted-foreground text-sm mb-3">
              Bukti pembayaran Anda sedang dalam proses verifikasi oleh admin.
              Anda akan mendapat konfirmasi via WhatsApp.
            </p>
            <p className="text-xs text-muted-foreground">
              No. Kwitansi: <strong>{submitSuccess.receiptNumber}</strong>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold">Portal Pembayaran Tenant</span>
        </div>

        {/* Info Invoice */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Detail Tagihan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">No. Invoice</span>
              <span className="font-medium">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tenant</span>
              <span className="font-medium">{invoice.tenantName}</span>
            </div>
            {invoice.unitCode && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit</span>
                <span>{invoice.unitCode}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jatuh Tempo</span>
              <span className={new Date(invoice.dueDate) < new Date() ? "text-destructive font-semibold" : ""}>
                {formatTanggal(invoice.dueDate)}
              </span>
            </div>
            <div className="border-t pt-2 mt-2 flex justify-between">
              <span className="text-muted-foreground">Total Tagihan</span>
              <span className="font-semibold">{formatRupiah(invoice.totalAmount)}</span>
            </div>
            {parseFloat(invoice.paidAmount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sudah Dibayar</span>
                <span className="text-green-600">{formatRupiah(invoice.paidAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>Sisa Tagihan</span>
              <span className="text-primary">{formatRupiah(invoice.outstandingAmount)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Form Upload Bukti */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Upload Bukti Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* File Upload — di atas agar OCR berjalan sebelum user isi amount */}
              <div className="space-y-1.5">
                <Label htmlFor="proof">
                  Foto/Bukti Pembayaran <span className="text-destructive">*</span>
                </Label>
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  {proofPreview ? (
                    <img
                      src={proofPreview}
                      alt="Bukti"
                      className="max-h-48 mx-auto rounded object-contain"
                    />
                  ) : (
                    <div className="space-y-2">
                      <FileImage className="h-8 w-8 text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        {proofFile ? proofFile.name : "Klik untuk pilih foto bukti pembayaran"}
                      </p>
                      <p className="text-xs text-muted-foreground">JPG, PNG, WEBP atau PDF — maks 5MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {proofFile && !proofPreview && (
                  <p className="text-xs text-muted-foreground">{proofFile.name}</p>
                )}

                {/* OCR scanning indicator */}
                {scanning && (
                  <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded-md px-3 py-2 mt-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                    <span>Mendeteksi nominal dari bukti transfer...</span>
                  </div>
                )}
              </div>

              {/* Jumlah Dibayar — dengan label OCR jika auto-fill */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="amount">Jumlah Dibayar <span className="text-destructive">*</span></Label>
                  {ocrFilled && scanResult?.extractedAmount && !scanning && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Terdeteksi otomatis
                    </Badge>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    placeholder="0"
                    className={`pl-10 ${ocrFilled && !scanning ? "border-green-400 focus:border-green-500" : ""}`}
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setOcrFilled(false); // user edit manual → hapus badge
                    }}
                    required
                  />
                </div>
                {ocrFilled && scanResult?.extractedAmount && !scanning && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Nominal terdeteksi dari bukti transfer. Pastikan sudah sesuai sebelum mengirim.
                  </p>
                )}
                {!scanning && proofFile && !ocrFilled && scanResult && !scanResult.extractedAmount && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Nominal tidak terdeteksi otomatis. Silakan isi manual.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Metode Pembayaran <span className="text-destructive">*</span></Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">Transfer Bank</SelectItem>
                    <SelectItem value="qris">QRIS</SelectItem>
                    <SelectItem value="tunai">Tunai</SelectItem>
                    <SelectItem value="edc">EDC/Debit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reference">Nomor Referensi / Bukti Transfer</Label>
                <Input
                  id="reference"
                  placeholder="Contoh: 123456789"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Catatan (Opsional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Tambahkan catatan jika diperlukan"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {submitError && (
                <Alert variant="destructive">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={submitting || scanning}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Mengirim...
                  </>
                ) : scanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Mendeteksi nominal...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Kirim Bukti Pembayaran
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Hubungi pengelola mall jika ada pertanyaan mengenai tagihan Anda.
        </p>
      </div>
    </div>
  );
}
