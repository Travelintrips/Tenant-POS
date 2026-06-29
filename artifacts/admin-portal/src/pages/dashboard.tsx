import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users, FileText, AlertTriangle, Wallet, TrendingUp,
  Clock, ArrowRight, ClipboardCheck, Store, CalendarRange,
  BarChart3, CheckCircle2, CircleDollarSign, LayoutGrid, Calculator, BadgeCheck,
  Download, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useSite } from "@/contexts/site-context";
import { useToast } from "@/hooks/use-toast";

const BASE = "";

function formatRp(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

type DashSummary = {
  totalTenants: number;
  tenantAktif: number;
  invoiceOverdue: number;
  invoiceUnpaid: number;
  invoicePartial: number;
  totalPiutang: number;
  revenueThisMonth: number;
  pendingPayments: number;
  invoicePaidCount: number;
  invoicePaidAmount: number;
  paidMonth: string;
};

type MonthlySummary = {
  bulan: string;
  bulanNum: number;
  totalAmount: number;
  jumlahTransaksi: number;
};

type UpcomingItem = {
  id: number;
  invoiceNumber: string;
  dueDate: string | null;
  outstandingAmount: string;
  status: string;
  tenantName: string | null;
};

type UpcomingData = {
  count: number;
  overdueCount: number;
  upcomingCount: number;
  overdue: UpcomingItem[];
  upcoming: UpcomingItem[];
};

type UnitStats = {
  stats: Record<string, number>;
  total: number;
  occupancyRate: number;
};

type TrendPoint = {
  label: string;
  month: string;
  count: number;
  amount: number;
};

const UNIT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  occupied:    { label: "Terisi",      color: "bg-emerald-500", bg: "bg-emerald-50 text-emerald-700" },
  available:   { label: "Tersedia",   color: "bg-sky-400",     bg: "bg-sky-50 text-sky-700" },
  maintenance: { label: "Maintenance", color: "bg-amber-400",  bg: "bg-amber-50 text-amber-700" },
  overdue:     { label: "Menunggak",  color: "bg-red-500",     bg: "bg-red-50 text-red-700" },
  booked:      { label: "Dipesan",    color: "bg-purple-400",  bg: "bg-purple-50 text-purple-700" },
  expired:     { label: "Kadaluarsa", color: "bg-slate-400",   bg: "bg-slate-50 text-slate-600" },
};

const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border rounded-lg shadow-md px-3 py-2 text-xs">
        <p className="font-semibold mb-1">{label}</p>
        <p className="text-primary">{formatRp(payload[0]?.value ?? 0)}</p>
        <p className="text-muted-foreground">{payload[1]?.value ?? 0} transaksi</p>
      </div>
    );
  }
  return null;
};

// Buat opsi bulan: 12 bulan terakhir
function buildMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    opts.push({ value, label });
  }
  return opts;
}

const MONTH_OPTIONS = buildMonthOptions();

