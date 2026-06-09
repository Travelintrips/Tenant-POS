import { apiFetch } from "@/lib/api";
import React, { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, Building2, AlertCircle, CheckCircle2,
  CircleDashed, Download, ChevronDown, Zap, RefreshCw,
  Receipt, CreditCard, Banknote, Smartphone, BadgeCheck,
  FileText, Clock, Filter, X, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE + "/api";

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmt(v: number) {
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1)}M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)}jt`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}
function fmtFull(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
}
function fmtTgl(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtJam(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function fmtTglID(iso: string) {
  const d = new Date(iso); if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
function fmtJamPendek(iso: string) {
  const d = new Date(iso); if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

// ─── Constants ───────────────────────────────────────────────────────────────

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
  tunai: "Tunai / Cash", transfer: "Transfer Bank", qris: "QRIS", edc: "EDC", other: "Lainnya",
};
const METODE_COLOR: Record<string, string> = {
  tunai: "#10b981", transfer: "#3b82f6", qris: "#8b5cf6", edc: "#f59e0b", other: "#94a3b8",
};

const STATUS_INV_COLOR: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  partial: "bg-amber-100 text-amber-700 border-amber-200",
  unpaid: "bg-slate-100 text-slate-600 border-slate-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
  draft: "bg-blue-50 text-blue-600 border-blue-200",
};
const STATUS_INV_LABEL: Record<string, string> = {
  paid: "Lunas", partial: "Sebagian", unpaid: "Belum Bayar", overdue: "Jatuh Tempo", draft: "Draft",
};

const AGING_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#dc2626", "#991b1b"];

// ─── Types ───────────────────────────────────────────────────────────────────

type Overview = { totalActiveTenants: number; unpaidCount: number; overdueCount: number; paidTodayAmount: number };
type RecentPayment = { id: number; amount: number; discountAmount: number; penaltyAmount: number; paymentMethod: string; receiptNumber: string | null; notes: string | null; paidAt: string; businessName: string; boothNumber: string; areaName: string; periodLabel: string | null };
type SummaryData = { tahun: number; monthly: { bulan: string; bulanNum: number; totalAmount: number; jumlahTransaksi: number }[]; totalPendapatan: number; totalTransaksi: number; tunggakan: { totalTunggakan: number; jumlahUnit: number } };
type KPIData = { revenueThisMonth: number; paidThisMonth: number; totalOutstanding: number; totalOverdue: number; jumlahInvoiceOverdue: number; jumlahTenantOverdue: number; collectionRate: number };
type PiutangRow = { id: number; invoiceNumber: string; tenantId: number; businessName: string; ownerName: string; unitCode: string; floor: string; dueDate: string | null; periodStart: string | null; periodEnd: string | null; totalAmount: number; paidAmount: number; outstandingAmount: number; status: string; agingDays: number | null };
type PiutangData = { data: PiutangRow[]; pagination: { total: number; limit: number; offset: number } };
type AgingBucket = { label: string; amount: number; count: number };
type AgingData = { buckets: AgingBucket[] };
type PaymentMethodRow = { method: string; totalAmount: number; grossAmount: number; refundTotal: number; jumlahTransaksi: number };
type PaymentMethodData = { data: PaymentMethodRow[] };
type PaymentRecord = { id: number; receiptNumber: string; paymentDate: string; tenantId: number; bookingId: number; businessName: string; ownerName: string; boothNumber: string; areaName: string; floor: string; category: string; periodLabel: string; paymentMethod: string; amountPaid: number; discountAmount: number; penaltyAmount: number; refundAmount: number; netAmount: number; paymentStatus: string; notes: string; source: string; debitAccount: string; creditAccount: string };
type RekapData = { data: PaymentRecord[]; pagination: { total: number; limit: number; offset: number }; tahun: number; bulan: number | null };
type TenantItem = { id: number; businessName: string };

// ─── Filter state ─────────────────────────────────────────────────────────────

interface FilterState {
  dari: string;
  sampai: string;
  bulan: string;
  tenantId: string;
  floor: string;
  paymentMethod: string;
  invoiceStatus: string;
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function toCsv(rows: Record<string, any>[], headers: Record<string, string>): string {
  const cols = Object.keys(headers);
  const head = cols.map((c) => headers[c]).join(",");
  const body = rows.map((r) =>
    cols.map((c) => {
      const v = r[c] ?? "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    }).join(",")
  ).join("\n");
  return head + "\n" + body;
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useLiveOverview() {
  return useQuery<Overview>({
    queryKey: ["laporan-overview"],
    queryFn: () => apiFetch(`${BASE}/api/tenant-pos/overview`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
  });
}
function useRecentPayments() {
  return useQuery<RecentPayment[]>({
    queryKey: ["laporan-recent-payments"],
    queryFn: () => apiFetch(`${BASE}/api/tenant-pos/recent-payments?limit=15`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
  });
}
function useKPI() {
  return useQuery<KPIData>({
    queryKey: ["laporan-kpi"],
    queryFn: () => apiFetch(`${API}/laporan/kpi`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 60_000,
  });
}
function usePiutang(filter: FilterState) {
  const params = new URLSearchParams({ limit: "200" });
  if (filter.tenantId) params.set("tenant_id", filter.tenantId);
  if (filter.floor) params.set("floor", filter.floor);
  if (filter.invoiceStatus) params.set("status", filter.invoiceStatus);
  if (filter.dari) params.set("dari", filter.dari);
  if (filter.sampai) params.set("sampai", filter.sampai);
  return useQuery<PiutangData>({
    queryKey: ["laporan-piutang", filter],
    queryFn: () => apiFetch(`${API}/laporan/piutang?${params}`, { credentials: "include" }).then((r) => r.json()),
  });
}
function useAging() {
  return useQuery<AgingData>({
    queryKey: ["laporan-aging"],
    queryFn: () => apiFetch(`${API}/laporan/aging`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 60_000,
  });
}
function usePaymentMethods(filter: FilterState, tahun: string) {
  const params = new URLSearchParams({ tahun });
  if (filter.bulan) params.set("bulan", filter.bulan);
  if (filter.dari) params.set("dari", filter.dari);
  if (filter.sampai) params.set("sampai", filter.sampai);
  return useQuery<PaymentMethodData>({
    queryKey: ["laporan-payment-methods", tahun, filter.bulan, filter.dari, filter.sampai],
    queryFn: () => apiFetch(`${API}/laporan/payment-methods?${params}`, { credentials: "include" }).then((r) => r.json()),
  });
}
function useTenantsList() {
  return useQuery<TenantItem[]>({
    queryKey: ["laporan-tenants-list"],
    queryFn: () => apiFetch(`${API}/laporan/tenants-list`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}
function useFloorsList() {
  return useQuery<string[]>({
    queryKey: ["laporan-floors-list"],
    queryFn: () => apiFetch(`${API}/laporan/floors-list`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Shared Components ────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-medium">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  );
}

// ─── Section: Filter Bar ──────────────────────────────────────────────────────

function FilterBar({
  filter, setFilter, tahun, setTahun,
}: {
  filter: FilterState;
  setFilter: React.Dispatch<React.SetStateAction<FilterState>>;
  tahun: string;
  setTahun: (v: string) => void;
}) {
  const tenantsQuery = useTenantsList();
  const floorsQuery = useFloorsList();
  const hasFilter = filter.dari || filter.sampai || filter.tenantId || filter.floor || filter.paymentMethod || filter.bulan;

  return (
    <Card className="border-slate-200 bg-slate-50/60">
      <CardContent className="py-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Filter Laporan</span>
          {hasFilter && (
            <button
              onClick={() => setFilter({ dari: "", sampai: "", bulan: "", tenantId: "", floor: "", paymentMethod: "", invoiceStatus: "" })}
              className="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
            >
              <X className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Tahun */}
          <Select value={tahun} onChange={setTahun}>
            {[2026, 2025, 2024].map((y) => <option key={y} value={String(y)}>Tahun {y}</option>)}
          </Select>
          {/* Bulan */}
          <Select value={filter.bulan} onChange={(v) => setFilter((f) => ({ ...f, bulan: v }))}>
            {BULAN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {/* Tanggal dari */}
          <input
            type="date"
            value={filter.dari}
            onChange={(e) => setFilter((f) => ({ ...f, dari: e.target.value }))}
            className="pl-3 pr-2 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Dari"
          />
          <input
            type="date"
            value={filter.sampai}
            onChange={(e) => setFilter((f) => ({ ...f, sampai: e.target.value }))}
            className="pl-3 pr-2 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Sampai"
          />
          {/* Tenant */}
          <Select value={filter.tenantId} onChange={(v) => setFilter((f) => ({ ...f, tenantId: v }))}>
            <option value="">Semua Tenant</option>
            {(tenantsQuery.data ?? []).map((t) => (
              <option key={t.id} value={String(t.id)}>{t.businessName}</option>
            ))}
          </Select>
          {/* Lantai */}
          <Select value={filter.floor} onChange={(v) => setFilter((f) => ({ ...f, floor: v }))}>
            <option value="">Semua Lantai</option>
            {(floorsQuery.data ?? []).map((fl) => (
              <option key={fl} value={fl}>Lantai {fl}</option>
            ))}
          </Select>
          {/* Metode Pembayaran */}
          <Select value={filter.paymentMethod} onChange={(v) => setFilter((f) => ({ ...f, paymentMethod: v }))}>
            <option value="">Semua Metode</option>
            {Object.entries(METODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {/* Status Invoice */}
          <Select value={filter.invoiceStatus} onChange={(v) => setFilter((f) => ({ ...f, invoiceStatus: v }))}>
            <option value="">Semua Status Invoice</option>
            {Object.entries(STATUS_INV_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section: KPI Extended ────────────────────────────────────────────────────

function KPIExtended() {
  const { data, isLoading } = useKPI();
  const cards = [
    {
      label: "Revenue Bulan Ini",
      value: data?.revenueThisMonth ?? 0,
      sub: "Bersih (net refund)",
      color: "border-emerald-200 bg-emerald-50/40",
      textColor: "text-emerald-700",
      labelColor: "text-emerald-600",
      icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
    },
    {
      label: "Total Dibayar Bulan Ini",
      value: data?.paidThisMonth ?? 0,
      sub: "Gross payment",
      color: "border-blue-200 bg-blue-50/40",
      textColor: "text-blue-700",
      labelColor: "text-blue-600",
      icon: <BadgeCheck className="w-4 h-4 text-blue-500" />,
    },
    {
      label: "Total Outstanding",
      value: data?.totalOutstanding ?? 0,
      sub: "Dari semua invoice",
      color: "border-amber-200 bg-amber-50/40",
      textColor: "text-amber-700",
      labelColor: "text-amber-600",
      icon: <Clock className="w-4 h-4 text-amber-500" />,
    },
    {
      label: "Total Overdue",
      value: data?.totalOverdue ?? 0,
      sub: `${data?.jumlahTenantOverdue ?? 0} tenant · ${data?.jumlahInvoiceOverdue ?? 0} invoice`,
      color: "border-red-200 bg-red-50/40",
      textColor: "text-red-700",
      labelColor: "text-red-600",
      icon: <AlertCircle className="w-4 h-4 text-red-500" />,
    },
    {
      label: "Collection Rate",
      value: null,
      pct: data?.collectionRate ?? 0,
      sub: "% invoice terlunasi",
      color: "border-violet-200 bg-violet-50/40",
      textColor: "text-violet-700",
      labelColor: "text-violet-600",
      icon: <Receipt className="w-4 h-4 text-violet-500" />,
    },
    {
      label: "Tenant Overdue",
      value: null,
      count: data?.jumlahTenantOverdue ?? 0,
      sub: "Tenant dengan tagihan lewat jatuh tempo",
      color: "border-orange-200 bg-orange-50/40",
      textColor: "text-orange-700",
      labelColor: "text-orange-600",
      icon: <Building2 className="w-4 h-4 text-orange-500" />,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className={c.color}>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              {c.icon}
              <p className={cn("text-[10px] font-semibold uppercase tracking-wide", c.labelColor)}>{c.label}</p>
            </div>
            {isLoading ? (
              <div className="h-7 bg-white/60 rounded animate-pulse mt-1" />
            ) : c.pct !== undefined ? (
              <p className={cn("text-2xl font-bold tracking-tight mt-0.5", c.textColor)}>{c.pct}%</p>
            ) : c.count !== undefined ? (
              <p className={cn("text-2xl font-bold tracking-tight mt-0.5", c.textColor)}>{c.count}</p>
            ) : (
              <p className={cn("text-xl font-bold tracking-tight mt-0.5", c.textColor)}>{fmt(c.value!)}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Section: Aging Receivable ────────────────────────────────────────────────

function AgingSection() {
  const { data, isLoading } = useAging();
  const buckets = data?.buckets ?? [];
  const total = buckets.reduce((s, b) => s + b.amount, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Aging Receivable</CardTitle>
            <CardDescription>Distribusi piutang berdasarkan umur tagihan</CardDescription>
          </div>
          <span className="text-sm font-semibold text-slate-700">{fmt(total)}</span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              {buckets.map((b, i) => {
                const pct = total > 0 ? Math.round((b.amount / total) * 100) : 0;
                return (
                  <div key={b.label} className="rounded-lg border p-3" style={{ borderColor: AGING_COLORS[i] + "60", background: AGING_COLORS[i] + "08" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: AGING_COLORS[i] }}>{b.label}</p>
                    <p className="text-lg font-bold text-slate-800">{fmt(b.amount)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{b.count} invoice · {pct}%</p>
                  </div>
                );
              })}
            </div>
            {/* Progress bar */}
            {total > 0 && (
              <div className="flex rounded-full overflow-hidden h-2.5">
                {buckets.map((b, i) => (
                  <div
                    key={b.label}
                    style={{ width: `${(b.amount / total) * 100}%`, background: AGING_COLORS[i] }}
                    title={`${b.label}: ${fmt(b.amount)}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section: Piutang Tenant ──────────────────────────────────────────────────

