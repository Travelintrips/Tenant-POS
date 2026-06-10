import { apiFetchJson } from "@/lib/api";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { useSite, ALL_SITES_SENTINEL } from "@/contexts/site-context";
import {
  Search, Building2, Dumbbell, TrendingDown, AlertTriangle,
  CheckCircle2, Clock, Store, Users, Download, FileText, ChevronDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line,
} from "recharts";
import { generateRekapTenantPDF } from "@/lib/pdf-rekap-tenant";

// ─── Types ────────────────────────────────────────────────────────────────────

type RekapTenant = {
  tenantId: number;
  businessName: string;
  ownerName: string;
  phone: string | null;
  category: string | null;
  tenantStatus: string;
  siteId: number;
  siteName: string;
  siteType: string;
  bookingId: number | null;
  unitCode: string | null;
  contractStatus: string | null;
  bookingPaymentStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  monthlyRent: number;
  periodLabel: string | null;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
  paidCount: number;
  overdueCount: number;
  unpaidCount: number;
  lastPaidAt: string | null;
  lastPaidAmount: number | null;
};

type TrenBulanan = {
  bulanKey: string;
  bulanLabel: string;
  siteId: number;
  siteName: string;
  siteType: string;
  totalTagihan: number;
  totalBayar: number;
  totalTunggakan: number;
  jumlahInvoice: number;
  lunas: number;
  menunggak: number;
  belumBayar: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `Rp ${(v / 1_000).toFixed(0)}rb`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}

