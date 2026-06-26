import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, TrendingDown, Filter, Pencil, Trash2, ExternalLink,
  Loader2, AlertCircle, Receipt, Zap, Wifi, Wrench, MoreHorizontal,
  Upload, ImageIcon, CheckCircle2, X, ScanLine, BarChart2, ChevronLeft, ChevronRight,
  ChevronsUpDown, Check,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ─────────────────────────────────────────────────────────────────────

type Expense = {
  id: number;
  siteId: number | null;
  tenantId: number | null;
  category: string;
  coaCode: string | null;
  coaName: string | null;
  coaAccountType: string | null;
  description: string | null;
  amount: string;
  paymentMethod: string;
  paidAt: string;
  receiptUrl: string | null;
  notes: string | null;
  createdAt: string;
  tenantName: string | null;
  siteName: string | null;
};

type ApiResponse = {
  success: boolean;
  data: Expense[];
  summary: { totalRecords: number; totalAmount: string };
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
};

type Tenant = { id: number; businessName: string };

type CoaAccount = {
  id: number;
  companyId: number;
  code: string;
  name: string;
  accountType: string;
};

type CoaAccountsResponse = { success: boolean; data: CoaAccount[] };

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMIT = 15;

const ACCT_TYPE_LABEL: Record<string, string> = {
  expense: "Beban/Biaya",
  asset: "Aset",
  liability: "Kewajiban",
  other: "Lainnya",
};

const ACCT_TYPE_ICON: Record<string, React.ReactNode> = {
  expense: <TrendingDown className="h-3.5 w-3.5" />,
  asset: <Zap className="h-3.5 w-3.5" />,
  liability: <Wrench className="h-3.5 w-3.5" />,
  other: <MoreHorizontal className="h-3.5 w-3.5" />,
};

const ACCT_TYPE_CLASS: Record<string, string> = {
  expense: "bg-orange-100 text-orange-700 border-orange-200",
  asset: "bg-yellow-100 text-yellow-700 border-yellow-200",
  liability: "bg-blue-100 text-blue-700 border-blue-200",
  other: "bg-slate-100 text-slate-600 border-slate-200",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  "e-wallet": "E-Wallet",
  lainnya: "Lainnya",
};

const LARGE_THRESHOLD = 1_000_000;

// ─── Utils ────────────────────────────────────────────────────────────────────

function formatRupiah(v: string | number | null | undefined) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(v ?? 0));
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(new Date(d));
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? "Request gagal");
  }
  return res.json() as Promise<T>;
}

type MonthData = {
  month: string;
  expense: number;
  asset: number;
  liability: number;
  other: number;
  total: number;
};

type MonthlySummary = {
  success: boolean;
  year: number;
  months: MonthData[];
  categoryTotals: { expense: number; asset: number; liability: number; other: number };
};

// ─── Chart colors ─────────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  expense: "#f97316",
  asset: "#f59e0b",
  liability: "#3b82f6",
  other: "#94a3b8",
};

function fmtShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return String(v);
}

// ─── Empty form state ──────────────────────────────────────────────────────────

type FormData = {
  tenantId: string;
  coaCode: string;
  coaName: string;
  coaAccountType: string;
  description: string;
  amount: string;
  paymentMethod: string;
  paidAt: string;
  receiptUrl: string;
  notes: string;
};

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; progress: number }
  | { status: "done"; url: string; previewSrc: string; extractedAmount: number | null; confidence: number }
  | { status: "error"; message: string };

