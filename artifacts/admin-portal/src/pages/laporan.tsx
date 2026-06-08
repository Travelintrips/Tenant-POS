import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import {
  TrendingUp, TrendingDown, Building2, AlertCircle, CheckCircle2,
  Download, ChevronDown, Receipt, CreditCard, Banknote, Smartphone, BadgeCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

function formatRupiah(v: number) {
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1)}M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)}jt`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}
function formatRupiahFull(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(v);
}
function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function formatJam(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

const BULAN_OPTIONS = [
  { value: "", label: "Semua Bulan" },
  { value: "1", label: "Januari" }, { value: "2", label: "Februari" },
  { value: "3", label: "Maret" }, { value: "4", label: "April" },
  { value: "5", label: "Mei" }, { value: "6", label: "Juni" },
  { value: "7", label: "Juli" }, { value: "8", label: "Agustus" },
  { value: "9", label: "September" }, { value: "10", label: "Oktober" },
  { value: "11", label: "November" }, { value: "12", label: "Desember" },
];

const METODE_ICON: Record<string, React.ReactNode> = {
  tunai: <Banknote className="w-3.5 h-3.5" />,
  transfer: <CreditCard className="w-3.5 h-3.5" />,
  qris: <Smartphone className="w-3.5 h-3.5" />,
  edc: <CreditCard className="w-3.5 h-3.5" />,
  other: <CreditCard className="w-3.5 h-3.5" />,
};
const METODE_LABEL: Record<string, string> = {
  tunai: "Tunai", transfer: "Transfer", qris: "QRIS", edc: "EDC", other: "Lainnya",
};
const STATUS_COLOR: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-amber-100 text-amber-700 border-amber-200",
  UNPAID: "bg-slate-100 text-slate-500 border-slate-200",
  OVERDUE: "bg-red-100 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<string, string> = {
  PAID: "Lunas", PARTIAL: "Sebagian", UNPAID: "Belum", OVERDUE: "Jatuh Tempo",
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-medium">{formatRupiah(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

type SummaryData = {
  tahun: number;
  monthly: { bulan: string; bulanNum: number; totalAmount: number; jumlahTransaksi: number }[];
  totalPendapatan: number;
  totalTransaksi: number;
  tunggakan: { totalTunggakan: number; jumlahUnit: number };
};

type PaymentRecord = {
  id: number;
  receiptNumber: string;
  paymentDate: string;
  tenantId: number;
  bookingId: number;
  businessName: string;
  ownerName: string;
  boothNumber: string;
  areaName: string;
  category: string;
  periodLabel: string;
  paymentMethod: string;
  amountPaid: number;
  discountAmount: number;
  penaltyAmount: number;
  paymentStatus: string;
  notes: string;
  source: "TENANT_POS_PAYMENT";
  debitAccount: string;
  creditAccount: string;
};

type RekapData = {
  data: PaymentRecord[];
  pagination: { total: number; limit: number; offset: number };
  tahun: number;
  bulan: number | null;
};

export default function Laporan() {
  const [tahun, setTahun] = useState<string>(String(new Date().getFullYear()));
  const [bulan, setBulan] = useState<string>("");
  const [showJurnal, setShowJurnal] = useState(false);

  const summaryQuery = useQuery<SummaryData>({
    queryKey: ["laporan-summary", tahun],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/laporan/summary?tahun=${tahun}`);
      if (!res.ok) throw new Error("Gagal memuat ringkasan");
      return res.json();
    },
  });

  const prevYear = String(parseInt(tahun) - 1);
  const prevSummaryQuery = useQuery<SummaryData>({
    queryKey: ["laporan-summary", prevYear],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/laporan/summary?tahun=${prevYear}`);
      if (!res.ok) throw new Error("Gagal memuat ringkasan tahun lalu");
      return res.json();
    },
  });

  const rekapQuery = useQuery<RekapData>({
    queryKey: ["laporan-rekap", tahun, bulan],
    queryFn: async () => {
      const params = new URLSearchParams({ tahun, limit: "100" });
      if (bulan) params.set("bulan", bulan);
      const res = await fetch(`${API_BASE}/laporan/rekap-payments?${params}`);
      if (!res.ok) throw new Error("Gagal memuat rekap pembayaran");
      return res.json();
    },
  });

  const summary = summaryQuery.data;
  const prevSummary = prevSummaryQuery.data;
  const rekap = rekapQuery.data;

  const totalPendapatan = summary?.totalPendapatan ?? 0;
  const prevTotal = prevSummary?.totalPendapatan ?? 0;
  const diffTotal = totalPendapatan - prevTotal;

  const chartData = (summary?.monthly ?? []).map((m, i) => ({
    bulan: m.bulan,
    [tahun]: m.totalAmount,
    [prevYear]: prevSummary?.monthly[i]?.totalAmount ?? 0,
  }));

  const cumulativeData = (summary?.monthly ?? []).map((m, i) => ({
    bulan: m.bulan,
    kumulatif: (summary?.monthly ?? []).slice(0, i + 1).reduce((s, x) => s + x.totalAmount, 0),
  }));

  const isLoading = summaryQuery.isLoading || rekapQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laporan Rekap Pembayaran</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Ringkasan pendapatan sewa tenant — data real-time dari sistem POS
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={tahun}
              onChange={(e) => setTahun(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-slate-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              {[2026, 2025, 2024].map((y) => (
                <option key={y} value={String(y)}>Tahun {y}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Pendapatan</p>
            {isLoading ? (
              <div className="h-8 bg-slate-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 tracking-tight">{formatRupiah(totalPendapatan)}</p>
            )}
            <div className={cn("flex items-center gap-1 text-xs mt-1", diffTotal >= 0 ? "text-emerald-600" : "text-red-500")}>
              {diffTotal >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {diffTotal >= 0 ? "+" : ""}{formatRupiah(Math.abs(diffTotal))} vs {prevYear}
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Jumlah Transaksi</p>
            {isLoading ? (
              <div className="h-8 bg-blue-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 text-blue-700 tracking-tight">
                {summary?.totalTransaksi ?? 0} <span className="text-sm font-normal">transaksi</span>
              </p>
            )}
            <p className="text-xs text-blue-400 mt-1">Tahun {tahun}</p>
          </CardContent>
        </Card>

        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-violet-600 font-medium uppercase tracking-wide">Rata-rata/Bulan</p>
            {isLoading ? (
              <div className="h-8 bg-violet-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 text-violet-700 tracking-tight">
                {formatRupiah(
                  summary && summary.monthly.filter(m => m.totalAmount > 0).length > 0
                    ? Math.round(totalPendapatan / summary.monthly.filter(m => m.totalAmount > 0).length)
                    : 0
                )}
              </p>
            )}
            <p className="text-xs text-violet-400 mt-1">Per bulan aktif</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Total Tunggakan</p>
            {isLoading ? (
              <div className="h-8 bg-red-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 text-red-600 tracking-tight">
                {formatRupiah(summary?.tunggakan.totalTunggakan ?? 0)}
              </p>
            )}
            <div className="flex items-center gap-1 text-xs mt-1 text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {summary?.tunggakan.jumlahUnit ?? 0} unit menunggak
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pendapatan Sewa Tenant per Bulan</CardTitle>
          <CardDescription>Perbandingan {tahun} vs {prevYear}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[280px] bg-slate-50 rounded-lg animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="bulan" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => v === 0 ? "0" : `${v / 1_000_000}jt`}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false} tickLine={false} width={42}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
                <Legend
                  formatter={(value) => <span className="text-xs text-slate-600 font-medium">{value}</span>}
                  iconType="circle" iconSize={8}
                />
                <Bar dataKey={tahun} name={`Tahun ${tahun}`} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey={prevYear} name={`Tahun ${prevYear}`} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tren Kumulatif Pendapatan</CardTitle>
          <CardDescription>Akumulasi pendapatan per bulan — {tahun}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[200px] bg-slate-50 rounded-lg animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="bulan" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => v === 0 ? "0" : `${v / 1_000_000}jt`}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false} tickLine={false} width={42}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone" dataKey="kumulatif" name="Kumulatif"
                  stroke="#3b82f6" strokeWidth={2.5}
                  dot={{ r: 3, fill: "#3b82f6" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Rekap Transaksi Pembayaran Tenant</CardTitle>
              <CardDescription>
                Setiap baris = 1 transaksi keuangan · Sumber: TENANT_POS_PAYMENT
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={bulan}
                  onChange={(e) => setBulan(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                >
                  {BULAN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              <button
                onClick={() => setShowJurnal(!showJurnal)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                  showJurnal ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                )}
              >
                {showJurnal ? "Sembunyikan Jurnal" : "Tampilkan Jurnal"}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {rekapQuery.isLoading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : rekapQuery.isError ? (
            <div className="flex items-center gap-2 text-red-500 py-8 justify-center text-sm">
              <AlertCircle className="w-4 h-4" />
              Gagal memuat data transaksi
            </div>
          ) : (rekap?.data.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Receipt className="w-8 h-8" />
              <p className="text-sm">Belum ada transaksi pembayaran untuk periode ini</p>
            </div>
          ) : (
            <div>
              <div className="rounded-lg border overflow-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Tanggal</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">No. Receipt</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Nama Bisnis</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Pemilik</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Booth</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Periode</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Metode</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Nominal</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                      {showJurnal && (
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Jurnal Akuntansi</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rekap?.data.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-slate-800 font-medium">{formatTanggal(row.paymentDate)}</div>
                          <div className="text-slate-400 text-xs">{formatJam(row.paymentDate)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="font-mono text-xs text-slate-600">{row.receiptNumber}</span>
                          </div>
                          <div className="mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-medium">
                              TENANT_POS_PAYMENT
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{row.businessName}</div>
                          <div className="text-xs text-slate-400">{row.category}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.ownerName}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {row.boothNumber}
                          </span>
                          <div className="text-xs text-slate-400 mt-0.5">{row.areaName}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{row.periodLabel}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            {METODE_ICON[row.paymentMethod]}
                            {METODE_LABEL[row.paymentMethod] ?? row.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="font-semibold text-slate-800 tabular-nums">
                            {formatRupiahFull(row.amountPaid)}
                          </div>
                          {(row.discountAmount > 0 || row.penaltyAmount > 0) && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              {row.discountAmount > 0 && (
                                <span className="text-emerald-600">-{formatRupiah(row.discountAmount)} diskon</span>
                              )}
                              {row.penaltyAmount > 0 && (
                                <span className="text-red-500 ml-1">+{formatRupiah(row.penaltyAmount)} denda</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className={cn(
                            "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium",
                            STATUS_COLOR[row.paymentStatus] ?? "bg-slate-100 text-slate-500 border-slate-200"
                          )}>
                            {row.paymentStatus === "PAID" && <CheckCircle2 className="w-3 h-3" />}
                            {row.paymentStatus === "OVERDUE" && <AlertCircle className="w-3 h-3" />}
                            {STATUS_LABEL[row.paymentStatus] ?? row.paymentStatus}
                          </span>
                        </td>
                        {showJurnal && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-xs space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="w-12 text-slate-400">Dr.</span>
                                <span className="text-slate-700 font-medium">{row.debitAccount}</span>
                                <span className="text-slate-500 tabular-nums">{formatRupiah(row.amountPaid)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-12 text-slate-400">Cr.</span>
                                <span className="text-slate-700 font-medium">{row.creditAccount}</span>
                                <span className="text-slate-500 tabular-nums">{formatRupiah(row.amountPaid)}</span>
                              </div>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t">
                      <td colSpan={showJurnal ? 7 : 6} className="px-4 py-2.5 text-xs font-semibold text-slate-600">
                        Total ({rekap?.pagination.total ?? 0} transaksi)
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-sm tabular-nums text-slate-800">
                        {formatRupiahFull(
                          rekap?.data.reduce((s, r) => s + r.amountPaid, 0) ?? 0
                        )}
                      </td>
                      <td colSpan={showJurnal ? 2 : 1} className="px-4 py-2.5 text-center text-xs text-slate-400">
                        {rekap?.data.filter(r => r.paymentStatus === "PAID").length} lunas
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-2 text-right">
                Menampilkan {rekap?.data.length ?? 0} dari {rekap?.pagination.total ?? 0} transaksi
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