function fmtAxis(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}jt`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return String(v);
}

function fmtTgl(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function contractLabel(s: string | null): { label: string; color: string } {
  switch (s) {
    case "active":        return { label: "Aktif",        color: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    case "expiring_soon": return { label: "Hampir Habis", color: "bg-amber-100 text-amber-800 border-amber-200" };
    case "draft":         return { label: "Draft",        color: "bg-blue-100 text-blue-800 border-blue-200" };
    case "expired":       return { label: "Berakhir",     color: "bg-gray-100 text-gray-600 border-gray-200" };
    case "terminated":    return { label: "Dihentikan",   color: "bg-red-100 text-red-700 border-red-200" };
    default:              return { label: "Belum Ada",    color: "bg-slate-100 text-slate-500 border-slate-200" };
  }
}

function paymentLabel(s: string | null): { label: string; color: string; icon: React.ReactNode } {
  switch ((s ?? "").toLowerCase()) {
    case "paid":    return { label: "Lunas",       color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> };
    case "partial": return { label: "Sebagian",    color: "bg-yellow-100 text-yellow-800 border-yellow-200",   icon: <Clock className="h-3 w-3" /> };
    case "overdue": return { label: "Menunggak",   color: "bg-red-100 text-red-700 border-red-200",            icon: <AlertTriangle className="h-3 w-3" /> };
    case "unpaid":  return { label: "Belum Bayar", color: "bg-orange-100 text-orange-800 border-orange-200",   icon: <TrendingDown className="h-3 w-3" /> };
    default:        return { label: "—",           color: "bg-slate-100 text-slate-500 border-slate-200",      icon: null };
  }
}

const SITE_COLORS: Record<string, string> = {
  "TOD M1 Bandara":       "#3b82f6",
  "Sport Center Bandara": "#10b981",
};

const SITE_TYPE_CFG: Record<string, { icon: React.ReactNode; color: string }> = {
  mall_tenant:  { icon: <Building2 className="h-3.5 w-3.5" />, color: "text-blue-600" },
  sport_center: { icon: <Dumbbell  className="h-3.5 w-3.5" />, color: "text-emerald-600" },
};

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-sm mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RekapTenantPage() {
  const { activeSite } = useSite();
  const isAllSites     = activeSite?.code === ALL_SITES_SENTINEL.code;
  const siteIdHeader   = isAllSites ? undefined : activeSite?.id;
  const [, navigate]   = useLocation();

  const [search,          setSearch]          = useState("");
  const [filterSite,      setFilterSite]      = useState<string>("all");
  const [filterContract,  setFilterContract]  = useState<string>("all");
  const [filterPayment,   setFilterPayment]   = useState<string>("all");
  const [chartMode,       setChartMode]       = useState<"bar" | "line">("bar");
  const [pdfLoading,      setPdfLoading]      = useState(false);

  const headers = siteIdHeader ? { "x-site-id": String(siteIdHeader) } : {};

  const { data: rekap = [], isLoading } = useQuery<RekapTenant[]>({
    queryKey: ["rekap-tenant", siteIdHeader],
    queryFn:  () => apiFetchJson<RekapTenant[]>("/api/laporan/rekap-tenant", { headers }),
  });

  const { data: tren = [], isLoading: trenLoading } = useQuery<TrenBulanan[]>({
    queryKey: ["tren-bulanan", siteIdHeader],
    queryFn:  () => apiFetchJson<TrenBulanan[]>("/api/laporan/tren-bulanan", { headers }),
  });

  // Pivot tren → per bulan dengan site sebagai kolom
  const chartData = useMemo(() => {
    const map = new Map<string, any>();
    for (const t of tren) {
      if (!map.has(t.bulanKey)) map.set(t.bulanKey, { bulan: t.bulanLabel });
      const row = map.get(t.bulanKey)!;
      row[`${t.siteName}_tagihan`]   = t.totalTagihan;
      row[`${t.siteName}_bayar`]     = t.totalBayar;
      row[`${t.siteName}_tunggakan`] = t.totalTunggakan;
    }
    return Array.from(map.values());
  }, [tren]);

  const siteList = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tren) seen.set(t.siteName, t.siteName);
    return Array.from(seen.keys());
  }, [tren]);

  const siteOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of rekap) seen.set(r.siteId, r.siteName);
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [rekap]);

  const filtered = useMemo(() => rekap.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch   = !q ||
      r.businessName.toLowerCase().includes(q) ||
      (r.ownerName ?? "").toLowerCase().includes(q) ||
      (r.unitCode ?? "").toLowerCase().includes(q) ||
      (r.category ?? "").toLowerCase().includes(q);
    const matchSite     = filterSite     === "all" || String(r.siteId) === filterSite;
    const matchContract = filterContract === "all" || (r.contractStatus ?? "none") === filterContract;
    const matchPay      = filterPayment  === "all" || (r.bookingPaymentStatus ?? "none").toLowerCase() === filterPayment;
    return matchSearch && matchSite && matchContract && matchPay;
  }), [rekap, search, filterSite, filterContract, filterPayment]);

  const kpi = useMemo(() => {
    const overdue          = rekap.filter(r => (r.bookingPaymentStatus ?? "").toLowerCase() === "overdue").length;
    const aktif            = rekap.filter(r => r.contractStatus === "active").length;
    const totalOutstanding = rekap.reduce((s, r) => s + r.totalOutstanding, 0);
    const totalPaid        = rekap.reduce((s, r) => s + r.totalPaid, 0);
    return { total: rekap.length, aktif, overdue, totalOutstanding, totalPaid };
  }, [rekap]);

  // ── Export CSV ──────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = [
      "Nama Usaha","Pemilik","Telp","Kategori","Lokasi","Unit",
      "Status Kontrak","Status Bayar","Sewa/bln","Total Tagihan",
      "Sudah Dibayar","Tunggakan","Jatuh Tempo","Terakhir Bayar",
    ];
    const rows = filtered.map(r => [
      r.businessName, r.ownerName, r.phone ?? "", r.category ?? "",
      r.siteName, r.unitCode ?? "", r.contractStatus ?? "",
      r.bookingPaymentStatus ?? "", r.monthlyRent, r.totalBilled,
      r.totalPaid, r.totalOutstanding, r.dueDate ?? "",
      r.lastPaidAt ? new Date(r.lastPaidAt).toLocaleDateString("id-ID") : "",
    ]);
    const csv  = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "rekap-tenant.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Export PDF ──────────────────────────────────────────────────────────────
  async function exportPdf() {
    if (pdfLoading || filtered.length === 0) return;
    setPdfLoading(true);
    try {
      const siteName = isAllSites
        ? "Semua Lokasi"
        : (activeSite?.name ?? "Mall Admin Portal");

      const filterParts: string[] = [];
      if (filterSite     !== "all") filterParts.push(`Lokasi: ${siteOptions.find(s => String(s.id) === filterSite)?.name}`);
      if (filterContract !== "all") filterParts.push(`Kontrak: ${filterContract}`);
      if (filterPayment  !== "all") filterParts.push(`Bayar: ${filterPayment}`);
      if (search)                   filterParts.push(`Cari: "${search}"`);

      generateRekapTenantPDF({
        data:        filtered,
        siteName,
        filterLabel: filterParts.length > 0 ? filterParts.join(" | ") : undefined,
        periodLabel: "Juni 2026",
      });
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rekap Tenant</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ringkasan status kontrak &amp; keuangan seluruh tenant
          </p>
        </div>

        {/* Export Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2" disabled={isLoading}>
              <Download className="h-4 w-4" />
              Export
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={exportCsv} className="gap-2 cursor-pointer">
              <Download className="h-4 w-4 text-muted-foreground" />
              Download CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={exportPdf}
              disabled={pdfLoading}
              className="gap-2 cursor-pointer"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              {pdfLoading ? "Membuat PDF…" : "Download PDF"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Total Tenant"    value={kpi.total}   icon={<Users         className="h-5 w-5 text-muted-foreground" />} />
          <KpiCard label="Kontrak Aktif"   value={kpi.aktif}   icon={<CheckCircle2  className="h-5 w-5 text-emerald-500" />}     valueClass="text-emerald-600" />
          <KpiCard label="Menunggak"       value={kpi.overdue} icon={<AlertTriangle className="h-5 w-5 text-red-500" />}         valueClass="text-red-600" />
          <KpiCard label="Total Tunggakan" value={fmt(kpi.totalOutstanding)} icon={<TrendingDown className="h-5 w-5 text-orange-500" />} valueClass="text-orange-600" isText />
        </div>
      )}

      {/* Grafik Tren */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Tren Tagihan &amp; Pembayaran Bulanan</CardTitle>
            <div className="flex gap-1">
              <Button size="sm" variant={chartMode === "bar"  ? "default" : "outline"} onClick={() => setChartMode("bar")}  className="h-7 text-xs px-3">Bar</Button>
              <Button size="sm" variant={chartMode === "line" ? "default" : "outline"} onClick={() => setChartMode("line")} className="h-7 text-xs px-3">Garis</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {trenLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Belum ada data tren</div>
          ) : chartMode === "bar" ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {siteList.map(site => (
                  <Bar key={`${site}_bayar`}     dataKey={`${site}_bayar`}     name={`Bayar – ${site}`}     fill={SITE_COLORS[site] ?? "#6366f1"} radius={[3,3,0,0]} maxBarSize={32} />
                ))}
                {siteList.map(site => (
                  <Bar key={`${site}_tunggakan`} dataKey={`${site}_tunggakan`} name={`Tunggakan – ${site}`} fill={SITE_COLORS[site] ? `${SITE_COLORS[site]}55` : "#f97316"} radius={[3,3,0,0]} maxBarSize={32} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {siteList.map(site => (
                  <Line key={`${site}_tagihan`}   type="monotone" dataKey={`${site}_tagihan`}   name={`Tagihan – ${site}`}   stroke={SITE_COLORS[site] ?? "#6366f1"} strokeWidth={2}   dot={{ r: 4 }} />
                ))}
                {siteList.map(site => (
                  <Line key={`${site}_bayar`}     type="monotone" dataKey={`${site}_bayar`}     name={`Bayar – ${site}`}     stroke={SITE_COLORS[site] ?? "#6366f1"} strokeWidth={2}   strokeDasharray="5 3" dot={{ r: 3 }} />
                ))}
                {siteList.map(site => (
                  <Line key={`${site}_tunggakan`} type="monotone" dataKey={`${site}_tunggakan`} name={`Tunggakan – ${site}`} stroke="#ef4444"                       strokeWidth={1.5} strokeDasharray="3 3"   dot={{ r: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}

          {!trenLoading && tren.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {siteList.map(site => {
                const siteTren  = tren.filter(t => t.siteName === site);
                const lastMonth = siteTren[siteTren.length - 1];
                if (!lastMonth) return null;
                const pct = lastMonth.totalTagihan > 0
                  ? Math.round(lastMonth.totalBayar / lastMonth.totalTagihan * 100) : 0;
                return (
                  <div key={site} className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-3 py-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: SITE_COLORS[site] ?? "#6366f1" }} />
                    <span className="font-medium">{site}</span>
                    <span className="text-muted-foreground">•</span>
                    <span>{lastMonth.bulanLabel}: <strong>{pct}%</strong> lunas</span>
                    {lastMonth.menunggak > 0 && (
                      <span className="text-red-600 font-medium">• {lastMonth.menunggak} menunggak</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama usaha, pemilik, unit..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {siteOptions.length > 1 && (
              <Select value={filterSite} onValueChange={setFilterSite}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Semua Lokasi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Lokasi</SelectItem>
                  {siteOptions.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={filterContract} onValueChange={setFilterContract}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status Kontrak" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kontrak</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="expiring_soon">Hampir Habis</SelectItem>
                <SelectItem value="expired">Berakhir</SelectItem>
                <SelectItem value="none">Belum Ada Kontrak</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPayment} onValueChange={setFilterPayment}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status Bayar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="paid">Lunas</SelectItem>
                <SelectItem value="partial">Sebagian</SelectItem>
                <SelectItem value="unpaid">Belum Bayar</SelectItem>
                <SelectItem value="overdue">Menunggak</SelectItem>
              </SelectContent>
            </Select>
            {(search || filterSite !== "all" || filterContract !== "all" || filterPayment !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => {
                setSearch(""); setFilterSite("all"); setFilterContract("all"); setFilterPayment("all");
              }}>Reset</Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Menampilkan {filtered.length} dari {rekap.length} tenant
          </p>
        </CardContent>
      </Card>

      {/* Tabel */}
      {isLoading ? (
        <Card><CardContent className="pt-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-16 gap-3">
          <Store className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Tidak ada data yang sesuai filter</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-52">Tenant</TableHead>
                    <TableHead className="w-36">Lokasi / Unit</TableHead>
                    <TableHead className="w-28">Kontrak</TableHead>
                    <TableHead className="w-28">Status Bayar</TableHead>
                    <TableHead className="text-right w-28">Sewa/bln</TableHead>
                    <TableHead className="text-right w-28">Total Tagihan</TableHead>
                    <TableHead className="text-right w-28">Sudah Bayar</TableHead>
                    <TableHead className="text-right w-28">Tunggakan</TableHead>
                    <TableHead className="w-32">Terakhir Bayar</TableHead>
                    <TableHead className="w-28">Jatuh Tempo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const cl    = contractLabel(r.contractStatus);
                    const pl    = paymentLabel(r.bookingPaymentStatus);
                    const stCfg = SITE_TYPE_CFG[r.siteType];
                    return (
                      <TableRow key={r.tenantId} className={r.overdueCount > 0 ? "bg-red-50/30" : ""}>
                        <TableCell>
                          <p className="font-medium text-sm">{r.businessName}</p>
                          <p className="text-xs text-muted-foreground">{r.ownerName}</p>
                          {r.category && <p className="text-[10px] text-muted-foreground">{r.category}</p>}
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1 text-xs font-medium ${stCfg?.color ?? ""}`}>
                            {stCfg?.icon}
                            <span className="truncate max-w-24">{r.siteName}</span>
                          </div>
                          {r.unitCode && (
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded mt-0.5 inline-block">{r.unitCode}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] border ${cl.color}`}>{cl.label}</Badge>
                          {r.endDate && <p className="text-[10px] text-muted-foreground mt-0.5">s/d {fmtTgl(r.endDate)}</p>}
                        </TableCell>
                        <TableCell>
                          {r.bookingId ? (
                            <Badge variant="outline" className={`text-[11px] border inline-flex items-center gap-1 ${pl.color}`}>
                              {pl.icon}{pl.label}
                            </Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">{r.monthlyRent > 0 ? fmt(r.monthlyRent) : "—"}</TableCell>
                        <TableCell className="text-right text-sm">{r.totalBilled > 0 ? fmt(r.totalBilled) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm text-emerald-600 font-medium">{r.totalPaid > 0 ? fmt(r.totalPaid) : "—"}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          {r.totalOutstanding > 0 ? (
                            <span className="text-sm font-semibold text-red-600">{fmt(r.totalOutstanding)}</span>
                          ) : <span className="text-xs text-emerald-600">✓ Lunas</span>}
                        </TableCell>
                        <TableCell>
                          {r.lastPaidAt ? (
                            <div>
                              <p className="text-xs">{fmtTgl(r.lastPaidAt)}</p>
                              {r.lastPaidAmount && <p className="text-[10px] text-muted-foreground">{fmt(r.lastPaidAmount)}</p>}
                            </div>
                          ) : <span className="text-xs text-muted-foreground">Belum pernah</span>}
                        </TableCell>
                        <TableCell>
                          {r.dueDate ? (
                            <span className={`text-xs ${
                              r.overdueCount > 0 ? "text-red-600 font-semibold" :
                              new Date(r.dueDate) < new Date() ? "text-orange-600" : "text-muted-foreground"
                            }`}>{fmtTgl(r.dueDate)}</span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Footer */}
      {!isLoading && filtered.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <SummaryItem label="Total Tagihan"   value={fmt(filtered.reduce((s, r) => s + r.totalBilled, 0))} />
              <SummaryItem label="Total Diterima"  value={fmt(filtered.reduce((s, r) => s + r.totalPaid, 0))}   color="text-emerald-600" />
              <SummaryItem label="Total Tunggakan" value={fmt(filtered.reduce((s, r) => s + r.totalOutstanding, 0))} color="text-red-600" />
              <SummaryItem
                label="Tingkat Pelunasan"
                value={(() => {
                  const billed = filtered.reduce((s, r) => s + r.totalBilled, 0);
                  const paid   = filtered.reduce((s, r) => s + r.totalPaid,   0);
                  return billed > 0 ? `${Math.round(paid / billed * 100)}%` : "—";
                })()}
                color="text-blue-600"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, valueClass, isText }: {
  label: string; value: number | string; icon: React.ReactNode; valueClass?: string; isText?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 font-bold ${isText ? "text-xl" : "text-2xl"} ${valueClass ?? "text-foreground"}`}>{value}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold mt-0.5 ${color ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
