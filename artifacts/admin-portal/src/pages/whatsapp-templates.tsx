import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Copy, CheckCheck, FileText, AlertTriangle, CreditCard,
  MessageSquare, Clock, XCircle, Bell, Link as LinkIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const EXAMPLE_PAYMENT_LINK = "https://myapp.replit.app/bayar/a3f9c2b1d4e7f8...";

interface Template {
  key: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  trigger: string;
  color: string;
  triggerColor: string;
  preview: (vars: Vars) => string;
}

interface Vars {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  periodLabel: string;
  totalAmount: string;
  outstandingAmount: string;
  dueDate: string;
  daysUntilDue: string;
  daysOverdue: string;
  amount: string;
  rejectionReason: string;
  companyName: string;
  paymentLink: string;
}

const DEFAULT_VARS: Vars = {
  ownerName: "Budi Santoso",
  businessName: "Toko Maju Jaya",
  invoiceNumber: "CST/202607/00001",
  periodLabel: "Juli 2026",
  totalAmount: "Rp 5.000.000",
  outstandingAmount: "Rp 3.500.000",
  dueDate: "6 Juli 2026",
  daysUntilDue: "3",
  daysOverdue: "5",
  amount: "Rp 5.000.000",
  rejectionReason: "Bukti transfer tidak terbaca dengan jelas",
  companyName: "Manajemen CST",
  paymentLink: EXAMPLE_PAYMENT_LINK,
};