const EMPTY_FORM: FormData = {
  tenantId: "",
  coaCode: "",
  coaName: "",
  coaAccountType: "",
  description: "",
  amount: "",
  paymentMethod: "cash",
  paidAt: new Date().toISOString().slice(0, 16),
  receiptUrl: "",
  notes: "",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PengeluaranOperasional() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterTenantId, setFilterTenantId] = useState("all");
  const [offset, setOffset] = useState(0);

  // Chart year
  const [chartYear, setChartYear] = useState(new Date().getFullYear());

  // Dialog
  const [formOpen, setFormOpen] = useState(false);
  const [coaOpen, setCoaOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Monthly summary query for chart
  const { data: chartData, isLoading: chartLoading } = useQuery<MonthlySummary>({
    queryKey: ["/api/operational-expenses/monthly-summary", chartYear],
    queryFn: () => apiFetch<MonthlySummary>(`${BASE}/api/operational-expenses/monthly-summary?year=${chartYear}`),
  });

  // Build query params
  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (filterCategory !== "all") params.set("category", filterCategory);
  if (filterTenantId !== "all") params.set("tenantId", filterTenantId);

  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ["/api/operational-expenses", offset, dateFrom, dateTo, filterCategory, filterTenantId],
    queryFn: () => apiFetch<ApiResponse>(`${BASE}/api/operational-expenses?${params}`),
  });

  const { data: tenantsData } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
    queryFn: () => apiFetch<Tenant[]>(`${BASE}/api/tenants`),
  });

  const { data: coaData } = useQuery<CoaAccountsResponse>({
    queryKey: ["/api/operational-expenses/coa-accounts"],
    queryFn: () => apiFetch<CoaAccountsResponse>(`${BASE}/api/operational-expenses/coa-accounts`),
  });

  const tenants = tenantsData ?? [];
  const coaAccounts = coaData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`${BASE}/api/operational-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Pengeluaran dicatat", description: "Data berhasil disimpan." });
      void qc.invalidateQueries({ queryKey: ["/api/operational-expenses"] });
      setFormOpen(false);
    },
    onError: (e) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiFetch(`${BASE}/api/operational-expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Pengeluaran diperbarui" });
      void qc.invalidateQueries({ queryKey: ["/api/operational-expenses"] });
      setFormOpen(false);
      setEditTarget(null);
    },
    onError: (e) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${BASE}/api/operational-expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Pengeluaran dihapus" });
      void qc.invalidateQueries({ queryKey: ["/api/operational-expenses"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast({ title: "Gagal hapus", description: e.message, variant: "destructive" }),
  });

  // ─── Upload receipt + OCR ────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (file: File) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setUploadState({ status: "error", message: "Format tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadState({ status: "error", message: "File terlalu besar. Maksimal 5MB." });
      return;
    }

    const previewSrc = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
    setUploadState({ status: "uploading", progress: 10 });

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadState({ status: "uploading", progress: 40 });
      const res = await fetch(`${BASE}/api/uploads/expense-receipt`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      setUploadState({ status: "uploading", progress: 85 });

      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? "Upload gagal");
      }

      const data = await res.json() as {
        url: string; extractedAmount: number | null; confidence: number;
      };

      setUploadState({
        status: "done",
        url: data.url,
        previewSrc,
        extractedAmount: data.extractedAmount,
        confidence: data.confidence,
      });

      // Auto-fill form
      setForm((f) => ({
        ...f,
        receiptUrl: data.url,
        ...(data.extractedAmount ? { amount: String(data.extractedAmount) } : {}),
      }));

      if (data.extractedAmount) {
        toast({
          title: "Nominal terbaca otomatis",
          description: `Rp ${data.extractedAmount.toLocaleString("id-ID")} (konfidensitas ${Math.round(data.confidence * 100)}%)`,
        });
      } else {
        toast({
          title: "Foto berhasil diupload",
          description: "Nominal tidak terbaca — isi manual.",
        });
      }
    } catch (err) {
      setUploadState({ status: "error", message: (err as Error).message });
      toast({ title: "Upload gagal", description: (err as Error).message, variant: "destructive" });
    }
  }, [toast]);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setUploadState({ status: "idle" });
    setFormOpen(true);
  }

  function openEdit(exp: Expense) {
    setEditTarget(exp);
    setForm({
      tenantId: exp.tenantId ? String(exp.tenantId) : "",
      coaCode: exp.coaCode ?? "",
      coaName: exp.coaName ?? "",
      coaAccountType: exp.coaAccountType ?? "",
      description: exp.description ?? "",
      amount: exp.amount,
      paymentMethod: exp.paymentMethod,
      paidAt: exp.paidAt ? exp.paidAt.slice(0, 16) : new Date().toISOString().slice(0, 16),
      receiptUrl: exp.receiptUrl ?? "",
      notes: exp.notes ?? "",
    });
    // Restore upload state when editing existing receipt
    setUploadState(
      exp.receiptUrl
        ? { status: "done", url: exp.receiptUrl, previewSrc: exp.receiptUrl, extractedAmount: null, confidence: 0 }
        : { status: "idle" }
    );
    setFormOpen(true);
  }

  function handleSubmit() {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Nominal tidak valid", description: "Nominal harus lebih dari 0.", variant: "destructive" });
      return;
    }
    if (!form.coaCode) {
      toast({ title: "Akun COA belum dipilih", description: "Pilih akun COA untuk menentukan jenis pengeluaran.", variant: "destructive" });
      return;
    }
    const body = {
      tenantId: form.tenantId ? parseInt(form.tenantId, 10) : null,
      coaCode: form.coaCode || null,
      coaName: form.coaName || null,
      coaAccountType: form.coaAccountType || null,
      description: form.description || null,
      amount,
      paymentMethod: form.paymentMethod,
      paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : null,
      receiptUrl: form.receiptUrl || null,
      notes: form.notes || null,
    };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  function resetFilters() {
    setDateFrom(""); setDateTo("");
    setFilterCategory("all"); setFilterTenantId("all");
    setOffset(0);
  }

  const rows = data?.data ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination;
  const total = pagination?.total ?? 0;
  const page = Math.floor(offset / LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const isPending = createMutation.isPending || updateMutation.isPending;
  const hasFilter = dateFrom || dateTo || filterCategory !== "all" || filterTenantId !== "all";

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-orange-600" />
            Pengeluaran Operasional
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Catat pengeluaran operasional seperti token listrik, internet, dan perbaikan.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Pengeluaran
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Pengeluaran", value: formatRupiah(summary?.totalAmount), color: "text-orange-600" },
          { label: "Jumlah Transaksi", value: String(summary?.totalRecords ?? 0), color: "text-slate-700" },
        ].map((c) => (
          <Card key={c.label} className="col-span-1">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Grafik Bulanan ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="py-3 px-4 pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-orange-500" />
                Tren Pengeluaran Bulanan
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">Per kategori — tahun {chartYear}</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setChartYear(y => y - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold tabular-nums w-12 text-center">{chartYear}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                disabled={chartYear >= new Date().getFullYear()}
                onClick={() => setChartYear(y => y + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Category total badges */}
          {chartData && (
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { key: "expense", label: "Beban/Biaya", color: CAT_COLOR.expense, val: chartData.categoryTotals.expense },
                { key: "asset", label: "Aset/Kasbon", color: CAT_COLOR.asset, val: chartData.categoryTotals.asset },
                { key: "liability", label: "Kewajiban", color: CAT_COLOR.liability, val: chartData.categoryTotals.liability },
                { key: "other", label: "Lainnya", color: CAT_COLOR.other, val: chartData.categoryTotals.other },
              ].filter(({ val }) => val > 0).map(({ key, label, color, val }) => (
                <span key={key} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border bg-background">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                  {label}: <strong>{formatRupiah(val)}</strong>
                </span>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-1 pb-4 px-2">
          {chartLoading ? (
            <div className="h-56 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !chartData || chartData.months.every(m => m.total === 0) ? (
            <div className="h-56 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <BarChart2 className="h-8 w-8 opacity-25" />
              <p className="text-sm">Belum ada data pengeluaran di tahun {chartYear}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData.months} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtShort}
                  width={48}
                />
                <Tooltip
                  formatter={(val: number, name: string) => [formatRupiah(val), ACCT_TYPE_LABEL[name] ?? name]}
                  labelFormatter={(l) => `Bulan: ${l}`}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend
                  iconType="square"
                  iconSize={10}
                  formatter={(val) => ACCT_TYPE_LABEL[val] ?? val}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="expense" stackId="a" fill={CAT_COLOR.expense} radius={[0,0,0,0]} />
                <Bar dataKey="asset" stackId="a" fill={CAT_COLOR.asset} />
                <Bar dataKey="liability" stackId="a" fill={CAT_COLOR.liability} />
                <Bar dataKey="other" stackId="a" fill={CAT_COLOR.other} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Filter bar */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Dari Tanggal</Label>
              <Input type="date" className="h-8 text-sm w-36" value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Sampai Tanggal</Label>
              <Input type="date" className="h-8 text-sm w-36" value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setOffset(0); }} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Tipe Akun</Label>
              <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setOffset(0); }}>
                <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="expense">Beban/Biaya</SelectItem>
                  <SelectItem value="asset">Aset/Kasbon</SelectItem>
                  <SelectItem value="liability">Kewajiban</SelectItem>
                  <SelectItem value="other">Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Tenant</Label>
              <Select value={filterTenantId} onValueChange={(v) => { setFilterTenantId(v); setOffset(0); }}>
                <SelectTrigger className="h-8 text-sm w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tenant</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.businessName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilter && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={resetFilters}>
                Reset filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm">Gagal memuat data. Coba refresh halaman.</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Receipt className="h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">Belum ada pengeluaran</p>
              {hasFilter && <p className="text-xs">Tidak ada data sesuai filter yang dipilih.</p>}
              <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" /> Tambah sekarang
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-10">No</TableHead>
                  <TableHead className="text-xs">Tanggal Bayar</TableHead>
                  <TableHead className="text-xs">Tenant / Unit</TableHead>
                  <TableHead className="text-xs">Kategori</TableHead>
                  <TableHead className="text-xs">Deskripsi</TableHead>
                  <TableHead className="text-xs text-right">Nominal</TableHead>
                  <TableHead className="text-xs">Metode</TableHead>
                  <TableHead className="text-xs">Bukti</TableHead>
                  <TableHead className="text-xs text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const isLarge = Number(row.amount) >= LARGE_THRESHOLD;
                  return (
                    <TableRow key={row.id} className={isLarge ? "bg-orange-50/60" : ""}>
                      <TableCell className="text-xs text-muted-foreground">{offset + idx + 1}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(row.paidAt)}</TableCell>
                      <TableCell className="text-sm">
                        {row.tenantName ?? <span className="text-muted-foreground text-xs">Umum</span>}
                        {row.siteName && <span className="text-xs text-muted-foreground ml-1">({row.siteName})</span>}
                      </TableCell>
                      <TableCell>
                        {row.coaCode ? (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ACCT_TYPE_CLASS[row.coaAccountType ?? "other"] ?? ACCT_TYPE_CLASS["other"]}`}>
                            {ACCT_TYPE_ICON[row.coaAccountType ?? "other"]}
                            <span className="font-mono">{row.coaCode}</span>
                            <span className="max-w-[100px] truncate">{row.coaName}</span>
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ACCT_TYPE_CLASS["other"]}`}>
                            {ACCT_TYPE_ICON["other"]}
                            {row.category}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {row.description ?? <span className="text-muted-foreground text-xs">-</span>}
                      </TableCell>
                      <TableCell className={`text-right text-sm font-semibold tabular-nums whitespace-nowrap ${isLarge ? "text-orange-700" : ""}`}>
                        {formatRupiah(row.amount)}
                        {isLarge && <span className="ml-1 text-xs">⚠</span>}
                      </TableCell>
                      <TableCell className="text-xs">{METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod}</TableCell>
                      <TableCell>
                        {row.receiptUrl ? (
                          <a href={row.receiptUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            Lihat <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : <span className="text-xs text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-center">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}>
                            <Pencil className="h-3.5 w-3.5 text-blue-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteTarget(row)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination + Footer Summary */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground flex-wrap gap-2">
          <div className="text-xs">
            Menampilkan {offset + 1}–{Math.min(offset + rows.length, total)} dari {total} pengeluaran
            {summary && (
              <span className="ml-3 font-semibold text-orange-700">
                Total halaman ini: {formatRupiah(rows.reduce((s, r) => s + Number(r.amount), 0))}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
              ← Sebelumnya
            </Button>
            <span className="text-xs">Hal {page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!pagination?.hasMore}
              onClick={() => setOffset(offset + LIMIT)}>
              Selanjutnya →
            </Button>
          </div>
        </div>
      )}

      {/* ─── Dialog: Tambah / Edit ─────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditTarget(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editTarget ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editTarget ? "Edit Pengeluaran" : "Tambah Pengeluaran"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Akun COA <span className="text-red-500">*</span></Label>
              <Popover open={coaOpen} onOpenChange={setCoaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={coaOpen}
                    className="w-full justify-between font-normal h-9 text-sm"
                  >
                    {form.coaCode
                      ? <span><span className="font-mono text-xs text-muted-foreground mr-1.5">{form.coaCode}</span>{form.coaName}</span>
                      : <span className="text-muted-foreground">Pilih akun...</span>
                    }
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Ketik kode atau nama akun..." />
                    <CommandList className="max-h-64">
                      <CommandEmpty>Akun tidak ditemukan.</CommandEmpty>
                      {coaAccounts.length === 0 && (
                        <div className="px-2 py-3 text-xs text-center text-muted-foreground">Memuat akun COA...</div>
                      )}
                      {["expense", "asset", "liability", "other"].map((type) => {
                        const grouped = coaAccounts.filter(a => a.accountType === type);
                        if (grouped.length === 0) return null;
                        return (
                          <CommandGroup key={type} heading={ACCT_TYPE_LABEL[type] ?? type}>
                            {grouped.map(a => (
                              <CommandItem
                                key={a.code}
                                value={`${a.code} ${a.name}`}
                                onSelect={() => {
                                  setForm(f => ({ ...f, coaCode: a.code, coaName: a.name, coaAccountType: a.accountType }));
                                  setCoaOpen(false);
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${form.coaCode === a.code ? "opacity-100" : "opacity-0"}`} />
                                <span className="font-mono text-xs text-muted-foreground mr-1.5">{a.code}</span>
                                {a.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        );
                      })}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {form.coaCode && (
                <p className="text-[11px] text-muted-foreground">
                  Tipe: <strong>{ACCT_TYPE_LABEL[form.coaAccountType] ?? form.coaAccountType}</strong>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Metode Bayar <span className="text-red-500">*</span></Label>
                <Select value={form.paymentMethod} onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Tunai</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="e-wallet">E-Wallet</SelectItem>
                    <SelectItem value="lainnya">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Nominal (Rp) <span className="text-red-500">*</span></Label>
                <Input
                  type="number" min="1" step="1000"
                  placeholder="500000"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Tanggal Bayar <span className="text-red-500">*</span></Label>
                <Input
                  type="datetime-local"
                  value={form.paidAt}
                  onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Tenant (opsional)</Label>
              <Select value={form.tenantId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, tenantId: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih tenant..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Tidak terkait tenant —</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.businessName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Deskripsi</Label>
              <Input
                placeholder="Contoh: Beli token PLN 500 kWh bulan Juni"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* ─── Upload Bukti Pembayaran ─────────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <ScanLine className="h-3.5 w-3.5 text-primary" />
                Foto Bukti Pembayaran
                <span className="text-muted-foreground font-normal">(nominal terbaca otomatis)</span>
              </Label>

              {/* Drop zone / upload area */}
              {uploadState.status !== "done" && (
                <div
                  className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 cursor-pointer transition-colors
                    ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/40"}
                    ${uploadState.status === "error" ? "border-red-400 bg-red-50" : ""}
                  `}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) void handleFileUpload(file);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileUpload(file);
                      e.target.value = "";
                    }}
                  />

                  {uploadState.status === "uploading" ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-xs text-muted-foreground">Mengupload & membaca nominal…</p>
                      <Progress value={uploadState.progress} className="w-full h-1.5" />
                    </>
                  ) : uploadState.status === "error" ? (
                    <>
                      <AlertCircle className="h-6 w-6 text-red-500" />
                      <p className="text-xs text-red-600 text-center">{uploadState.message}</p>
                      <p className="text-xs text-muted-foreground">Klik untuk coba lagi</p>
                    </>
                  ) : (
                    <>
                      <div className="rounded-full bg-primary/10 p-2.5">
                        <Upload className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium">Klik atau seret foto struk/bukti bayar</p>
                        <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WEBP, PDF · Maks 5MB</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Preview setelah upload berhasil */}
              {uploadState.status === "done" && (
                <div className="rounded-lg border bg-muted/30 p-3 flex gap-3 items-start">
                  {uploadState.previewSrc ? (
                    <a href={uploadState.url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={uploadState.previewSrc}
                        alt="Bukti pembayaran"
                        className="w-20 h-20 object-cover rounded-md border shrink-0 hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ) : (
                    <div className="w-20 h-20 rounded-md border bg-white flex items-center justify-center shrink-0">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-xs font-medium text-green-700">Upload berhasil</span>
                    </div>
                    {uploadState.extractedAmount ? (
                      <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded px-2 py-1">
                        <ScanLine className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-green-700">
                            OCR: Rp {uploadState.extractedAmount.toLocaleString("id-ID")}
                          </p>
                          <p className="text-[10px] text-green-600">
                            Konfidensitas {Math.round(uploadState.confidence * 100)}% — sudah diisi otomatis
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nominal tidak terbaca — isi manual di kolom Nominal</p>
                    )}
                    <a href={uploadState.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Lihat file <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      className="ml-3 text-xs text-muted-foreground hover:text-destructive flex items-center gap-0.5"
                      onClick={() => { setUploadState({ status: "idle" }); setForm((f) => ({ ...f, receiptUrl: "" })); }}
                    >
                      <X className="h-3 w-3" /> Ganti foto
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Catatan</Label>
              <Textarea
                rows={2}
                placeholder="Catatan tambahan (opsional)"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <Separator />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button disabled={isPending} onClick={handleSubmit} className="gap-2">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editTarget ? "Simpan Perubahan" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── AlertDialog: Hapus ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Hapus Pengeluaran?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{ACCT_TYPE_LABEL[deleteTarget.coaAccountType ?? ""] ?? deleteTarget.category}</strong>
                  {" — "}{deleteTarget.description ?? "-"}<br />
                  <strong className="text-destructive">{formatRupiah(deleteTarget.amount)}</strong>
                  {" pada "}{formatDate(deleteTarget.paidAt)}
                  <br /><br />
                  Tindakan ini tidak dapat dibatalkan.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
