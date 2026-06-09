import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import {
  TrendingUp, TrendingDown, Building2, AlertCircle, CheckCircle2,
  Users, DollarSign, PercentIcon, RefreshCw, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useSite } from "@/contexts/site-context";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE + "/api";

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmt(v: number) {
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1)}M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `Rp ${(v / 1_000).toFixed(0)}rb`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}
function fmtFull(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
}

// ─── Types ────────────────────────────────────────────────────────────────────
type KpiData = {
  revenueThisMonth: number;
  paidThisMonth: number;
  totalOutstanding: number;
  totalOverdue: number;
  jumlahInvoiceOverdue: number;
  jumlahTenantOverdue: number;
  collectionRate: number;
};

type SummaryData = {
  tahun: number;
  monthly: { bulan: string; bulanNum: number; totalAmount: number; jumlahTransaksi: number }[];
  totalPendapatan: number;
  totalTransaksi: number;
  totalTunggakan: number;
  jumlahTunggakan: number;
};

type Site = { id: number; code: string; name: string; type: string };

// ─── Helper ───────────────────────────────────────────────────────────────────
async function fetchWithSite<T>(url: string, siteId: number): Promise<T> {
  const res = await apiFetch(url, { headers: { "x-site-id": String(siteId) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, siteA, siteB, format = fmt, higherIsBetter = true,
}: {
  label: string;
  siteA: number;
  siteB: number;
  format?: (v: number) => string;
  higherIsBetter?: boolean;
}) {
  const diff = siteA - siteB;
  const pct = siteB > 0 ? Math.abs(Math.round((diff / siteB) * 100)) : 0;
  const aWins = higherIsBetter ? siteA >= siteB : siteA <= siteB;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className={cn("rounded-lg border p-3", aWins && "bg-emerald-50 border-emerald-200")}>
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="text-lg font-bold">{format(siteA)}</div>
        {aWins && diff !== 0 && (
          <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
            <ArrowUpRight className="w-3 h-3" />
            <span>+{pct}% lebih {higherIsBetter ? "tinggi" : "rendah"}</span>
          </div>
        )}
      </div>
      <div className={cn("rounded-lg border p-3", !aWins && "bg-emerald-50 border-emerald-200")}>
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="text-lg font-bold">{format(siteB)}</div>
        {!aWins && diff !== 0 && (
          <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
            <ArrowUpRight className="w-3 h-3" />
            <span>+{pct}% lebih {higherIsBetter ? "tinggi" : "rendah"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton Loading ─────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CompareSites() {
  const { sites } = useSite();
  const tahun = new Date().getFullYear();

  const [siteAId, setSiteAId] = useState<number | null>(null);
  const [siteBId, setSiteBId] = useState<number | null>(null);

  // Default: auto-select first two sites
  const siteA = siteAId !== null ? sites.find((s) => s.id === siteAId) : sites[0];
  const siteB = siteBId !== null ? sites.find((s) => s.id === siteBId) : sites[1];

  const kpiA = useQuery<KpiData>({
    queryKey: ["compare-kpi", siteA?.id],
    queryFn: () => fetchWithSite(`${API}/laporan/kpi`, siteA!.id),
    enabled: !!siteA,
  });

  const kpiB = useQuery<KpiData>({
    queryKey: ["compare-kpi", siteB?.id],
    queryFn: () => fetchWithSite(`${API}/laporan/kpi`, siteB!.id),
    enabled: !!siteB,
  });

  const summaryA = useQuery<SummaryData>({
    queryKey: ["compare-summary", siteA?.id, tahun],
    queryFn: () => fetchWithSite(`${API}/laporan/summary?tahun=${tahun}`, siteA!.id),
    enabled: !!siteA,
  });

  const summaryB = useQuery<SummaryData>({
    queryKey: ["compare-summary", siteB?.id, tahun],
    queryFn: () => fetchWithSite(`${API}/laporan/summary?tahun=${tahun}`, siteB!.id),
    enabled: !!siteB,
  });

  const isLoading = kpiA.isLoading || kpiB.isLoading || summaryA.isLoading || summaryB.isLoading;

  if (sites.length < 2) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">Perlu Minimal 2 Lokasi</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Perbandingan memerlukan minimal 2 site yang aktif.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Gabungkan data bulanan untuk chart
  const BULAN_PENDEK = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const monthlyChart = BULAN_PENDEK.map((bulan, idx) => {
    const mA = summaryA.data?.monthly?.[idx];
    const mB = summaryB.data?.monthly?.[idx];
    return {
      bulan,
      [siteA?.name ?? "Site A"]: mA?.totalAmount ?? 0,
      [siteB?.name ?? "Site B"]: mB?.totalAmount ?? 0,
    };
  });

  // Radar chart data
  const maxRev = Math.max(kpiA.data?.revenueThisMonth ?? 1, kpiB.data?.revenueThisMonth ?? 1, 1);
  const maxOut = Math.max(kpiA.data?.totalOutstanding ?? 1, kpiB.data?.totalOutstanding ?? 1, 1);
  const radarData = [
    {
      subject: "Revenue",
      [siteA?.name ?? "A"]: Math.round(((kpiA.data?.revenueThisMonth ?? 0) / maxRev) * 100),
      [siteB?.name ?? "B"]: Math.round(((kpiB.data?.revenueThisMonth ?? 0) / maxRev) * 100),
    },
    {
      subject: "Collection Rate",
      [siteA?.name ?? "A"]: kpiA.data?.collectionRate ?? 0,
      [siteB?.name ?? "B"]: kpiB.data?.collectionRate ?? 0,
    },
    {
      subject: "Piutang (inv)",
      [siteA?.name ?? "A"]: Math.round((1 - (kpiA.data?.totalOutstanding ?? 0) / maxOut) * 100),
      [siteB?.name ?? "B"]: Math.round((1 - (kpiB.data?.totalOutstanding ?? 0) / maxOut) * 100),
    },
    {
      subject: "Tepat Waktu",
      [siteA?.name ?? "A"]: Math.max(0, 100 - (kpiA.data?.jumlahInvoiceOverdue ?? 0) * 10),
      [siteB?.name ?? "B"]: Math.max(0, 100 - (kpiB.data?.jumlahInvoiceOverdue ?? 0) * 10),
    },
  ];

  const SITE_TYPE_LABELS: Record<string, string> = {
    mall_tenant: "Mal", sport_center: "Sport",
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Perbandingan Lokasi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analisis KPI dua lokasi secara berdampingan
          </p>
        </div>
        <button
          onClick={() => { kpiA.refetch(); kpiB.refetch(); summaryA.refetch(); summaryB.refetch(); }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Site selector */}
      <div className="grid grid-cols-2 gap-4">
        {([["A", siteA, setSiteAId] as const, ["B", siteB, setSiteBId] as const]).map(([label, selected, setter]) => (
          <Card key={label} className="border-2 border-primary/20">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lokasi {label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={selected?.id ?? ""}
                onChange={(e) => setter(Number(e.target.value))}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {selected && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {SITE_TYPE_LABELS[selected.type] ?? selected.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{selected.code}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KPI Summary Cards */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Header columns */}
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="font-semibold text-slate-700 text-sm truncate">{siteA?.name}</div>
            <div className="font-semibold text-slate-700 text-sm truncate">{siteB?.name}</div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">KPI Bulan Ini</h3>
            <KpiCard
              label="Revenue Bulan Ini"
              siteA={kpiA.data?.revenueThisMonth ?? 0}
              siteB={kpiB.data?.revenueThisMonth ?? 0}
            />
            <KpiCard
              label="Total Pembayaran Masuk"
              siteA={kpiA.data?.paidThisMonth ?? 0}
              siteB={kpiB.data?.paidThisMonth ?? 0}
            />
            <KpiCard
              label="Collection Rate"
              siteA={kpiA.data?.collectionRate ?? 0}
              siteB={kpiB.data?.collectionRate ?? 0}
              format={(v) => `${v}%`}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Piutang &amp; Tunggakan</h3>
            <KpiCard
              label="Total Piutang Belum Lunas"
              siteA={kpiA.data?.totalOutstanding ?? 0}
              siteB={kpiB.data?.totalOutstanding ?? 0}
              higherIsBetter={false}
            />
            <KpiCard
              label="Total Overdue"
              siteA={kpiA.data?.totalOverdue ?? 0}
              siteB={kpiB.data?.totalOverdue ?? 0}
              higherIsBetter={false}
            />
            <KpiCard
              label="Jumlah Invoice Overdue"
              siteA={kpiA.data?.jumlahInvoiceOverdue ?? 0}
              siteB={kpiB.data?.jumlahInvoiceOverdue ?? 0}
              format={(v) => `${v} invoice`}
              higherIsBetter={false}
            />
            <KpiCard
              label="Jumlah Tenant Overdue"
              siteA={kpiA.data?.jumlahTenantOverdue ?? 0}
              siteB={kpiB.data?.jumlahTenantOverdue ?? 0}
              format={(v) => `${v} tenant`}
              higherIsBetter={false}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Ringkasan Tahunan {tahun}</h3>
            <KpiCard
              label="Total Pendapatan Tahun Ini"
              siteA={summaryA.data?.totalPendapatan ?? 0}
              siteB={summaryB.data?.totalPendapatan ?? 0}
            />
            <KpiCard
              label="Jumlah Transaksi"
              siteA={summaryA.data?.totalTransaksi ?? 0}
              siteB={summaryB.data?.totalTransaksi ?? 0}
              format={(v) => `${v} transaksi`}
            />
          </div>
        </>
      )}

      {/* Monthly Revenue Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pendapatan Bulanan {tahun}</CardTitle>
          <CardDescription>Perbandingan revenue per bulan (dalam juta rupiah)</CardDescription>
        </CardHeader>
        <CardContent>
          {summaryA.isLoading || summaryB.isLoading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}jt`} tick={{ fontSize: 11 }} width={45} />
                <Tooltip
                  formatter={(value: number) => fmtFull(value)}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={siteA?.name ?? "Site A"} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Bar dataKey={siteB?.name ?? "Site B"} fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Radar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Profil Performa</CardTitle>
          <CardDescription>Visualisasi multidimensi — skor 0–100 dinormalisasi</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                <Radar
                  name={siteA?.name ?? "Site A"}
                  dataKey={siteA?.name ?? "A"}
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.15}
                />
                <Radar
                  name={siteB?.name ?? "Site B"}
                  dataKey={siteB?.name ?? "B"}
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.15}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Summary Table */}
      {!isLoading && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tabel Ringkasan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Indikator</th>
                    <th className="text-right py-2 px-3 font-medium">{siteA?.name}</th>
                    <th className="text-right py-2 px-3 font-medium">{siteB?.name}</th>
                    <th className="text-right py-2 pl-3 font-medium text-muted-foreground">Unggul</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    { label: "Revenue Bulan Ini",     a: kpiA.data?.revenueThisMonth ?? 0,       b: kpiB.data?.revenueThisMonth ?? 0,       fmt: fmt,  higher: true  },
                    { label: "Collection Rate",        a: kpiA.data?.collectionRate ?? 0,         b: kpiB.data?.collectionRate ?? 0,         fmt: (v: number) => `${v}%`, higher: true  },
                    { label: "Total Piutang",          a: kpiA.data?.totalOutstanding ?? 0,       b: kpiB.data?.totalOutstanding ?? 0,       fmt: fmt,  higher: false },
                    { label: "Invoice Overdue",        a: kpiA.data?.jumlahInvoiceOverdue ?? 0,   b: kpiB.data?.jumlahInvoiceOverdue ?? 0,   fmt: (v: number) => `${v}`, higher: false },
                    { label: "Total Pendapatan YTD",   a: summaryA.data?.totalPendapatan ?? 0,    b: summaryB.data?.totalPendapatan ?? 0,    fmt: fmt,  higher: true  },
                    { label: "Jumlah Transaksi YTD",   a: summaryA.data?.totalTransaksi ?? 0,     b: summaryB.data?.totalTransaksi ?? 0,     fmt: (v: number) => `${v}`, higher: true  },
                  ].map(({ label, a, b, fmt: fmtFn, higher }) => {
                    const aWins = higher ? a >= b : a <= b;
                    return (
                      <tr key={label} className="hover:bg-slate-50">
                        <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                        <td className={cn("text-right py-2 px-3 font-medium", aWins && "text-emerald-700")}>{fmtFn(a)}</td>
                        <td className={cn("text-right py-2 px-3 font-medium", !aWins && "text-emerald-700")}>{fmtFn(b)}</td>
                        <td className="text-right py-2 pl-3">
                          <Badge variant="outline" className={cn("text-[10px]", aWins ? "border-blue-300 text-blue-700" : "border-emerald-300 text-emerald-700")}>
                            {aWins ? (siteA?.name ?? "A") : (siteB?.name ?? "B")}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
