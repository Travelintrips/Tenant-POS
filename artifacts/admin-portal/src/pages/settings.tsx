import React, { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, Building2, FileText, DollarSign, Save, RefreshCw,
  MessageSquare, CheckCircle2, XCircle, Wifi, WifiOff, Send,
  AlertCircle, Loader2, ExternalLink, Smartphone, Info, Link,
  Upload, Palette, Eye, ImageIcon, X, Pencil, Check, Globe2,
  Trash2, ShieldAlert,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  waSenderPhone: string;
  waSenderLabel: string;
  paymentDomain: string;
  invoiceColor: string;
  invoiceFooterNote: string;
  invoiceSignerName: string;
}

interface FonnteDevice {
  name: string;
  phone: string;
  status: string;
  connected: boolean;
}

interface DevicesResult {
  configured: boolean;
  devices: FonnteDevice[];
  error?: string;
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

function WhatsAppPanel({ config, onSaveSender }: {
  config: MallConfig | undefined;
  onSaveSender: (waSenderPhone: string, waSenderLabel: string) => void;
}) {
  const { toast } = useToast();
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<TestSendResult | null>(null);
  const [senderPhone, setSenderPhone] = useState("");
  const [senderLabel, setSenderLabel] = useState("");
  const [senderDirty, setSenderDirty] = useState(false);

  React.useEffect(() => {
    if (config) {
      setSenderPhone(config.waSenderPhone ?? "");
      setSenderLabel(config.waSenderLabel ?? "");
    }
  }, [config]);

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

  const { data: devicesData, isLoading: devicesLoading, refetch: refetchDevices } = useQuery<DevicesResult>({
    queryKey: ["/api/whatsapp/devices"],
    queryFn: async () => {
      const res = await apiFetch("/api/whatsapp/devices");
      if (!res.ok) throw new Error("Gagal ambil device");
      return res.json();
    },
    staleTime: 60000,
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
  const devices = devicesData?.devices ?? [];

  function selectDevice(d: FonnteDevice) {
    setSenderPhone(d.phone);
    setSenderLabel(d.name);
    setSenderDirty(true);
  }

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
              variant="ghost" size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => { void refetchStatus(); void refetchDevices(); }}
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
            isConnected ? "bg-green-50 border-green-200 text-green-800"
            : !isConfigured ? "bg-orange-50 border-orange-200 text-orange-800"
            : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {isConnected
              ? <Wifi className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
              : <WifiOff className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />}
            <div className="space-y-0.5">
              <p className="font-medium">{waStatus.message}</p>
              {isConnected && <p className="text-green-700 opacity-80">Semua fitur notifikasi WA siap digunakan.</p>}
            </div>
          </div>
        )}

        <Separator />

