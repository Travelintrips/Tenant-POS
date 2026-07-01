import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Copy, CheckCheck, FileText, AlertTriangle, CreditCard, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Template {
  key: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  variables: string[];
  preview: (vars: Record<string, string>) => string;
  color: string;
}

const TEMPLATES: Template[] = [
  {
    key: "invoice",
    label: "Notifikasi Invoice",
    icon: <FileText className="h-4 w-4" />,
    description: "Dikirim saat invoice baru dibuat atau manual dari halaman Invoice Tenant.",
    color: "bg-blue-50 border-blue-200",
    variables: ["ownerName", "businessName", "invoiceNumber", "periodLabel", "totalAmount", "dueDate", "paymentLink"],
    preview: (v) =>
`Halo *${v.ownerName ?? "Budi Santoso"}*,

Kami informasikan bahwa invoice sewa untuk *${v.businessName ?? "Toko ABC"}* telah diterbitkan.

📄 *Detail Invoice:*
• No. Invoice: *${v.invoiceNumber ?? "INV-TENANT-0001"}*
• Periode: ${v.periodLabel ?? "Jan 2025 s/d Jan 2025"}
• Total Tagihan: *${v.totalAmount ?? "Rp 5.000.000"}*
• Jatuh Tempo: ${v.dueDate ?? "31 Januari 2025"}

${v.paymentLink ? `💳 *Link Pembayaran:*\n${v.paymentLink}\n\n` : ""}Mohon segera melakukan pembayaran sebelum tanggal jatuh tempo.

Terima kasih atas kepercayaan Anda. 🙏
_Manajemen CST_`,
  },
  {
    key: "overdue",
    label: "Pengingat Overdue",
    icon: <AlertTriangle className="h-4 w-4" />,
    description: "Dikirim manual atau terjadwal ke tenant yang invoicenya sudah melewati jatuh tempo.",
    color: "bg-red-50 border-red-200",
    variables: ["ownerName", "businessName", "invoiceNumber", "daysOverdue", "outstandingAmount"],
    preview: (v) =>
`⚠️ *PENGINGAT TAGIHAN OVERDUE*

Yth. *${v.ownerName ?? "Budi Santoso"}* (${v.businessName ?? "Toko ABC"}),

Invoice Anda *${v.invoiceNumber ?? "INV-TENANT-0001"}* telah melewati jatuh tempo sejak *${v.daysOverdue ?? "5"} hari* yang lalu.

💰 Sisa tagihan: *${v.outstandingAmount ?? "Rp 5.000.000"}*

Mohon segera melakukan pembayaran sebelum tanggal jatuh tempo.

Hubungi kami jika ada pertanyaan. Terima kasih. 🙏
_Manajemen CST_`,
  },
  {
    key: "payment_confirmation",
    label: "Konfirmasi Pembayaran",
    icon: <CreditCard className="h-4 w-4" />,
    description: "Dikirim otomatis setelah pembayaran tenant dikonfirmasi oleh admin.",
    color: "bg-green-50 border-green-200",
    variables: ["ownerName", "businessName", "invoiceNumber", "paidAmount", "remainingAmount"],
    preview: (v) =>
`✅ *KONFIRMASI PEMBAYARAN DITERIMA*

Halo *${v.ownerName ?? "Budi Santoso"}* (${v.businessName ?? "Toko ABC"}),

Pembayaran Anda telah kami terima dan dikonfirmasi.

📋 *Detail Pembayaran:*
• No. Invoice: *${v.invoiceNumber ?? "INV-TENANT-0001"}*
• Jumlah Dibayar: *${v.paidAmount ?? "Rp 5.000.000"}*
• Sisa Tagihan: *${v.remainingAmount ?? "Rp 0"}*

${v.remainingAmount === "Rp 0" || !v.remainingAmount ? "Invoice Anda telah *LUNAS*. ✅" : `Masih ada sisa tagihan sebesar *${v.remainingAmount}*.`}

Terima kasih atas pembayaran Anda. 🙏
_Manajemen CST_`,
  },
  {
    key: "custom",
    label: "Pesan Kustom",
    icon: <MessageSquare className="h-4 w-4" />,
    description: "Pesan bebas yang bisa dikirim dari menu Kirim WA &rsaquo; Kirim Pesan Uji Coba.",
    color: "bg-gray-50 border-gray-200",
    variables: [],
    preview: () =>
`✅ *Tes Koneksi WhatsApp Berhasil!*

Notifikasi dari Portal Admin Mall sudah aktif dan berfungsi dengan baik.

_Pesan ini dikirim otomatis oleh sistem._`,
  },
];

function PreviewBox({ text, onCopy }: { text: string; onCopy: () => void }) {
  return (
    <div className="relative">
      <div className="bg-[#e8fdd8] rounded-xl rounded-tl-none px-4 py-3 text-sm whitespace-pre-wrap font-[system-ui] leading-relaxed text-gray-800 border border-green-200 shadow-sm max-h-64 overflow-y-auto">
        {text}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 h-6 w-6 opacity-70 hover:opacity-100"
        onClick={onCopy}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function WhatsAppTemplates() {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  function handleCopy(key: string, text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      toast({ title: "Disalin", description: "Template pesan berhasil disalin ke clipboard." });
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-green-600" />
          Template WhatsApp
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Template pesan yang digunakan sistem untuk notifikasi WhatsApp via Fonnte.
        </p>
      </div>

      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-amber-700">
            <strong>Info:</strong> Template ini adalah format bawaan sistem. Variabel dalam kurung kurawal{" "}
            <code className="bg-amber-100 px-1 rounded">{"{{variabel}}"}</code> akan diisi otomatis oleh data invoice/tenant.
            Anda dapat menyalin template untuk referensi atau mengirim pesan kustom dari menu <strong>Kirim WA</strong>.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {TEMPLATES.map((tpl) => {
          const previewText = tpl.preview({});
          return (
            <Card key={tpl.key} className={`border ${tpl.color}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {tpl.icon}
                      {tpl.label}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">{tpl.description}</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => handleCopy(tpl.key, previewText)}
                  >
                    {copied === tpl.key
                      ? <><CheckCheck className="h-3 w-3 mr-1 text-green-600" /> Disalin</>
                      : <><Copy className="h-3 w-3 mr-1" /> Salin</>
                    }
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {tpl.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tpl.variables.map(v => (
                      <Badge key={v} variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">Preview pesan:</p>
                  <PreviewBox text={previewText} onCopy={() => handleCopy(tpl.key, previewText)} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />

      <div className="text-xs text-muted-foreground space-y-1">
        <p className="font-medium">Catatan penggunaan:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Pesan WA menggunakan format <strong>Markdown WhatsApp</strong>: *tebal*, _miring_</li>
          <li>Nomor HP otomatis dikonversi ke format internasional (0812 → 62812)</li>
          <li>Semua pengiriman melewati API <strong>Fonnte</strong> — pastikan token & device aktif di halaman Pengaturan</li>
          <li>Template kustom hanya tersedia saat kirim pesan uji coba dari menu Kirim WA</li>
        </ul>
      </div>
    </div>
  );
}