function PiutangTable({ filter }: { filter: FilterState }) {
  const { data, isLoading, isError } = usePiutang(filter);
  const rows = data?.data ?? [];
  const total = data?.pagination.total ?? 0;

  const handleExport = () => {
    if (!rows.length) return;
    const csv = toCsv(rows, {
      invoiceNumber: "No. Invoice",
      businessName: "Nama Bisnis",
      ownerName: "Pemilik",
      unitCode: "Unit",
      floor: "Lantai",
      dueDate: "Jatuh Tempo",
      totalAmount: "Total Tagihan",
      paidAmount: "Sudah Dibayar",
      outstandingAmount: "Outstanding",
      agingDays: "Aging (hari)",
      status: "Status",
    });
    downloadCsv(csv, `piutang-tenant-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Laporan Piutang Tenant</CardTitle>
            <CardDescription>{total} invoice · belum lunas</CardDescription>
          </div>
          <button
            onClick={handleExport}
            disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : isError ? (
          <div className="flex items-center gap-2 justify-center py-10 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4" /> Gagal memuat data piutang
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <CheckCircle2 className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">Tidak ada piutang untuk filter ini</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b">
                  {["No. Invoice", "Tenant", "Unit / Lantai", "Jatuh Tempo", "Total Tagihan", "Dibayar", "Outstanding", "Aging", "Status"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const aging = r.agingDays;
                  const agingLabel = aging === null ? "—"
                    : aging <= 0 ? "Belum JT"
                    : aging <= 30 ? `${aging}h`
                    : aging <= 60 ? `${aging}h`
                    : aging <= 90 ? `${aging}h`
                    : `${aging}h`;
                  const agingColor = aging === null || aging <= 0 ? "text-emerald-600"
                    : aging <= 30 ? "text-amber-600"
                    : aging <= 60 ? "text-orange-600"
                    : "text-red-700 font-semibold";
                  return (
                    <tr key={r.id} className={cn("hover:bg-slate-50/60 transition-colors", aging !== null && aging > 30 && "bg-red-50/20")}>
                      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{r.invoiceNumber}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-800 truncate max-w-[150px]">{r.businessName}</p>
                        <p className="text-[11px] text-slate-400">{r.ownerName}</p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{r.unitCode}</span>
                        {r.floor && r.floor !== "-" && <span className="text-xs text-slate-400 ml-1">Lt.{r.floor}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-sm whitespace-nowrap">{fmtTgl(r.dueDate)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-medium">{fmtFull(r.totalAmount)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-emerald-700">{fmtFull(r.paidAmount)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-semibold text-slate-800">{fmtFull(r.outstandingAmount)}</td>
                      <td className={cn("px-3 py-2.5 text-center tabular-nums whitespace-nowrap text-sm", agingColor)}>{agingLabel}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", STATUS_INV_COLOR[r.status] ?? "bg-slate-100 text-slate-600 border-slate-200")}>
                          {STATUS_INV_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t">
                  <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold text-slate-600">
                    Total ({total} invoice)
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-sm tabular-nums">{fmtFull(rows.reduce((s, r) => s + r.totalAmount, 0))}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-sm tabular-nums text-emerald-700">{fmtFull(rows.reduce((s, r) => s + r.paidAmount, 0))}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-sm tabular-nums text-red-700">{fmtFull(rows.reduce((s, r) => s + r.outstandingAmount, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section: Pembayaran per Metode ──────────────────────────────────────────

function PaymentMethodSection({ filter, tahun }: { filter: FilterState; tahun: string }) {
  const { data, isLoading } = usePaymentMethods(filter, tahun);
  const rows = data?.data ?? [];
  const grandTotal = rows.reduce((s, r) => s + r.totalAmount, 0);
  const grandTrx = rows.reduce((s, r) => s + r.jumlahTransaksi, 0);

  const handleExport = () => {
    if (!rows.length) return;
    const csv = toCsv(rows.map((r) => ({ ...r, method: METODE_LABEL[r.method] ?? r.method })), {
      method: "Metode Pembayaran",
      jumlahTransaksi: "Jumlah Transaksi",
      grossAmount: "Total Bruto",
      refundTotal: "Total Refund",
      totalAmount: "Total Bersih",
    });
    downloadCsv(csv, `pembayaran-per-metode-${tahun}.csv`);
  };

  const pieData = rows.filter((r) => r.totalAmount > 0).map((r) => ({
    name: METODE_LABEL[r.method] ?? r.method,
    value: r.totalAmount,
    color: METODE_COLOR[r.method] ?? "#94a3b8",
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Pembayaran per Metode</CardTitle>
            <CardDescription>Cash, transfer, QRIS, EDC — void dikecualikan, refund dikurangi</CardDescription>
          </div>
          <button
            onClick={handleExport}
            disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-40 bg-slate-50 rounded-lg animate-pulse" />
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Table */}
            <div className="flex-1 rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Metode</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Transaksi</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bruto</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Refund</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bersih</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const pct = grandTotal > 0 ? ((r.totalAmount / grandTotal) * 100).toFixed(1) : "0";
                    return (
                      <tr key={r.method} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: METODE_COLOR[r.method] ?? "#94a3b8" }} />
                            <span className="flex items-center gap-1.5">
                              {METODE_ICON[r.method]}
                              <span className="font-medium">{METODE_LABEL[r.method] ?? r.method}</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.jumlahTransaksi}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{fmt(r.grossAmount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-500">
                          {r.refundTotal > 0 ? `-${fmt(r.refundTotal)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{fmt(r.totalAmount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500 text-xs">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t font-semibold">
                    <td className="px-4 py-2.5 text-sm">Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{grandTrx}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(rows.reduce((s, r) => s + r.grossAmount, 0))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-500">
                      {rows.reduce((s, r) => s + r.refundTotal, 0) > 0 ? `-${fmt(rows.reduce((s, r) => s + r.refundTotal, 0))}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{fmt(grandTotal)}</td>
                    <td className="px-4 py-2.5 text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Pie */}
            {pieData.length > 0 && (
              <div className="w-full lg:w-52 flex items-center justify-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section: Live KPI Bar ────────────────────────────────────────────────────

function LiveKPIBar() {
  const { data, isLoading, isError, refetch } = useLiveOverview();
  return (
    <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50/60 to-white">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE — Hari Ini
          </span>
          <button onClick={() => refetch()} className="text-muted-foreground hover:text-slate-700 transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Terkumpul Hari Ini", val: isLoading ? null : fmtFull(data?.paidTodayAmount ?? 0), color: "text-emerald-700 text-xl" },
            { label: "Tenant Aktif", val: isLoading ? null : String(data?.totalActiveTenants ?? 0), color: "text-xl font-bold mt-0.5" },
            { label: "Tagihan Pending", val: isLoading ? null : String(data?.unpaidCount ?? 0), color: "text-xl font-bold text-amber-600 mt-0.5" },
            { label: "Jatuh Tempo", val: isLoading ? null : String(data?.overdueCount ?? 0), color: "text-xl font-bold text-red-600 mt-0.5" },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
              {isLoading ? <Skeleton className="h-6 w-24 mt-1" /> : (
                <p className={cn("font-bold mt-0.5", item.color)}>{item.val}</p>
              )}
            </div>
          ))}
        </div>
        {isError && <p className="text-xs text-red-500 mt-2 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />Gagal memuat data live</p>}
      </CardContent>
    </Card>
  );
}

// ─── Section: Recent Payments ─────────────────────────────────────────────────

function RecentPaymentsTable() {
  const { data: payments, isLoading, isError, refetch, dataUpdatedAt } = useRecentPayments();
  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Pembayaran Terbaru
              <span className="inline-flex items-center gap-1 text-[10px] font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE
              </span>
            </CardTitle>
            <CardDescription>
              Transaksi real-time dari POS Tenant
              {lastUpdate && <span className="ml-2 text-[10px]">· diperbarui {lastUpdate}</span>}
            </CardDescription>
          </div>
          <button onClick={() => refetch()} className="text-muted-foreground hover:text-slate-700 transition-colors"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
            <AlertCircle className="w-8 h-8 mb-2 opacity-40" /><p className="text-sm">Gagal memuat pembayaran terbaru</p>
            <button onClick={() => refetch()} className="text-xs text-primary mt-2 hover:underline">Coba Lagi</button>
          </div>
        ) : !payments?.length ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
            <Zap className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Belum ada pembayaran yang tercatat</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  {["Waktu", "Tenant", "Periode", "Metode", "Jumlah"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide", i < 2 ? "text-left" : i === 4 ? "text-right" : "text-left", i === 2 && "hidden sm:table-cell", i === 3 && "hidden md:table-cell")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      <div>{fmtTglID(p.paidAt.slice(0, 10))}</div>
                      <div className="text-[10px] text-slate-400">{fmtJamPendek(p.paidAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[150px]">{p.businessName}</p>
                      <p className="text-[11px] text-muted-foreground">{p.boothNumber} · {p.areaName}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden sm:table-cell">{p.periodLabel ?? "—"}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {METODE_LABEL[p.paymentMethod] ?? p.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{fmtFull(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t">
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-slate-600">{payments.length} transaksi terakhir</td>
                  <td colSpan={2} className="px-4 py-2.5 text-right font-bold text-sm tabular-nums text-emerald-700">
                    {fmtFull(payments.reduce((s, p) => s + p.amount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section: Rekap Transaksi ─────────────────────────────────────────────────

function RekapTransaksiSection({ filter, tahun }: { filter: FilterState; tahun: string }) {
  const [showJurnal, setShowJurnal] = useState(false);

  const params = new URLSearchParams({ tahun, limit: "100" });
  if (filter.bulan) params.set("bulan", filter.bulan);
  if (filter.dari) params.set("dari", filter.dari);
  if (filter.sampai) params.set("sampai", filter.sampai);
  if (filter.tenantId) params.set("tenant_id", filter.tenantId);
  if (filter.floor) params.set("floor", filter.floor);
  if (filter.paymentMethod) params.set("payment_method", filter.paymentMethod);

  const rekapQuery = useQuery<RekapData>({
    queryKey: ["laporan-rekap", tahun, filter],
    queryFn: async () => {
      const res = await apiFetch(`${API}/laporan/rekap-payments?${params}`);
      if (!res.ok) throw new Error("Gagal memuat rekap pembayaran");
      return res.json();
    },
  });

  const rekap = rekapQuery.data;

  const handleExport = () => {
    const rows = rekap?.data ?? [];
    if (!rows.length) return;
    const csv = toCsv(rows, {
      paymentDate: "Tanggal",
      receiptNumber: "No. Receipt",
      businessName: "Nama Bisnis",
      ownerName: "Pemilik",
      boothNumber: "Booth",
      floor: "Lantai",
      periodLabel: "Periode",
      paymentMethod: "Metode",
      amountPaid: "Nominal Bruto",
      refundAmount: "Refund",
      netAmount: "Nominal Bersih",
      paymentStatus: "Status",
      notes: "Catatan",
    });
    downloadCsv(csv, `rekap-pembayaran-${tahun}.csv`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Rekap Transaksi Pembayaran</CardTitle>
            <CardDescription>
              Setiap baris = 1 transaksi · Void dikecualikan · Refund tampil sebagai pengurang
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExport}
              disabled={!rekap?.data.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              onClick={() => setShowJurnal(!showJurnal)}
              className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-all border", showJurnal ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400")}
            >
              {showJurnal ? "Sembunyikan Jurnal" : "Tampilkan Jurnal"}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {rekapQuery.isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : rekapQuery.isError ? (
          <div className="flex items-center gap-2 text-red-500 py-8 justify-center text-sm"><AlertCircle className="w-4 h-4" />Gagal memuat data transaksi</div>
        ) : !(rekap?.data.length) ? (
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
                    {[
                      "Tanggal", "No. Receipt", "Nama Bisnis", "Pemilik", "Booth", "Lantai",
                      "Periode", "Metode", "Nominal", "Refund", "Bersih", "Status",
                      ...(showJurnal ? ["Jurnal"] : []),
                    ].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rekap?.data.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="text-slate-800 font-medium">{fmtTgl(row.paymentDate)}</div>
                        <div className="text-slate-400 text-xs">{fmtJam(row.paymentDate)}</div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Receipt className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-mono text-xs text-slate-600">{row.receiptNumber}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800 truncate max-w-[130px]">{row.businessName}</div>
                        <div className="text-xs text-slate-400">{row.category}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-sm">{row.ownerName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{row.boothNumber}</span>
                        <div className="text-xs text-slate-400 mt-0.5">{row.areaName}</div>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-slate-500 whitespace-nowrap">{row.floor !== "-" ? `Lt.${row.floor}` : "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">{row.periodLabel}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          {METODE_ICON[row.paymentMethod]}
                          {METODE_LABEL[row.paymentMethod] ?? row.paymentMethod}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums font-medium text-slate-700">{fmtFull(row.amountPaid)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-red-500 text-xs">
                        {row.refundAmount > 0 ? `-${fmtFull(row.refundAmount)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums font-semibold text-slate-800">{fmtFull(row.netAmount)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium",
                          row.paymentStatus?.toUpperCase() === "PAID" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : row.paymentStatus?.toUpperCase() === "PARTIAL" ? "bg-amber-100 text-amber-700 border-amber-200"
                          : row.paymentStatus?.toUpperCase() === "OVERDUE" ? "bg-red-100 text-red-700 border-red-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                        )}>
                          {row.paymentStatus?.toUpperCase() === "PAID" ? "Lunas"
                          : row.paymentStatus?.toUpperCase() === "PARTIAL" ? "Sebagian"
                          : row.paymentStatus?.toUpperCase() === "OVERDUE" ? "Jatuh Tempo"
                          : row.paymentStatus}
                        </span>
                      </td>
                      {showJurnal && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="text-xs space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-8 text-slate-400">Dr.</span>
                              <span className="text-slate-700 font-medium">{row.debitAccount}</span>
                              <span className="text-slate-400 tabular-nums">{fmt(row.netAmount)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-8 text-slate-400">Cr.</span>
                              <span className="text-slate-700 font-medium">{row.creditAccount}</span>
                              <span className="text-slate-400 tabular-nums">{fmt(row.netAmount)}</span>
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t">
                    <td colSpan={showJurnal ? 8 : 7} className="px-3 py-2.5 text-xs font-semibold text-slate-600">
                      Total ({rekap?.pagination.total ?? 0} transaksi)
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-sm tabular-nums text-slate-700">
                      {fmtFull(rekap?.data.reduce((s, r) => s + r.amountPaid, 0) ?? 0)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-sm tabular-nums text-red-500">
                      {rekap?.data.reduce((s, r) => s + r.refundAmount, 0)
                        ? `-${fmtFull(rekap?.data.reduce((s, r) => s + r.refundAmount, 0) ?? 0)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-sm tabular-nums text-emerald-700">
                      {fmtFull(rekap?.data.reduce((s, r) => s + r.netAmount, 0) ?? 0)}
                    </td>
                    <td colSpan={showJurnal ? 2 : 1} />
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
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Laporan() {
  const [tahun, setTahun] = useState(String(new Date().getFullYear()));
  const [filter, setFilter] = useState<FilterState>({
    dari: "", sampai: "", bulan: "", tenantId: "", floor: "", paymentMethod: "", invoiceStatus: "",
  });

  const prevYear = String(parseInt(tahun) - 1);

  const summaryQuery = useQuery<SummaryData>({
    queryKey: ["laporan-summary", tahun],
    queryFn: async () => {
      const res = await apiFetch(`${API}/laporan/summary?tahun=${tahun}`);
      if (!res.ok) throw new Error("Gagal memuat ringkasan");
      return res.json();
    },
  });
  const prevSummaryQuery = useQuery<SummaryData>({
    queryKey: ["laporan-summary", prevYear],
    queryFn: async () => {
      const res = await apiFetch(`${API}/laporan/summary?tahun=${prevYear}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const summary = summaryQuery.data;
  const prevSummary = prevSummaryQuery.data;
  const totalPendapatan = summary?.totalPendapatan ?? 0;
  const prevTotal = prevSummary?.totalPendapatan ?? 0;
  const diffTotal = totalPendapatan - prevTotal;
  const isLoading = summaryQuery.isLoading;

  const chartData = (summary?.monthly ?? []).map((m, i) => ({
    bulan: m.bulan,
    [tahun]: m.totalAmount,
    [prevYear]: prevSummary?.monthly[i]?.totalAmount ?? 0,
  }));

  const cumulativeData = (summary?.monthly ?? []).map((m, i) => ({
    bulan: m.bulan,
    kumulatif: (summary?.monthly ?? []).slice(0, i + 1).reduce((s, x) => s + x.totalAmount, 0),
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laporan Keuangan</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Piutang, pembayaran, dan rekap pendapatan sewa tenant
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar filter={filter} setFilter={setFilter} tahun={tahun} setTahun={setTahun} />

      {/* KPI Extended */}
      <KPIExtended />

      {/* Live KPI bar */}
      <LiveKPIBar />

      {/* Historical KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Pendapatan</p>
            {isLoading ? <div className="h-8 bg-slate-100 rounded animate-pulse mt-1" /> : (
              <p className="text-2xl font-bold mt-1 tracking-tight">{fmt(totalPendapatan)}</p>
            )}
            <div className={cn("flex items-center gap-1 text-xs mt-1", diffTotal >= 0 ? "text-emerald-600" : "text-red-500")}>
              {diffTotal >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {diffTotal >= 0 ? "+" : ""}{fmt(Math.abs(diffTotal))} vs {prevYear}
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Jumlah Transaksi</p>
            {isLoading ? <div className="h-8 bg-blue-100 rounded animate-pulse mt-1" /> : (
              <p className="text-2xl font-bold mt-1 text-blue-700 tracking-tight">{summary?.totalTransaksi ?? 0} <span className="text-sm font-normal">transaksi</span></p>
            )}
            <p className="text-xs text-blue-400 mt-1">Tahun {tahun}</p>
          </CardContent>
        </Card>
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-violet-600 font-medium uppercase tracking-wide">Rata-rata/Bulan</p>
            {isLoading ? <div className="h-8 bg-violet-100 rounded animate-pulse mt-1" /> : (
              <p className="text-2xl font-bold mt-1 text-violet-700 tracking-tight">
                {fmt(summary && summary.monthly.filter(m => m.totalAmount > 0).length > 0
                  ? Math.round(totalPendapatan / summary.monthly.filter(m => m.totalAmount > 0).length) : 0)}
              </p>
            )}
            <p className="text-xs text-violet-400 mt-1">Per bulan aktif</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Total Tunggakan</p>
            {isLoading ? <div className="h-8 bg-red-100 rounded animate-pulse mt-1" /> : (
              <p className="text-2xl font-bold mt-1 text-red-600 tracking-tight">{fmt(summary?.tunggakan.totalTunggakan ?? 0)}</p>
            )}
            <div className="flex items-center gap-1 text-xs mt-1 text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {summary?.tunggakan.jumlahUnit ?? 0} unit menunggak
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── NEW: Aging Receivable ── */}
      <AgingSection />

      {/* ── NEW: Piutang Tenant ── */}
      <PiutangTable filter={filter} />

      {/* Recent Payments (live) */}
      <RecentPaymentsTable />

      {/* Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pendapatan Sewa Tenant per Bulan</CardTitle>
          <CardDescription>Perbandingan {tahun} vs {prevYear}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="h-[280px] bg-slate-50 rounded-lg animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="bulan" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => v === 0 ? "0" : `${v / 1_000_000}jt`} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={42} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
                <Legend formatter={(v) => <span className="text-xs text-slate-600 font-medium">{v}</span>} iconType="circle" iconSize={8} />
                <Bar dataKey={tahun} name={`Tahun ${tahun}`} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey={prevYear} name={`Tahun ${prevYear}`} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Line Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tren Kumulatif Pendapatan</CardTitle>
          <CardDescription>Akumulasi pendapatan per bulan — {tahun}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="h-[200px] bg-slate-50 rounded-lg animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="bulan" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => v === 0 ? "0" : `${v / 1_000_000}jt`} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={42} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="kumulatif" name="Kumulatif" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── NEW: Pembayaran per Metode ── */}
      <PaymentMethodSection filter={filter} tahun={tahun} />

      {/* ── Rekap Transaksi (now with all filters + export + refund column) ── */}
      <RekapTransaksiSection filter={filter} tahun={tahun} />
    </div>
  );
}
