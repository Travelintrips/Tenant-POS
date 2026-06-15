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
};

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
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Terjadi kesalahan");
      return body;
    },
    onSuccess: () => setSubmitted(true),
  });

  const canSubmit =
    form.picName.trim().length >= 2 &&
    form.brandName.trim().length >= 1 &&
    form.businessType.trim().length >= 1 &&
    form.phone.trim().length >= 8;

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
          <p className="text-center text-xs text-muted-foreground">
            Dengan mengirim formulir ini, data Anda akan diproses oleh tim manajemen.
            Dokumen penawaran akan dikirimkan melalui WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