const TEMPLATES: Template[] = [
  {
    key: "invoice",
    label: "Tagihan Baru",
    icon: <FileText className="h-4 w-4" />,
    description: "Dikirim otomatis awal bulan (blast tagihan) atau manual dari halaman Invoice.",
    trigger: "Otomatis — awal bulan & manual",
    color: "bg-blue-50 border-blue-200",
    triggerColor: "bg-blue-100 text-blue-700",
    preview: (v) =>
`📋 *Tagihan Baru — ${v.businessName}*
━━━━━━━━━━━━━━━━━━━━━

Yth. Bapak/Ibu *${v.ownerName}*,

Berikut adalah tagihan terbaru yang telah kami terbitkan untuk Anda:

• No. Invoice : *${v.invoiceNumber}*
• Periode       : ${v.periodLabel}
• Total Tagihan : *${v.totalAmount}*
• Jatuh Tempo  : *${v.dueDate}*

🔗 *Link Pembayaran:*
${v.paymentLink}

Mohon lakukan pembayaran sebelum tanggal jatuh tempo.

Hubungi kami jika ada pertanyaan.

Terima kasih 🙏
_${v.companyName}_`,
  },
  {
    key: "reminder_h7",
    label: "Pengingat H-7",
    icon: <Clock className="h-4 w-4" />,
    description: "Dikirim otomatis 7 hari sebelum jatuh tempo invoice.",
    trigger: "Otomatis — H-7 sebelum jatuh tempo",
    color: "bg-yellow-50 border-yellow-200",
    triggerColor: "bg-yellow-100 text-yellow-700",
    preview: (v) =>
`🟡 *Pengingat Jatuh Tempo — ${v.businessName}*
━━━━━━━━━━━━━━━━━━━━━

Yth. Bapak/Ibu *${v.ownerName}*,

Tagihan berikut akan jatuh tempo dalam *7 hari lagi*. Mohon segera lakukan pembayaran.

• No. Invoice       : *${v.invoiceNumber}*
• Periode            : ${v.periodLabel}
• Sisa Tagihan      : *${v.outstandingAmount}*
• Jatuh Tempo       : *${v.dueDate}*

🔗 *Link Pembayaran:*
${v.paymentLink}

Pembayaran tepat waktu sangat membantu kelancaran operasional Anda.

Hubungi kami jika ada pertanyaan. Terima kasih 🙏
_${v.companyName}_`,
  },
  {
    key: "reminder_h3",
    label: "Pengingat H-3",
    icon: <Clock className="h-4 w-4" />,
    description: "Dikirim otomatis 3 hari sebelum jatuh tempo invoice.",
    trigger: "Otomatis — H-3 sebelum jatuh tempo",
    color: "bg-orange-50 border-orange-200",
    triggerColor: "bg-orange-100 text-orange-700",
    preview: (v) =>
`🟡 *Pengingat Jatuh Tempo — ${v.businessName}*
━━━━━━━━━━━━━━━━━━━━━

Yth. Bapak/Ibu *${v.ownerName}*,

Tagihan berikut akan jatuh tempo dalam *3 hari lagi*. Mohon segera lakukan pembayaran.

• No. Invoice       : *${v.invoiceNumber}*
• Periode            : ${v.periodLabel}
• Sisa Tagihan      : *${v.outstandingAmount}*
• Jatuh Tempo       : *${v.dueDate}*

🔗 *Link Pembayaran:*
${v.paymentLink}

Pembayaran tepat waktu sangat membantu kelancaran operasional Anda.

Hubungi kami jika ada pertanyaan. Terima kasih 🙏
_${v.companyName}_`,
  },
  {
    key: "reminder_h1",
    label: "Pengingat H-1",
    icon: <Clock className="h-4 w-4" />,
    description: "Dikirim otomatis 1 hari sebelum jatuh tempo invoice.",
    trigger: "Otomatis — H-1 sebelum jatuh tempo",
    color: "bg-red-50 border-red-200",
    triggerColor: "bg-red-100 text-red-700",
    preview: (v) =>
`🔴 *Pengingat Jatuh Tempo — ${v.businessName}*
━━━━━━━━━━━━━━━━━━━━━

Yth. Bapak/Ibu *${v.ownerName}*,

Tagihan berikut akan jatuh tempo dalam *1 hari lagi*. Mohon segera lakukan pembayaran.

• No. Invoice       : *${v.invoiceNumber}*
• Periode            : ${v.periodLabel}
• Sisa Tagihan      : *${v.outstandingAmount}*
• Jatuh Tempo       : *${v.dueDate}*

🔗 *Link Pembayaran:*
${v.paymentLink}

Pembayaran tepat waktu sangat membantu kelancaran operasional Anda.

Hubungi kami jika ada pertanyaan. Terima kasih 🙏
_${v.companyName}_`,
  },
  {
    key: "overdue",
    label: "Tagihan Melewati Jatuh Tempo",
    icon: <AlertTriangle className="h-4 w-4" />,
    description: "Dikirim otomatis saat invoice melewati tanggal jatuh tempo dan belum dibayar.",
    trigger: "Otomatis — saat invoice overdue",
    color: "bg-red-50 border-red-300",
    triggerColor: "bg-red-100 text-red-700",
    preview: (v) =>
`🔴 *Tagihan Melewati Jatuh Tempo — ${v.businessName}*
━━━━━━━━━━━━━━━━━━━━━

Yth. Bapak/Ibu *${v.ownerName}*,

Kami menginformasikan bahwa tagihan Anda telah melewati batas waktu pembayaran.

• No. Invoice       : *${v.invoiceNumber}*
• Total Tagihan     : ${v.totalAmount}
• Sisa Belum Bayar : *${v.outstandingAmount}*
• Keterlambatan     : *${v.daysOverdue} hari*

🔗 *Link Pembayaran:*
${v.paymentLink}

Mohon segera lakukan pembayaran untuk menghindari sanksi keterlambatan lebih lanjut.

Hubungi kami jika ada pertanyaan atau kendala.

Terima kasih. 🙏
_${v.companyName}_`,
  },
  {
    key: "proof_received",
    label: "Bukti Pembayaran Diterima",
    icon: <Bell className="h-4 w-4" />,
    description: "Dikirim ke tenant saat mereka mengunggah bukti pembayaran — sedang menunggu verifikasi.",
    trigger: "Otomatis — saat tenant upload bukti",
    color: "bg-cyan-50 border-cyan-200",
    triggerColor: "bg-cyan-100 text-cyan-700",
    preview: (v) =>
`🔔 *Bukti Pembayaran Diterima — ${v.businessName}*
━━━━━━━━━━━━━━━━━━━━━

Yth. Bapak/Ibu *${v.ownerName}*,

Bukti pembayaran Anda telah kami terima dengan rincian:

• No. Invoice : *${v.invoiceNumber}*
• Jumlah         : *${v.amount}*

Pembayaran Anda sedang dalam proses verifikasi oleh tim kami. Anda akan mendapat konfirmasi setelah proses selesai.

Terima kasih atas kesabaran Anda. 🙏
_${v.companyName}_`,
  },
  {
    key: "payment_approved",
    label: "Pembayaran Disetujui",
    icon: <CreditCard className="h-4 w-4" />,
    description: "Dikirim ke tenant setelah admin menyetujui bukti pembayaran.",
    trigger: "Otomatis — setelah admin klik Setujui",
    color: "bg-green-50 border-green-200",
    triggerColor: "bg-green-100 text-green-700",
    preview: (v) =>
`✅ *Pembayaran Disetujui — ${v.businessName}*
━━━━━━━━━━━━━━━━━━━━━

Yth. Bapak/Ibu *${v.ownerName}*,

Kami informasikan bahwa pembayaran Anda telah *diverifikasi dan disetujui* oleh tim kami.

• No. Invoice : *${v.invoiceNumber}*
• Jumlah         : *${v.amount}*

Simpan pesan ini sebagai bukti konfirmasi pembayaran Anda.

Terima kasih atas kepercayaan Anda. 🙏
_${v.companyName}_`,
  },
  {
    key: "payment_rejected",
    label: "Pembayaran Ditolak",
    icon: <XCircle className="h-4 w-4" />,
    description: "Dikirim ke tenant setelah admin menolak bukti pembayaran.",
    trigger: "Otomatis — setelah admin klik Tolak",
    color: "bg-gray-50 border-gray-200",
    triggerColor: "bg-gray-100 text-gray-700",
    preview: (v) =>
`❌ *Pembayaran Tidak Dapat Diproses — ${v.businessName}*
━━━━━━━━━━━━━━━━━━━━━

Yth. Bapak/Ibu *${v.ownerName}*,

Mohon maaf, bukti pembayaran Anda untuk invoice berikut tidak dapat kami proses:

• No. Invoice : *${v.invoiceNumber}*
• Alasan         : ${v.rejectionReason}

Mohon upload ulang bukti pembayaran yang valid melalui link yang telah dikirimkan sebelumnya, atau hubungi kami untuk informasi lebih lanjut.

Terima kasih. 🙏
_${v.companyName}_`,
  },
];

