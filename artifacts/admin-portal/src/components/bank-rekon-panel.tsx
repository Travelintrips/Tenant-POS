import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, RefreshCw, CheckCircle2, XCircle, AlertTriangle, HelpCircle,
  Zap, Search, ChevronRight, FileUp, BarChart2, Banknote, Receipt, FileCheck,
  FileSpreadsheet, MessageCircle, Send, ClipboardList, LayoutDashboard,
  TrendingUp, Lock, BookOpen, Plus, Pencil, Trash2, AlertCircle, LockOpen,
  GitCompareArrows, ShieldCheck, ShieldAlert, Link2, Timer, WifiOff, Wifi,
  Eye, Loader2,
} from "lucide-react";

const formatRp = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    parseFloat(String(n ?? 0)) || 0
  );

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}
function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AppContext = {
  ownerApp: string; sourceApp: string;
  ownerTenantId: number | null; ownerCompanyId: number | null;
  role: string; isBizPortal: boolean; isFullAccess: boolean;
};
type MutationStatus = "unmatched" | "matched" | "duplicate_need_review" | "approved" | "rejected";
type BankMutation = {
  id: number; bankAccountId: string | null; transactionDate: string;
  description: string; creditAmount: string; debitAmount: string;
  amount: string; direction: string; mutationKey: string;
  normalizedDescription: string; providerName: string | null;
  providerOrderId: string | null; status: MutationStatus;
  matchedPaymentId: number | null; matchedOrderId: number | null; siteId: number | null;
};
type MatchCandidate = {
  id: number; mutationId: number; candidateType: string; candidateId: number;
  matchScore: number; matchReason: string | null;
  amountMatch: boolean; dateMatch: boolean; nameMatch: boolean;
  orderIdMatch: boolean; proofMatch: boolean; status: string;
  detail: Record<string, unknown>;
};
type MutationWithMatches = { mutation: BankMutation; matches: MatchCandidate[] };
type KpiData = {
  mutations: { unmatched: number; matched: number; approved: number; rejected: number; duplicateNeedReview: number; total: number };
  paymentEvents: { pending: number; waitingConfirmation: number; confirmed: number; rejected: number; total: number; totalConfirmedAmount: number };
  invoices: { paid: number; partial: number; unpaid: number; overdue: number; totalPaidAmount: number; totalPartialPaidAmount: number };
};
type BankReconAuditLog = {
  id: number; mutationId: number | null; matchId: number | null;
  financePaymentEventId: number | null; journalId: string | null;
  action: string; actionApp: string | null; actionUserId: string | null;
  actionRole: string | null; ownerApp: string | null; ownerCompanyId: number | null;
  ownerTenantId: number | null; sourceApp: string | null; sourceModule: string | null;
  beforeValue: unknown; afterValue: unknown; metadata: unknown;
  ipAddress: string | null; userAgent: string | null; createdAt: string;
};
type LaporanRow = {
  year_month: string; total: number; approved: number; rejected: number;
  unmatched: number; matched: number; duplicate: number;
  total_in: string; total_out: string; approved_amount: string;
};
type ClosingPeriod = {
  id: number; yearMonth: string; lockedAt: string;
  lockedBy: string | null; lockedByRole: string | null; notes: string | null;
};
type CoaRule = {
  id: number; providerName: string | null; direction: string;
  descriptionPattern: string | null; coaCode: string; coaName: string;
  description: string | null; isActive: boolean; createdAt: string; updatedAt: string;
};
type AuditException = {
  ok: boolean; totalIssues: number; checkedAt: string;
  issues: Record<string, { count: number; items?: unknown[]; note?: string }>;
};
type KesesuaianRow = {
  id: number; transactionDate: string; description: string; amount: string;
  direction: string; status: string; providerName: string | null; providerOrderId: string | null;
  bankAccountId: string | null; ownerTenantId: number | null;
  matchId: number | null; candidateType: string | null; candidateId: number | null;
  matchScore: number | null; amountMatch: boolean | null;
  refAmount: string | null; refMethod: string | null; refReference: string | null;
  refTenant: string | null; refStatus: string | null; selisih: string | null;
};
type KesesuaianData = {
  summary: { total: number; approved: number; unmatched: number; withSelisih: number };
  rows: KesesuaianRow[];
};

