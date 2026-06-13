import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, RefreshCw, CheckCircle2, XCircle, AlertTriangle, HelpCircle,
  Zap, Search, ChevronRight, FileUp, BarChart2, Banknote, Receipt, FileCheck,
  FileSpreadsheet, MessageCircle, Send, ExternalLink, Archive, ClipboardList,
  LayoutDashboard, Lock, Unlock, BookOpen, Plus, Pencil, Trash2,
} from "lucide-react";

const formatRp = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    parseFloat(String(n ?? 0)) || 0
  );

const MONTH_NAMES = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

type AppContext = {
  ownerApp: string;
  sourceApp: string;
  ownerTenantId: number | null;
  ownerCompanyId: number | null;
  role: string;
  isBizPortal: boolean;
  isFullAccess: boolean;
};

type MutationStatus = "unmatched" | "matched" | "duplicate_need_review" | "approved" | "rejected";

type BankMutation = {
  id: number;
  bankAccountId: string | null;
  transactionDate: string;
  description: string;
  creditAmount: string;
  debitAmount: string;
  amount: string;
  direction: string;
  mutationKey: string;
  normalizedDescription: string;
  providerName: string | null;
  providerOrderId: string | null;
  status: MutationStatus;
  matchedPaymentId: number | null;
  matchedOrderId: number | null;
  siteId: number | null;
};

type MatchCandidate = {
  id: number;
  mutationId: number;
  candidateType: string;
  candidateId: number;
  matchScore: number;
  matchReason: string | null;
  amountMatch: boolean;
  dateMatch: boolean;
  nameMatch: boolean;
  orderIdMatch: boolean;
  proofMatch: boolean;
  status: string;
  detail: Record<string, unknown>;
};

type MutationWithMatches = {
  mutation: BankMutation;
  matches: MatchCandidate[];
};

type KpiData = {
  mutations: { unmatched: number; matched: number; approved: number; rejected: number; duplicateNeedReview: number; total: number };
  paymentEvents: { pending: number; waitingConfirmation: number; confirmed: number; rejected: number; total: number; totalConfirmedAmount: number };
  invoices: { paid: number; partial: number; unpaid: number; overdue: number; totalPaidAmount: number; totalPartialPaidAmount: number };
};

