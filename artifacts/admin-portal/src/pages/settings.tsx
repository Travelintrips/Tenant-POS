import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, Building2, FileText, DollarSign, Save, RefreshCw,
  MessageSquare, CheckCircle2, XCircle, Wifi, WifiOff, Send,
  AlertCircle, Loader2, ExternalLink, Smartphone, Info,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MallConfig {
  mallName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  invoicePrefix: string;
  taxRate: number;
  currency: string;
  logoUrl: string;
  adminPhone: string;
}

interface WaStatus {
  configured: boolean;
  connected: boolean | null;
  provider: string;
  message: string;
}

interface TestSendResult {
  ok: boolean;
  message?: string;
  error?: string;
  target?: string;
  skipped?: boolean;
}

// ─── WhatsApp Status Panel ────────────────────────────────────────────────────

function WaStatusBadge({ status }: { status: WaStatus | undefined; }) {
  if (!status) return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Memuat...</Badge>;
  if (!status.configured) return (
    <Badge variant="outline" className="gap-1 border-orange-300 bg-orange-50 text-orange-700">
      <AlertCircle className="h-3 w-3" />FONNTE_TOKEN belum diisi
    </Badge>
  );
  if (status.connected === true) return (
    <Badge className="gap-1 bg-green-100 text-green-700 border-green-300 hover:bg-green-100">
      <CheckCircle2 className="h-3 w-3" />Terhubung
    </Badge>
  );
  if (status.connected === false) return (
    <Badge variant="outline" className="gap-1 border-red-300 bg-red-50 text-red-700">
      <XCircle className="h-3 w-3" />Tidak Terhubung
    </Badge>
  );
  return (
    <Badge variant="outline" className="gap-1 border-yellow-300 bg-yellow-50 text-yellow-700">
      <AlertCircle className="h-3 w-3" />Tidak Diketahui
    </Badge>
  );
}

