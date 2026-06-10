import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, FileText, AlertTriangle, Wallet, TrendingUp,
  Clock, ArrowRight, ClipboardCheck, Store, CalendarRange,
  BarChart3, CheckCircle2, CircleDollarSign,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useSite } from "@/contexts/site-context";

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

export default function Dashboard() {
  const { data: user } = useAuth();
  const { activeSite } = useSite();
  const siteHeader = activeSite && activeSite.code !== "ALL"
    ? { "x-site-id": String(activeSite.id) }
    : {};

  const tahun = new Date().getFullYear();
  const bulanSekarang = new Date().getMonth();

  const { data: summary, isLoading: loadSummary } = useQuery<DashSummary>({
    queryKey: ["dashboard-summary", activeSite?.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/dashboard/summary`, { headers: siteHeader });
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">
          {greeting}, {user?.name?.split(" ")[0] ?? "Admin"} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Ringkasan operasional · {activeSite?.name ?? "Semua Lokasi"} · {now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
      </div>

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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