        {/* ─── Perangkat / Nomor Pengirim ─────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5" />
            Perangkat Pengirim WA
          </p>
          <p className="text-xs text-muted-foreground">
            Pilih nomor HP (device Fonnte) yang digunakan untuk mengirim pesan ke penyewa tenant. Klik baris perangkat untuk memilih.
          </p>

          {/* Daftar device dari Fonnte */}
          {devicesLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat daftar perangkat...
            </div>
          ) : !isConfigured ? (
            <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
              Konfigurasi FONNTE_TOKEN terlebih dahulu untuk melihat daftar perangkat.
            </p>
          ) : devices.length === 0 ? (
            <p className="text-xs text-muted-foreground bg-muted/40 border rounded-md px-3 py-2">
              {devicesData?.error ?? "Belum ada perangkat terhubung di akun Fonnte Anda."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {devices.map((d) => {
                const isSelected = senderPhone === d.phone;
                return (
                  <button
                    key={d.phone}
                    type="button"
                    onClick={() => selectDevice(d)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                      isSelected
                        ? "border-green-400 bg-green-50 text-green-900"
                        : "border-border bg-background hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${d.connected ? "bg-green-500" : "bg-gray-300"}`} />
                        <div>
                          <p className="font-semibold">{d.name}</p>
                          <p className="font-mono text-muted-foreground mt-0.5">{d.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className={`text-[10px] h-5 ${d.connected ? "border-green-300 text-green-700 bg-green-50" : "text-muted-foreground"}`}>
                          {d.connected ? "Terhubung" : "Terputus"}
                        </Badge>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Field manual override */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nomor Pengirim (manual / override)</Label>
            <div className="flex gap-2">
              <Input
                value={senderPhone}
                onChange={e => { setSenderPhone(e.target.value); setSenderDirty(true); }}
                placeholder="628xxxxxxxxxx (kosongkan = default Fonnte)"
                className="h-8 text-sm font-mono flex-1"
              />
              <Input
                value={senderLabel}
                onChange={e => { setSenderLabel(e.target.value); setSenderDirty(true); }}
                placeholder="Label (opsional)"
                className="h-8 text-sm w-36"
              />
              <Button
                size="sm"
                className="h-8 gap-1.5 whitespace-nowrap"
                disabled={!senderDirty}
                onClick={() => { onSaveSender(senderPhone, senderLabel); setSenderDirty(false); }}
              >
                <Save className="h-3.5 w-3.5" />
                Simpan
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Nomor yang dipilih akan digunakan sebagai pengirim semua pesan WA ke tenant. Kosongkan untuk menggunakan device default akun Fonnte.
            </p>
          </div>
        </div>

        <Separator />

        {/* ─── Panduan Setup ────────────────────────────────────────────────────── */}
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
              <span>Pilih <strong>Device</strong> → klik <strong>"Connect"</strong> / <strong>"Scan QR"</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">3</span>
              <span>Di HP, buka <strong>WhatsApp → Setelan → Perangkat Tertaut → Tautkan Perangkat</strong> → scan QR.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">4</span>
              <span>Salin <strong>Token API</strong> dari dashboard Fonnte → simpan sebagai secret <code className="bg-muted px-1 rounded font-mono">FONNTE_TOKEN</code> di Replit.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">5</span>
              <span>Kembali ke halaman ini → klik <strong>Refresh</strong> → pilih perangkat yang ingin digunakan sebagai pengirim.</span>
            </li>
          </ol>
        </div>

        <Separator />

        {/* ─── Tes Kirim ────────────────────────────────────────────────────────── */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Tes Kirim Pesan WA
          </p>
          <p className="text-xs text-muted-foreground">
            Kirim pesan tes ke nomor HP untuk verifikasi koneksi dan nomor pengirim.
          </p>
          <div className="flex gap-2">
            <Input
              value={testPhone}
              onChange={e => { setTestPhone(e.target.value); setLastTestResult(null); }}
              placeholder="08123456789 atau 6281234567890"
              className="h-8 text-sm flex-1"
              onKeyDown={e => e.key === "Enter" && void handleTestSend()}
            />
            <Button
              size="sm" className="h-8 gap-1.5 whitespace-nowrap"
              onClick={handleTestSend}
              disabled={testSending || !testPhone.trim()}
            >
              {testSending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Mengirim...</>
                : <><Send className="h-3.5 w-3.5" />Kirim Tes</>}
            </Button>
          </div>
          {lastTestResult && (
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
              lastTestResult.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
            }`}>
              {lastTestResult.ok
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                : <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />}
              <div>
                <p className="font-medium">{lastTestResult.ok ? "Berhasil!" : "Gagal"}</p>
                <p className="opacity-80">{lastTestResult.ok ? lastTestResult.message : lastTestResult.error}</p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Info token */}
        <div className="rounded-lg bg-muted/60 px-3 py-2.5 space-y-1">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
            Konfigurasi Replit Secret
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Token Fonnte disimpan sebagai secret <code className="bg-background border px-1 rounded font-mono text-[10px]">FONNTE_TOKEN</code>.
            Untuk mengubahnya, buka tab <strong>Secrets</strong> di sidebar Replit dan perbarui nilainya. Restart server setelah mengubah secret.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Invoice Preview ─────────────────────────────────────────────────────────

function InvoicePreview({
  mallName, tagline, logoUrl, invoiceColor, invoiceFooterNote, invoiceSignerName,
}: {
  mallName: string; tagline: string; logoUrl: string;
  invoiceColor: string; invoiceFooterNote: string; invoiceSignerName: string;
}) {
  const accent = invoiceColor || "#1e3a5f";
  const accentLight = accent + "14";
  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", color: "#1a1a1a", background: "#fff", padding: "20px", maxWidth: "100%", fontSize: "10px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
        <div>
          {logoUrl ? (
            <>
              <img src={logoUrl} alt="Logo" style={{ height: "32px", maxWidth: "120px", objectFit: "contain", display: "block", marginBottom: "3px" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <div style={{ fontWeight: 700, color: accent, fontSize: "10px" }}>{mallName || "Nama Mall"}</div>
              <div style={{ fontSize: "9px", color: "#666" }}>{tagline || "Tagline Mall"}</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, color: accent, fontSize: "14px" }}>{mallName || "Nama Mall"}</div>
              <div style={{ fontSize: "9px", color: "#666", marginTop: "1px" }}>{tagline || "Tagline Mall"}</div>
            </>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, color: accent, fontSize: "11px" }}>INV-TENANT/202506/00001</div>
          <div style={{ fontSize: "9px", color: "#666", marginTop: "2px" }}>Tanggal: 13 Juni 2026</div>
          <div style={{ display: "inline-block", marginTop: "4px", padding: "2px 8px", borderRadius: "20px", fontSize: "9px", fontWeight: 600, background: "#fef3c7", color: "#b45309", border: "1px solid #fcd34d" }}>Belum Lunas</div>
        </div>
      </div>
      <div style={{ borderTop: `3px solid ${accent}`, marginBottom: "10px" }} />
      {/* Info rows */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px", fontSize: "9px" }}>
        <div>
          <div style={{ color: "#888", textTransform: "uppercase", fontSize: "8px", letterSpacing: "0.05em", marginBottom: "2px", fontWeight: 600 }}>Tagihan Kepada</div>
          <div style={{ fontWeight: 600 }}>PT Contoh Tenant</div>
          <div style={{ color: "#666" }}>Budi Santoso</div>
          <div style={{ color: "#666" }}>budi@example.com</div>
        </div>
        <div>
          <div style={{ color: "#888", textTransform: "uppercase", fontSize: "8px", letterSpacing: "0.05em", marginBottom: "2px", fontWeight: 600 }}>Detail Invoice</div>
          <div style={{ display: "flex", gap: "6px" }}><span style={{ color: "#666" }}>Unit/Booth</span><span style={{ fontWeight: 500 }}>A-01</span></div>
          <div style={{ display: "flex", gap: "6px" }}><span style={{ color: "#666" }}>Periode</span><span style={{ fontWeight: 500 }}>Jun 2026</span></div>
          <div style={{ display: "flex", gap: "6px" }}><span style={{ color: "#666" }}>Jatuh Tempo</span><span style={{ fontWeight: 500 }}>30 Jun 2026</span></div>
        </div>
      </div>
      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px", fontSize: "9px" }}>
        <thead>
          <tr style={{ background: accent }}>
            <th style={{ textAlign: "left", padding: "5px 8px", color: "#fff", textTransform: "uppercase", fontSize: "8px" }}>Uraian</th>
            <th style={{ textAlign: "right", padding: "5px 8px", color: "#fff", textTransform: "uppercase", fontSize: "8px" }}>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={{ padding: "4px 8px", borderBottom: "1px solid #f1f5f9" }}>Sewa Ruang / Booth</td><td style={{ padding: "4px 8px", textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>Rp 5.000.000</td></tr>
          <tr style={{ background: accentLight }}><td style={{ padding: "4px 8px", borderBottom: "1px solid #f1f5f9" }}>Service Charge</td><td style={{ padding: "4px 8px", textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>Rp 500.000</td></tr>
          <tr><td style={{ padding: "4px 8px" }}>Biaya Listrik</td><td style={{ padding: "4px 8px", textAlign: "right" }}>Rp 250.000</td></tr>
        </tbody>
      </table>
      {/* Totals */}
      <div style={{ marginLeft: "auto", width: "180px", fontSize: "9px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>Subtotal</span><span>Rp 5.750.000</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "11px", fontWeight: 700, borderTop: `2px solid ${accent}`, marginTop: "2px", color: accent }}><span>Total</span><span>Rp 5.750.000</span></div>
      </div>
      {/* Signer */}
      {invoiceSignerName && (
        <div style={{ marginTop: "16px", textAlign: "right", fontSize: "9px", color: "#444" }}>
          <div>Hormat kami,</div>
          <div style={{ marginTop: "20px", borderTop: "1px solid #ccc", paddingTop: "2px", display: "inline-block", minWidth: "100px", fontWeight: 600 }}>{invoiceSignerName}</div>
        </div>
      )}
      {/* Footer */}
      <div style={{ marginTop: "12px", fontSize: "8px", color: "#aaa", textAlign: "center", borderTop: "1px solid #e5e7eb", paddingTop: "8px" }}>
        {invoiceFooterNote && <div style={{ marginBottom: "2px", fontWeight: 500, color: "#777" }}>{invoiceFooterNote}</div>}
        <div>Dokumen ini dibuat secara otomatis oleh sistem {mallName || "Mall Admin"}.</div>
      </div>
    </div>
  );
}

// ─── Logo Uploader ────────────────────────────────────────────────────────────

function LogoUploader({ logoUrl, onUpload }: { logoUrl: string; onUpload: (url: string) => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/uploads/mall-logo", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Upload gagal");
      }
      const { url } = await res.json() as { url: string };
      onUpload(url);
      toast({ title: "Logo berhasil diunggah", description: "URL logo telah disimpan." });
    } catch (e) {
      toast({ title: "Gagal upload", description: e instanceof Error ? e.message : "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <div className="relative flex-shrink-0 h-14 w-36 border rounded-md bg-muted/30 flex items-center justify-center overflow-hidden">
            <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
        ) : (
          <div className="flex-shrink-0 h-14 w-36 border-2 border-dashed rounded-md bg-muted/20 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-5 w-5 opacity-40" />
            <span className="text-[10px]">Belum ada logo</span>
          </div>
        )}
        <div className="space-y-1.5 flex-1">
          <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 w-full" disabled={uploading}
            onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Mengunggah..." : "Pilih Gambar Logo"}
          </Button>
          {logoUrl && (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 w-full text-destructive hover:text-destructive text-xs"
              onClick={() => onUpload("")}>
              <X className="h-3 w-3" />Hapus Logo
            </Button>
          )}
          <p className="text-[10px] text-muted-foreground">JPG, PNG, WebP — maks. 5 MB</p>
        </div>
      </div>
      {logoUrl && (
        <div className="text-[10px] text-muted-foreground truncate font-mono bg-muted/40 px-2 py-1 rounded">
          {logoUrl}
        </div>
      )}
    </div>
  );
}

// ─── Site Settings Panel (Nama Perusahaan + Logo per Site) ───────────────────

interface SiteEntry { siteId: number; siteName: string; companyName: string; logoUrl: string; invoiceColor: string }

function SiteLogoUploader({ siteId, logoUrl, onUploaded }: {
  siteId: number;
  logoUrl: string;
  onUploaded: (url: string) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await apiFetch("/api/uploads/mall-logo", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Upload gagal");
      }
      const { url } = await uploadRes.json() as { url: string };

      // Simpan ke site
      setSaving(true);
      const saveRes = await apiFetch(`/api/settings/sites/${siteId}/logo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: url }),
      });
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Gagal menyimpan logo");
      }
      onUploaded(url);
      toast({ title: "Logo disimpan", description: "Logo perusahaan berhasil diperbarui." });
    } catch (e) {
      toast({ title: "Gagal", description: e instanceof Error ? e.message : "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setUploading(false);
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/settings/sites/${siteId}/logo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: "" }),
      });
      if (!res.ok) throw new Error("Gagal menghapus logo");
      onUploaded("");
      toast({ title: "Logo dihapus" });
    } catch (e) {
      toast({ title: "Gagal", description: e instanceof Error ? e.message : "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const isLoading = uploading || saving;

  return (
    <div className="flex items-center gap-2 mt-2">
      {/* Preview */}
      {logoUrl ? (
        <div className="relative flex-shrink-0 h-12 w-28 border rounded-md bg-muted/30 flex items-center justify-center overflow-hidden">
          <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain p-1"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      ) : (
        <div className="flex-shrink-0 h-12 w-28 border-2 border-dashed rounded-md bg-muted/20 flex flex-col items-center justify-center gap-0.5 text-muted-foreground">
          <ImageIcon className="h-4 w-4 opacity-40" />
          <span className="text-[9px]">Belum ada logo</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-1">
        <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs px-2" disabled={isLoading}
          onClick={() => fileRef.current?.click()}>
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {uploading ? "Mengunggah..." : saving ? "Menyimpan..." : "Upload Logo"}
        </Button>
        {logoUrl && (
          <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-xs px-2 text-destructive hover:text-destructive"
            disabled={isLoading} onClick={() => void handleRemove()}>
            <X className="h-3 w-3" />Hapus
          </Button>
        )}
      </div>
    </div>
  );
}

function SiteCompanyPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: sites, isLoading } = useQuery<SiteEntry[]>({
    queryKey: ["settings-sites"],
    queryFn: async () => {
      const res = await apiFetch("/api/settings/sites");
      if (!res.ok) throw new Error("Gagal memuat data site");
      return res.json();
    },
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  // Logo per site — track URLs locally after upload
  const [siteLogos, setSiteLogos] = useState<Record<number, string>>({});
  // Color per site — track locally
  const [siteColors, setSiteColors] = useState<Record<number, string>>({});
  const [savingColorId, setSavingColorId] = useState<number | null>(null);

  // Sync from server data on load
  useEffect(() => {
    if (sites) {
      const logoMap: Record<number, string> = {};
      const colorMap: Record<number, string> = {};
      sites.forEach(s => {
        logoMap[s.siteId] = s.logoUrl ?? "";
        colorMap[s.siteId] = s.invoiceColor ?? "";
      });
      setSiteLogos(prev => ({ ...logoMap, ...prev }));
      setSiteColors(prev => {
        const merged: Record<number, string> = { ...colorMap };
        Object.keys(prev).forEach(k => { if (prev[Number(k)]) merged[Number(k)] = prev[Number(k)]; });
        return merged;
      });
    }
  }, [sites]);

  const saveColor = useCallback(async (siteId: number, color: string) => {
    setSavingColorId(siteId);
    try {
      const res = await apiFetch(`/api/settings/sites/${siteId}/color`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceColor: color }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Gagal menyimpan warna");
      }
      toast({ title: "Warna disimpan", description: "Warna tema invoice berhasil diperbarui." });
      await qc.invalidateQueries({ queryKey: ["settings-sites"] });
      await qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      toast({ title: "Gagal", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingColorId(null);
    }
  }, [toast, qc]);

  const startEdit = useCallback((site: SiteEntry) => {
    setEditingId(site.siteId);
    setDraftName(site.companyName);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraftName("");
  }, []);

  const saveEdit = useCallback(async (siteId: number) => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      toast({ title: "Validasi", description: "Nama perusahaan wajib diisi", variant: "destructive" });
      return;
    }
    if (trimmed.length > 255) {
      toast({ title: "Validasi", description: "Nama perusahaan maksimal 255 karakter", variant: "destructive" });
      return;
    }
    setSavingId(siteId);
    try {
      const res = await apiFetch(`/api/settings/sites/${siteId}/company`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Gagal menyimpan");
      }
      toast({ title: "Berhasil", description: "Nama perusahaan berhasil diperbarui." });
      await qc.invalidateQueries({ queryKey: ["settings-sites"] });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["sites"] });
      setEditingId(null);
      setDraftName("");
    } catch (err) {
      toast({ title: "Gagal", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }, [draftName, toast, qc]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-primary" />
          Identitas Perusahaan per Site
        </CardTitle>
        <CardDescription className="text-xs">
          Nama PT dan logo yang muncul di invoice PDF, struk POS, dan notifikasi WA — berbeda untuk setiap site
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-16 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Memuat...
          </div>
        ) : !sites?.length ? (
          <p className="text-sm text-muted-foreground">Tidak ada data site.</p>
        ) : (
          <div className="space-y-4">
            {sites.map((site) => {
              const isEditing = editingId === site.siteId;
              const isSaving = savingId === site.siteId;
              const currentLogo = siteLogos[site.siteId] ?? site.logoUrl ?? "";
              const currentColor = siteColors[site.siteId] ?? site.invoiceColor ?? "";
              const isSavingColor = savingColorId === site.siteId;
              return (
                <div key={site.siteId} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                  {/* Site name badge */}
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{site.siteName}</p>

                  {/* Company name row */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Nama Perusahaan</p>
                      {isEditing ? (
                        <Input
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveEdit(site.siteId);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          placeholder="Nama PT / perusahaan pengelola"
                          className="h-8 text-sm"
                          maxLength={255}
                          autoFocus
                          disabled={isSaving}
                        />
                      ) : (
                        <p className="text-sm font-semibold truncate">
                          {site.companyName || <span className="text-muted-foreground italic font-normal">Belum diatur</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <Button size="sm" variant="default" className="h-7 px-2 gap-1 text-xs"
                            onClick={() => void saveEdit(site.siteId)} disabled={isSaving}>
                            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            Simpan
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={cancelEdit} disabled={isSaving}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs"
                          onClick={() => startEdit(site)}>
                          <Pencil className="h-3 w-3" />Edit
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Logo row */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Logo Perusahaan</p>
                    <SiteLogoUploader
                      siteId={site.siteId}
                      logoUrl={currentLogo}
                      onUploaded={(url) => {
                        setSiteLogos(prev => ({ ...prev, [site.siteId]: url }));
                        void qc.invalidateQueries({ queryKey: ["settings-sites"] });
                        void qc.invalidateQueries({ queryKey: ["settings"] });
                      }}
                    />
                  </div>

                  {/* Warna Tema Invoice */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Warna Tema Invoice</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Preset colors */}
                      {[
                        { hex: "#1e3a5f", label: "Biru Tua" },
                        { hex: "#2563eb", label: "Biru" },
                        { hex: "#0f766e", label: "Hijau Teal" },
                        { hex: "#b45309", label: "Kuning Emas" },
                        { hex: "#d97706", label: "Amber" },
                        { hex: "#f59e0b", label: "Kuning" },
                        { hex: "#7c3aed", label: "Ungu" },
                        { hex: "#be123c", label: "Merah" },
                      ].map(c => (
                        <button
                          key={c.hex}
                          title={c.label}
                          onClick={() => setSiteColors(prev => ({ ...prev, [site.siteId]: c.hex }))}
                          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${currentColor === c.hex ? "border-foreground scale-110 ring-1 ring-offset-1 ring-foreground" : "border-white/60 shadow-sm"}`}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                      {/* Custom color picker */}
                      <div className="relative" title="Pilih warna kustom">
                        <input
                          type="color"
                          value={currentColor || "#1e3a5f"}
                          onChange={e => setSiteColors(prev => ({ ...prev, [site.siteId]: e.target.value }))}
                          className="h-6 w-6 rounded-full cursor-pointer opacity-0 absolute inset-0"
                        />
                        <div
                          className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center text-[9px] text-muted-foreground"
                          style={{ backgroundColor: currentColor && !["#1e3a5f","#2563eb","#0f766e","#b45309","#d97706","#f59e0b","#7c3aed","#be123c"].includes(currentColor) ? currentColor : "transparent" }}
                        >
                          {!["#1e3a5f","#2563eb","#0f766e","#b45309","#d97706","#f59e0b","#7c3aed","#be123c"].includes(currentColor) ? "" : "+"}
                        </div>
                      </div>
                      {/* Preview + Save */}
                      {currentColor && (
                        <div className="flex items-center gap-1.5 ml-1">
                          <div className="h-5 px-2 rounded text-[10px] font-medium text-white flex items-center" style={{ backgroundColor: currentColor }}>
                            Preview
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            disabled={isSavingColor || currentColor === (site.invoiceColor ?? "")}
                            onClick={() => void saveColor(site.siteId, currentColor)}
                          >
                            {isSavingColor ? <Loader2 className="h-3 w-3 animate-spin" /> : "Simpan Warna"}
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Warna ini dipakai di header invoice PDF dan struk untuk site ini.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Settings Page ────────────────────────────────────────────────────────

// ─── Zona Bahaya — Reset Semua Transaksi (hanya Pemilik) ─────────────────────

function ResetTransactionsPanel() {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const REQUIRED = "HAPUS SEMUA";

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/reset-transactions", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Gagal reset");
      toast({
        title: "Transaksi berhasil dihapus",
        description: "Semua data pembayaran, invoice, dan transaksi telah dihapus dari sistem.",
      });
      setOpen(false);
      setConfirmText("");
    } catch (err: unknown) {
      toast({
        title: "Gagal",
        description: err instanceof Error ? err.message : "Terjadi kesalahan.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-red-700 text-base">
          <ShieldAlert className="h-5 w-5" />
          Zona Bahaya
        </CardTitle>
        <CardDescription className="text-red-600/80">
          Tindakan di bawah ini bersifat permanen dan tidak dapat dibatalkan. Gunakan hanya saat diperlukan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-red-200 bg-white">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Hapus Semua Data Transaksi</p>
            <p className="text-xs text-muted-foreground">
              Menghapus seluruh pembayaran, invoice, POS, mutasi bank, jurnal akuntansi, dan shift kasir.
              Data tenant &amp; booking tidak terpengaruh.
            </p>
          </div>
          <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmText(""); }}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="shrink-0 gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                Reset Transaksi
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-red-700">
                  <ShieldAlert className="h-5 w-5" />
                  Konfirmasi Hapus Semua Transaksi
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      Tindakan ini akan <strong className="text-foreground">menghapus permanen</strong> seluruh data berikut:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs bg-red-50 border border-red-200 rounded p-3 text-red-800">
                      <li>Semua pembayaran tenant</li>
                      <li>Semua invoice &amp; tagihan</li>
                      <li>Kwitansi &amp; bukti bayar</li>
                      <li>Mutasi bank &amp; rekonsiliasi</li>
                      <li>Jurnal akuntansi</li>
                      <li>Shift kasir &amp; pengeluaran operasional</li>
                    </ul>
                    <p>
                      Data tenant, booking, dan unit <strong className="text-foreground">tidak akan dihapus</strong>.
                    </p>
                    <div className="space-y-1.5 pt-1">
                      <p className="font-medium text-foreground">
                        Ketik <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-red-700">{REQUIRED}</span> untuk konfirmasi:
                      </p>
                      <input
                        className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
                        placeholder={REQUIRED}
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmText("")}>Batal</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                  disabled={confirmText !== REQUIRED || loading}
                  onClick={(e) => { e.preventDefault(); void handleReset(); }}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Menghapus...</>
                  ) : (
                    <><Trash2 className="h-4 w-4 mr-1.5" />Ya, Hapus Semua</>
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

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

  const { register, handleSubmit, reset, watch, setValue, formState: { isDirty } } = useForm<MallConfig>({
    defaultValues: config,
  });

  const watchedMallName = watch("mallName") ?? "";
  const watchedTagline = watch("tagline") ?? "";
  const watchedLogoUrl = watch("logoUrl") ?? "";
  const watchedColor = watch("invoiceColor") ?? "#1e3a5f";
  const watchedFooterNote = watch("invoiceFooterNote") ?? "";
  const watchedSignerName = watch("invoiceSignerName") ?? "";
  const [showPreview, setShowPreview] = useState(false);

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

  const onSubmit = (data: MallConfig) => {
    if (data.paymentDomain) {
      try {
        data.paymentDomain = new URL(data.paymentDomain.trim()).origin;
      } catch {
        data.paymentDomain = data.paymentDomain.trim().replace(/\/$/, "").replace(/\/.*$/, "");
      }
    }
    mutation.mutate(data);
  };

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
                  <Label className="text-xs">Logo Mall</Label>
                  <LogoUploader
                    logoUrl={watchedLogoUrl}
                    onUpload={(url) => { setValue("logoUrl", url, { shouldDirty: true }); }}
                  />
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

        {/* Desain Invoice */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                Desain &amp; Branding Invoice
              </CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => setShowPreview(p => !p)}
              >
                <Eye className="h-3.5 w-3.5" />
                {showPreview ? "Sembunyikan" : "Preview Invoice"}
              </Button>
            </div>
            <CardDescription className="text-xs">
              Warna tema, catatan kaki, dan penandatangan invoice cetak
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <>
                {/* Warna Invoice */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Warna Tema Invoice</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      {...register("invoiceColor")}
                      className="h-9 w-14 cursor-pointer rounded-md border border-input p-0.5"
                    />
                    <div className="flex-1 space-y-0.5">
                      <Input
                        value={watchedColor}
                        onChange={e => setValue("invoiceColor", e.target.value, { shouldDirty: true })}
                        placeholder="#1e3a5f"
                        className="h-8 text-sm font-mono"
                        maxLength={7}
                      />
                    </div>
                    <div
                      className="h-9 w-16 rounded-md border flex items-center justify-center text-white text-[10px] font-semibold"
                      style={{ background: watchedColor || "#1e3a5f" }}
                    >
                      Contoh
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Diterapkan pada header, garis aksen, dan total invoice.</p>
                </div>

                <Separator />

                {/* Catatan Kaki */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Catatan Kaki Invoice (opsional)</Label>
                  <Textarea
                    {...register("invoiceFooterNote")}
                    placeholder="Contoh: Pembayaran ke Rek. BCA 1234567890 a/n PT Mall Admin. Terima kasih."
                    className="text-sm min-h-[60px] resize-none"
                    rows={2}
                  />
                  <p className="text-[10px] text-muted-foreground">Muncul di bagian bawah invoice, sebelum teks otomatis sistem.</p>
                </div>

                {/* Nama Penandatangan */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama Penandatangan (opsional)</Label>
                  <Input
                    {...register("invoiceSignerName")}
                    placeholder="Nama Manager / Direktur"
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">Jika diisi, akan tampil blok TTD di pojok kanan bawah invoice.</p>
                </div>

                {/* Preview */}
                {showPreview && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      Preview invoice (tampilan aktual saat cetak)
                    </div>
                    <InvoicePreview
                      mallName={watchedMallName}
                      tagline={watchedTagline}
                      logoUrl={watchedLogoUrl}
                      invoiceColor={watchedColor}
                      invoiceFooterNote={watchedFooterNote}
                      invoiceSignerName={watchedSignerName}
                    />
                  </div>
                )}
              </>
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

        {/* Domain Link Pembayaran */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link className="h-4 w-4 text-primary" />
              Domain Link Pembayaran Tenant
            </CardTitle>
            <CardDescription className="text-xs">
              Domain yang digunakan pada link bayar yang dikirim via WhatsApp ke tenant.
              Jika diisi, akan menimpa konfigurasi server secara otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="h-12 flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">URL Domain</Label>
                <Input
                  {...register("paymentDomain")}
                  placeholder="https://tenant.travelintrips.co.id"
                  className="h-8 text-sm font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Format: <span className="font-mono">https://domain.anda.com</span> — tanpa garis miring di akhir.
                  Link bayar yang dikirim akan menjadi:{" "}
                  <span className="font-mono bg-muted px-1 rounded">
                    {(config?.paymentDomain || "https://tenant.travelintrips.co.id").replace(/\/$/, "")}/bayar/&#123;token&#125;
                  </span>
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

      {/* Panel Nama Perusahaan per Site */}
      <SiteCompanyPanel />

      {/* Panel WhatsApp — di luar form karena punya state/action sendiri */}
      <WhatsAppPanel
        config={config}
        onSaveSender={async (waSenderPhone, waSenderLabel) => {
          try {
            const res = await apiFetch("/api/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ waSenderPhone, waSenderLabel }),
            });
            if (!res.ok) throw new Error("Gagal menyimpan");
            toast({ title: "Pengirim WA disimpan", description: waSenderPhone ? `Nomor pengirim diatur ke ${waSenderPhone}` : "Menggunakan device default Fonnte." });
            void qc.invalidateQueries({ queryKey: ["settings"] });
          } catch {
            toast({ title: "Gagal", description: "Tidak dapat menyimpan pengaturan pengirim WA.", variant: "destructive" });
          }
        }}
      />

      {/* Zona Bahaya — hanya Pemilik yang bisa akses halaman ini */}
      <ResetTransactionsPanel />
    </div>
  );
}