function WaBubble({ text, onCopy, isCopied }: { text: string; onCopy: () => void; isCopied: boolean }) {
  return (
    <div className="relative bg-[#e8fdd8] rounded-xl rounded-tl-none px-4 py-3 text-sm whitespace-pre-wrap font-[system-ui] leading-relaxed text-gray-800 border border-green-200 shadow-sm max-h-72 overflow-y-auto">
      {text}
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 h-6 w-6 opacity-60 hover:opacity-100"
        onClick={onCopy}
      >
        {isCopied
          ? <CheckCheck className="h-3.5 w-3.5 text-green-600" />
          : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export default function WhatsAppTemplates() {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const [vars, setVars] = useState<Vars>(DEFAULT_VARS);
  const [showVarEditor, setShowVarEditor] = useState(false);

  function handleCopy(key: string, text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      toast({ title: "Disalin", description: "Teks pesan berhasil disalin ke clipboard." });
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function updateVar(key: keyof Vars, value: string) {
    setVars(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-600" />
            Template WhatsApp
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Semua pesan WA yang dikirim sistem — tampilan sesuai aslinya.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowVarEditor(v => !v)}
          className="shrink-0"
        >
          {showVarEditor ? "Sembunyikan" : "✏️ Ubah Contoh Data"}
        </Button>
      </div>

      {/* Link Pembayaran Info */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-3 px-4 space-y-1">
          <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
            <LinkIcon className="h-3.5 w-3.5" /> Format Link Pembayaran
          </p>
          <p className="text-xs text-blue-700">
            Setiap invoice punya token unik. Link dikirim otomatis di dalam pesan WA:
          </p>
          <code className="text-xs bg-blue-100 text-blue-900 px-2 py-1 rounded block font-mono">
            https://[nama-app].replit.app/bayar/[token-unik-invoice]
          </code>
          <p className="text-xs text-blue-600 mt-1">
            Tenant klik link → buka halaman bayar → upload bukti transfer → admin verifikasi.
          </p>
        </CardContent>
      </Card>

      {/* Variable Editor */}
      {showVarEditor && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ubah Contoh Data Preview</CardTitle>
            <CardDescription className="text-xs">Ganti nilai di bawah untuk melihat tampilan pesan dengan data berbeda.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(Object.keys(DEFAULT_VARS) as (keyof Vars)[]).map(k => (
                <div key={k} className="flex flex-col gap-1">
                  <Label className="text-[10px] font-mono text-muted-foreground">{k}</Label>
                  <Input
                    className="h-7 text-xs"
                    value={vars[k]}
                    onChange={e => updateVar(k, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-xs h-7"
              onClick={() => setVars(DEFAULT_VARS)}
            >
              Reset ke default
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Jadwal Pengiriman */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-amber-800 font-semibold mb-2">📅 Jadwal Pengiriman Otomatis</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-amber-700">
            <span>🕗 <strong>06:00 WIB</strong> — pengecekan pagi</span>
            <span>🕗 <strong>08:00 WIB</strong> — blast tagihan bulanan</span>
            <span>🕖 <strong>18:00 WIB</strong> — pengecekan sore</span>
          </div>
          <p className="text-[11px] text-amber-600 mt-2">
            Setiap pengecekan menjalankan: buat invoice bulanan → kirim tagihan baru → reminder H-7/H-3/H-1 → notifikasi overdue.
          </p>
        </CardContent>
      </Card>

      {/* Template Cards */}
      <div className="space-y-5">
        {TEMPLATES.map((tpl) => {
          const previewText = tpl.preview(vars);
          return (
            <Card key={tpl.key} className={`border ${tpl.color}`}>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {tpl.icon}
                      {tpl.label}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">{tpl.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${tpl.triggerColor}`}>
                      {tpl.trigger}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleCopy(tpl.key, previewText)}
                    >
                      {copied === tpl.key
                        ? <><CheckCheck className="h-3 w-3 mr-1 text-green-600" />Disalin</>
                        : <><Copy className="h-3 w-3 mr-1" />Salin</>}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-muted-foreground mb-2 font-medium">Preview pesan (tampilan di WA tenant):</p>
                <WaBubble
                  text={previewText}
                  onCopy={() => handleCopy(tpl.key, previewText)}
                  isCopied={copied === tpl.key}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />

      <div className="text-xs text-muted-foreground space-y-1">
        <p className="font-medium">Catatan:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Format <strong>*teks*</strong> = tebal, <strong>_teks_</strong> = miring di WhatsApp</li>
          <li>Nomor HP otomatis dikonversi: <strong>0812... → 62812...</strong></li>
          <li>Semua pengiriman via <strong>Fonnte API</strong> — pastikan device WA aktif di Pengaturan</li>
          <li>Link pembayaran hanya muncul jika <strong>APP_URL</strong> sudah dikonfigurasi di Secrets</li>
        </ul>
      </div>
    </div>
  );
}