type BankReconAuditLog = {
  id: number;
  mutationId: number | null;
  matchId: number | null;
  financePaymentEventId: number | null;
  journalId: string | null;
  action: string;
  actionApp: string | null;
  actionUserId: string | null;
  actionRole: string | null;
  ownerApp: string | null;
  ownerCompanyId: number | null;
  ownerTenantId: number | null;
  sourceApp: string | null;
  sourceModule: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type LaporanRow = {
  year_month: string;
  total: number;
  approved: number;
  rejected: number;
  unmatched: number;
  matched: number;
  duplicate: number;
  total_in: string;
  total_out: string;
  approved_amount: string;
};

type ClosingPeriod = {
  id: number;
  yearMonth: string;
  lockedBy: string | null;
  lockedByRole: string | null;
  notes: string | null;
  siteId: number | null;
  createdAt: string;
};

type CoaRule = {
  id: number;
  providerName: string | null;
  direction: string;
  descriptionPattern: string | null;
  coaCode: string;
  coaName: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
};

const STATUS_CONFIG: Record<MutationStatus, { label: string; color: string; icon: React.ReactNode }> = {
  unmatched:            { label: "Tidak Cocok",   color: "bg-gray-100 text-gray-700 border-gray-300",      icon: <HelpCircle className="h-3 w-3" /> },
  matched:              { label: "Ada Kandidat",  color: "bg-blue-100 text-blue-700 border-blue-300",      icon: <Search className="h-3 w-3" /> },
  duplicate_need_review:{ label: "Duplikat",      color: "bg-yellow-100 text-yellow-800 border-yellow-300",icon: <AlertTriangle className="h-3 w-3" /> },
  approved:             { label: "Disetujui",     color: "bg-green-100 text-green-800 border-green-300",   icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected:             { label: "Ditolak",       color: "bg-red-100 text-red-700 border-red-300",         icon: <XCircle className="h-3 w-3" /> },
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
  import_mutasi:     { label: "Import",       color: "bg-blue-100 text-blue-800 border-blue-200" },
  auto_match:        { label: "Auto Match",   color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  need_review:       { label: "Need Review",  color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  manual_match:      { label: "Manual Match", color: "bg-purple-100 text-purple-800 border-purple-200" },
  approved:          { label: "Disetujui",    color: "bg-green-100 text-green-800 border-green-200" },
  rejected:          { label: "Ditolak",      color: "bg-red-100 text-red-800 border-red-200" },
  run_matching:      { label: "Run Matching", color: "bg-sky-100 text-sky-800 border-sky-200" },
  export_sheet:      { label: "Export Sheet", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  send_reminder_wa:  { label: "Kirim WA",     color: "bg-orange-100 text-orange-800 border-orange-200" },
};

function AuditActionBadge({ action }: { action: string }) {
  const s = AUDIT_ACTION_STYLES[action];
  if (!s) return <span className="inline-flex rounded border px-2 py-0.5 text-[10px] font-mono bg-gray-50 text-gray-600 border-gray-200">{action}</span>;
  return <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${s.color}`}>{s.label}</span>;
}

const EMPTY_COA_FORM = {
  providerName: "",
  direction: "ALL",
  descriptionPattern: "",
  coaCode: "",
  coaName: "",
  description: "",
  isActive: true,
};

export default function BankRekonsiliasi() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: appCtx } = useQuery<AppContext>({
    queryKey: ["/api/bank-reconciliation/context"],
    queryFn: async () => {
      const r = await fetch("/api/bank-reconciliation/context");
      if (!r.ok) return { ownerApp: "tenant_management", sourceApp: "tenant_management", ownerTenantId: null, ownerCompanyId: null, role: "admin", isBizPortal: false, isFullAccess: false };
      return r.json();
    },
    staleTime: 60_000,
  });

  // ── State: Mutasi filters ─────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDirection, setFilterDirection] = useState("all");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedMutation, setSelectedMutation] = useState<BankMutation | null>(null);
  const [manualCandidateType, setManualCandidateType] = useState<"payment" | "invoice">("payment");
  const [manualCandidateId, setManualCandidateId] = useState("");

  // ── State: Export & WA ───────────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);
  const [exportSheetUrl, setExportSheetUrl] = useState(() => localStorage.getItem("bank_rekon_sheet_url") ?? "");
  const [exportSheetTitle, setExportSheetTitle] = useState("");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [showWa, setShowWa] = useState(false);
  const [waTypes, setWaTypes] = useState<string[]>(["unpaid_invoice"]);

  // ── State: Audit Trail filters ───────────────────────────────────────────
  const [auditAction, setAuditAction] = useState("all");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");

  // ── State: Laporan ───────────────────────────────────────────────────────
  const [laporanYear, setLaporanYear] = useState(new Date().getFullYear());

  // ── State: Closing Bank ──────────────────────────────────────────────────
  const [closingLockMonth, setClosingLockMonth] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

  // ── State: Aturan COA ────────────────────────────────────────────────────
  const [showCoaForm, setShowCoaForm] = useState(false);
  const [editingCoaId, setEditingCoaId] = useState<number | null>(null);
  const [coaForm, setCoaForm] = useState(EMPTY_COA_FORM);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: kpi, refetch: refetchKpi } = useQuery<KpiData>({
    queryKey: ["/api/bank-reconciliation/kpi"],
    queryFn: async () => {
      const r = await fetch("/api/bank-reconciliation/kpi");
      if (!r.ok) throw new Error("Gagal memuat KPI");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const params = new URLSearchParams();
  if (filterStatus !== "all") params.set("status", filterStatus);
  if (filterDirection !== "all") params.set("direction", filterDirection);
  if (filterProvider) params.set("provider", filterProvider);
  if (filterDateFrom) params.set("dateFrom", filterDateFrom);
  if (filterDateTo) params.set("dateTo", filterDateTo);

  const { data: mutations = [], isLoading, refetch } = useQuery<BankMutation[]>({
    queryKey: ["/api/bank-reconciliation/mutations", params.toString()],
    queryFn: async () => {
      const r = await fetch(`/api/bank-reconciliation/mutations?${params}`);
      if (!r.ok) throw new Error("Gagal memuat data");
      return r.json();
    },
  });

  const { data: matchData, isLoading: loadingMatches } = useQuery<MutationWithMatches>({
    queryKey: ["/api/bank-reconciliation/matches", selectedMutation?.id],
    queryFn: async () => {
      const r = await fetch(`/api/bank-reconciliation/matches/${selectedMutation!.id}`);
      if (!r.ok) throw new Error("Gagal memuat kandidat");
      return r.json();
    },
    enabled: !!selectedMutation,
  });

  const auditParams = new URLSearchParams();
  if (auditAction !== "all") auditParams.set("action", auditAction);
  if (auditDateFrom) auditParams.set("date_from", auditDateFrom);
  if (auditDateTo) auditParams.set("date_to", auditDateTo);
  auditParams.set("limit", "100");

  const { data: auditLogsData, isLoading: loadingAuditLogs, refetch: refetchAuditLogs } = useQuery<{ data: BankReconAuditLog[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/bank-reconciliation/audit-logs", auditParams.toString()],
    queryFn: async () => {
      const r = await fetch(`/api/bank-reconciliation/audit-logs?${auditParams}`);
      if (!r.ok) throw new Error("Gagal memuat audit log");
      return r.json();
    },
  });
  const auditLogs = auditLogsData?.data ?? [];

  const { data: laporanData, isLoading: loadingLaporan, refetch: refetchLaporan } = useQuery<{ year: number; rows: LaporanRow[] }>({
    queryKey: ["/api/bank-reconciliation/laporan", laporanYear],
    queryFn: async () => {
      const r = await fetch(`/api/bank-reconciliation/laporan?year=${laporanYear}`);
      if (!r.ok) throw new Error("Gagal memuat laporan");
      return r.json();
    },
  });

  const { data: closingPeriods = [], isLoading: loadingClosing, refetch: refetchClosing } = useQuery<ClosingPeriod[]>({
    queryKey: ["/api/bank-reconciliation/closing"],
    queryFn: async () => {
      const r = await fetch("/api/bank-reconciliation/closing");
      if (!r.ok) throw new Error("Gagal memuat data closing");
      return r.json();
    },
  });

  const { data: coaRules = [], isLoading: loadingCoa, refetch: refetchCoa } = useQuery<CoaRule[]>({
    queryKey: ["/api/bank-reconciliation/coa-rules"],
    queryFn: async () => {
      const r = await fetch("/api/bank-reconciliation/coa-rules");
      if (!r.ok) throw new Error("Gagal memuat aturan COA");
      return r.json();
    },
  });

  // ── Stats (dari data mutasi yang di-load) ─────────────────────────────────
  const stats = {
    total: mutations.length,
    unmatched: mutations.filter((m) => m.status === "unmatched").length,
    matched: mutations.filter((m) => m.status === "matched").length,
    duplicate: mutations.filter((m) => m.status === "duplicate_need_review").length,
    approved: mutations.filter((m) => m.status === "approved").length,
    rejected: mutations.filter((m) => m.status === "rejected").length,
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/bank-reconciliation/import", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Import gagal");
      return data;
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
      const r = await fetch("/api/bank-reconciliation/run-matching", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal");
      return data;
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
      const r = await fetch(`/api/bank-reconciliation/${mutationId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal approve");
      return data;
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
      const r = await fetch(`/api/bank-reconciliation/${mutationId}/reject`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal reject");
      return data;
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
      const r = await fetch(`/api/bank-reconciliation/${mutationId}/manual-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateType, candidateId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal");
      return data;
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
      const r = await fetch("/api/bank-reconciliation/export-google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal export");
      return data as { success: boolean; sheetTitle: string; rowCount: number; sheetUrl: string };
    },
    onSuccess: (data) => {
      toast({ title: "Export berhasil!", description: `${data.rowCount} baris ditulis ke sheet "${data.sheetTitle}"` });
      setShowExport(false);
    },
    onError: (e: Error) => toast({ title: "Export gagal", description: e.message, variant: "destructive" }),
  });

  const sendWaMut = useMutation({
    mutationFn: async (payload: { types: string[] }) => {
      const r = await fetch("/api/bank-reconciliation/send-reminder-wa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal kirim");
      return data as { sent: string[]; failed: { ref: string; error: string }[]; skipped: { ref: string; reason: string }[]; summary: Record<string, number>; monthLabel: string };
    },
    onSuccess: (data) => {
      const total = data.sent.length + data.failed.length + data.skipped.length;
      toast({ title: "Reminder WA selesai", description: `${data.sent.length} terkirim, ${data.failed.length} gagal, ${data.skipped.length} dilewati dari ${total} invoice` });
      setShowWa(false);
    },
    onError: (e: Error) => toast({ title: "Gagal kirim WA", description: e.message, variant: "destructive" }),
  });

  const lockPeriodMut = useMutation({
    mutationFn: async ({ yearMonth, notes }: { yearMonth: string; notes?: string }) => {
      const r = await fetch(`/api/bank-reconciliation/closing/${yearMonth}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal mengunci periode");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Periode dikunci" });
      setClosingLockMonth("");
      setClosingNotes("");
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/closing"] });
    },
    onError: (e: Error) => toast({ title: "Gagal kunci", description: e.message, variant: "destructive" }),
  });

  const unlockPeriodMut = useMutation({
    mutationFn: async (yearMonth: string) => {
      const r = await fetch(`/api/bank-reconciliation/closing/${yearMonth}/lock`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal membuka periode");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Periode dibuka kembali" });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/closing"] });
    },
    onError: (e: Error) => toast({ title: "Gagal buka", description: e.message, variant: "destructive" }),
  });

  const saveCoaRuleMut = useMutation({
    mutationFn: async (form: typeof EMPTY_COA_FORM & { id?: number }) => {
      const { id, ...body } = form;
      const url = id ? `/api/bank-reconciliation/coa-rules/${id}` : "/api/bank-reconciliation/coa-rules";
      const method = id ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal menyimpan");
      return data;
    },
    onSuccess: () => {
      toast({ title: editingCoaId ? "Aturan diperbarui" : "Aturan ditambahkan" });
      setShowCoaForm(false);
      setEditingCoaId(null);
      setCoaForm(EMPTY_COA_FORM);
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/coa-rules"] });
    },
    onError: (e: Error) => toast({ title: "Gagal simpan", description: e.message, variant: "destructive" }),
  });

  const deleteCoaRuleMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/bank-reconciliation/coa-rules/${id}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal hapus");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Aturan dihapus" });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/coa-rules"] });
    },
    onError: (e: Error) => toast({ title: "Gagal hapus", description: e.message, variant: "destructive" }),
  });

  // ── Helper: set COA form for editing ─────────────────────────────────────
  function openEditCoa(rule: CoaRule) {
    setCoaForm({
      providerName: rule.providerName ?? "",
      direction: rule.direction,
      descriptionPattern: rule.descriptionPattern ?? "",
      coaCode: rule.coaCode,
      coaName: rule.coaName,
      description: rule.description ?? "",
      isActive: rule.isActive,
    });
    setEditingCoaId(rule.id);
    setShowCoaForm(true);
  }

  // ── Closing: generate months for current year ─────────────────────────────
  const lockedSet = new Set(closingPeriods.map((p) => p.yearMonth));
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const closingMonthOptions: string[] = [];
  for (let m = 1; m <= currentMonth; m++) {
    closingMonthOptions.push(`${currentYear}-${String(m).padStart(2, "0")}`);
  }
  // Also include previous year months
  for (let m = 1; m <= 12; m++) {
    closingMonthOptions.push(`${currentYear - 1}-${String(m).padStart(2, "0")}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">Rekonsiliasi Bank</h1>
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Engine Baru</span>
            <span className="inline-flex items-center rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Jurnal Aktif</span>
            <span className="inline-flex items-center rounded-full border border-purple-300 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">Closing Aktif</span>
            <span className="inline-flex items-center rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">Tenant Scoped</span>
            {appCtx?.ownerTenantId != null && (
              <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                Tenant ID: {appCtx.ownerTenantId}
              </span>
            )}
            {appCtx?.isFullAccess && (
              <span className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">Akses Penuh</span>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Cocokkan mutasi rekening dengan transaksi di sistem
          </p>
        </div>
      </div>

      {/* 6 Tabs */}
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="mb-0 flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" className="text-xs flex items-center gap-1.5">
            <LayoutDashboard className="h-3 w-3" />Dashboard
          </TabsTrigger>
          <TabsTrigger value="audit-trail" className="text-xs flex items-center gap-1.5">
            <ClipboardList className="h-3 w-3" />Audit Trail
          </TabsTrigger>
          <TabsTrigger value="mutasi" className="text-xs flex items-center gap-1.5">
            <Banknote className="h-3 w-3" />Mutasi
          </TabsTrigger>
          <TabsTrigger value="laporan" className="text-xs flex items-center gap-1.5">
            <BarChart2 className="h-3 w-3" />Laporan
          </TabsTrigger>
          <TabsTrigger value="closing-bank" className="text-xs flex items-center gap-1.5">
            <Lock className="h-3 w-3" />Closing Bank
          </TabsTrigger>
          <TabsTrigger value="aturan-coa" className="text-xs flex items-center gap-1.5">
            <BookOpen className="h-3 w-3" />Aturan COA
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════ DASHBOARD ═══════════════ */}
        <TabsContent value="dashboard" className="space-y-4 mt-4">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending
                ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Mengimport...</>
                : <><FileUp className="mr-2 h-4 w-4" />Import CSV</>}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { importMutation.mutate(f); e.target.value = ""; }
              }}
            />
            <Button
              variant="outline"
              onClick={() => runMatchMutation.mutate()}
              disabled={runMatchMutation.isPending}
            >
              {runMatchMutation.isPending
                ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Memproses...</>
                : <><Zap className="mr-2 h-4 w-4" />Jalankan Auto-Match</>}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { refetch(); refetchKpi(); }} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <div className="w-px bg-border h-8 mx-1" />
            <Button
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => setShowExport(true)}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export Google Sheets
            </Button>
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => setShowWa(true)}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Kirim Reminder WA
            </Button>
          </div>

          {/* KPI Panel */}
          {kpi && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-blue-200 bg-blue-50/40">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                    <Banknote className="h-4 w-4" /> Mutasi Bank
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-lg font-bold text-blue-700">{kpi.mutations.total}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Perlu Review</p>
                      <p className="text-lg font-bold text-yellow-700">{kpi.mutations.matched + kpi.mutations.duplicateNeedReview}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Selesai</p>
                      <p className="text-lg font-bold text-green-700">{kpi.mutations.approved}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-purple-200 bg-purple-50/40">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-purple-800 flex items-center gap-1.5">
                    <Receipt className="h-4 w-4" /> Event Pembayaran
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-lg font-bold text-purple-700">{kpi.paymentEvents.total}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Menunggu</p>
                      <p className="text-lg font-bold text-orange-600">{kpi.paymentEvents.pending + kpi.paymentEvents.waitingConfirmation}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Dikonfirmasi</p>
                      <p className="text-lg font-bold text-green-700">{kpi.paymentEvents.confirmed}</p>
                    </div>
                  </div>
                  {kpi.paymentEvents.totalConfirmedAmount > 0 && (
                    <p className="text-xs text-center text-muted-foreground mt-2 border-t pt-2">
                      Total konfirmasi: <span className="font-semibold text-green-700">{formatRp(kpi.paymentEvents.totalConfirmedAmount)}</span>
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-green-200 bg-green-50/40">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
                    <FileCheck className="h-4 w-4" /> Status Invoice
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Lunas</p>
                      <p className="text-lg font-bold text-green-700">{kpi.invoices.paid}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sebagian</p>
                      <p className="text-lg font-bold text-blue-700">{kpi.invoices.partial}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Belum</p>
                      <p className="text-lg font-bold text-gray-600">{kpi.invoices.unpaid}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lewat</p>
                      <p className="text-lg font-bold text-red-600">{kpi.invoices.overdue}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Stat cards (dari data yang dimuat) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total Dimuat",  val: stats.total,     color: "text-gray-700",   bg: "" },
              { label: "Tidak Cocok",   val: stats.unmatched, color: "text-gray-600",   bg: "bg-gray-50" },
              { label: "Ada Kandidat",  val: stats.matched,   color: "text-blue-700",   bg: "bg-blue-50" },
              { label: "Duplikat",      val: stats.duplicate, color: "text-yellow-700", bg: "bg-yellow-50" },
              { label: "Disetujui",     val: stats.approved,  color: "text-green-700",  bg: "bg-green-50" },
            ].map((s) => (
              <div key={s.label} className={`rounded-lg border p-3 text-center ${s.bg}`}>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* Closing periods summary */}
          {closingPeriods.length > 0 && (
            <div className="rounded-lg border p-4 bg-amber-50/40 border-amber-200">
              <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
                <Lock className="h-4 w-4" /> Periode Terkunci ({closingPeriods.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {closingPeriods.slice(0, 6).map((p) => {
                  const [yr, mo] = p.yearMonth.split("-");
                  return (
                    <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      <Lock className="h-3 w-3" />
                      {MONTH_NAMES[parseInt(mo, 10) - 1]} {yr}
                    </span>
                  );
                })}
                {closingPeriods.length > 6 && (
                  <span className="text-xs text-muted-foreground">+{closingPeriods.length - 6} lainnya</span>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════ AUDIT TRAIL ═══════════════ */}
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
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
                setAuditAction("all"); setAuditDateFrom(""); setAuditDateTo("");
              }}>Reset Filter</Button>
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
                {loadingAuditLogs && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">Memuat data...</TableCell></TableRow>
                )}
                {!loadingAuditLogs && auditLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      <ClipboardList className="mx-auto mb-2 h-8 w-8 opacity-25" />
                      <p>Belum ada data audit log.</p>
                      <p className="text-xs mt-1">Lakukan aksi rekonsiliasi (import, approve, dll.) untuk mengisi log ini.</p>
                    </TableCell>
                  </TableRow>
                )}
                {auditLogs.map((log) => (
                  <TableRow key={log.id} className="text-xs">
                    <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap font-mono">
                      {new Date(log.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                    </TableCell>
                    <TableCell><AuditActionBadge action={log.action} /></TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{log.mutationId ?? "—"}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                      {log.matchId ? `M:${log.matchId}` : ""}{log.matchId && log.journalId ? " / " : ""}{log.journalId ? `J:${log.journalId}` : ""}{!log.matchId && !log.journalId ? "—" : ""}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{log.actionUserId ?? "—"}</span>
                      {log.actionRole && <span className="ml-1 text-[10px] text-muted-foreground">({log.actionRole})</span>}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{log.ownerApp ?? "—"}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{log.sourceModule ?? "—"}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground max-w-xs">
                      {log.metadata ? (
                        <span className="truncate block">{JSON.stringify(log.metadata)}</span>
                      ) : log.afterValue ? (
                        <span className="truncate block">{JSON.stringify(log.afterValue)}</span>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {auditLogsData && auditLogsData.total > 100 && (
            <p className="text-xs text-muted-foreground text-center">
              Menampilkan 100 dari {auditLogsData.total} entri. Gunakan filter untuk mempersempit pencarian.
            </p>
          )}
        </TabsContent>

        {/* ═══════════════ MUTASI ═══════════════ */}
        <TabsContent value="mutasi" className="space-y-4 mt-4">
          {/* Import actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending
                ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Mengimport...</>
                : <><FileUp className="mr-2 h-3.5 w-3.5" />Import CSV</>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runMatchMutation.mutate()}
              disabled={runMatchMutation.isPending}
            >
              {runMatchMutation.isPending
                ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Memproses...</>
                : <><Zap className="mr-2 h-3.5 w-3.5" />Jalankan Auto-Match</>}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { refetch(); refetchKpi(); }} disabled={isLoading}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>

          {/* CSV format hint */}
          <Alert className="border-blue-200 bg-blue-50 py-3">
            <BarChart2 className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-700 text-xs">
              Format CSV: kolom <strong>tanggal</strong>, <strong>keterangan</strong>, <strong>kredit</strong>, <strong>debet</strong> (atau <strong>nominal</strong>).
              Baris pertama adalah header. GoPay/DOMPET ANAK BANGSA akan dideteksi otomatis.
            </AlertDescription>
          </Alert>

          {/* Filters */}
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
              <Input
                className="h-8 w-36 text-xs"
                placeholder="GoPay / all"
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
              />
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
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
                setFilterStatus("all"); setFilterDirection("all");
                setFilterProvider(""); setFilterDateFrom(""); setFilterDateTo("");
              }}>
                Reset Filter
              </Button>
            )}
          </div>

          {/* Table */}
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
                {isLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">Memuat data...</TableCell></TableRow>
                )}
                {!isLoading && mutations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                      <Upload className="mx-auto mb-2 h-8 w-8 opacity-25" />
                      <p>Belum ada data mutasi.</p>
                      <p className="text-xs mt-1">Import file CSV mutasi rekening untuk memulai.</p>
                    </TableCell>
                  </TableRow>
                )}
                {mutations.map((m) => (
                  <TableRow
                    key={m.id}
                    className={m.status === "approved" ? "bg-green-50/40" : m.status === "duplicate_need_review" ? "bg-yellow-50/40" : ""}
                  >
                    <TableCell className="text-xs whitespace-nowrap">{m.transactionDate}</TableCell>
                    <TableCell className="text-xs max-w-xs">
                      <p className="truncate">{m.description}</p>
                      {m.providerOrderId && (
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{m.providerOrderId}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium text-green-700">
                      {parseFloat(m.creditAmount) > 0 ? formatRp(m.creditAmount) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium text-red-700">
                      {parseFloat(m.debitAmount) > 0 ? formatRp(m.debitAmount) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.direction === "IN" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {m.direction}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.providerName ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 border-purple-300 text-purple-700 bg-purple-50">
                          {m.providerName}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{m.mutationKey}</TableCell>
                    <TableCell><StatusBadge status={m.status} /></TableCell>
                    <TableCell className="text-center">
                      {m.status !== "approved" && m.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setSelectedMutation(m)}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                          Tinjau
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

        {/* ═══════════════ LAPORAN ═══════════════ */}
        <TabsContent value="laporan" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tahun</Label>
              <Select value={String(laporanYear)} onValueChange={(v) => setLaporanYear(parseInt(v, 10))}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear, currentYear - 1, currentYear - 2].map((yr) => (
                    <SelectItem key={yr} value={String(yr)}>{yr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-5">
              <Button variant="ghost" size="sm" onClick={() => refetchLaporan()} disabled={loadingLaporan}>
                <RefreshCw className={`h-3.5 w-3.5 ${loadingLaporan ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Summary cards */}
          {laporanData && laporanData.rows.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(() => {
                const totals = laporanData.rows.reduce(
                  (acc, r) => ({
                    total: acc.total + r.total,
                    approved: acc.approved + r.approved,
                    unmatched: acc.unmatched + r.unmatched,
                    totalIn: acc.totalIn + parseFloat(r.total_in),
                    approvedAmt: acc.approvedAmt + parseFloat(r.approved_amount),
                  }),
                  { total: 0, approved: 0, unmatched: 0, totalIn: 0, approvedAmt: 0 }
                );
                return (
                  <>
                    <div className="rounded-lg border p-3 text-center bg-blue-50">
                      <p className="text-xs text-muted-foreground">Total Mutasi</p>
                      <p className="text-xl font-bold text-blue-700">{totals.total}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center bg-green-50">
                      <p className="text-xs text-muted-foreground">Disetujui</p>
                      <p className="text-xl font-bold text-green-700">{totals.approved}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center bg-gray-50">
                      <p className="text-xs text-muted-foreground">Tidak Cocok</p>
                      <p className="text-xl font-bold text-gray-700">{totals.unmatched}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center bg-emerald-50">
                      <p className="text-xs text-muted-foreground">Total Masuk</p>
                      <p className="text-sm font-bold text-emerald-700">{formatRp(totals.totalIn)}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">Bulan</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Disetujui</TableHead>
                  <TableHead className="text-xs text-right">Ditolak</TableHead>
                  <TableHead className="text-xs text-right">Tidak Cocok</TableHead>
                  <TableHead className="text-xs text-right">Duplikat</TableHead>
                  <TableHead className="text-xs text-right">Total Masuk</TableHead>
                  <TableHead className="text-xs text-right">Total Keluar</TableHead>
                  <TableHead className="text-xs text-right">Approved Masuk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLaporan && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">Memuat laporan...</TableCell></TableRow>
                )}
                {!loadingLaporan && (!laporanData || laporanData.rows.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                      <BarChart2 className="mx-auto mb-2 h-8 w-8 opacity-25" />
                      <p>Tidak ada data mutasi untuk tahun {laporanYear}.</p>
                    </TableCell>
                  </TableRow>
                )}
                {laporanData?.rows.map((row) => {
                  const [yr, mo] = row.year_month.split("-");
                  const isLocked = lockedSet.has(row.year_month);
                  return (
                    <TableRow key={row.year_month} className={isLocked ? "bg-amber-50/40" : ""}>
                      <TableCell className="text-xs font-medium">
                        <div className="flex items-center gap-1.5">
                          {isLocked && <Lock className="h-3 w-3 text-amber-600" />}
                          {MONTH_NAMES[parseInt(mo, 10) - 1]} {yr}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right font-bold">{row.total}</TableCell>
                      <TableCell className="text-xs text-right text-green-700 font-semibold">{row.approved}</TableCell>
                      <TableCell className="text-xs text-right text-red-600">{row.rejected}</TableCell>
                      <TableCell className="text-xs text-right text-gray-600">{row.unmatched}</TableCell>
                      <TableCell className="text-xs text-right text-yellow-700">{row.duplicate}</TableCell>
                      <TableCell className="text-xs text-right text-emerald-700">{formatRp(row.total_in)}</TableCell>
                      <TableCell className="text-xs text-right text-red-700">{formatRp(row.total_out)}</TableCell>
                      <TableCell className="text-xs text-right font-semibold text-green-700">{formatRp(row.approved_amount)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ═══════════════ CLOSING BANK ═══════════════ */}
        <TabsContent value="closing-bank" className="space-y-4 mt-4">
          <div className="flex items-start gap-4 flex-wrap">
            <Card className="flex-1 min-w-64">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-amber-600" />
                  Kunci Periode Baru
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Pilih Bulan</Label>
                  <Select value={closingLockMonth} onValueChange={setClosingLockMonth}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pilih bulan..." /></SelectTrigger>
                    <SelectContent>
                      {closingMonthOptions.filter((m) => !lockedSet.has(m)).map((ym) => {
                        const [yr, mo] = ym.split("-");
                        return (
                          <SelectItem key={ym} value={ym}>
                            {MONTH_NAMES[parseInt(mo, 10) - 1]} {yr}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Catatan (opsional)</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Alasan penguncian..."
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={!closingLockMonth || lockPeriodMut.isPending}
                  onClick={() => lockPeriodMut.mutate({ yearMonth: closingLockMonth, notes: closingNotes || undefined })}
                >
                  {lockPeriodMut.isPending
                    ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Mengunci...</>
                    : <><Lock className="mr-2 h-3.5 w-3.5" />Kunci Periode</>}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">Periode</TableHead>
                  <TableHead className="text-xs">Dikunci Oleh</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Catatan</TableHead>
                  <TableHead className="text-xs">Waktu Kunci</TableHead>
                  <TableHead className="text-xs text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingClosing && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Memuat data...</TableCell></TableRow>
                )}
                {!loadingClosing && closingPeriods.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                      <Unlock className="mx-auto mb-2 h-8 w-8 opacity-25" />
                      <p>Belum ada periode yang dikunci.</p>
                      <p className="text-xs mt-1">Kunci periode untuk mencegah perubahan data rekonsiliasi.</p>
                    </TableCell>
                  </TableRow>
                )}
                {closingPeriods.map((period) => {
                  const [yr, mo] = period.yearMonth.split("-");
                  return (
                    <TableRow key={period.id}>
                      <TableCell className="text-sm font-semibold">
                        <div className="flex items-center gap-1.5">
                          <Lock className="h-3.5 w-3.5 text-amber-600" />
                          {MONTH_NAMES[parseInt(mo, 10) - 1]} {yr}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{period.lockedBy ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {period.lockedByRole && (
                          <Badge variant="outline" className="text-[10px]">{period.lockedByRole}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{period.notes ?? "—"}</TableCell>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">
                        {new Date(period.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
                          disabled={unlockPeriodMut.isPending}
                          onClick={() => unlockPeriodMut.mutate(period.yearMonth)}
                        >
                          <Unlock className="mr-1 h-3 w-3" />Buka
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ═══════════════ ATURAN COA ═══════════════ */}
        <TabsContent value="aturan-coa" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Aturan Pemetaan COA</h3>
              <p className="text-xs text-muted-foreground">Petakan provider/pola deskripsi mutasi ke kode akun COA.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => refetchCoa()} disabled={loadingCoa}>
                <RefreshCw className={`h-3.5 w-3.5 ${loadingCoa ? "animate-spin" : ""}`} />
              </Button>
              <Button
                size="sm"
                onClick={() => { setEditingCoaId(null); setCoaForm(EMPTY_COA_FORM); setShowCoaForm(true); }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah Aturan
              </Button>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">Kode COA</TableHead>
                  <TableHead className="text-xs">Nama COA</TableHead>
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs">Arah</TableHead>
                  <TableHead className="text-xs">Pola Deskripsi</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCoa && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Memuat data...</TableCell></TableRow>
                )}
                {!loadingCoa && coaRules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                      <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-25" />
                      <p>Belum ada aturan COA.</p>
                      <p className="text-xs mt-1">Tambah aturan untuk memetakan mutasi ke kode akun secara otomatis.</p>
                    </TableCell>
                  </TableRow>
                )}
                {coaRules.map((rule) => (
                  <TableRow key={rule.id} className={!rule.isActive ? "opacity-50" : ""}>
                    <TableCell className="text-xs font-mono font-semibold text-blue-700">{rule.coaCode}</TableCell>
                    <TableCell className="text-xs font-medium">{rule.coaName}</TableCell>
                    <TableCell className="text-xs">
                      {rule.providerName ? (
                        <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700 bg-purple-50">{rule.providerName}</Badge>
                      ) : <span className="text-muted-foreground">Semua</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                        rule.direction === "IN" ? "bg-green-50 text-green-700 border-green-200" :
                        rule.direction === "OUT" ? "bg-red-50 text-red-700 border-red-200" :
                        "bg-gray-50 text-gray-700 border-gray-200"
                      }`}>
                        {rule.direction}
                      </span>
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                      {rule.descriptionPattern ?? <span className="italic">—</span>}
                    </TableCell>
                    <TableCell>
                      {rule.isActive
                        ? <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px]">Aktif</Badge>
                        : <Badge variant="outline" className="text-[10px] text-gray-500">Nonaktif</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => openEditCoa(rule)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          disabled={deleteCoaRuleMut.isPending}
                          onClick={() => {
                            if (confirm(`Hapus aturan COA "${rule.coaCode} - ${rule.coaName}"?`)) {
                              deleteCoaRuleMut.mutate(rule.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Dialog: Export Google Sheets ─── */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              Export Laporan ke Google Sheets
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label className="text-xs">URL / ID Google Spreadsheet <span className="text-red-500">*</span></Label>
              <Input
                className="text-xs"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={exportSheetUrl}
                onChange={(e) => {
                  setExportSheetUrl(e.target.value);
                  localStorage.setItem("bank_rekon_sheet_url", e.target.value);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Judul Sheet (opsional)</Label>
              <Input
                className="text-xs"
                placeholder="Rekonsiliasi Bank Juni 2026"
                value={exportSheetTitle}
                onChange={(e) => setExportSheetTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Dari Tanggal</Label>
                <Input type="date" className="text-xs" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sampai Tanggal</Label>
                <Input type="date" className="text-xs" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} />
              </div>
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700">
              Data export dari <strong>engine baru</strong>: bank_mutations, bank_reconciliation_matches, bank_journal_entries, tenant_invoices, tenant_payments.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowExport(false)}>Batal</Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={!exportSheetUrl.trim() || exportSheetMut.isPending}
              onClick={() => exportSheetMut.mutate({
                spreadsheetId: exportSheetUrl.trim(),
                sheetTitle: exportSheetTitle.trim() || undefined,
                dateFrom: exportDateFrom || undefined,
                dateTo: exportDateTo || undefined,
              })}
            >
              {exportSheetMut.isPending
                ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Mengexport...</>
                : <><FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Export Sekarang</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Kirim Reminder WA ─── */}
      <Dialog open={showWa} onOpenChange={setShowWa}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-blue-600" />
              Kirim Reminder WA dari Engine Baru
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">Pilih kategori yang akan diingatkan via WhatsApp:</p>
            <div className="space-y-2">
              {[
                { value: "unpaid_invoice", label: "Invoice belum lunas (unpaid / sebagian / overdue)", count: kpi ? kpi.invoices.unpaid + kpi.invoices.partial + kpi.invoices.overdue : null },
                { value: "need_review",    label: "Mutasi duplikat perlu review",                       count: kpi ? kpi.mutations.duplicateNeedReview : null },
                { value: "unmatched",      label: "Mutasi tidak cocok (unmatched)",                     count: kpi ? kpi.mutations.unmatched : null },
                { value: "approved_no_journal", label: "Mutasi disetujui belum posting jurnal",         count: null },
              ].map(({ value, label, count }) => (
                <label key={value} className="flex items-center gap-2.5 cursor-pointer rounded-md border p-2.5 hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={waTypes.includes(value)}
                    onChange={(e) => {
                      if (e.target.checked) setWaTypes((p) => [...p, value]);
                      else setWaTypes((p) => p.filter((t) => t !== value));
                    }}
                    className="rounded"
                  />
                  <span className="text-xs flex-1">{label}</span>
                  {count !== null && count !== undefined && (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${count > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>{count}</span>
                  )}
                </label>
              ))}
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
              WA hanya dikirim untuk invoice unpaid/partial/overdue. Kategori lain dicatat sebagai ringkasan jumlah.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowWa(false)}>Batal</Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={waTypes.length === 0 || sendWaMut.isPending}
              onClick={() => sendWaMut.mutate({ types: waTypes })}
            >
              {sendWaMut.isPending
                ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Mengirim...</>
                : <><Send className="mr-2 h-3.5 w-3.5" />Kirim Reminder</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Tambah/Edit Aturan COA ─── */}
      <Dialog open={showCoaForm} onOpenChange={(o) => { if (!o) { setShowCoaForm(false); setEditingCoaId(null); setCoaForm(EMPTY_COA_FORM); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              {editingCoaId ? "Edit Aturan COA" : "Tambah Aturan COA"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Kode COA <span className="text-red-500">*</span></Label>
                <Input
                  className="text-xs"
                  placeholder="1-1-0001"
                  value={coaForm.coaCode}
                  onChange={(e) => setCoaForm((f) => ({ ...f, coaCode: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nama COA <span className="text-red-500">*</span></Label>
                <Input
                  className="text-xs"
                  placeholder="Kas Bank BCA"
                  value={coaForm.coaName}
                  onChange={(e) => setCoaForm((f) => ({ ...f, coaName: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Provider (opsional)</Label>
                <Input
                  className="text-xs"
                  placeholder="GoPay / DANA / ..."
                  value={coaForm.providerName}
                  onChange={(e) => setCoaForm((f) => ({ ...f, providerName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Arah Mutasi</Label>
                <Select value={coaForm.direction} onValueChange={(v) => setCoaForm((f) => ({ ...f, direction: v }))}>
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
              <Label className="text-xs">Pola Deskripsi (regex, opsional)</Label>
              <Input
                className="text-xs font-mono"
                placeholder="TRANSFER|PEMBAYARAN|GOPAY.*"
                value={coaForm.descriptionPattern}
                onChange={(e) => setCoaForm((f) => ({ ...f, descriptionPattern: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Keterangan</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Aturan untuk mutasi masuk dari GoPay..."
                value={coaForm.description}
                onChange={(e) => setCoaForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="coa-active"
                checked={coaForm.isActive}
                onCheckedChange={(v) => setCoaForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="coa-active" className="text-xs cursor-pointer">Aturan aktif</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowCoaForm(false); setEditingCoaId(null); setCoaForm(EMPTY_COA_FORM); }}>
              Batal
            </Button>
            <Button
              size="sm"
              disabled={!coaForm.coaCode.trim() || !coaForm.coaName.trim() || saveCoaRuleMut.isPending}
              onClick={() => saveCoaRuleMut.mutate({ ...coaForm, id: editingCoaId ?? undefined })}
            >
              {saveCoaRuleMut.isPending
                ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Menyimpan...</>
                : editingCoaId ? "Perbarui" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Mutation Dialog ─── */}
      <Dialog open={!!selectedMutation} onOpenChange={(o) => { if (!o) setSelectedMutation(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tinjau Mutasi</DialogTitle>
          </DialogHeader>

          {selectedMutation && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="text-muted-foreground text-xs">Tanggal</span><p className="font-medium">{selectedMutation.transactionDate}</p></div>
                  <div><span className="text-muted-foreground text-xs">Nominal</span><p className="font-medium">{formatRp(selectedMutation.amount)}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-xs">Keterangan</span><p>{selectedMutation.description}</p></div>
                  {selectedMutation.providerOrderId && (
                    <div className="col-span-2"><span className="text-muted-foreground text-xs">Order ID</span><p className="font-mono text-xs">{selectedMutation.providerOrderId}</p></div>
                  )}
                  <div><span className="text-muted-foreground text-xs">Arah</span>
                    <p><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${selectedMutation.direction === "IN" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{selectedMutation.direction}</span></p>
                  </div>
                  <div><span className="text-muted-foreground text-xs">Mutation Key</span><p className="font-mono text-xs">{selectedMutation.mutationKey}</p></div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <StatusBadge status={selectedMutation.status} />
                  {selectedMutation.providerName && (
                    <Badge variant="outline" className="text-xs border-purple-300 text-purple-700 bg-purple-50">{selectedMutation.providerName}</Badge>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Kandidat Match</h3>
                {loadingMatches && <p className="text-sm text-muted-foreground">Memuat kandidat...</p>}
                {matchData && matchData.matches.length === 0 && (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Tidak ada kandidat. Gunakan "Manual Match" di bawah.
                  </div>
                )}
                {matchData && matchData.matches.length > 0 && (
                  <div className="space-y-2">
                    {matchData.matches.map((m) => (
                      <div key={m.id} className={`rounded-lg border p-3 space-y-2 ${m.status === "approved" ? "border-green-400 bg-green-50" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium capitalize">{m.candidateType} #{m.candidateId}</span>
                              <ScoreBadge score={m.matchScore} />
                              {m.matchScore >= 95 && <span className="text-[10px] bg-green-100 text-green-800 px-1.5 rounded">Auto-match</span>}
                              {m.matchScore >= 80 && m.matchScore < 95 && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 rounded">Perlu review</span>}
                            </div>
                            <p className="text-xs text-muted-foreground">{m.matchReason}</p>
                            {m.detail && (
                              <div className="text-xs mt-1 space-y-0.5">
                                {!!(m.detail.tenantName || m.detail.businessName) && (
                                  <p><span className="text-muted-foreground">Tenant:</span> {String(m.detail.tenantName || m.detail.businessName || "")}</p>
                                )}
                                {!!m.detail.amount && <p><span className="text-muted-foreground">Nominal:</span> {formatRp(String(m.detail.amount))}</p>}
                                {!!m.detail.invoiceNumber && <p><span className="text-muted-foreground">Invoice:</span> {String(m.detail.invoiceNumber)}</p>}
                                {!!m.detail.paymentNumber && <p><span className="text-muted-foreground">No Bayar:</span> {String(m.detail.paymentNumber)}</p>}
                                {!!m.detail.dueDate && <p><span className="text-muted-foreground">Jatuh Tempo:</span> {String(m.detail.dueDate)}</p>}
                              </div>
                            )}
                            <div className="flex gap-2 mt-1">
                              {[
                                { v: m.amountMatch, l: "Nominal" },
                                { v: m.dateMatch,   l: "Tanggal" },
                                { v: m.nameMatch,   l: "Nama" },
                                { v: m.orderIdMatch,l: "Order ID" },
                              ].map(({ v, l }) => (
                                <span key={l} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${v ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                                  {v ? "✓" : "✗"} {l}
                                </span>
                              ))}
                            </div>
                          </div>
                          {m.status !== "approved" && (
                            <Button
                              size="sm"
                              className="shrink-0 bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                              onClick={() => approveMutation.mutate({ mutationId: selectedMutation.id, matchId: m.id })}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Setujui
                            </Button>
                          )}
                          {m.status === "approved" && (
                            <Badge className="bg-green-600 text-white shrink-0">Dipilih</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-2">Manual Match</h3>
                <div className="flex gap-2 items-end">
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
                    <Input
                      className="h-8 w-28 text-xs"
                      placeholder="123"
                      value={manualCandidateId}
                      onChange={(e) => setManualCandidateId(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={!manualCandidateId || manualMatchMut.isPending}
                    onClick={() => manualMatchMut.mutate({
                      mutationId: selectedMutation.id,
                      candidateType: manualCandidateType,
                      candidateId: parseInt(manualCandidateId, 10),
                    })}
                  >
                    Terapkan Manual Match
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => selectedMutation && rejectMutation.mutate(selectedMutation.id)}
              disabled={rejectMutation.isPending}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />Tolak Mutasi
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedMutation(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