export default function Dashboard() {
  const { data: user } = useAuth();
  const { activeSite } = useSite();
  const { toast } = useToast();
  const siteHeader: Record<string, string> = activeSite && activeSite.code !== "ALL"
    ? { "x-site-id": String(activeSite.id) }
    : {};

  const tahun = new Date().getFullYear();
  const bulanSekarang = new Date().getMonth();

  const defaultMonth = MONTH_OPTIONS[0].value;
  const [paidMonthFilter, setPaidMonthFilter] = useState<string>(defaultMonth);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      const params = new URLSearchParams({ month: paidMonthFilter });
      if (activeSite && activeSite.code !== "ALL") params.set("siteId", String(activeSite.id));
      const res = await fetch(`${BASE}/api/dashboard/export-monthly-pdf?${params}`, {
        headers: siteHeader,
      });
      if (!res.ok) throw new Error("Gagal mengunduh laporan");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-${paidMonthFilter}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: "Gagal mengunduh laporan",
        description: "Terjadi kesalahan saat mengunduh laporan PDF. Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const { data: summary, isLoading: loadSummary } = useQuery<DashSummary>({
    queryKey: ["dashboard-summary", activeSite?.id, paidMonthFilter],
    queryFn: async () => {
      const url = `${BASE}/api/dashboard/summary?paidMonth=${paidMonthFilter}`;
      const res = await fetch(url, { headers: siteHeader });
      if (!res.ok) throw new Error("Gagal memuat summary");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: monthly, isLoading: loadMonthly } = useQuery<{ monthly: MonthlySummary[] }>({
    queryKey: ["laporan-summary-dashboard", tahun, activeSite?.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/laporan/summary?tahun=${tahun}`, { headers: siteHeader });
      if (!res.ok) throw new Error("Gagal memuat grafik");
      return res.json();
    },
    refetchInterval: 120_000,
  });

  const { data: unitStats } = useQuery<UnitStats>({
    queryKey: ["dashboard-unit-stats"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/dashboard/unit-stats`);
      if (!res.ok) throw new Error("Gagal memuat statistik unit");
      return res.json();
    },
    refetchInterval: 120_000,
  });

  const { data: paidTrend } = useQuery<{ trend: TrendPoint[] }>({
    queryKey: ["dashboard-paid-trend", activeSite?.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/dashboard/paid-trend`, { headers: siteHeader });
      if (!res.ok) return { trend: [] };
      return res.json();
    },
    refetchInterval: 120_000,
  });

  const { data: upcoming } = useQuery<UpcomingData>({
    queryKey: ["invoice-upcoming-dashboard", activeSite?.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/tenant-invoices/upcoming`, { headers: siteHeader });
      if (!res.ok) return { count: 0, overdueCount: 0, upcomingCount: 0, overdue: [], upcoming: [] };
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const chartData = useMemo(() => {
    const raw = monthly?.monthly ?? [];
    return raw.slice(0, bulanSekarang + 1);
  }, [monthly, bulanSekarang]);

  const urgentList = useMemo(() => {
    const all = [...(upcoming?.overdue ?? []), ...(upcoming?.upcoming ?? [])];
    return all.slice(0, 5);
  }, [upcoming]);

  const now = new Date();
  const namaBulan = BULAN[now.getMonth()];
  const greeting = now.getHours() < 12 ? "Selamat pagi" : now.getHours() < 17 ? "Selamat siang" : "Selamat sore";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">
          {greeting}, {user?.name?.split(" ")[0] ?? "Admin"} 👋
        </h1>
        <p className="text-[11px] sm:text-sm text-muted-foreground">
          Ringkasan operasional · {activeSite?.name ?? "Semua Lokasi"} · <span className="hidden sm:inline">{now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span><span className="sm:hidden">{now.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3 px-4">
            {loadSummary ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Tenant Aktif</p>
                  <Store className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="text-3xl font-bold text-emerald-600">{summary?.tenantAktif ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">dari {summary?.totalTenants ?? 0} tenant terdaftar</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4 pb-3 px-4">
            {loadSummary ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Invoice Overdue</p>
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>
                <p className="text-3xl font-bold text-red-600">{summary?.invoiceOverdue ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  +{summary?.invoiceUnpaid ?? 0} belum bayar, {summary?.invoicePartial ?? 0} sebagian
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-3 px-4">
            {loadSummary ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Bukti Bayar Pending</p>
                  <ClipboardCheck className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-3xl font-bold text-amber-600">{summary?.pendingPayments ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">menunggu persetujuan admin</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3 px-4">
            {loadSummary ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Total Piutang</p>
                  <Wallet className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-2xl font-bold text-blue-600">{formatRp(summary?.totalPiutang ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pendapatan {namaBulan}: {formatRp(summary?.revenueThisMonth ?? 0)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500 col-span-2 sm:col-span-3 lg:col-span-1">
          <CardContent className="pt-3 pb-3 px-4">
            {loadSummary ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <BadgeCheck className="h-3.5 w-3.5 text-violet-500" />
                    Invoice Terbayar
                  </p>
                  <div className="flex items-center gap-1">
                    <Select value={paidMonthFilter} onValueChange={setPaidMonthFilter}>
                      <SelectTrigger className="h-6 text-[10px] px-2 py-0 w-auto border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 focus:ring-violet-300 rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end" className="text-xs max-h-56">
                        {MONTH_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-violet-600 hover:bg-violet-100"
                      onClick={handleDownloadPdf}
                      disabled={isDownloading}
                      title="Download laporan PDF"
                    >
                      {isDownloading
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Download className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                <p className="text-3xl font-bold text-violet-600">{summary?.invoicePaidCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                  {formatRp(summary?.invoicePaidAmount ?? 0)} masuk
                </p>
                {/* Mini sparkline 6 bulan */}
                {(paidTrend?.trend?.length ?? 0) > 0 && (
                  <ResponsiveContainer width="100%" height={44}>
                    <BarChart data={paidTrend!.trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={8}>
                      <Tooltip
                        content={({ active, payload, label }) =>
                          active && payload?.length ? (
                            <div className="bg-white border rounded shadow px-2 py-1 text-[10px]">
                              <p className="font-semibold text-violet-700">{label}</p>
                              <p>{payload[0]?.value} invoice</p>
                              <p className="text-muted-foreground">{formatRp(Number(payload[0]?.payload?.amount ?? 0))}</p>
                            </div>
                          ) : null
                        }
                      />
                      <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                        {paidTrend!.trend.map((entry) => (
                          <Cell
                            key={entry.month}
                            fill={entry.month === paidMonthFilter ? "#7c3aed" : "#ddd6fe"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="flex justify-between mt-0.5">
                  {(paidTrend?.trend ?? []).map((t) => (
                    <span
                      key={t.month}
                      className={`text-[9px] ${t.month === paidMonthFilter ? "text-violet-700 font-bold" : "text-muted-foreground"}`}
                    >
                      {t.label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Unit Stats / Denah Tenant */}
      {(unitStats?.total ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-primary" />
                Status Unit Mall
              </CardTitle>
              <Link href="/tenant-pos">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary">
                  Lihat Denah
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {/* Progress bar */}
            <div className="flex h-4 rounded-full overflow-hidden gap-[1px] mb-3">
              {Object.entries(UNIT_STATUS_CONFIG).map(([key, cfg]) => {
                const cnt = unitStats?.stats[key] ?? 0;
                if (!cnt) return null;
                const pct = (cnt / (unitStats?.total ?? 1)) * 100;
                return (
                  <div
                    key={key}
                    title={`${cfg.label}: ${cnt} unit`}
                    className={`${cfg.color} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
            </div>
            {/* Legend badges */}
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(UNIT_STATUS_CONFIG).map(([key, cfg]) => {
                const cnt = unitStats?.stats[key] ?? 0;
                if (!cnt) return null;
                return (
                  <span key={key} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg.bg}`}>
                    {cfg.label} — {cnt}
                  </span>
                );
              })}
            </div>
            {/* Occupancy rate */}
            <div className="flex items-center gap-3 pt-2 border-t">
              <div className="text-2xl font-bold text-emerald-600">{unitStats?.occupancyRate ?? 0}%</div>
              <div className="text-xs text-muted-foreground">
                Tingkat Hunian<br />
                {((unitStats?.stats["occupied"] ?? 0) + (unitStats?.stats["overdue"] ?? 0))} dari {unitStats?.total ?? 0} unit terisi
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart + Urgent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Tren Pembayaran Bulanan {tahun}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadMonthly ? (
              <Skeleton className="h-48 w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                Belum ada data pembayaran tahun ini.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="bulan" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}jt` : String(v)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="totalAmount"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#colorRev)"
                    name="Pendapatan"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Invoice mendesak */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Invoice Mendesak
              {(upcoming?.count ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-auto text-[10px] h-5 px-1.5">
                  {upcoming!.count}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {urgentList.length === 0 ? (
              <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 opacity-20" />
                <p className="text-xs text-center">Tidak ada invoice mendesak.<br />Semua tagihan aman!</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {urgentList.map((item) => {
                  const isOverdue = upcoming?.overdue.some(o => o.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col rounded-md px-2.5 py-2 border text-xs ${
                        isOverdue
                          ? "bg-red-50 border-red-100"
                          : "bg-amber-50 border-amber-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`font-semibold truncate ${isOverdue ? "text-red-700" : "text-amber-700"}`}>
                          {item.tenantName ?? "—"}
                        </span>
                        <span className={`shrink-0 font-bold ${isOverdue ? "text-red-600" : "text-orange-600"}`}>
                          {formatRp(Number(item.outstandingAmount))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-muted-foreground font-mono">{item.invoiceNumber}</span>
                        <span className={isOverdue ? "text-red-500" : "text-amber-600"}>
                          {isOverdue ? "⚠️" : "⏰"} {formatDate(item.dueDate)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <Link href="/tenant-invoices">
                  <Button variant="outline" size="sm" className="w-full mt-2 h-7 text-xs gap-1">
                    Lihat semua invoice
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground font-medium">Aksi Cepat</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Link href="/data-tenant">
              <button className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-card hover:bg-muted/60 hover:border-primary/30 transition-colors w-full">
                <Store className="h-5 w-5 text-emerald-600" />
                <span className="text-xs font-medium text-center">Data Tenant</span>
              </button>
            </Link>
            <Link href="/booking-tenant">
              <button className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-card hover:bg-muted/60 hover:border-primary/30 transition-colors w-full">
                <CalendarRange className="h-5 w-5 text-blue-600" />
                <span className="text-xs font-medium text-center">Booking Tenant</span>
              </button>
            </Link>
            <Link href="/tenant-invoices">
              <button className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-card hover:bg-muted/60 hover:border-primary/30 transition-colors w-full">
                <FileText className="h-5 w-5 text-purple-600" />
                <span className="text-xs font-medium text-center">Invoice Tenant</span>
              </button>
            </Link>
            <Link href="/tinjau-pembayaran">
              <button className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-card hover:bg-muted/60 hover:border-primary/30 transition-colors w-full relative">
                <ClipboardCheck className="h-5 w-5 text-amber-600" />
                <span className="text-xs font-medium text-center">Tinjau Pembayaran</span>
                {(summary?.pendingPayments ?? 0) > 0 && (
                  <span className="absolute top-2 right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-1">
                    {summary!.pendingPayments}
                  </span>
                )}
              </button>
            </Link>
            <Link href="/laporan">
              <button className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-card hover:bg-muted/60 hover:border-primary/30 transition-colors w-full">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
                <span className="text-xs font-medium text-center">Laporan</span>
              </button>
            </Link>
            <Link href="/tenant-pos">
              <button className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-card hover:bg-muted/60 hover:border-primary/30 transition-colors w-full">
                <Calculator className="h-5 w-5 text-rose-600" />
                <span className="text-xs font-medium text-center">POS / Kasir</span>
              </button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
