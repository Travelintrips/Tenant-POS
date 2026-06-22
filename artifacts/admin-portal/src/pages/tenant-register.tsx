import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Building2,
  CheckCircle2,
  Loader2,
  Phone,
  Mail,
  User,
  Briefcase,
  MapPin,
  MessageCircle,
  FileText,
  AlertTriangle,
} from "lucide-react";

interface RegisterForm {
  picName: string;
  brandName: string;
  businessType: string;
  phone: string;
  email: string;
  address: string;
  interestedUnit: string;
  notes: string;
  agreementStatus: "setuju" | "tidak_setuju" | "";
  disagreementReason: string;
  leaseDurationMonths: string;
}

const BLANK: RegisterForm = {
  picName: "",
  brandName: "",
  businessType: "",
  phone: "",
  email: "",
  address: "",
  interestedUnit: "",
  notes: "",
  agreementStatus: "",
  disagreementReason: "",
  leaseDurationMonths: "",
};

const KETENTUAN = [
  "Data pendaftaran yang diberikan akan diproses dan ditinjau oleh tim manajemen.",
  "Calon tenant wajib memberikan informasi yang benar, lengkap, dan dapat dipertanggungjawabkan.",
  "Persetujuan pendaftaran tidak berarti otomatis diterima sebagai tenant — keputusan akhir ada di tangan manajemen.",
  "Besaran biaya sewa, deposit, masa sewa, dan ketentuan operasional lainnya akan dibahas lebih lanjut setelah seleksi.",
  "Tenant wajib mengikuti aturan kebersihan, jam operasional yang berlaku, kelengkapan perizinan usaha, dan larangan menjalankan usaha ilegal.",
  "Tenant dapat memilih opsi sewa bulanan sesuai kesepakatan dengan manajemen.",
  "Manajemen berhak menolak pendaftaran apabila calon tenant tidak memenuhi persyaratan atau bertentangan dengan ketentuan yang berlaku.",
];

const DURASI_OPTIONS = [
  { value: "1", label: "1 bulan" },
  { value: "3", label: "3 bulan" },
  { value: "6", label: "6 bulan" },
  { value: "12", label: "12 bulan (1 tahun)" },
  { value: "24", label: "24 bulan (2 tahun)" },
  { value: "36", label: "36 bulan (3 tahun)" },
];