// ─── Status badges ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MutationStatus, { label: string; color: string; icon: React.ReactNode }> = {
  unmatched:             { label: "Tidak Cocok",  color: "bg-gray-100 text-gray-700 border-gray-300",      icon: <HelpCircle className="h-3 w-3" /> },
  matched:               { label: "Ada Kandidat", color: "bg-blue-100 text-blue-700 border-blue-300",      icon: <Search className="h-3 w-3" /> },
  duplicate_need_review: { label: "Duplikat",     color: "bg-yellow-100 text-yellow-800 border-yellow-300",icon: <AlertTriangle className="h-3 w-3" /> },
  approved:              { label: "Disetujui",    color: "bg-green-100 text-green-800 border-green-300",   icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected:              { label: "Ditolak",      color: "bg-red-100 text-red-700 border-red-300",         icon: <XCircle className="h-3 w-3" /> },
};
function StatusBadge({ status }: { status: MutationStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unmatched;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 95 ? "bg-green-100 text-green-800" : score >= 80 ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-600";
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-bold ${color}`}>{score}</span>;
}

const AUDIT_ACTION_STYLES: Record<string, { label: string; color: string }> = {
  import_mutasi:    { label: "Import",       color: "bg-blue-100 text-blue-800 border-blue-200" },
  auto_match:       { label: "Auto Match",   color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  need_review:      { label: "Need Review",  color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  manual_match:     { label: "Manual Match", color: "bg-purple-100 text-purple-800 border-purple-200" },
  approved:         { label: "Disetujui",    color: "bg-green-100 text-green-800 border-green-200" },
  rejected:         { label: "Ditolak",      color: "bg-red-100 text-red-800 border-red-200" },
  run_matching:     { label: "Run Matching", color: "bg-sky-100 text-sky-800 border-sky-200" },
  export_sheet:     { label: "Export Sheet", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  send_reminder_wa: { label: "Kirim WA",     color: "bg-orange-100 text-orange-800 border-orange-200" },
  closing_lock:     { label: "Closing Lock", color: "bg-slate-100 text-slate-800 border-slate-200" },
  closing_unlock:   { label: "Buka Kunci",   color: "bg-rose-100 text-rose-800 border-rose-200" },
};
function AuditActionBadge({ action }: { action: string }) {
  const s = AUDIT_ACTION_STYLES[action];
  if (!s) return <span className="inline-flex rounded border px-2 py-0.5 text-[10px] font-mono bg-gray-50 text-gray-600 border-gray-200">{action}</span>;
  return <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${s.color}`}>{s.label}</span>;
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function BankRekonPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Context ──────────────────────────────────────────────────────────────────
  const { data: appCtx } = useQuery<AppContext>({
    queryKey: ["/api/bank-reconciliation/context"],
    queryFn: async () => {
      const r = await apiFetch("/api/bank-reconciliation/context");
      if (!r.ok) return { ownerApp: "tenant_management", sourceApp: "tenant_management", ownerTenantId: null, ownerCompanyId: null, role: "admin", isBizPortal: false, isFullAccess: false };
      return r.json();
    },
    staleTime: 60_000,
  });

  // ── Mutasi filters ───────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDirection, setFilterDirection] = useState("all");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedMutation, setSelectedMutation] = useState<BankMutation | null>(null);
  const [manualCandidateType, setManualCandidateType] = useState<"payment" | "invoice">("payment");
  const [manualCandidateId, setManualCandidateId] = useState("");

  // ── Audit filters ────────────────────────────────────────────────────────────
  const [auditAction, setAuditAction] = useState("all");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");

  // ── Laporan filter ───────────────────────────────────────────────────────────
  const [laporanYear, setLaporanYear] = useState(new Date().getFullYear());

  // ── Cek Kesesuaian filters ────────────────────────────────────────────────────
  const [kesesuaianStatus, setKesesuaianStatus] = useState("all");
  const [kesesuaianDateFrom, setKesesuaianDateFrom] = useState("");
  const [kesesuaianDateTo, setKesesuaianDateTo] = useState("");

  // ── Closing dialog ───────────────────────────────────────────────────────────
  const [showClosingDialog, setShowClosingDialog] = useState(false);
  const [closingYearMonth, setClosingYearMonth] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [closingNotes, setClosingNotes] = useState("");

  // ── COA dialog ───────────────────────────────────────────────────────────────
  const [showCoaDialog, setShowCoaDialog] = useState(false);
  const [editingCoa, setEditingCoa] = useState<CoaRule | null>(null);
  const [coaForm, setCoaForm] = useState({ providerName: "", direction: "ALL", descriptionPattern: "", coaCode: "", coaName: "", description: "", isActive: true });

  // ── Exception Dashboard filter ────────────────────────────────────────────────
  const [exceptionFilter, setExceptionFilter] = useState<"need_review" | "unmatched" | "duplicate" | "belum_jurnal" | "closed">("need_review");

  // ── Sinkronisasi Otomatis ─────────────────────────────────────────────────────
  type SyncConfig = {
    enabled: boolean; spreadsheetId: string; sheetName: string; bankAccountId: string;
    intervalMinutes: number; lastSyncAt: string | null;
    lastSyncResult: { success: boolean; newRows: number; totalRows: number; error: string | null; at: string } | null;
  };
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncForm, setSyncForm] = useState<Omit<SyncConfig, "lastSyncAt" | "lastSyncResult">>({
    enabled: false, spreadsheetId: "", sheetName: "", bankAccountId: "", intervalMinutes: 5,
  });

  const { data: syncConfig, refetch: refetchSyncConfig } = useQuery<SyncConfig>({
    queryKey: ["/api/bank-reconciliation/sync-config"],
    queryFn: async () => { const r = await apiFetch("/api/bank-reconciliation/sync-config"); if (!r.ok) throw new Error(); return r.json(); },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (syncConfig) {
      setSyncForm({
        enabled: syncConfig.enabled,
        spreadsheetId: syncConfig.spreadsheetId,
        sheetName: syncConfig.sheetName ?? "",
        bankAccountId: syncConfig.bankAccountId ?? "",
        intervalMinutes: syncConfig.intervalMinutes ?? 5,
      });
    }
  }, [syncConfig]);

  // Auto-refresh data saat sinkronisasi aktif
  useEffect(() => {
    if (!syncConfig?.enabled) return;
    const ms = (syncConfig.intervalMinutes ?? 5) * 60_000;
    const id = setInterval(() => {
      refetch();
      refetchKpi();
      refetchSyncConfig();
    }, ms);
    return () => clearInterval(id);
  }, [syncConfig?.enabled, syncConfig?.intervalMinutes]);

  const saveSyncConfigMut = useMutation({
    mutationFn: async (cfg: typeof syncForm) => {
      const r = await apiFetch("/api/bank-reconciliation/sync-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Gagal menyimpan"); return d;
    },
    onSuccess: () => { toast({ title: "Konfigurasi disimpan" }); refetchSyncConfig(); },
    onError: (e: Error) => toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" }),
  });

  const syncNowMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/api/bank-reconciliation/sync-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Gagal sinkronisasi"); return d as { newRows: number; totalRows: number; skipped: number; autoMatched: number };
    },
    onSuccess: (d) => {
      toast({ title: "Sinkronisasi selesai", description: `${d.newRows} baris baru, ${d.skipped} dilewati, ${d.autoMatched} auto-match` });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/kpi"] });
      refetchSyncConfig();
    },
    onError: (e: Error) => toast({ title: "Sinkronisasi gagal", description: e.message, variant: "destructive" }),
  });

  // ── Preview Google Sheets (dialog sinkronisasi) ───────────────────────────────
  type SyncSheetPreview = { headers: string[]; rows: string[][]; total: number };
  const [syncPreview, setSyncPreview]               = useState<SyncSheetPreview | null>(null);
  const [syncPreviewLoading, setSyncPreviewLoading] = useState(false);
  const [syncPreviewError, setSyncPreviewError]     = useState<string | null>(null);
  const syncPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = syncForm.spreadsheetId.trim();
    if (!id) {
      setSyncPreview(null);
      setSyncPreviewError(null);
      return;
    }
    if (syncPreviewTimerRef.current) clearTimeout(syncPreviewTimerRef.current);
    syncPreviewTimerRef.current = setTimeout(async () => {
      setSyncPreviewLoading(true);
      setSyncPreviewError(null);
      setSyncPreview(null);
      try {
        const params = new URLSearchParams({ spreadsheetId: id });
        if (syncForm.sheetName) params.set("sheetName", syncForm.sheetName);
        const r = await apiFetch(`/api/bank-reconciliation/sheet-preview?${params}`);
        const d = await r.json();
        if (!r.ok) { setSyncPreviewError(d.error ?? "Gagal mengambil preview"); return; }
        setSyncPreview(d as SyncSheetPreview);
      } catch {
        setSyncPreviewError("Gagal terhubung ke server");
      } finally {
        setSyncPreviewLoading(false);
      }
    }, 900);
    return () => { if (syncPreviewTimerRef.current) clearTimeout(syncPreviewTimerRef.current); };
  }, [syncForm.spreadsheetId, syncForm.sheetName]);

  // ── Export & WA dialogs ───────────────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);
  const [exportSheetUrl, setExportSheetUrl] = useState(() => localStorage.getItem("bank_rekon_sheet_url") ?? "");
  const [exportSheetTitle, setExportSheetTitle] = useState("");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [showWa, setShowWa] = useState(false);
  const [waTypes, setWaTypes] = useState<string[]>(["unpaid_invoice"]);

  // ── Import dari Google Sheets dialog ─────────────────────────────────────────
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [importSheetUrl, setImportSheetUrl] = useState(() => localStorage.getItem("bank_rekon_import_sheet_url") ?? "");
  const [importSheetName, setImportSheetName] = useState("");
  const [importSheetBankAccount, setImportSheetBankAccount] = useState("");
  type SheetPreview = {
    spreadsheetId: string; sheetName: string | null; totalRows: number; validRows: number;
    headers: string[];
    preview: { transactionDate: string; description: string; amount: string; direction: string; providerName: string | null; providerOrderId: string | null }[];
  };
  const [sheetPreview, setSheetPreview] = useState<SheetPreview | null>(null);
  const [previewError, setPreviewError] = useState("");

  // ── KPI ───────────────────────────────────────────────────────────────────────
  const { data: kpi, refetch: refetchKpi } = useQuery<KpiData>({
    queryKey: ["/api/bank-reconciliation/kpi"],
    queryFn: async () => { const r = await apiFetch("/api/bank-reconciliation/kpi"); if (!r.ok) throw new Error("Gagal memuat KPI"); return r.json(); },
    refetchInterval: 60_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const mutParams = new URLSearchParams();
  if (filterStatus !== "all") mutParams.set("status", filterStatus);
  if (filterDirection !== "all") mutParams.set("direction", filterDirection);
  if (filterProvider) mutParams.set("provider", filterProvider);
  if (filterDateFrom) mutParams.set("dateFrom", filterDateFrom);
  if (filterDateTo) mutParams.set("dateTo", filterDateTo);

  const { data: mutations = [], isLoading, refetch } = useQuery<BankMutation[]>({
    queryKey: ["/api/bank-reconciliation/mutations", mutParams.toString()],
    queryFn: async () => { const r = await apiFetch(`/api/bank-reconciliation/mutations?${mutParams}`); if (!r.ok) throw new Error("Gagal memuat data"); return r.json(); },
  });

  const { data: matchData, isLoading: loadingMatches } = useQuery<MutationWithMatches>({
    queryKey: ["/api/bank-reconciliation/matches", selectedMutation?.id],
    queryFn: async () => { const r = await apiFetch(`/api/bank-reconciliation/matches/${selectedMutation!.id}`); if (!r.ok) throw new Error("Gagal memuat kandidat"); return r.json(); },
    enabled: !!selectedMutation,
  });

  // ── Audit Trail ───────────────────────────────────────────────────────────────
  const auditParams = new URLSearchParams();
  if (auditAction !== "all") auditParams.set("action", auditAction);
  if (auditDateFrom) auditParams.set("date_from", auditDateFrom);
  if (auditDateTo) auditParams.set("date_to", auditDateTo);
  auditParams.set("limit", "100");

  const { data: auditLogsData, isLoading: loadingAuditLogs, refetch: refetchAuditLogs } = useQuery<{ data: BankReconAuditLog[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/bank-reconciliation/audit-logs", auditParams.toString()],
    queryFn: async () => { const r = await apiFetch(`/api/bank-reconciliation/audit-logs?${auditParams}`); if (!r.ok) throw new Error("Gagal memuat audit log"); return r.json(); },
  });
  const auditLogs = auditLogsData?.data ?? [];

  // ── Exception Audit ───────────────────────────────────────────────────────────
  const { data: auditException } = useQuery<AuditException>({
    queryKey: ["/api/bank-reconciliation/audit"],
    queryFn: async () => { const r = await apiFetch("/api/bank-reconciliation/audit"); if (!r.ok) throw new Error(); return r.json(); },
    staleTime: 120_000,
  });

  // ── Dashboard mutations (unfiltered, for exception table) ─────────────────────
  const { data: dashboardMuts = [], refetch: refetchDashboardMuts } = useQuery<BankMutation[]>({
    queryKey: ["/api/bank-reconciliation/mutations", "dashboard-all"],
    queryFn: async () => { const r = await apiFetch("/api/bank-reconciliation/mutations"); if (!r.ok) return []; return r.json(); },
    staleTime: 60_000,
  });

  // ── Laporan ───────────────────────────────────────────────────────────────────
  const { data: laporanData, isLoading: loadingLaporan } = useQuery<{ year: number; rows: LaporanRow[] }>({
    queryKey: ["/api/bank-reconciliation/laporan", laporanYear],
    queryFn: async () => { const r = await apiFetch(`/api/bank-reconciliation/laporan?year=${laporanYear}`); if (!r.ok) throw new Error("Gagal memuat laporan"); return r.json(); },
  });

  // ── Closing Bank ──────────────────────────────────────────────────────────────
  const { data: closingPeriods = [], refetch: refetchClosing } = useQuery<ClosingPeriod[]>({
    queryKey: ["/api/bank-reconciliation/closing"],
    queryFn: async () => { const r = await apiFetch("/api/bank-reconciliation/closing"); if (!r.ok) throw new Error(); return r.json(); },
  });

  // ── COA Rules ─────────────────────────────────────────────────────────────────
  const { data: coaRules = [], refetch: refetchCoa } = useQuery<CoaRule[]>({
    queryKey: ["/api/bank-reconciliation/coa-rules"],
    queryFn: async () => { const r = await apiFetch("/api/bank-reconciliation/coa-rules"); if (!r.ok) throw new Error(); return r.json(); },
  });

  // ── Cek Kesesuaian ────────────────────────────────────────────────────────────
  const kesesuaianParams = new URLSearchParams();
  if (kesesuaianStatus !== "all") kesesuaianParams.set("status", kesesuaianStatus);
  if (kesesuaianDateFrom) kesesuaianParams.set("dateFrom", kesesuaianDateFrom);
  if (kesesuaianDateTo) kesesuaianParams.set("dateTo", kesesuaianDateTo);

  const { data: kesesuaianData, isLoading: loadingKesesuaian, refetch: refetchKesesuaian } = useQuery<KesesuaianData>({
    queryKey: ["/api/bank-reconciliation/cek-kesesuaian", kesesuaianParams.toString()],
    queryFn: async () => { const r = await apiFetch(`/api/bank-reconciliation/cek-kesesuaian?${kesesuaianParams}`); if (!r.ok) throw new Error("Gagal memuat data kesesuaian"); return r.json(); },
    staleTime: 30_000,
  });

  // ── Mutations (API calls) ──────────────────────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData(); fd.append("file", file);
      const r = await apiFetch("/api/bank-reconciliation/import", { method: "POST", body: fd });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Import gagal"); return data;
    },
    onSuccess: (data) => {
      toast({ title: "Import berhasil", description: `${data.imported} mutasi diimport, ${data.autoMatched} auto-match, ${data.duplicates} duplikat` });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/kpi"] });
    },
    onError: (e: Error) => toast({ title: "Import gagal", description: e.message, variant: "destructive" }),
  });

  const runMatchMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/api/bank-reconciliation/run-matching", { method: "POST" });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal"); return data;
    },
    onSuccess: (data) => {
      toast({ title: "Matching selesai", description: `${data.total} diproses — ${data.autoMatched} auto-match, ${data.withCandidates} ada kandidat, ${data.unmatched} tidak cocok` });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/kpi"] });
    },
    onError: (e: Error) => toast({ title: "Matching gagal", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ mutationId, matchId }: { mutationId: number; matchId: number }) => {
      const r = await apiFetch(`/api/bank-reconciliation/${mutationId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal approve"); return data;
    },
    onSuccess: () => {
      toast({ title: "Disetujui" });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/matches", selectedMutation?.id] });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/kpi"] });
      setSelectedMutation(null);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (mutationId: number) => {
      const r = await apiFetch(`/api/bank-reconciliation/${mutationId}/reject`, { method: "POST" });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal reject"); return data;
    },
    onSuccess: () => {
      toast({ title: "Ditolak" });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/kpi"] });
      setSelectedMutation(null);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const manualMatchMut = useMutation({
    mutationFn: async ({ mutationId, candidateType, candidateId }: { mutationId: number; candidateType: string; candidateId: number }) => {
      const r = await apiFetch(`/api/bank-reconciliation/${mutationId}/manual-match`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateType, candidateId }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal"); return data;
    },
    onSuccess: () => {
      toast({ title: "Manual match berhasil" });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/kpi"] });
      setSelectedMutation(null);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const exportSheetMut = useMutation({
    mutationFn: async (payload: { spreadsheetId: string; sheetTitle?: string; dateFrom?: string; dateTo?: string }) => {
      const r = await apiFetch("/api/bank-reconciliation/export-google-sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal export"); return data as { success: boolean; sheetTitle: string; rowCount: number; sheetUrl: string };
    },
    onSuccess: (data) => { toast({ title: "Export berhasil!", description: `${data.rowCount} baris ditulis ke sheet "${data.sheetTitle}"` }); setShowExport(false); },
    onError: (e: Error) => toast({ title: "Export gagal", description: e.message, variant: "destructive" }),
  });

  const previewSheetMut = useMutation({
    mutationFn: async (payload: { spreadsheetId: string; sheetName?: string; bankAccountId?: string }) => {
      const r = await apiFetch("/api/bank-reconciliation/preview-from-sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal membaca sheet");
      return data as SheetPreview & { success: boolean };
    },
    onSuccess: (data) => { setSheetPreview(data); setPreviewError(""); },
    onError: (e: Error) => { setPreviewError(e.message); setSheetPreview(null); },
  });

  const importSheetMut = useMutation({
    mutationFn: async (payload: { spreadsheetId: string; sheetName?: string; bankAccountId?: string }) => {
      const r = await apiFetch("/api/bank-reconciliation/import-from-sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Import gagal");
      return data as { success: boolean; imported: number; autoMatched: number; duplicates: number };
    },
    onSuccess: (data) => {
      toast({ title: "Import dari Sheets berhasil", description: `${data.imported} mutasi diimport, ${data.autoMatched} auto-match, ${data.duplicates} duplikat` });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/kpi"] });
      setShowImportSheet(false);
      setSheetPreview(null);
      setPreviewError("");
    },
    onError: (e: Error) => toast({ title: "Import gagal", description: e.message, variant: "destructive" }),
  });

  const sendWaMut = useMutation({
    mutationFn: async (payload: { types: string[] }) => {
      const r = await apiFetch("/api/bank-reconciliation/send-reminder-wa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal kirim"); return data as { sent: string[]; failed: { ref: string; error: string }[]; skipped: { ref: string; reason: string }[]; summary: Record<string, number> };
    },
    onSuccess: (data) => {
      const total = data.sent.length + data.failed.length + data.skipped.length;
      toast({ title: "Reminder WA selesai", description: `${data.sent.length} terkirim, ${data.failed.length} gagal, ${data.skipped.length} dilewati dari ${total} invoice` });
      setShowWa(false);
    },
    onError: (e: Error) => toast({ title: "Gagal kirim WA", description: e.message, variant: "destructive" }),
  });

  const lockClosingMut = useMutation({
    mutationFn: async ({ yearMonth, notes }: { yearMonth: string; notes?: string }) => {
      const r = await apiFetch(`/api/bank-reconciliation/closing/${yearMonth}/lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal kunci"); return data;
    },
    onSuccess: () => { toast({ title: "Periode dikunci" }); setShowClosingDialog(false); setClosingNotes(""); refetchClosing(); },
    onError: (e: Error) => toast({ title: "Gagal kunci periode", description: e.message, variant: "destructive" }),
  });

  const unlockClosingMut = useMutation({
    mutationFn: async (yearMonth: string) => {
      const r = await apiFetch(`/api/bank-reconciliation/closing/${yearMonth}/lock`, { method: "DELETE" });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal buka"); return data;
    },
    onSuccess: () => { toast({ title: "Periode dibuka kembali" }); refetchClosing(); },
    onError: (e: Error) => toast({ title: "Gagal buka periode", description: e.message, variant: "destructive" }),
  });

  const saveCoaMut = useMutation({
    mutationFn: async (payload: typeof coaForm & { id?: number }) => {
      const { id, ...body } = payload;
      const url = id ? `/api/bank-reconciliation/coa-rules/${id}` : "/api/bank-reconciliation/coa-rules";
      const method = id ? "PUT" : "POST";
      const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal simpan"); return data;
    },
    onSuccess: () => { toast({ title: editingCoa ? "Aturan diperbarui" : "Aturan ditambahkan" }); setShowCoaDialog(false); setEditingCoa(null); setCoaForm({ providerName: "", direction: "ALL", descriptionPattern: "", coaCode: "", coaName: "", description: "", isActive: true }); refetchCoa(); },
    onError: (e: Error) => toast({ title: "Gagal simpan aturan", description: e.message, variant: "destructive" }),
  });

  const deleteCoaMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/api/bank-reconciliation/coa-rules/${id}`, { method: "DELETE" });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Gagal hapus"); return data;
    },
    onSuccess: () => { toast({ title: "Aturan dihapus" }); refetchCoa(); },
    onError: (e: Error) => toast({ title: "Gagal hapus", description: e.message, variant: "destructive" }),
  });

  // ── Stats (from loaded mutations) ────────────────────────────────────────────
  const stats = {
    total: mutations.length,
    unmatched: mutations.filter((m) => m.status === "unmatched").length,
    matched: mutations.filter((m) => m.status === "matched").length,
    duplicate: mutations.filter((m) => m.status === "duplicate_need_review").length,
    approved: mutations.filter((m) => m.status === "approved").length,
    rejected: mutations.filter((m) => m.status === "rejected").length,
  };

  const openCoaEdit = (rule: CoaRule) => {
    setEditingCoa(rule);
    setCoaForm({ providerName: rule.providerName ?? "", direction: rule.direction, descriptionPattern: rule.descriptionPattern ?? "", coaCode: rule.coaCode, coaName: rule.coaName, description: rule.description ?? "", isActive: rule.isActive });
    setShowCoaDialog(true);
  };

  // ── Dashboard computed values ─────────────────────────────────────────────────
  const outstandingIn = dashboardMuts
    .filter((m) => m.status === "unmatched" && m.direction === "IN")
    .reduce((s, m) => s + (parseFloat(m.creditAmount) || 0), 0);
  const belumJurnal = (auditException?.issues?.approved_no_journal?.count ?? 0) as number;
  const dashboardMutItems = dashboardMuts.filter((m) => {
    if (exceptionFilter === "need_review")  return m.status === "matched";
    if (exceptionFilter === "unmatched")    return m.status === "unmatched";
    if (exceptionFilter === "duplicate")    return m.status === "duplicate_need_review";
    if (exceptionFilter === "belum_jurnal") return m.status === "approved";
    if (exceptionFilter === "closed")       return m.status === "rejected";
    return false;
  });

  return (
    <div className="space-y-4">
      {/* ── Main Tabs ── */}
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="mb-0 flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="text-xs flex items-center gap-1.5"><LayoutDashboard className="h-3 w-3" />Dashboard</TabsTrigger>
          <TabsTrigger value="audit-trail" className="text-xs flex items-center gap-1.5"><ClipboardList className="h-3 w-3" />Audit Trail</TabsTrigger>
          <TabsTrigger value="mutasi" className="text-xs flex items-center gap-1.5"><Banknote className="h-3 w-3" />Mutasi</TabsTrigger>
          <TabsTrigger value="laporan" className="text-xs flex items-center gap-1.5"><TrendingUp className="h-3 w-3" />Laporan</TabsTrigger>
          <TabsTrigger value="closing" className="text-xs flex items-center gap-1.5"><Lock className="h-3 w-3" />Closing Bank</TabsTrigger>
          <TabsTrigger value="coa" className="text-xs flex items-center gap-1.5"><BookOpen className="h-3 w-3" />Aturan COA</TabsTrigger>
        </TabsList>

        {/* ══ DASHBOARD TAB ══ */}
        <TabsContent value="dashboard" className="space-y-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-700">Exception Dashboard</h3>

          {/* Row 1: 4 metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-[11px] text-muted-foreground">Total Mutasi</p>
              <p className="text-2xl font-bold mt-1">{kpi?.mutations.total ?? 0}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-[11px] text-green-600">Approved</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{kpi?.mutations.approved ?? 0}</p>
            </div>
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-[11px] text-yellow-700">Need Review</p>
              <p className="text-2xl font-bold text-yellow-800 mt-1">{kpi?.mutations.matched ?? 0}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-[11px] text-red-500">Unmatched</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{kpi?.mutations.unmatched ?? 0}</p>
            </div>
          </div>

          {/* Row 2: 3 metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-[11px] text-yellow-700">Duplikat</p>
              <p className="text-2xl font-bold text-yellow-800 mt-1">{kpi?.mutations.duplicateNeedReview ?? 0}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-[11px] text-muted-foreground">Belum Jurnal</p>
              <p className="text-2xl font-bold mt-1">{belumJurnal}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-[11px] text-blue-600">Outstanding IN</p>
              <p className="text-lg font-bold text-blue-700 mt-1">{formatRp(outstandingIn)}</p>
            </div>
          </div>

          {/* Daftar Exception */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Daftar Exception</h3>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => refetchDashboardMuts()}>
                <RefreshCw className="h-3.5 w-3.5" />Refresh
              </Button>
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap gap-2">
              {([
                { key: "need_review",  label: "Need Review",      count: kpi?.mutations.matched ?? 0 },
                { key: "unmatched",    label: "Unmatched",        count: kpi?.mutations.unmatched ?? 0 },
                { key: "duplicate",    label: "Duplikat",         count: kpi?.mutations.duplicateNeedReview ?? 0 },
                { key: "belum_jurnal", label: "Belum Jurnal",     count: belumJurnal },
                { key: "closed",       label: "Closed Violations", count: kpi?.mutations.rejected ?? 0 },
              ] as const).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setExceptionFilter(key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    exceptionFilter === key
                      ? "bg-orange-500 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${exceptionFilter === key ? "bg-white/30 text-white" : "bg-orange-100 text-orange-700"}`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Exception table */}
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="py-2 text-xs w-14">ID</TableHead>
                    <TableHead className="py-2 text-xs whitespace-nowrap">Tanggal</TableHead>
                    <TableHead className="py-2 text-xs">Keterangan</TableHead>
                    <TableHead className="py-2 text-xs w-16">Arah</TableHead>
                    <TableHead className="py-2 text-xs text-right">Jumlah</TableHead>
                    <TableHead className="py-2 text-xs">Rekening</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboardMutItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-green-500 opacity-60" />
                        <p>Tidak ada exception untuk kategori ini</p>
                      </TableCell>
                    </TableRow>
                  ) : dashboardMutItems.map((m) => (
                    <TableRow key={m.id} className="text-xs">
                      <TableCell className="py-2 font-mono text-muted-foreground">#{m.id}</TableCell>
                      <TableCell className="py-2 whitespace-nowrap font-mono">{m.transactionDate}</TableCell>
                      <TableCell className="py-2">
                        <p>{m.description}</p>
                        {m.providerOrderId && <p className="text-[10px] text-muted-foreground font-mono">{m.providerOrderId}</p>}
                      </TableCell>
                      <TableCell className="py-2">
                        <span className={`inline-flex rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase ${m.direction === "IN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{m.direction}</span>
                      </TableCell>
                      <TableCell className="py-2 text-right font-medium whitespace-nowrap">
                        {formatRp(m.direction === "IN" ? m.creditAmount : m.debitAmount)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">{m.bankAccountId ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Final Audit — Production Readiness */}
          <div className="rounded-lg border bg-white p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Final Audit — Production Readiness</p>
              <p className="text-xs text-muted-foreground mt-0.5">Validasi integritas data: duplikat jurnal, invoice overpaid, closing dengan selisih, dll.</p>
            </div>
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white shrink-0"
              onClick={() => { void refetchKpi(); }}
            >
              Jalankan Audit
            </Button>
          </div>
        </TabsContent>

        {/* ══ MUTASI TAB ══ */}
        <TabsContent value="mutasi" className="space-y-4 mt-4">
          {/* Action Toolbar */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}>
              {importMutation.isPending ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Mengimport...</> : <><FileUp className="mr-2 h-3.5 w-3.5" />Import CSV</>}
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { importMutation.mutate(f); e.target.value = ""; } }} />
            <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => { setShowImportSheet(true); setSheetPreview(null); setPreviewError(""); }} disabled={importSheetMut.isPending}>
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Import dari Sheets
            </Button>
            {/* Sinkronisasi Otomatis button */}
            <Button
              variant="outline"
              size="sm"
              className={syncConfig?.enabled
                ? "border-teal-400 text-teal-700 bg-teal-50 hover:bg-teal-100"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"}
              onClick={() => setShowSyncDialog(true)}
            >
              {syncConfig?.enabled
                ? <><Wifi className="mr-1.5 h-3.5 w-3.5 text-teal-600" />Sinkron Aktif</>
                : <><WifiOff className="mr-1.5 h-3.5 w-3.5" />Sinkronisasi</>}
            </Button>
            <Button variant="outline" size="sm" onClick={() => runMatchMutation.mutate()} disabled={runMatchMutation.isPending}>
              {runMatchMutation.isPending ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Memproses...</> : <><Zap className="mr-2 h-3.5 w-3.5" />Jalankan Auto-Match</>}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { refetch(); refetchKpi(); }} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <div className="w-px bg-border h-8 mx-1" />
            <Button variant="outline" size="sm" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => setShowExport(true)}>
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Export Google Sheets
            </Button>
            <Button variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => setShowWa(true)}>
              <MessageCircle className="mr-2 h-3.5 w-3.5" />Kirim Reminder WA
            </Button>
          </div>

          <Alert className="border-blue-200 bg-blue-50 py-3">
            <BarChart2 className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-700 text-xs">
              Format CSV: kolom <strong>tanggal</strong>, <strong>keterangan</strong>, <strong>kredit</strong>, <strong>debet</strong> (atau <strong>nominal</strong>). Baris pertama adalah header.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="unmatched">Tidak Cocok</SelectItem>
                  <SelectItem value="matched">Ada Kandidat</SelectItem>
                  <SelectItem value="duplicate_need_review">Duplikat</SelectItem>
                  <SelectItem value="approved">Disetujui</SelectItem>
                  <SelectItem value="rejected">Ditolak</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Arah</Label>
              <Select value={filterDirection} onValueChange={setFilterDirection}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">IN & OUT</SelectItem>
                  <SelectItem value="IN">Masuk (IN)</SelectItem>
                  <SelectItem value="OUT">Keluar (OUT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Provider</Label>
              <Input className="h-8 w-36 text-xs" placeholder="GoPay / all" value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dari Tanggal</Label>
              <Input type="date" className="h-8 text-xs" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sampai</Label>
              <Input type="date" className="h-8 text-xs" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
            </div>
            {(filterStatus !== "all" || filterDirection !== "all" || filterProvider || filterDateFrom || filterDateTo) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterStatus("all"); setFilterDirection("all"); setFilterProvider(""); setFilterDateFrom(""); setFilterDateTo(""); }}>
                Reset Filter
              </Button>
            )}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs whitespace-nowrap">Tanggal</TableHead>
                  <TableHead className="text-xs">Keterangan</TableHead>
                  <TableHead className="text-xs text-right">Kredit</TableHead>
                  <TableHead className="text-xs text-right">Debet</TableHead>
                  <TableHead className="text-xs">Arah</TableHead>
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs">Mutation Key</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">Memuat data...</TableCell></TableRow>}
                {!isLoading && mutations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                      <Upload className="mx-auto mb-2 h-8 w-8 opacity-25" /><p>Belum ada data mutasi.</p><p className="text-xs mt-1">Import file CSV mutasi rekening untuk memulai.</p>
                    </TableCell>
                  </TableRow>
                )}
                {mutations.map((m) => (
                  <TableRow key={m.id} className={m.status === "approved" ? "bg-green-50/40" : m.status === "duplicate_need_review" ? "bg-yellow-50/40" : ""}>
                    <TableCell className="text-xs whitespace-nowrap">{m.transactionDate}</TableCell>
                    <TableCell className="text-xs max-w-xs">
                      <p className="truncate">{m.description}</p>
                      {m.providerOrderId && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{m.providerOrderId}</p>}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium text-green-700">{parseFloat(m.creditAmount) > 0 ? formatRp(m.creditAmount) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-medium text-red-700">{parseFloat(m.debitAmount) > 0 ? formatRp(m.debitAmount) : "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.direction === "IN" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{m.direction}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.providerName ? <Badge variant="outline" className="text-[10px] px-1.5 border-purple-300 text-purple-700 bg-purple-50">{m.providerName}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{m.mutationKey}</TableCell>
                    <TableCell><StatusBadge status={m.status} /></TableCell>
                    <TableCell className="text-center">
                      {m.status !== "approved" && m.status !== "rejected" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedMutation(m)}>
                          <ChevronRight className="h-3.5 w-3.5" />Tinjau
                        </Button>
                      )}
                      {m.status === "approved" && <span className="text-xs text-green-600">✓ Selesai</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ══ AUDIT TRAIL TAB ══ */}
        <TabsContent value="audit-trail" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Aksi</Label>
              <Select value={auditAction} onValueChange={setAuditAction}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Aksi</SelectItem>
                  <SelectItem value="import_mutasi">Import Mutasi</SelectItem>
                  <SelectItem value="auto_match">Auto Match</SelectItem>
                  <SelectItem value="need_review">Need Review</SelectItem>
                  <SelectItem value="manual_match">Manual Match</SelectItem>
                  <SelectItem value="approved">Disetujui</SelectItem>
                  <SelectItem value="rejected">Ditolak</SelectItem>
                  <SelectItem value="run_matching">Run Matching</SelectItem>
                  <SelectItem value="export_sheet">Export Sheet</SelectItem>
                  <SelectItem value="send_reminder_wa">Kirim WA</SelectItem>
                  <SelectItem value="closing_lock">Closing Lock</SelectItem>
                  <SelectItem value="closing_unlock">Buka Kunci</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dari Tanggal</Label>
              <Input type="date" className="h-8 text-xs" value={auditDateFrom} onChange={(e) => setAuditDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sampai</Label>
              <Input type="date" className="h-8 text-xs" value={auditDateTo} onChange={(e) => setAuditDateTo(e.target.value)} />
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetchAuditLogs()} disabled={loadingAuditLogs}>
              <RefreshCw className={`h-4 w-4 ${loadingAuditLogs ? "animate-spin" : ""}`} />
            </Button>
            {(auditAction !== "all" || auditDateFrom || auditDateTo) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setAuditAction("all"); setAuditDateFrom(""); setAuditDateTo(""); }}>Reset Filter</Button>
            )}
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs whitespace-nowrap">Waktu</TableHead>
                  <TableHead className="text-xs">Aksi</TableHead>
                  <TableHead className="text-xs">Mutation ID</TableHead>
                  <TableHead className="text-xs">Match / Journal</TableHead>
                  <TableHead className="text-xs">User / Role</TableHead>
                  <TableHead className="text-xs">App</TableHead>
                  <TableHead className="text-xs">Module</TableHead>
                  <TableHead className="text-xs">Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAuditLogs && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">Memuat data...</TableCell></TableRow>}
                {!loadingAuditLogs && auditLogs.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm"><ClipboardList className="mx-auto mb-2 h-8 w-8 opacity-25" /><p>Belum ada data audit log.</p></TableCell></TableRow>
                )}
                {auditLogs.map((log) => (
                  <TableRow key={log.id} className="text-xs">
                    <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap font-mono">{fmtDateTime(log.createdAt)}</TableCell>
                    <TableCell><AuditActionBadge action={log.action} /></TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{log.mutationId ?? "—"}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{log.matchId ? `M:${log.matchId}` : ""}{log.matchId && log.journalId ? " / " : ""}{log.journalId ? `J:${log.journalId}` : ""}{!log.matchId && !log.journalId ? "—" : ""}</TableCell>
                    <TableCell><span className="font-medium">{log.actionUserId ?? "—"}</span>{log.actionRole && <span className="ml-1 text-[10px] text-muted-foreground">({log.actionRole})</span>}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{log.ownerApp ?? "—"}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{log.sourceModule ?? "—"}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground max-w-xs">
                      {log.metadata ? <span className="truncate block">{JSON.stringify(log.metadata)}</span> : log.afterValue ? <span className="truncate block">{JSON.stringify(log.afterValue)}</span> : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {auditLogsData && auditLogsData.total > 100 && (
            <p className="text-xs text-muted-foreground text-center">Menampilkan 100 dari {auditLogsData.total} entri. Gunakan filter untuk mempersempit.</p>
          )}
        </TabsContent>

        {/* ══ LAPORAN TAB ══ */}
        <TabsContent value="laporan" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium">Tahun</Label>
            <Select value={String(laporanYear)} onValueChange={(v) => setLaporanYear(parseInt(v))}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2026, 2025, 2024, 2023].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs whitespace-nowrap">Bulan</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Disetujui</TableHead>
                  <TableHead className="text-xs text-right">Ditolak</TableHead>
                  <TableHead className="text-xs text-right">Tdk Cocok</TableHead>
                  <TableHead className="text-xs text-right">Ada Kandidat</TableHead>
                  <TableHead className="text-xs text-right">Duplikat</TableHead>
                  <TableHead className="text-xs text-right">Total Masuk</TableHead>
                  <TableHead className="text-xs text-right">Total Keluar</TableHead>
                  <TableHead className="text-xs text-right">Dikonfirmasi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLaporan && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">Memuat laporan...</TableCell></TableRow>}
                {!loadingLaporan && (!laporanData?.rows || laporanData.rows.length === 0) && (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground text-sm"><TrendingUp className="mx-auto mb-2 h-8 w-8 opacity-25" /><p>Tidak ada data laporan untuk tahun {laporanYear}.</p></TableCell></TableRow>
                )}
                {laporanData?.rows.map((row) => (
                  <TableRow key={row.year_month} className="text-xs">
                    <TableCell className="font-medium whitespace-nowrap">{fmtMonth(row.year_month)}</TableCell>
                    <TableCell className="text-right">{row.total}</TableCell>
                    <TableCell className="text-right text-green-700 font-medium">{row.approved}</TableCell>
                    <TableCell className="text-right text-red-600">{row.rejected}</TableCell>
                    <TableCell className="text-right text-gray-500">{row.unmatched}</TableCell>
                    <TableCell className="text-right text-blue-600">{row.matched}</TableCell>
                    <TableCell className="text-right text-yellow-700">{row.duplicate}</TableCell>
                    <TableCell className="text-right font-medium text-green-700">{formatRp(row.total_in)}</TableCell>
                    <TableCell className="text-right font-medium text-red-600">{formatRp(row.total_out)}</TableCell>
                    <TableCell className="text-right font-medium text-emerald-700">{formatRp(row.approved_amount)}</TableCell>
                  </TableRow>
                ))}
                {laporanData?.rows && laporanData.rows.length > 0 && (() => {
                  const totals = laporanData.rows.reduce((acc, r) => ({
                    total: acc.total + r.total, approved: acc.approved + r.approved,
                    rejected: acc.rejected + r.rejected, unmatched: acc.unmatched + r.unmatched,
                    matched: acc.matched + r.matched, duplicate: acc.duplicate + r.duplicate,
                    total_in: acc.total_in + parseFloat(r.total_in), total_out: acc.total_out + parseFloat(r.total_out),
                    approved_amount: acc.approved_amount + parseFloat(r.approved_amount),
                  }), { total: 0, approved: 0, rejected: 0, unmatched: 0, matched: 0, duplicate: 0, total_in: 0, total_out: 0, approved_amount: 0 });
                  return (
                    <TableRow className="text-xs font-bold border-t-2 bg-muted/30">
                      <TableCell>TOTAL {laporanYear}</TableCell>
                      <TableCell className="text-right">{totals.total}</TableCell>
                      <TableCell className="text-right text-green-700">{totals.approved}</TableCell>
                      <TableCell className="text-right text-red-600">{totals.rejected}</TableCell>
                      <TableCell className="text-right">{totals.unmatched}</TableCell>
                      <TableCell className="text-right text-blue-600">{totals.matched}</TableCell>
                      <TableCell className="text-right text-yellow-700">{totals.duplicate}</TableCell>
                      <TableCell className="text-right text-green-700">{formatRp(totals.total_in)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatRp(totals.total_out)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{formatRp(totals.approved_amount)}</TableCell>
                    </TableRow>
                  );
                })()}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ══ CLOSING BANK TAB ══ */}
        <TabsContent value="closing" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Closing Periode Bank</p>
              <p className="text-xs text-muted-foreground mt-0.5">Kunci periode rekonsiliasi agar tidak bisa diubah. Data yang sudah dikunci tidak dapat di-approve atau di-reject.</p>
            </div>
            <Button size="sm" onClick={() => setShowClosingDialog(true)}>
              <Lock className="mr-2 h-4 w-4" />Kunci Periode
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">Periode</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Dikunci Pada</TableHead>
                  <TableHead className="text-xs">Dikunci Oleh</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Catatan</TableHead>
                  <TableHead className="text-xs text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closingPeriods.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm"><Lock className="mx-auto mb-2 h-8 w-8 opacity-25" /><p>Belum ada periode yang dikunci.</p></TableCell></TableRow>
                )}
                {closingPeriods.map((p) => (
                  <TableRow key={p.id} className="text-xs">
                    <TableCell className="font-semibold">{fmtMonth(p.yearMonth)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground font-mono text-[10px]">{fmtDateTime(p.lockedAt)}</TableCell>
                    <TableCell className="font-mono text-[10px]">{p.lockedBy ?? "—"}</TableCell>
                    <TableCell><span className="inline-flex rounded border px-2 py-0.5 text-[10px] bg-slate-50 text-slate-700 border-slate-200">{p.lockedByRole ?? "—"}</span></TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">{p.notes ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:bg-red-50" onClick={() => unlockClosingMut.mutate(p.yearMonth)} disabled={unlockClosingMut.isPending}>
                        <LockOpen className="mr-1 h-3 w-3" />Buka
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ══ ATURAN COA TAB ══ */}
        <TabsContent value="coa" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Aturan COA (Chart of Accounts)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Peta otomatis: provider / pola deskripsi → kode jurnal akuntansi.</p>
            </div>
            <Button size="sm" onClick={() => { setEditingCoa(null); setCoaForm({ providerName: "", direction: "ALL", descriptionPattern: "", coaCode: "", coaName: "", description: "", isActive: true }); setShowCoaDialog(true); }}>
              <Plus className="mr-2 h-4 w-4" />Tambah Aturan
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs">Arah</TableHead>
                  <TableHead className="text-xs">Pola Deskripsi</TableHead>
                  <TableHead className="text-xs">Kode COA</TableHead>
                  <TableHead className="text-xs">Nama COA</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coaRules.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm"><BookOpen className="mx-auto mb-2 h-8 w-8 opacity-25" /><p>Belum ada aturan COA.</p></TableCell></TableRow>
                )}
                {coaRules.map((rule) => (
                  <TableRow key={rule.id} className="text-xs">
                    <TableCell>{rule.providerName ? <Badge variant="outline" className="text-[10px] px-1.5 border-purple-300 text-purple-700 bg-purple-50">{rule.providerName}</Badge> : <span className="text-muted-foreground">Semua</span>}</TableCell>
                    <TableCell><span className="inline-flex rounded border px-2 py-0.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200">{rule.direction}</span></TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground max-w-xs truncate">{rule.descriptionPattern ?? "—"}</TableCell>
                    <TableCell className="font-mono font-semibold">{rule.coaCode}</TableCell>
                    <TableCell>{rule.coaName}</TableCell>
                    <TableCell>
                      {rule.isActive
                        ? <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700">Aktif</span>
                        : <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500">Nonaktif</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openCoaEdit(rule)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50" onClick={() => { if (confirm("Hapus aturan COA ini?")) deleteCoaMut.mutate(rule.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>


      </Tabs>

      {/* ─── Dialog: Import dari Google Sheets ─── */}
      <Dialog open={showImportSheet} onOpenChange={(o) => { if (!o) { setShowImportSheet(false); setSheetPreview(null); setPreviewError(""); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />Import Mutasi dari Google Sheets
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {/* Info service account */}
            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription className="text-xs text-blue-800">
                Pastikan spreadsheet sudah di-share (Editor/Viewer) ke Service Account:
                <code className="block mt-1 font-mono text-[10px] break-all select-all bg-blue-100 px-2 py-1 rounded">
                  dheet-286@sheet-498707.iam.gserviceaccount.com
                </code>
              </AlertDescription>
            </Alert>

            {/* Form input */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">URL / ID Google Spreadsheet <span className="text-red-500">*</span></Label>
                <Input
                  className="text-xs"
                  placeholder="https://docs.google.com/spreadsheets/d/... atau ID spreadsheet"
                  value={importSheetUrl}
                  onChange={(e) => { setImportSheetUrl(e.target.value); localStorage.setItem("bank_rekon_import_sheet_url", e.target.value); setSheetPreview(null); setPreviewError(""); }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nama Sheet/Tab (opsional)</Label>
                  <Input className="text-xs" placeholder="Sheet1 (kosong = sheet pertama)" value={importSheetName} onChange={(e) => { setImportSheetName(e.target.value); setSheetPreview(null); }} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">ID Rekening Bank (opsional)</Label>
                  <Input className="text-xs" placeholder="BCA-001" value={importSheetBankAccount} onChange={(e) => setImportSheetBankAccount(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Format panduan */}
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-800">Format kolom yang didukung:</p>
              <div className="grid grid-cols-2 gap-x-4 text-[11px] text-amber-700">
                <div>• <span className="font-mono">Tanggal</span> / <span className="font-mono">Date</span> / <span className="font-mono">Tgl</span></div>
                <div>• <span className="font-mono">Keterangan</span> / <span className="font-mono">Description</span></div>
                <div>• <span className="font-mono">Kredit</span> / <span className="font-mono">Credit</span> / <span className="font-mono">Masuk</span></div>
                <div>• <span className="font-mono">Debet</span> / <span className="font-mono">Debit</span> / <span className="font-mono">Keluar</span></div>
                <div>• <span className="font-mono">Nominal</span> / <span className="font-mono">Amount</span> (opsional)</div>
              </div>
            </div>

            {/* Error */}
            {previewError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{previewError}</AlertDescription>
              </Alert>
            )}

            {/* Preview hasil */}
            {sheetPreview && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div className="text-xs text-emerald-800">
                    <p className="font-semibold">Berhasil membaca spreadsheet</p>
                    <p>{sheetPreview.totalRows} baris data, <strong>{sheetPreview.validRows} baris valid</strong> siap diimport</p>
                    {sheetPreview.sheetName && <p className="text-[11px] text-emerald-600">Sheet: {sheetPreview.sheetName}</p>}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1.5">Preview 5 baris pertama:</p>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-[10px] py-2">Tanggal</TableHead>
                          <TableHead className="text-[10px] py-2">Keterangan</TableHead>
                          <TableHead className="text-[10px] py-2 text-right">Nominal</TableHead>
                          <TableHead className="text-[10px] py-2">Arah</TableHead>
                          <TableHead className="text-[10px] py-2">Provider</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sheetPreview.preview.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-[10px] py-1.5 font-mono">{row.transactionDate}</TableCell>
                            <TableCell className="text-[10px] py-1.5 max-w-[200px] truncate">{row.description}</TableCell>
                            <TableCell className="text-[10px] py-1.5 text-right font-medium">{formatRp(row.amount)}</TableCell>
                            <TableCell className="text-[10px] py-1.5">
                              <span className={`inline-flex rounded px-1.5 py-0.5 font-semibold ${row.direction === "IN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{row.direction}</span>
                            </TableCell>
                            <TableCell className="text-[10px] py-1.5 text-muted-foreground">{row.providerName ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {sheetPreview.validRows > 5 && (
                    <p className="text-[11px] text-muted-foreground mt-1">... dan {sheetPreview.validRows - 5} baris lainnya</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => { setShowImportSheet(false); setSheetPreview(null); setPreviewError(""); }}>Batal</Button>
            {!sheetPreview ? (
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                disabled={!importSheetUrl.trim() || previewSheetMut.isPending}
                onClick={() => previewSheetMut.mutate({ spreadsheetId: importSheetUrl.trim(), sheetName: importSheetName.trim() || undefined, bankAccountId: importSheetBankAccount.trim() || undefined })}
              >
                {previewSheetMut.isPending ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Membaca...</> : <><Search className="mr-2 h-3.5 w-3.5" />Baca & Preview</>}
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => { setSheetPreview(null); setPreviewError(""); }}>
                  Ubah Sheet
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={importSheetMut.isPending || sheetPreview.validRows === 0}
                  onClick={() => importSheetMut.mutate({ spreadsheetId: importSheetUrl.trim(), sheetName: importSheetName.trim() || undefined, bankAccountId: importSheetBankAccount.trim() || undefined })}
                >
                  {importSheetMut.isPending
                    ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Mengimport...</>
                    : <><FileUp className="mr-2 h-3.5 w-3.5" />Import {sheetPreview.validRows} Mutasi</>}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Export Google Sheets ─── */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-green-600" />Export Laporan ke Google Sheets</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label className="text-xs">URL / ID Google Spreadsheet <span className="text-red-500">*</span></Label>
              <Input className="text-xs" placeholder="https://docs.google.com/spreadsheets/d/..." value={exportSheetUrl} onChange={(e) => { setExportSheetUrl(e.target.value); localStorage.setItem("bank_rekon_sheet_url", e.target.value); }} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Judul Sheet (opsional)</Label>
              <Input className="text-xs" placeholder="Rekonsiliasi Bank Juni 2026" value={exportSheetTitle} onChange={(e) => setExportSheetTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Dari Tanggal</Label><Input type="date" className="text-xs" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Sampai Tanggal</Label><Input type="date" className="text-xs" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowExport(false)}>Batal</Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={!exportSheetUrl.trim() || exportSheetMut.isPending} onClick={() => exportSheetMut.mutate({ spreadsheetId: exportSheetUrl.trim(), sheetTitle: exportSheetTitle.trim() || undefined, dateFrom: exportDateFrom || undefined, dateTo: exportDateTo || undefined })}>
              {exportSheetMut.isPending ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Mengexport...</> : <><FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Export Sekarang</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Sinkronisasi Otomatis ─── */}
      <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-teal-600" />Sinkronisasi Otomatis Google Sheets
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {/* Status terakhir */}
            {syncConfig?.lastSyncAt && (
              <div className={`rounded-md border p-3 flex items-start gap-3 ${syncConfig.lastSyncResult?.success ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                {syncConfig.lastSyncResult?.success
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  : <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />}
                <div className="text-xs">
                  <p className="font-semibold">
                    {syncConfig.lastSyncResult?.success ? "Sinkronisasi terakhir berhasil" : "Sinkronisasi terakhir gagal"}
                  </p>
                  <p className="text-muted-foreground">
                    {new Date(syncConfig.lastSyncAt).toLocaleString("id-ID")}
                    {syncConfig.lastSyncResult?.success && ` — ${syncConfig.lastSyncResult.newRows} baris baru, ${syncConfig.lastSyncResult.totalRows} total dibaca`}
                  </p>
                  {syncConfig.lastSyncResult?.error && <p className="text-red-600 mt-0.5">{syncConfig.lastSyncResult.error}</p>}
                </div>
              </div>
            )}

            {/* Toggle aktif */}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium text-sm">Aktifkan Sinkronisasi Otomatis</p>
                <p className="text-xs text-muted-foreground">Data baru dari spreadsheet akan diimport secara otomatis</p>
              </div>
              <Switch
                checked={syncForm.enabled}
                onCheckedChange={(v) => setSyncForm((f) => ({ ...f, enabled: v }))}
              />
            </div>

            {/* Info service account */}
            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription className="text-xs text-blue-800">
                Pastikan spreadsheet sudah di-share ke Service Account:
                <code className="block mt-1 font-mono text-[10px] break-all select-all bg-blue-100 px-2 py-1 rounded">
                  dheet-286@sheet-498707.iam.gserviceaccount.com
                </code>
              </AlertDescription>
            </Alert>

            {/* URL Spreadsheet */}
            <div className="space-y-1">
              <Label className="text-xs">URL / ID Google Spreadsheet <span className="text-red-500">*</span></Label>
              <Input
                className="text-xs"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={syncForm.spreadsheetId}
                onChange={(e) => setSyncForm((f) => ({ ...f, spreadsheetId: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nama Sheet/Tab (opsional)</Label>
                <Input className="text-xs" placeholder="Sheet1 (kosong = sheet pertama)" value={syncForm.sheetName} onChange={(e) => setSyncForm((f) => ({ ...f, sheetName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ID Rekening Bank (opsional)</Label>
                <Input className="text-xs" placeholder="BCA-001" value={syncForm.bankAccountId} onChange={(e) => setSyncForm((f) => ({ ...f, bankAccountId: e.target.value }))} />
              </div>
            </div>

            {/* ── Preview Google Sheets ── */}
            {(syncPreviewLoading || syncPreview || syncPreviewError) && (
              <div className="rounded-md border overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                  {syncPreviewLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    : syncPreview
                      ? <Eye className="h-3.5 w-3.5 text-emerald-600" />
                      : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                  <span className="text-xs font-medium">
                    {syncPreviewLoading
                      ? "Mengambil preview spreadsheet…"
                      : syncPreview
                        ? `Preview berhasil — ${syncPreview.total} baris data ditemukan`
                        : "Gagal mengambil preview"}
                  </span>
                </div>

                {syncPreviewError && (
                  <div className="px-3 py-2 text-xs text-red-600 bg-red-50">{syncPreviewError}</div>
                )}

                {syncPreview && syncPreview.headers.length > 0 && (
                  <div className="overflow-x-auto max-h-44">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/70 sticky top-0">
                        <tr>
                          {syncPreview.headers.map((h, i) => (
                            <th key={i} className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap border-b">
                              {h || <span className="italic text-muted-foreground/50">kolom {i + 1}</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {syncPreview.rows.map((row, ri) => (
                          <tr key={ri} className="border-b last:border-0 hover:bg-muted/30">
                            {syncPreview.headers.map((_, ci) => (
                              <td key={ci} className="px-2 py-1.5 whitespace-nowrap text-foreground/80 max-w-[140px] truncate">
                                {row[ci] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {syncPreview && syncPreview.headers.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Sheet kosong atau tidak ada data</div>
                )}
              </div>
            )}

            {/* Interval */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Timer className="h-3.5 w-3.5" />Interval Sinkronisasi</Label>
              <Select
                value={String(syncForm.intervalMinutes)}
                onValueChange={(v) => setSyncForm((f) => ({ ...f, intervalMinutes: parseInt(v) }))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Setiap 1 menit</SelectItem>
                  <SelectItem value="5">Setiap 5 menit</SelectItem>
                  <SelectItem value="15">Setiap 15 menit</SelectItem>
                  <SelectItem value="30">Setiap 30 menit</SelectItem>
                  <SelectItem value="60">Setiap 1 jam</SelectItem>
                  <SelectItem value="360">Setiap 6 jam</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Hanya baris baru yang belum ada di sistem yang akan diimport (tidak ada duplikat)</p>
            </div>
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              disabled={!syncConfig?.spreadsheetId || syncNowMut.isPending}
              onClick={() => syncNowMut.mutate()}
            >
              {syncNowMut.isPending
                ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Menyinkronkan...</>
                : <><RefreshCw className="mr-2 h-3.5 w-3.5" />Sinkronkan Sekarang</>}
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => setShowSyncDialog(false)}>Batal</Button>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white"
              disabled={saveSyncConfigMut.isPending}
              onClick={() => saveSyncConfigMut.mutate(syncForm)}
            >
              {saveSyncConfigMut.isPending
                ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Menyimpan...</>
                : "Simpan Konfigurasi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Kirim Reminder WA ─── */}
      <Dialog open={showWa} onOpenChange={setShowWa}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-blue-600" />Kirim Reminder WA</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">Pilih kategori yang akan diingatkan via WhatsApp:</p>
            <div className="space-y-2">
              {[
                { value: "unpaid_invoice", label: "Invoice belum lunas (unpaid / sebagian / overdue)", count: kpi ? kpi.invoices.unpaid + kpi.invoices.partial + kpi.invoices.overdue : null },
                { value: "need_review", label: "Mutasi duplikat perlu review", count: kpi ? kpi.mutations.duplicateNeedReview : null },
                { value: "unmatched", label: "Mutasi tidak cocok (unmatched)", count: kpi ? kpi.mutations.unmatched : null },
                { value: "approved_no_journal", label: "Mutasi disetujui belum posting jurnal", count: null },
              ].map(({ value, label, count }) => (
                <label key={value} className="flex items-center gap-2.5 cursor-pointer rounded-md border p-2.5 hover:bg-muted/40">
                  <input type="checkbox" checked={waTypes.includes(value)} onChange={(e) => { if (e.target.checked) setWaTypes((p) => [...p, value]); else setWaTypes((p) => p.filter((t) => t !== value)); }} className="rounded" />
                  <span className="text-xs flex-1">{label}</span>
                  {count !== null && count !== undefined && <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${count > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>{count}</span>}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowWa(false)}>Batal</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={waTypes.length === 0 || sendWaMut.isPending} onClick={() => sendWaMut.mutate({ types: waTypes })}>
              {sendWaMut.isPending ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Mengirim...</> : <><Send className="mr-2 h-3.5 w-3.5" />Kirim Reminder</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Closing Bank ─── */}
      <Dialog open={showClosingDialog} onOpenChange={setShowClosingDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-slate-600" />Kunci Periode Rekonsiliasi</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label className="text-xs">Periode (YYYY-MM) <span className="text-red-500">*</span></Label>
              <Input className="text-xs font-mono" placeholder="2026-05" value={closingYearMonth} onChange={(e) => setClosingYearMonth(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Catatan (opsional)</Label>
              <Textarea className="text-xs resize-none" rows={2} placeholder="Catatan closing..." value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} />
            </div>
            <Alert className="py-2 border-orange-200 bg-orange-50">
              <AlertDescription className="text-xs text-orange-700">Periode yang dikunci tidak dapat diubah. Pastikan semua mutasi sudah selesai diproses.</AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowClosingDialog(false)}>Batal</Button>
            <Button size="sm" disabled={!closingYearMonth.trim() || lockClosingMut.isPending} onClick={() => lockClosingMut.mutate({ yearMonth: closingYearMonth.trim(), notes: closingNotes.trim() || undefined })}>
              {lockClosingMut.isPending ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Mengunci...</> : <><Lock className="mr-2 h-3.5 w-3.5" />Kunci Periode</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: COA Rule Form ─── */}
      <Dialog open={showCoaDialog} onOpenChange={(o) => { if (!o) { setShowCoaDialog(false); setEditingCoa(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-indigo-600" />{editingCoa ? "Edit Aturan COA" : "Tambah Aturan COA"}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Provider (opsional)</Label>
                <Input className="text-xs" placeholder="GoPay / DANA" value={coaForm.providerName} onChange={(e) => setCoaForm((p) => ({ ...p, providerName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Arah Transaksi</Label>
                <Select value={coaForm.direction} onValueChange={(v) => setCoaForm((p) => ({ ...p, direction: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua (IN & OUT)</SelectItem>
                    <SelectItem value="IN">Masuk (IN)</SelectItem>
                    <SelectItem value="OUT">Keluar (OUT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pola Deskripsi (opsional, regex)</Label>
              <Input className="text-xs font-mono" placeholder="TRANSFER|PAYMENT" value={coaForm.descriptionPattern} onChange={(e) => setCoaForm((p) => ({ ...p, descriptionPattern: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Kode COA <span className="text-red-500">*</span></Label>
                <Input className="text-xs font-mono" placeholder="1-0001" value={coaForm.coaCode} onChange={(e) => setCoaForm((p) => ({ ...p, coaCode: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nama COA <span className="text-red-500">*</span></Label>
                <Input className="text-xs" placeholder="Kas dan Setara Kas" value={coaForm.coaName} onChange={(e) => setCoaForm((p) => ({ ...p, coaName: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Deskripsi (opsional)</Label>
              <Input className="text-xs" placeholder="Keterangan aturan..." value={coaForm.description} onChange={(e) => setCoaForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={coaForm.isActive} onCheckedChange={(v) => setCoaForm((p) => ({ ...p, isActive: v }))} />
              <Label className="text-xs">Aturan aktif</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowCoaDialog(false); setEditingCoa(null); }}>Batal</Button>
            <Button size="sm" disabled={!coaForm.coaCode.trim() || !coaForm.coaName.trim() || saveCoaMut.isPending} onClick={() => saveCoaMut.mutate({ ...coaForm, id: editingCoa?.id })}>
              {saveCoaMut.isPending ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Menyimpan...</> : editingCoa ? "Perbarui" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Tinjau Mutasi ─── */}
      <Dialog open={!!selectedMutation} onOpenChange={(o) => { if (!o) setSelectedMutation(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Tinjau Mutasi</DialogTitle></DialogHeader>
          {selectedMutation && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="text-muted-foreground text-xs">Tanggal</span><p className="font-medium">{selectedMutation.transactionDate}</p></div>
                  <div><span className="text-muted-foreground text-xs">Nominal</span><p className="font-medium">{formatRp(selectedMutation.amount)}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-xs">Keterangan</span><p>{selectedMutation.description}</p></div>
                  {selectedMutation.providerOrderId && <div className="col-span-2"><span className="text-muted-foreground text-xs">Order ID</span><p className="font-mono text-xs">{selectedMutation.providerOrderId}</p></div>}
                  <div><span className="text-muted-foreground text-xs">Arah</span><p>{selectedMutation.direction}</p></div>
                  <div><span className="text-muted-foreground text-xs">Status</span><p><StatusBadge status={selectedMutation.status} /></p></div>
                </div>
              </div>
              {loadingMatches ? (
                <p className="text-sm text-center text-muted-foreground">Memuat kandidat...</p>
              ) : matchData?.matches && matchData.matches.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Kandidat Match ({matchData.matches.length})</p>
                  {matchData.matches.map((mc) => (
                    <div key={mc.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{mc.candidateType}</span>
                          <span className="font-mono text-xs">#{mc.candidateId}</span>
                          <ScoreBadge score={mc.matchScore} />
                        </div>
                        <div className="flex gap-1 text-[10px]">
                          {mc.amountMatch && <span className="rounded bg-green-100 text-green-700 px-1.5 py-0.5">Nominal</span>}
                          {mc.dateMatch && <span className="rounded bg-green-100 text-green-700 px-1.5 py-0.5">Tanggal</span>}
                          {mc.nameMatch && <span className="rounded bg-green-100 text-green-700 px-1.5 py-0.5">Nama</span>}
                          {mc.orderIdMatch && <span className="rounded bg-green-100 text-green-700 px-1.5 py-0.5">Order ID</span>}
                        </div>
                      </div>
                      {mc.matchReason && <p className="text-xs text-muted-foreground">{mc.matchReason}</p>}
                      {mc.detail && Object.keys(mc.detail).length > 0 && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs bg-muted/30 rounded p-2">
                          {Object.entries(mc.detail).slice(0, 6).map(([k, v]) => (
                            <div key={k}><span className="text-muted-foreground">{k}:</span> <span className="font-medium">{String(v ?? "—")}</span></div>
                          ))}
                        </div>
                      )}
                      {mc.status !== "applied" && (
                        <Button size="sm" className="w-full h-8 text-xs" onClick={() => approveMutation.mutate({ mutationId: selectedMutation.id, matchId: mc.id })} disabled={approveMutation.isPending}>
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Setujui dengan kandidat ini
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-center text-muted-foreground py-2">Tidak ada kandidat match.</p>
              )}
              <Separator />
              <div className="space-y-3">
                <p className="text-sm font-medium">Match Manual</p>
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipe</Label>
                    <Select value={manualCandidateType} onValueChange={(v) => setManualCandidateType(v as "payment" | "invoice")}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="payment">Payment</SelectItem>
                        <SelectItem value="invoice">Invoice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ID</Label>
                    <Input className="h-8 w-28 text-xs" placeholder="ID" value={manualCandidateId} onChange={(e) => setManualCandidateId(e.target.value)} />
                  </div>
                  <Button size="sm" className="h-8" disabled={!manualCandidateId || manualMatchMut.isPending} onClick={() => manualMatchMut.mutate({ mutationId: selectedMutation.id, candidateType: manualCandidateType, candidateId: parseInt(manualCandidateId, 10) })}>
                    {manualMatchMut.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Terapkan"}
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="destructive" size="sm" className="flex-1" onClick={() => rejectMutation.mutate(selectedMutation.id)} disabled={rejectMutation.isPending}>
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />Tolak Mutasi
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