function WhatsAppPanel() {
  const { toast } = useToast();
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<TestSendResult | null>(null);

  const {
    data: waStatus,
    isLoading: waLoading,
    refetch: refetchStatus,
    isFetching: waFetching,
  } = useQuery<WaStatus>({
    queryKey: ["/api/whatsapp/status"],
    queryFn: async () => {
      const res = await apiFetch("/api/whatsapp/status");
      if (!res.ok) throw new Error("Gagal cek status");
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  async function handleTestSend() {
    if (!testPhone.trim()) {
      toast({ title: "Nomor kosong", description: "Masukkan nomor HP tujuan terlebih dahulu.", variant: "destructive" });
      return;
    }
    setTestSending(true);
    setLastTestResult(null);
    try {
      const res = await apiFetch("/api/whatsapp/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone.trim() }),
      });
      const data: TestSendResult = await res.json();
      setLastTestResult(data);
      if (data.ok) {
        toast({ title: "✅ Pesan tes terkirim!", description: `WA berhasil dikirim ke ${data.target ?? testPhone}` });
        refetchStatus();
      } else {
        toast({ title: "Gagal kirim WA", description: data.error ?? "Terjadi kesalahan", variant: "destructive" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan";
      setLastTestResult({ ok: false, error: msg });
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setTestSending(false);
    }
  }

  const isConnected = waStatus?.connected === true;
  const isConfigured = waStatus?.configured === true;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-green-600" />
            WhatsApp via Fonnte
          </CardTitle>
          <div className="flex items-center gap-2">
            <WaStatusBadge status={waStatus} />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => refetchStatus()}
              disabled={waFetching}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${waFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs">
          Koneksi WhatsApp untuk notifikasi otomatis invoice, pengingat tagihan, dan konfirmasi pembayaran.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status detail */}
        {!waLoading && waStatus && (
          <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs ${
            isConnected
              ? "bg-green-50 border-green-200 text-green-800"
              : !isConfigured
              ? "bg-orange-50 border-orange-200 text-orange-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {isConnected
              ? <Wifi className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
              : <WifiOff className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
            }
            <div className="space-y-0.5">
              <p className="font-medium">{waStatus.message}</p>
              {isConnected && (
                <p className="text-green-700 opacity-80">Semua fitur notifikasi WA siap digunakan.</p>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Panduan Setup */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Cara Menghubungkan Perangkat
          </p>
          <ol className="space-y-2 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">1</span>
              <span>Buka <a href="https://fonnte.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5 font-medium">fonnte.com <ExternalLink className="h-2.5 w-2.5" /></a> lalu login ke dashboard Anda.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">2</span>
              <span>Pilih <strong>Device</strong> → klik tombol <strong>"Connect"</strong> / <strong>"Scan QR"</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">3</span>
              <span>Di HP Anda, buka <strong>WhatsApp</strong> → <strong>Setelan</strong> → <strong>Perangkat Tertaut</strong> → <strong>Tautkan Perangkat</strong> → scan QR.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">4</span>
              <span>Salin <strong>Token API</strong> dari dashboard Fonnte, lalu simpan sebagai secret <code className="bg-muted px-1 rounded font-mono">FONNTE_TOKEN</code> di Replit.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">5</span>
              <span>Klik tombol <strong>Refresh</strong> di atas atau gunakan form tes di bawah untuk konfirmasi koneksi aktif.</span>
            </li>
          </ol>
        </div>

        <Separator />

        {/* Test Send */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5" />
            Tes Kirim Pesan WA
          </p>
          <p className="text-xs text-muted-foreground">
            Masukkan nomor HP untuk mengirim pesan tes. Gunakan nomor Anda sendiri untuk verifikasi.
          </p>
          <div className="flex gap-2">
            <Input
              value={testPhone}
              onChange={e => { setTestPhone(e.target.value); setLastTestResult(null); }}
              placeholder="08123456789 atau 6281234567890"
              className="h-8 text-sm flex-1"
              onKeyDown={e => e.key === "Enter" && handleTestSend()}
            />
            <Button
              size="sm"
              className="h-8 gap-1.5 whitespace-nowrap"
              onClick={handleTestSend}
              disabled={testSending || !testPhone.trim()}
            >
              {testSending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Mengirim...</>
                : <><Send className="h-3.5 w-3.5" />Kirim Tes</>
              }
            </Button>
          </div>

          {/* Hasil test */}
          {lastTestResult && (
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
              lastTestResult.ok
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}>
              {lastTestResult.ok
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                : <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
              }
              <div>
                <p className="font-medium">
                  {lastTestResult.ok ? "Berhasil!" : "Gagal"}
                </p>
                <p className="opacity-80">
                  {lastTestResult.ok ? lastTestResult.message : lastTestResult.error}
                </p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Info FONNTE_TOKEN */}
        <div className="rounded-lg bg-muted/60 px-3 py-2.5 space-y-1">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
            Konfigurasi Replit Secret
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Token Fonnte disimpan sebagai secret <code className="bg-background border px-1 rounded font-mono text-[10px]">FONNTE_TOKEN</code>.
            Untuk mengubahnya, buka tab <strong>Secrets</strong> di sidebar Replit, cari <code className="bg-background border px-1 rounded font-mono text-[10px]">FONNTE_TOKEN</code>,
            dan perbarui nilainya. Restart server setelah mengubah secret.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Settings Page ────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery<MallConfig>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await apiFetch("/api/settings");
      if (!res.ok) throw new Error("Gagal memuat pengaturan");
      return res.json();
    },
  });

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<MallConfig>({
    defaultValues: config,
  });

  useEffect(() => {
    if (config) reset(config);
  }, [config, reset]);

  const mutation = useMutation({
    mutationFn: async (data: MallConfig) => {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Gagal menyimpan");
      }
      return res.json();
    },
    onSuccess: (data: MallConfig) => {
      toast({ title: "Pengaturan disimpan", description: "Konfigurasi sistem berhasil diperbarui." });
      qc.setQueryData(["settings"], data);
      reset(data);
    },
    onError: (err: Error) => {
      toast({ title: "Gagal", description: err.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: MallConfig) => mutation.mutate(data);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Pengaturan Sistem
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Konfigurasi umum portal admin mall
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Informasi Mall */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Informasi Mall
            </CardTitle>
            <CardDescription className="text-xs">
              Nama dan detail kontak mall yang tampil di sistem
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nama Mall *</Label>
                    <Input {...register("mallName")} placeholder="Mall Admin" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tagline</Label>
                    <Input {...register("tagline")} placeholder="Manajemen Tenant Mall" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alamat</Label>
                  <Input {...register("address")} placeholder="Jl. Contoh No. 1, Kota" className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telepon</Label>
                    <Input {...register("phone")} placeholder="021-12345678" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input {...register("email")} type="email" placeholder="admin@mall.com" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">URL Logo (opsional)</Label>
                  <Input {...register("logoUrl")} placeholder="https://..." className="h-8 text-sm" />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pengaturan Invoice */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Pengaturan Invoice
            </CardTitle>
            <CardDescription className="text-xs">
              Format dan aturan penomoran invoice
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="h-16 flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Prefix Invoice</Label>
                  <Input {...register("invoicePrefix")} placeholder="INV-TENANT" className="h-8 text-sm font-mono" />
                  <p className="text-[10px] text-muted-foreground">Contoh: INV-TENANT/202506/00001</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mata Uang</Label>
                  <Input {...register("currency")} placeholder="IDR" className="h-8 text-sm" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pengaturan Pajak */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Pengaturan Pajak
            </CardTitle>
            <CardDescription className="text-xs">
              Tarif pajak yang diterapkan pada invoice
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-32 space-y-1.5">
                  <Label className="text-xs">PPN / Tarif Pajak (%)</Label>
                  <Input
                    {...register("taxRate", { valueAsNumber: true })}
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="0"
                    className="h-8 text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-5">
                  Isi 0 jika tidak ada pajak. Contoh: 11 untuk PPN 11%.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nomor WA Admin */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Notifikasi WhatsApp Admin
            </CardTitle>
            <CardDescription className="text-xs">
              Nomor WA yang menerima notifikasi saat tenant upload bukti bayar. Admin dapat membalas
              <span className="font-mono mx-1 bg-muted px-1 rounded">SETUJU {"{ID}"}</span>
              atau
              <span className="font-mono mx-1 bg-muted px-1 rounded">TOLAK {"{ID}"} alasan</span>
              untuk memproses langsung dari WA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="h-12 flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Nomor WhatsApp Admin</Label>
                <Input
                  {...register("adminPhone")}
                  placeholder="08123456789 atau 6281234567890"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Isi nomor HP admin (format 08xxx atau 628xxx). Kosongkan jika tidak ingin menerima notifikasi WA.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!isDirty || mutation.isPending} className="gap-1.5">
            <Save className="h-4 w-4" />
            {mutation.isPending ? "Menyimpan..." : "Simpan Pengaturan"}
          </Button>
          {isDirty && (
            <Button type="button" variant="ghost" size="sm" onClick={() => reset(config)} className="gap-1.5 text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>
      </form>

      {/* Panel WhatsApp — di luar form karena punya state/action sendiri */}
      <WhatsAppPanel />
    </div>
  );
}