export default function TenantRegister() {
  const [form, setForm] = useState<RegisterForm>(BLANK);
  const [submitted, setSubmitted] = useState(false);

  function setField(k: keyof RegisterForm, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const registerMutation = useMutation({
    mutationFn: async (f: RegisterForm) => {
      const res = await fetch("/api/calon-tenant/daftar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          picName: f.picName.trim(),
          brandName: f.brandName.trim(),
          businessType: f.businessType.trim(),
          phone: f.phone.trim(),
          email: f.email.trim() || undefined,
          address: f.address.trim() || undefined,
          interestedUnit: f.interestedUnit.trim() || undefined,
          notes: f.notes.trim() || undefined,
          agreementStatus: f.agreementStatus,
          disagreementReason: f.disagreementReason.trim() || undefined,
          leaseDurationMonths: f.leaseDurationMonths ? Number(f.leaseDurationMonths) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Terjadi kesalahan");
      return body;
    },
    onSuccess: () => setSubmitted(true),
  });

  const baseFieldsValid =
    form.picName.trim().length >= 2 &&
    form.brandName.trim().length >= 1 &&
    form.businessType.trim().length >= 1 &&
    form.phone.trim().length >= 8;

  const agreementValid =
    form.agreementStatus === "setuju" ||
    (form.agreementStatus === "tidak_setuju" && form.disagreementReason.trim().length >= 10);

  const canSubmit = baseFieldsValid && agreementValid;

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg border-0">
          <CardContent className="pt-10 pb-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800">Pendaftaran Berhasil!</h2>
            <p className="text-slate-600 text-sm leading-relaxed">
              Terima kasih, data Anda sudah kami terima. Tim kami akan mengirimkan
              dokumen penawaran/sewa melalui WhatsApp dalam waktu dekat.
            </p>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
              Pastikan nomor WhatsApp Anda aktif dan dapat menerima pesan. Jika
              dalam 1×24 jam belum ada kabar, silakan hubungi tim kami secara
              langsung.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-base text-slate-800">Pendaftaran Calon Tenant</h1>
            <p className="text-xs text-slate-500">Isi formulir berikut untuk mendaftar sebagai calon mitra/tenant</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {registerMutation.isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
            {(registerMutation.error as Error).message}
          </div>
        )}

        {/* Data PIC */}
        <Card className="shadow-sm border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />Data Penanggung Jawab
            </CardTitle>
            <CardDescription>Nama pemilik atau PIC yang bertanggung jawab atas usaha ini</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                Nama Calon Tenant / PIC <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Nama lengkap pemilik atau penanggung jawab"
                value={form.picName}
                onChange={(e) => setField("picName", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" />Nomor WhatsApp <span className="text-destructive">*</span></span>
                </Label>
                <Input
                  placeholder="628xxxxxxxxx"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Dokumen akan dikirim ke nomor ini</p>
              </div>
              <div className="space-y-1.5">
                <Label>
                  <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" />Email</span>
                </Label>
                <Input
                  type="email"
                  placeholder="email@domain.com (opsional)"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Alamat</Label>
              <Textarea
                placeholder="Alamat lengkap (opsional)"
                rows={2}
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Data Usaha */}
        <Card className="shadow-sm border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />Data Usaha / Brand
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nama Brand / Usaha <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Nama toko atau brand Anda"
                  value={form.brandName}
                  onChange={(e) => setField("brandName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Jenis Usaha <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="misal: Kuliner, Fashion, Olahraga, dll."
                  value={form.businessType}
                  onChange={(e) => setField("businessType", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Minat Sewa */}
        <Card className="shadow-sm border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />Minat Lokasi / Unit
            </CardTitle>
            <CardDescription>Informasi unit atau lokasi yang Anda minati (opsional)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Unit / Lokasi yang Diminati</Label>
              <Input
                placeholder="misal: Unit A-01 Lantai 1, atau deskripsi lokasi yang diinginkan"
                value={form.interestedUnit}
                onChange={(e) => setField("interestedUnit", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                <span className="flex items-center gap-1.5"><MessageCircle className="h-3 w-3" />Catatan Kebutuhan</span>
              </Label>
              <Textarea
                placeholder="Ceritakan kebutuhan khusus, preferensi lokasi, atau informasi lain yang ingin disampaikan..."
                rows={3}
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Persetujuan Ketentuan Sewa */}
        <Card className={`shadow-sm border-2 ${form.agreementStatus === "setuju" ? "border-emerald-200 bg-emerald-50/30" : form.agreementStatus === "tidak_setuju" ? "border-amber-200 bg-amber-50/30" : "border-slate-200"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Persetujuan Ketentuan Sewa Tenant <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>Baca dan pahami ketentuan berikut sebelum melanjutkan pendaftaran</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Daftar Ketentuan */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
              {KETENTUAN.map((item, i) => (
                <div key={i} className="flex gap-2.5 text-sm text-slate-700">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <p className="leading-relaxed">{item}</p>
                </div>
              ))}
            </div>

            {/* Radio Buttons */}
            <div className="space-y-2.5">
              <Label className="text-sm font-medium text-slate-700">
                Pilihan persetujuan Anda <span className="text-destructive">*</span>
              </Label>

              {/* Setuju */}
              <label
                className={`flex items-center gap-3 p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                  form.agreementStatus === "setuju"
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="agreementStatus"
                  value="setuju"
                  checked={form.agreementStatus === "setuju"}
                  onChange={() => setField("agreementStatus", "setuju")}
                  className="w-4 h-4 accent-emerald-600"
                />
                <div>
                  <p className={`text-sm font-medium ${form.agreementStatus === "setuju" ? "text-emerald-700" : "text-slate-700"}`}>
                    ✅ Saya setuju dengan ketentuan sewa tenant
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Saya telah membaca dan menyetujui seluruh ketentuan di atas
                  </p>
                </div>
              </label>

              {/* Tidak Setuju */}
              <label
                className={`flex items-center gap-3 p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                  form.agreementStatus === "tidak_setuju"
                    ? "border-amber-400 bg-amber-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="agreementStatus"
                  value="tidak_setuju"
                  checked={form.agreementStatus === "tidak_setuju"}
                  onChange={() => setField("agreementStatus", "tidak_setuju")}
                  className="w-4 h-4 accent-amber-600"
                />
                <div>
                  <p className={`text-sm font-medium ${form.agreementStatus === "tidak_setuju" ? "text-amber-700" : "text-slate-700"}`}>
                    ⚠️ Saya tidak setuju
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Wajib mengisi alasan di bawah ini
                  </p>
                </div>
              </label>
            </div>

            {/* Pilihan Durasi Sewa Bulanan (opsional) */}
            {form.agreementStatus === "setuju" && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <Label className="text-sm font-medium text-slate-700">
                  Preferensi Durasi Sewa <span className="text-xs font-normal text-muted-foreground">(opsional)</span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {DURASI_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setField("leaseDurationMonths", form.leaseDurationMonths === opt.value ? "" : opt.value)}
                      className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all text-center ${
                        form.leaseDurationMonths === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Pilih estimasi durasi sewa yang Anda inginkan. Durasi final akan dibahas bersama manajemen.</p>
              </div>
            )}

            {/* Textarea Alasan (muncul hanya jika tidak setuju) */}
            {form.agreementStatus === "tidak_setuju" && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                <Label className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Alasan tidak setuju <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  placeholder="Tuliskan alasan Anda tidak setuju dengan ketentuan sewa tenant..."
                  rows={3}
                  value={form.disagreementReason}
                  onChange={(e) => setField("disagreementReason", e.target.value)}
                  className="border-amber-300 focus:border-amber-400 bg-white"
                />
                <p className="text-xs text-muted-foreground">
                  {form.disagreementReason.trim().length}/10 karakter minimum
                  {form.disagreementReason.trim().length < 10 && form.disagreementReason.length > 0 && (
                    <span className="text-destructive ml-1">
                      (butuh {10 - form.disagreementReason.trim().length} karakter lagi)
                    </span>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="space-y-3">
          <Button
            className="w-full h-11 gap-2 text-base"
            disabled={!canSubmit || registerMutation.isPending}
            onClick={() => registerMutation.mutate(form)}
          >
            {registerMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Mengirim...</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" />Kirim Pendaftaran</>
            )}
          </Button>
          {!form.agreementStatus && (
            <p className="text-center text-xs text-amber-600 font-medium">
              Wajib memilih persetujuan ketentuan sewa sebelum mengirim
            </p>
          )}
          {!form.agreementStatus && (
            <p className="text-center text-xs text-muted-foreground">
              Dengan mengirim formulir ini, data Anda akan diproses oleh tim manajemen.
            </p>
          )}
          {form.agreementStatus === "setuju" && (
            <p className="text-center text-xs text-emerald-600">
              ✅ Anda telah menyetujui ketentuan sewa. Dokumen penawaran akan dikirimkan melalui WhatsApp.
            </p>
          )}
          {form.agreementStatus === "tidak_setuju" && (
            <p className="text-center text-xs text-amber-600">
              ⚠️ Pendaftaran tetap diterima namun tim kami akan menghubungi Anda untuk diskusi lebih lanjut.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
