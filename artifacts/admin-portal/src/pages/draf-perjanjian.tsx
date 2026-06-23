import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { apiFetch, apiFetchJson } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  FilePlus,
  Copy,
  Trash2,
  MoreVertical,
  Send,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  FileSignature,
  ExternalLink,
  RefreshCw,
  Link2,
  BookmarkCheck,
  ThumbsUp,
  ThumbsDown,
  BellRing,
  Megaphone,
  DoorOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Search,
  CalendarRange,
  MessageSquare,
  MessageCircle,
  CreditCard,
  Loader2,
  Phone,
  History,
  ChevronDown,
  ChevronUp,
  Users,
  CheckCheck,
  AlertCircle,
  SkipForward,
} from "lucide-react";

// ── Tipe data ──────────────────────────────────────────────────────────────────
interface MallUnitInfo {
  unitCode: string;
  areaName: string;
  defaultRentAmount: number | null;
  status: string;
}

interface DraftAgreement {
  id: number;
  token: string;
  siteId: number;
  docType: "surat_minat" | "perjanjian_sewa";
  picName: string | null;
  source: "admin" | "self_register";
  tenantName: string;
  brandName: string;
  businessType: string;
  email: string | null;
  phone: string;
  address: string | null;
  unitCode: string | null;
  interestedUnit: string | null;
  areaName: string | null;
  startDate: string | null;
  endDate: string | null;
  durationMonths: number | null;
  periodLabel: string | null;
  rentAmount: string;
  depositAmount: string;
  paymentTerms: string | null;
  notes: string | null;
  agreementStatus: "setuju" | "tidak_setuju" | null;
  disagreementReason: string | null;
  leaseDurationMonths: number | null;
  status: "pending" | "approved" | "rejected";
  respondedAt: string | null;
  respondedName: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  createdAt: string;
  publicUrl: string;
  tenantId: number | null;
  bookingId: number | null;
}

interface BlastSessionLog {
  id: number;
  siteId: number | null;
  blastType: string;
  sentBy: string | null;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  metadata: { unitCodes?: string[] } | null;
  createdAt: string;
}

interface PaginatedResponse {
  success: boolean;
  data: DraftAgreement[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface SummaryResponse {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  today: number;
  thisMonth: number;
  selfRegister: number;
}

// ── Helper ──────────────────────────────────────────────────────────────────────
function formatRp(v: string | number | null | undefined) {
  if (!v) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function formatTanggal(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function StatusBadge({ status }: { status: DraftAgreement["status"] }) {
  if (status === "approved")
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 border"><CheckCircle2 className="h-3 w-3 mr-1" />Disetujui</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 border"><XCircle className="h-3 w-3 mr-1" />Tidak Disetujui</Badge>;
  return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-amber-200 border"><Clock className="h-3 w-3 mr-1" />Menunggu</Badge>;
}

function DocTypeBadge({ type }: { type: DraftAgreement["docType"] }) {
  if (type === "perjanjian_sewa")
    return <span className="inline-flex items-center gap-1 text-xs text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200"><FileSignature className="h-3 w-3" />Perjanjian Sewa</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200"><FileText className="h-3 w-3" />Surat Minat</span>;
}

// ── Sort Header ────────────────────────────────────────────────────────────────
function SortHeader({
  label,
  colKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  colKey: string;
  currentSort: string;
  currentDir: string;
  onSort: (col: string, dir: string) => void;
}) {
  const active = currentSort === colKey;
  const nextDir = active && currentDir === "asc" ? "desc" : "asc";
  return (
    <button
      className="flex items-center gap-1 text-xs font-medium hover:text-primary transition-colors"
      onClick={() => onSort(colKey, active && currentDir === "asc" ? "desc" : nextDir)}
    >
      {label}
      {active ? (
        currentDir === "asc"
          ? <ArrowUp className="h-3 w-3 text-primary" />
          : <ArrowDown className="h-3 w-3 text-primary" />
      ) : (
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

// ── Pagination UI ──────────────────────────────────────────────────────────────
function PaginationBar({
  page,
  totalPages,
  total,
  limit,
  onPage,
  onLimit,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
  onLimit: (l: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Tampil {from}–{to} dari <strong>{total}</strong> data</span>
        <Select value={String(limit)} onValueChange={(v) => onLimit(Number(v))}>
          <SelectTrigger className="h-7 w-[72px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>per halaman</span>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => onPage(1)}>
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e${i}`} className="px-1.5 text-muted-foreground text-xs">…</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="icon"
              className="h-7 w-7 text-xs"
              onClick={() => onPage(p as number)}
            >
              {p}
            </Button>
          )
        )}
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => onPage(totalPages)}>
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Unit Picker Row ────────────────────────────────────────────────────────────
function UnitPickerRow({
  unitCode,
  areaName,
  onUnitCode,
  onAreaName,
  onRentAmount,
  availableUnits,
  loadingUnits,
}: {
  unitCode: string;
  areaName: string;
  onUnitCode: (v: string) => void;
  onAreaName: (v: string) => void;
  onRentAmount?: (v: string) => void;
  availableUnits: MallUnitInfo[];
  loadingUnits: boolean;
}) {
  // Cek apakah unitCode saat ini ada di daftar available units
  const selectedFromDropdown = availableUnits.some((u) => u.unitCode === unitCode);

  function handleSelect(val: string) {
    const unit = availableUnits.find((u) => u.unitCode === val);
    if (!unit) return;
    onUnitCode(unit.unitCode);
    onAreaName(unit.areaName);
    if (onRentAmount && unit.defaultRentAmount) {
      onRentAmount(String(unit.defaultRentAmount));
    }
  }

  function handleClear() {
    onUnitCode("");
    onAreaName("");
  }

  const placeholder = loadingUnits
    ? "Memuat unit..."
    : availableUnits.length === 0
    ? "Tidak ada unit kosong saat ini"
    : "— Pilih unit kosong (otomatis isi) —";

  return (
    <>
      <div className="space-y-1.5 col-span-2">
        <Label className="flex items-center gap-1.5">
          Pilih Unit Kosong
          {availableUnits.length > 0 && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200 font-medium">
              {availableUnits.length} tersedia
            </span>
          )}
        </Label>
        <Select
          value={selectedFromDropdown ? unitCode : ""}
          onValueChange={handleSelect}
          disabled={loadingUnits || availableUnits.length === 0}
        >
          <SelectTrigger className="text-sm">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {availableUnits.map((u) => (
              <SelectItem key={u.unitCode} value={u.unitCode} className="text-sm">
                <span className="font-mono font-semibold">{u.unitCode}</span>
                {u.areaName && (
                  <span className="ml-2 text-muted-foreground">· {u.areaName}</span>
                )}
                {u.defaultRentAmount ? (
                  <span className="ml-2 text-emerald-700 font-medium">
                    Rp {u.defaultRentAmount.toLocaleString("id-ID")}/bln
                  </span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Jika unit dipilih dari dropdown → tampilkan ringkasan, bukan input manual */}
      {selectedFromDropdown ? (
        <div className="col-span-2 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <CheckCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-emerald-800 font-medium">{unitCode}</span>
          {areaName && <span className="text-emerald-700">· {areaName}</span>}
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto text-xs text-muted-foreground underline hover:text-destructive"
          >
            Hapus pilihan
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>Kode Unit</Label>
            <Input
              placeholder="misal: SC-01"
              value={unitCode}
              onChange={(e) => onUnitCode(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nama Area/Lokasi</Label>
            <Input
              placeholder="misal: Sport Center Lantai 1"
              value={areaName}
              onChange={(e) => onAreaName(e.target.value)}
            />
          </div>
        </>
      )}
    </>
  );
}

// ── Form buat draf baru ────────────────────────────────────────────────────────
interface CreateForm {
  docType: "surat_minat" | "perjanjian_sewa";
  picName: string;
  tenantName: string;
  brandName: string;
  businessType: string;
  email: string;
  phone: string;
  address: string;
  unitCode: string;
  areaName: string;
  interestedUnit: string;
  startDate: string;
  endDate: string;
  durationMonths: string;
  periodLabel: string;
  rentAmount: string;
  depositAmount: string;
  paymentTerms: string;
  notes: string;
  expiresInDays: string;
}

const BLANK_FORM: CreateForm = {
  docType: "surat_minat",
  picName: "",
  tenantName: "",
  brandName: "",
  businessType: "",
  email: "",
  phone: "",
  address: "",
  unitCode: "",
  areaName: "",
  interestedUnit: "",
  startDate: "",
  endDate: "",
  durationMonths: "",
  periodLabel: "",
  rentAmount: "",
  depositAmount: "",
  paymentTerms: "Pembayaran dilakukan setiap bulan di muka, paling lambat tanggal 10 setiap bulannya.",
  notes: "",
  expiresInDays: "30",
};

// ── Detail panel ──────────────────────────────────────────────────────────────
interface WaLog {
  id: number;
  phoneNumber: string;
  sentAt: string;
  status: "success" | "failed" | "pending";
  sentBy: string | null;
  type: "auto" | "manual";
  errorMessage: string | null;
}

function DetailPanel({
  draft,
  onClose,
  onDelete,
  onRemind,
  onKirimWaApproved,
  onEdit,
  onBookingCreated,
  onStatusChanged,
}: {
  draft: DraftAgreement;
  onClose: () => void;
  onDelete: (id: number) => void;
  onRemind: (id: number) => void;
  onKirimWaApproved: (id: number) => void;
  onEdit: (draft: DraftAgreement) => void;
  onBookingCreated: () => void;
  onStatusChanged: () => void;
}) {
  const { toast } = useToast();
  const qcPanel = useQueryClient();
  const [, setLocation] = useLocation();
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [waPhone, setWaPhone] = useState(draft.phone ?? "");
  const [postBookingResult, setPostBookingResult] = useState<{ tenantId: number; bookingId: number } | null>(null);

  const kirimWaManualMutation = useMutation({
    mutationFn: ({ id, targetPhone }: { id: number; targetPhone: string }) =>
      apiFetchJson(`/api/draft-agreements/${id}/kirim-wa-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: targetPhone }),
      }),
    onSuccess: (data: { message?: string }) => {
      toast({ title: "WA Terkirim! ✅", description: data?.message ?? "Link dokumen berhasil dikirim via WhatsApp." });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal Kirim WA", description: err.message, variant: "destructive" });
    },
  });
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "approved" | "rejected" | null;
    note: string;
  }>({ open: false, type: null, note: "" });
  const [bookingForm, setBookingForm] = useState({
    startDate: draft.startDate ?? "",
    endDate: draft.endDate ?? "",
    rentAmount: draft.rentAmount ? String(Number(draft.rentAmount)) : "",
    depositAmount: draft.depositAmount ? String(Number(draft.depositAmount)) : "",
    unitCode: draft.unitCode ?? "",
    areaName: draft.areaName ?? "",
    billingCycle: "monthly" as "monthly" | "quarterly" | "yearly",
    notes: "",
  });

  const { data: availableUnits = [], isLoading: loadingUnits } = useQuery<MallUnitInfo[]>({
    queryKey: ["mall-units-available"],
    queryFn: async () => {
      const res = await apiFetch("/api/mall-units");
      if (!res.ok) return [];
      const data = await res.json() as any[];
      return data
        .filter((u) => u.status === "available")
        .map((u) => ({
          unitCode: u.unitCode as string,
          areaName: (u.areaKantin ?? u.zone ?? u.floor ?? "") as string,
          defaultRentAmount: u.defaultRentAmount ? Number(u.defaultRentAmount) : null,
          status: u.status as string,
        }));
    },
    staleTime: 60_000,
  });

  const waLogQuery = useQuery<WaLog[]>({
    queryKey: ["draft-wa-log", draft.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/draft-agreements/${draft.id}/wa-log`);
      const body = await res.json() as { success: boolean; logs: WaLog[] };
      if (!res.ok) throw new Error("Gagal memuat riwayat WA");
      return body.logs;
    },
    staleTime: 30_000,
  });

  const kirimWaMutation = useMutation({
    mutationFn: async (phone: string) => {
      const res = await apiFetch(`/api/draft-agreements/${draft.id}/kirim-wa-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = await res.json() as { success?: boolean; error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      return body;
    },
    onSuccess: () => {
      toast({ title: "WA berhasil dikirim!", description: `Pesan terkirim ke ${waPhone}` });
      qcPanel.invalidateQueries({ queryKey: ["draft-wa-log", draft.id] });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal kirim WA", description: err.message, variant: "destructive" });
      qcPanel.invalidateQueries({ queryKey: ["draft-wa-log", draft.id] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ status, note }: { status: "approved" | "rejected"; note?: string }) => {
      const res = await apiFetch(`/api/calon-tenant/${draft.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      return body as { success: boolean; status: string; waSent: boolean; bookingId?: number | null; tenantId?: number | null };
    },
    onSuccess: (result) => {
      const isApproved = result.status === "approved";
      const bookingCreated = isApproved && result.bookingId;
      toast({
        title: isApproved ? "Calon tenant disetujui!" : "Calon tenant ditolak",
        description: bookingCreated
          ? `Booking tenant otomatis dibuat (ID: ${result.bookingId}). ${result.waSent ? "Notifikasi WA terkirim." : ""}`
          : result.waSent
            ? "Notifikasi WhatsApp telah dikirim ke calon tenant."
            : "Status berhasil diperbarui.",
      });
      setConfirmDialog({ open: false, type: null, note: "" });
      onStatusChanged();
    },
    onError: (err: Error) => {
      toast({ title: "Gagal memperbarui status", description: err.message, variant: "destructive" });
    },
  });

  const jadikanBookingMutation = useMutation({
    mutationFn: async (form: typeof bookingForm) => {
      const res = await apiFetch(`/api/draft-agreements/${draft.id}/jadikan-booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: form.startDate,
          endDate: form.endDate,
          rentAmount: form.rentAmount ? Number(form.rentAmount) : undefined,
          depositAmount: form.depositAmount ? Number(form.depositAmount) : undefined,
          unitCode: form.unitCode || undefined,
          areaName: form.areaName || undefined,
          billingCycle: form.billingCycle,
          notes: form.notes || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      return body as { success: boolean; tenantId: number; bookingId: number; message: string };
    },
    onSuccess: (result) => {
      setShowBookingDialog(false);
      setPostBookingResult({ tenantId: result.tenantId, bookingId: result.bookingId });
      onBookingCreated();
    },
    onError: (err: Error) => {
      toast({ title: "Gagal membuat booking", description: err.message, variant: "destructive" });
    },
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (bookingId: number) => {
      const res = await apiFetch(`/api/tenant-invoices/generate-from-booking/${bookingId}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      return body as { id: number; invoiceNumber: string };
    },
    onSuccess: () => {
      toast({ title: "Invoice berhasil dibuat!", description: "Mengarahkan ke halaman Invoice & Pembayaran..." });
      setTimeout(() => setLocation("/tenant-invoices"), 800);
    },
    onError: (err: Error) => {
      toast({ title: "Gagal buat invoice", description: err.message, variant: "destructive" });
    },
  });

  function copyLink() {
    navigator.clipboard.writeText(draft.publicUrl).then(() => {
      toast({ title: "Link disalin!", description: draft.publicUrl });
    });
  }

  const canCreateBooking = draft.status === "approved" && !draft.bookingId;
  const alreadyConverted = !!draft.bookingId;

  return (
    <>
      <Card className="border-0 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{draft.brandName}</CardTitle>
              <CardDescription className="mt-0.5">{draft.tenantName} · {draft.phone}</CardDescription>
            </div>
            <StatusBadge status={draft.status} />
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <DocTypeBadge type={draft.docType} />
            {draft.source === "self_register" && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                🌐 Pendaftaran Mandiri
              </span>
            )}
            {alreadyConverted && (
              <span className="inline-flex items-center gap-1 text-xs text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
                <BookmarkCheck className="h-3 w-3" />Booking #{draft.bookingId}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 text-sm">
          {/* ── Panel sukses setelah booking dibuat ── */}
          {postBookingResult && (
            <div className="rounded-lg bg-emerald-50 border-2 border-emerald-300 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Tenant &amp; Booking berhasil dibuat!</p>
                  <p className="text-xs text-emerald-700">WA notifikasi kontrak otomatis dikirim ke tenant.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white w-full justify-start"
                  onClick={() => generateInvoiceMutation.mutate(postBookingResult.bookingId)}
                  disabled={generateInvoiceMutation.isPending}
                >
                  {generateInvoiceMutation.isPending
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <CreditCard className="h-3.5 w-3.5" />}
                  Buat Invoice Pertama &amp; Lanjut ke Pembayaran
                </Button>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100 flex-1"
                    onClick={() => setLocation("/tenant-invoices")}
                  >
                    <CreditCard className="h-3 w-3" />Invoice
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 flex-1"
                    onClick={() => setLocation("/booking-tenant")}
                  >
                    <BookmarkCheck className="h-3 w-3" />Booking
                  </Button>
                </div>
              </div>
            </div>
          )}

          {canCreateBooking && !postBookingResult && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-800">✅ Dokumen telah disetujui oleh calon tenant</p>
              <p className="text-xs text-emerald-700">Buat kontrak resmi tenant dan booking di sistem untuk mulai proses sewa.</p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => setShowBookingDialog(true)}
                >
                  <BookmarkCheck className="h-3.5 w-3.5" />Buat Tenant &amp; Booking
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                  onClick={() => onKirimWaApproved(draft.id)}
                >
                  <MessageCircle className="h-3.5 w-3.5" />Kirim WA Disetujui
                </Button>
              </div>
            </div>
          )}

          {alreadyConverted && !postBookingResult && (
            <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-violet-800">Draf ini sudah dikonversi ke booking resmi</p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-violet-300 text-violet-700"
                  onClick={() => setLocation("/booking-tenant")}
                >
                  <BookmarkCheck className="h-3 w-3" />Lihat di Booking Tenant
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-sky-300 text-sky-700 hover:bg-sky-50"
                  onClick={() => setLocation("/tenant-invoices")}
                >
                  <CreditCard className="h-3 w-3" />Invoice &amp; Pembayaran
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-muted p-3 space-y-2">
            <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Link Dokumen Calon Tenant</p>
            <p className="break-all text-primary font-mono text-xs">{draft.publicUrl}</p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={copyLink}>
                <Copy className="h-3 w-3" />Salin Link
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                <a href={draft.publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />Buka
                </a>
              </Button>
              {draft.status === "pending" && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => onRemind(draft.id)}
                >
                  <Send className="h-3 w-3" />Kirim via WA
                </Button>
              )}
              {draft.status === "approved" && !alreadyConverted && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => onKirimWaApproved(draft.id)}
                >
                  <MessageCircle className="h-3 w-3" />Kirim WA Notif
                </Button>
              )}
            </div>
            {/* Kirim ke nomor WA manual */}
            <div className="pt-1 border-t border-muted-foreground/20">
              <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                <Phone className="h-3 w-3" />Kirim link ke nomor WA lain
              </p>
              <div className="flex gap-2">
                <Input
                  type="tel"
                  placeholder="Contoh: 08123456789"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  className="h-8 text-xs flex-1 bg-background"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white shrink-0"
                  disabled={kirimWaManualMutation.isPending || waPhone.trim().length < 8}
                  onClick={() => kirimWaManualMutation.mutate({ id: draft.id, targetPhone: waPhone.trim() })}
                >
                  {kirimWaManualMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />
                  }
                  {kirimWaManualMutation.isPending ? "Mengirim..." : "Kirim WA"}
                </Button>
              </div>
            </div>
          </div>

          {/* Kirim WA Manual */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />Kirim WhatsApp
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 text-xs pl-8"
                  placeholder="628xxxxxxxxx"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                className="h-8 gap-1.5 shrink-0"
                disabled={kirimWaMutation.isPending || !waPhone.trim()}
                onClick={() => kirimWaMutation.mutate(waPhone.trim())}
              >
                <Send className="h-3.5 w-3.5" />
                {kirimWaMutation.isPending ? "Mengirim..." : "Kirim WA"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Link dokumen akan dikirim ke nomor di atas via WhatsApp.</p>
          </div>

          {/* Riwayat Pengiriman WA */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />Riwayat Pengiriman WA
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => qcPanel.invalidateQueries({ queryKey: ["draft-wa-log", draft.id] })}
                title="Refresh"
              >
                <RefreshCw className={`h-3 w-3 ${waLogQuery.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {waLogQuery.isLoading ? (
              <p className="text-xs text-muted-foreground py-2 text-center">Memuat riwayat...</p>
            ) : waLogQuery.data && waLogQuery.data.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {waLogQuery.data.map((log) => (
                  <div key={log.id} className="rounded border bg-background p-2 text-xs space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-muted-foreground truncate">{log.phoneNumber}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          log.status === "success"
                            ? "bg-emerald-100 text-emerald-700"
                            : log.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {log.status === "success" ? <CheckCircle2 className="h-2.5 w-2.5" /> : log.status === "failed" ? <XCircle className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                          {log.status === "success" ? "Berhasil" : log.status === "failed" ? "Gagal" : "Pending"}
                        </span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${log.type === "manual" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                          {log.type === "manual" ? "Manual" : "Otomatis"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{new Date(log.sentAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
                      {log.sentBy && <span>oleh {log.sentBy}</span>}
                    </div>
                    {log.errorMessage && (
                      <p className="text-red-600 mt-0.5 bg-red-50 rounded px-1.5 py-0.5">{log.errorMessage}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-3 text-center">Belum ada pengiriman WA</p>
            )}
          </div>

          {draft.picName && (
            <div><p className="text-xs text-muted-foreground">Nama PIC / Penanggung Jawab</p><p className="font-medium">{draft.picName}</p></div>
          )}
          {draft.interestedUnit && (
            <div><p className="text-xs text-muted-foreground">Unit yang Diminati</p><p className="font-medium">{draft.interestedUnit}</p></div>
          )}
          {draft.agreementStatus && (
            <div className={`rounded-lg border p-3 ${draft.agreementStatus === "setuju" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <p className="text-xs text-muted-foreground mb-1">Status Persetujuan Ketentuan Sewa</p>
              <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${draft.agreementStatus === "setuju" ? "text-emerald-700" : "text-amber-700"}`}>
                {draft.agreementStatus === "setuju" ? "✅ Menyetujui ketentuan sewa" : "⚠️ Tidak menyetujui ketentuan sewa"}
              </span>
              {draft.agreementStatus === "tidak_setuju" && draft.disagreementReason && (
                <p className="text-xs text-amber-700 mt-1.5 leading-relaxed border-t border-amber-200 pt-1.5">
                  <span className="font-medium">Alasan: </span>{draft.disagreementReason}
                </p>
              )}
            </div>
          )}
          {draft.leaseDurationMonths && (
            <div><p className="text-xs text-muted-foreground">Preferensi Durasi Sewa</p><p className="font-medium">{draft.leaseDurationMonths} bulan</p></div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{draft.email || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Jenis Usaha</p><p className="font-medium">{draft.businessType}</p></div>
            <div className="col-span-2"><p className="text-xs text-muted-foreground">Alamat</p><p className="font-medium">{draft.address || "—"}</p></div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><p className="text-xs text-muted-foreground">Unit / Lokasi</p><p className="font-medium">{[draft.unitCode, draft.areaName].filter(Boolean).join(" — ") || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Durasi</p><p className="font-medium">{draft.periodLabel || (draft.durationMonths ? `${draft.durationMonths} bulan` : "—")}</p></div>
            <div><p className="text-xs text-muted-foreground">Mulai</p><p className="font-medium">{formatTanggal(draft.startDate)}</p></div>
            <div><p className="text-xs text-muted-foreground">Selesai</p><p className="font-medium">{formatTanggal(draft.endDate)}</p></div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><p className="text-xs text-muted-foreground">Harga Sewa/Bulan</p><p className="font-semibold text-primary">{formatRp(draft.rentAmount)}</p></div>
            <div><p className="text-xs text-muted-foreground">Deposit/Jaminan</p><p className="font-semibold">{formatRp(draft.depositAmount)}</p></div>
          </div>

          {draft.status !== "pending" && (
            <div className="rounded-lg border p-3 space-y-1.5">
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Respon Tenant</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div><p className="text-muted-foreground">Nama Responden</p><p className="font-medium">{draft.respondedName || "—"}</p></div>
                <div><p className="text-muted-foreground">Waktu Respon</p><p className="font-medium">{formatTanggal(draft.respondedAt)}</p></div>
              </div>
              {draft.rejectionReason && (
                <div className="mt-1.5">
                  <p className="text-xs text-muted-foreground">Alasan Penolakan</p>
                  <p className="text-sm mt-0.5 text-red-700 bg-red-50 rounded p-2">{draft.rejectionReason}</p>
                </div>
              )}
            </div>
          )}

          {draft.expiresAt && (
            <p className="text-xs text-muted-foreground">
              Link kedaluwarsa: {formatTanggal(draft.expiresAt)}
            </p>
          )}

          {(draft.status === "pending" || (draft.status === "approved" && !draft.bookingId)) && (
            <div className={`rounded-lg border p-3 space-y-2 ${draft.status === "approved" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <p className={`text-xs font-semibold ${draft.status === "approved" ? "text-emerald-800" : "text-amber-800"}`}>
                {draft.status === "approved" ? "⚡ Buat Booking Otomatis" : "Tindakan Admin"}
              </p>
              <p className={`text-xs ${draft.status === "approved" ? "text-emerald-700" : "text-amber-700"}`}>
                {draft.status === "approved"
                  ? "Tenant sudah menandatangani dokumen. Klik tombol di bawah untuk membuat data Tenant & Booking secara otomatis."
                  : "Setujui atau tolak pendaftaran calon tenant ini. Notifikasi WhatsApp akan dikirim otomatis."}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
                  onClick={() => setConfirmDialog({ open: true, type: "approved", note: "" })}
                  disabled={statusMutation.isPending}
                >
                  {draft.status === "approved"
                    ? <><BookmarkCheck className="h-3.5 w-3.5" />Buat Booking</>
                    : <><ThumbsUp className="h-3.5 w-3.5" />Setujui</>}
                </Button>
                {draft.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 flex-1"
                    onClick={() => setConfirmDialog({ open: true, type: "rejected", note: "" })}
                    disabled={statusMutation.isPending}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />Tolak
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-2 pt-2 border-t">
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={onClose}>Tutup</Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => onEdit(draft)}>
                ✏️ Edit
              </Button>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="gap-1" asChild>
                <a href={draft.publicUrl} target="_blank" rel="noopener noreferrer">
                  🖨️ PDF
                </a>
              </Button>
              <Button size="sm" variant="destructive" className="gap-1" onClick={() => onDelete(draft.id)}>
                <Trash2 className="h-3.5 w-3.5" />Hapus
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Konfirmasi Approve / Reject */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, type: null, note: "" })}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog.type === "approved"
                ? draft.status === "approved"
                  ? <><BookmarkCheck className="h-4 w-4 text-emerald-600" />Buat Booking Otomatis?</>
                  : <><ThumbsUp className="h-4 w-4 text-emerald-600" />Setujui Calon Tenant?</>
                : <><ThumbsDown className="h-4 w-4 text-red-600" />Tolak Calon Tenant?</>}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.type === "approved"
                ? draft.status === "approved"
                  ? <>Tenant <strong>{draft.brandName}</strong> sudah menandatangani. Booking akan dibuat otomatis di Booking Tenant.</>
                  : <>Pendaftaran <strong>{draft.brandName}</strong> akan disetujui. Notifikasi WA akan dikirim ke calon tenant.</>
                : <>Pendaftaran <strong>{draft.brandName}</strong> akan ditolak. Notifikasi WA akan dikirim ke calon tenant.</>}
            </DialogDescription>
          </DialogHeader>
          {confirmDialog.type === "rejected" && (
            <div className="space-y-1.5">
              <Label>Alasan Penolakan (opsional)</Label>
              <Textarea
                rows={3}
                placeholder="Tulis alasan penolakan untuk calon tenant..."
                value={confirmDialog.note}
                onChange={(e) => setConfirmDialog((s) => ({ ...s, note: e.target.value }))}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog({ open: false, type: null, note: "" })}
              disabled={statusMutation.isPending}
            >
              Batal
            </Button>
            <Button
              className={confirmDialog.type === "approved"
                ? "bg-emerald-600 hover:bg-emerald-700 gap-2"
                : "bg-red-600 hover:bg-red-700 gap-2"}
              onClick={() => {
                if (confirmDialog.type) {
                  statusMutation.mutate({ status: confirmDialog.type, note: confirmDialog.note || undefined });
                }
              }}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : confirmDialog.type === "approved"
                  ? <ThumbsUp className="h-3.5 w-3.5" />
                  : <ThumbsDown className="h-3.5 w-3.5" />}
              {confirmDialog.type === "approved" ? "Ya, Setujui" : "Ya, Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Buat Tenant & Booking */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkCheck className="h-4 w-4 text-emerald-600" />Buat Tenant &amp; Booking Resmi
            </DialogTitle>
            <DialogDescription>
              Data dari draf <strong>{draft.brandName}</strong> akan digunakan untuk membuat tenant dan kontrak booking di sistem.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-lg bg-slate-50 border p-3 space-y-1 text-xs">
              <p className="font-semibold text-slate-700">Data Tenant (dari draf)</p>
              <p><span className="text-muted-foreground">Nama:</span> {draft.tenantName}</p>
              <p><span className="text-muted-foreground">Brand:</span> {draft.brandName}</p>
              <p><span className="text-muted-foreground">Telepon:</span> {draft.phone}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <UnitPickerRow
                unitCode={bookingForm.unitCode}
                areaName={bookingForm.areaName}
                onUnitCode={(v) => setBookingForm((f) => ({ ...f, unitCode: v }))}
                onAreaName={(v) => setBookingForm((f) => ({ ...f, areaName: v }))}
                onRentAmount={(v) => setBookingForm((f) => ({ ...f, rentAmount: v }))}
                availableUnits={availableUnits}
                loadingUnits={loadingUnits}
              />
              <div className="space-y-1.5">
                <Label>Tanggal Mulai <span className="text-destructive">*</span></Label>
                <Input type="date" value={bookingForm.startDate} onChange={(e) => setBookingForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tanggal Selesai <span className="text-destructive">*</span></Label>
                <Input type="date" value={bookingForm.endDate} onChange={(e) => setBookingForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Harga Sewa/Bulan (Rp)</Label>
                <Input placeholder="0" value={bookingForm.rentAmount} onChange={(e) => setBookingForm((f) => ({ ...f, rentAmount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Deposit (Rp)</Label>
                <Input placeholder="0" value={bookingForm.depositAmount} onChange={(e) => setBookingForm((f) => ({ ...f, depositAmount: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Siklus Tagihan</Label>
              <Select
                value={bookingForm.billingCycle}
                onValueChange={(v) => setBookingForm((f) => ({ ...f, billingCycle: v as typeof f.billingCycle }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Bulanan</SelectItem>
                  <SelectItem value="quarterly">Triwulan (3 bulan)</SelectItem>
                  <SelectItem value="yearly">Tahunan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Catatan Internal</Label>
              <Textarea
                rows={2}
                placeholder="Catatan admin (opsional)"
                value={bookingForm.notes}
                onChange={(e) => setBookingForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookingDialog(false)}>Batal</Button>
            <Button
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              disabled={
                jadikanBookingMutation.isPending ||
                !bookingForm.startDate ||
                !bookingForm.endDate ||
                bookingForm.endDate <= bookingForm.startDate
              }
              onClick={() => jadikanBookingMutation.mutate(bookingForm)}
            >
              {jadikanBookingMutation.isPending
                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Membuat...</>
                : <><BookmarkCheck className="h-3.5 w-3.5" />Buat Tenant &amp; Booking</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Komponen utama halaman ─────────────────────────────────────────────────────
export default function DrafPerjanjian() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const rawSearch = useSearch();

  // ── URL state helpers ───────────────────────────────────────────────────────
  const params = new URLSearchParams(rawSearch);
  const page     = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const limit    = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "20", 10) || 20));
  const status   = params.get("status")   ?? "all";
  const source   = params.get("source")   ?? "all";
  const search   = params.get("search")   ?? "";
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo   = params.get("dateTo")   ?? "";
  const sortBy   = params.get("sortBy")   ?? "created_at";
  const sortDir  = params.get("sortDir")  ?? "desc";

  const setParams = useCallback((updates: Record<string, string | null>) => {
    const np = new URLSearchParams(rawSearch);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") np.delete(k);
      else np.set(k, v);
    }
    // reset to page 1 on any filter change (unless explicitly setting page)
    if (!("page" in updates)) np.set("page", "1");
    const qs = np.toString();
    setLocation(`/draf-perjanjian${qs ? "?" + qs : ""}`);
  }, [rawSearch, setLocation]);

  const resetFilters = useCallback(() => {
    setLocation("/draf-perjanjian");
  }, [setLocation]);

  // ── Local state ─────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState(search);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkReminder, setShowBulkReminder] = useState(false);
  const [showBlastUnit, setShowBlastUnit] = useState(false);
  const [form, setForm] = useState<CreateForm>(BLANK_FORM);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<DraftAgreement | null>(null);
  const [editForm, setEditForm] = useState<CreateForm>(BLANK_FORM);
  const [kirimLinkWaPhone, setKirimLinkWaPhone] = useState("");
  const [kirimLinkWaTouched, setKirimLinkWaTouched] = useState(false);
  const [showBlastHistory, setShowBlastHistory] = useState(false);

  // ── Helpers validasi nomor WA ──────────────────────────────────────────────
  const normalizePhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("0")) return "62" + digits.slice(1);
    if (digits.startsWith("8")) return "62" + digits;
    return digits;
  };
  const phoneError = (() => {
    if (!kirimLinkWaPhone.trim()) return "Nomor WA wajib diisi";
    const normalized = normalizePhone(kirimLinkWaPhone);
    if (!normalized.startsWith("62")) return "Nomor harus diawali 62, 08, atau 8";
    if (normalized.length < 10) return "Nomor terlalu pendek (min 10 digit)";
    if (normalized.length > 15) return "Nomor terlalu panjang (maks 15 digit)";
    return null;
  })();
  const phoneIsValid = phoneError === null;
  const phoneNormalized = phoneIsValid ? normalizePhone(kirimLinkWaPhone) : null;

  // ── Build API query string ─────────────────────────────────────────────────
  const apiQs = new URLSearchParams();
  apiQs.set("page", String(page));
  apiQs.set("limit", String(limit));
  if (status !== "all") apiQs.set("status", status);
  if (source !== "all") apiQs.set("source", source);
  if (search) apiQs.set("search", search);
  if (dateFrom) apiQs.set("dateFrom", dateFrom);
  if (dateTo) apiQs.set("dateTo", dateTo);
  apiQs.set("sortBy", sortBy);
  apiQs.set("sortDir", sortDir);

  // ── Query: available mall units (untuk picker) ────────────────────────────
  const { data: availableUnits = [], isLoading: loadingUnits } = useQuery<MallUnitInfo[]>({
    queryKey: ["mall-units-available"],
    queryFn: async () => {
      const res = await apiFetch("/api/mall-units");
      if (!res.ok) return [];
      const data = await res.json() as any[];
      return data
        .filter((u) => u.status === "available")
        .map((u) => ({
          unitCode: u.unitCode as string,
          areaName: (u.areaKantin ?? u.zone ?? u.floor ?? "") as string,
          defaultRentAmount: u.defaultRentAmount ? Number(u.defaultRentAmount) : null,
          status: u.status as string,
        }));
    },
    staleTime: 60_000,
  });

  // ── Query: paginated list ──────────────────────────────────────────────────
  const {
    data: pageData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<PaginatedResponse>({
    queryKey: ["draft-agreements", page, limit, status, source, search, dateFrom, dateTo, sortBy, sortDir],
    queryFn: () => apiFetchJson<PaginatedResponse>(`/api/draft-agreements?${apiQs.toString()}`),
    placeholderData: (prev) => prev,
  });

  const drafts = pageData?.data ?? [];
  const pagination = pageData?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1, hasNext: false, hasPrev: false };
  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  // ── Query: summary (aggregate) ────────────────────────────────────────────
  const { data: summary } = useQuery<SummaryResponse>({
    queryKey: ["draft-agreements-summary"],
    queryFn: () => apiFetchJson<SummaryResponse>("/api/draft-agreements/summary"),
    staleTime: 30_000,
  });

  // ── Active filter count ───────────────────────────────────────────────────
  const activeFilterCount = [
    status !== "all",
    source !== "all",
    search !== "",
    dateFrom !== "",
    dateTo !== "",
  ].filter(Boolean).length;

  // ── Sort handler ──────────────────────────────────────────────────────────
  function handleSort(col: string, dir: string) {
    setParams({ sortBy: col, sortDir: dir });
  }

  // ── Helper: konversi form ke body API ─────────────────────────────────────
  function formToBody(f: CreateForm) {
    return {
      docType: f.docType,
      picName: f.picName.trim() || undefined,
      tenantName: f.tenantName.trim(),
      brandName: f.brandName.trim(),
      businessType: f.businessType.trim(),
      email: f.email.trim() || undefined,
      phone: f.phone.trim(),
      address: f.address.trim() || undefined,
      unitCode: f.unitCode.trim() || undefined,
      areaName: f.areaName.trim() || undefined,
      interestedUnit: f.interestedUnit.trim() || undefined,
      startDate: f.startDate || undefined,
      endDate: f.endDate || undefined,
      durationMonths: f.durationMonths ? parseInt(f.durationMonths) : undefined,
      periodLabel: f.periodLabel.trim() || undefined,
      rentAmount: f.rentAmount ? parseFloat(f.rentAmount.replace(/\./g, "").replace(",", ".")) : 0,
      depositAmount: f.depositAmount ? parseFloat(f.depositAmount.replace(/\./g, "").replace(",", ".")) : 0,
      paymentTerms: f.paymentTerms.trim() || undefined,
      notes: f.notes.trim() || undefined,
      expiresInDays: f.expiresInDays ? parseInt(f.expiresInDays) : 30,
    };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["draft-agreements"] });
    qc.invalidateQueries({ queryKey: ["draft-agreements-summary"] });
  }, [qc]);

  const createMutation = useMutation({
    mutationFn: async (f: CreateForm) => {
      const res = await apiFetch("/api/draft-agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToBody(f)),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Error ${res.status}`);
      }
      return res.json() as Promise<DraftAgreement>;
    },
    onSuccess: (created) => {
      invalidate();
      setShowCreate(false);
      setForm(BLANK_FORM);
      setSelectedId(created.id);
      toast({ title: "Draf berhasil dibuat!", description: `Link telah dibuat untuk ${created.brandName}` });
      navigator.clipboard.writeText(created.publicUrl).catch(() => {});
    },
    onError: (err: Error) => {
      toast({ title: "Gagal membuat draf", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/draft-agreements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
      setDeleteId(null);
      toast({ title: "Draf berhasil dihapus" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal menghapus", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, f }: { id: number; f: CreateForm }) => {
      const res = await apiFetch(`/api/draft-agreements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToBody(f)),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Error ${res.status}`);
      }
      return res.json() as Promise<DraftAgreement>;
    },
    onSuccess: (updated) => {
      invalidate();
      setEditDraft(null);
      setSelectedId(updated.id);
      toast({ title: "Draf berhasil diperbarui!" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal memperbarui", description: err.message, variant: "destructive" });
    },
  });

  const remindMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/draft-agreements/${id}/remind`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Pengingat terkirim!", description: "Link dokumen telah dikirim via WhatsApp" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal mengirim", description: err.message, variant: "destructive" });
    },
  });

  const kirimLinkWaMutation = useMutation({
    mutationFn: async (phone: string) => {
      const res = await apiFetch("/api/calon-tenant/kirim-link-wa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (res.status === 401) throw new Error("Sesi telah berakhir, silakan login kembali");
      const text = await res.text();
      let body: { success?: boolean; error?: string; message?: string };
      try { body = JSON.parse(text); } catch { throw new Error("Server tidak merespons dengan benar, coba beberapa saat lagi"); }
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      return body;
    },
    onSuccess: () => {
      toast({ title: "WA terkirim!", description: `Link pendaftaran berhasil dikirim ke ${phoneNormalized ?? kirimLinkWaPhone}` });
      setKirimLinkWaPhone("");
      setKirimLinkWaTouched(false);
      qc.invalidateQueries({ queryKey: ["link-wa-log"] });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal kirim WA", description: err.message, variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["link-wa-log"] });
    },
  });

  interface LinkWaLog {
    id: number;
    phoneNumber: string;
    sentAt: string;
    status: "success" | "failed" | "pending";
    sentBy: string | null;
    errorMessage: string | null;
  }

  const linkWaLogQuery = useQuery<LinkWaLog[]>({
    queryKey: ["link-wa-log"],
    queryFn: async () => {
      const res = await apiFetch("/api/calon-tenant/link-wa-log");
      const body = await res.json() as { success: boolean; logs: LinkWaLog[] };
      if (!res.ok) throw new Error("Gagal memuat riwayat");
      return body.logs;
    },
    staleTime: 30_000,
  });

  const { data: registrationUrlData } = useQuery<{ url: string | null }>({
    queryKey: ["registration-url"],
    queryFn: () => apiFetchJson<{ url: string | null }>("/api/calon-tenant/registration-url"),
    staleTime: 60_000,
  });

  const blastHistoryQuery = useQuery<BlastSessionLog[]>({
    queryKey: ["blast-session-logs"],
    queryFn: async () => {
      const res = await apiFetch("/api/calon-tenant/blast-history");
      const body = await res.json() as { success: boolean; logs: BlastSessionLog[] };
      if (!res.ok) throw new Error("Gagal memuat riwayat");
      return body.logs;
    },
    staleTime: 30_000,
  });

  const kirimWaApprovedMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/draft-agreements/${id}/kirim-wa-approved`, { method: "POST" }),
    onSuccess: (data: { skipped?: boolean }) => {
      if (data?.skipped) {
        toast({ title: "WA tidak dikirim", description: "FONNTE_TOKEN belum dikonfigurasi di Secrets." });
      } else {
        toast({ title: "Notifikasi WA terkirim!", description: "Pesan persetujuan telah dikirim ke calon tenant via WhatsApp." });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Gagal mengirim WA", description: err.message, variant: "destructive" });
    },
  });

  const bulkReminderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/calon-tenant/bulk-reminder", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      return body as { success: boolean; total: number; sent: number; failed: number; results: unknown[] };
    },
    onSuccess: (data) => {
      setShowBulkReminder(false);
      invalidate();
      qc.invalidateQueries({ queryKey: ["calon-tenant-pending-count"] });
      if (data.total === 0) {
        toast({ title: "Tidak ada penerima", description: "Tidak ada calon tenant pending dari pendaftaran mandiri." });
      } else if (data.failed === 0) {
        toast({ title: `Reminder terkirim ke ${data.sent} calon tenant`, description: "Semua notifikasi WhatsApp berhasil dikirim." });
      } else {
        toast({
          title: `Reminder dikirim: ${data.sent} berhasil, ${data.failed} gagal`,
          description: `dari total ${data.total} calon tenant pending.`,
          variant: data.sent === 0 ? "destructive" : "default",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Gagal kirim bulk reminder", description: err.message, variant: "destructive" });
    },
  });

  const blastUnitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/calon-tenant/blast-unit-tersedia", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      return body as { success: boolean; total: number; sent: number; failed: number; skipped: number; availableUnits?: string[]; message?: string };
    },
    onSuccess: (data) => {
      setShowBlastUnit(false);
      qc.invalidateQueries({ queryKey: ["blast-session-logs"] });
      if (data.total === 0) {
        toast({ title: "Tidak ada penerima", description: data.message ?? "Tidak ada calon tenant pending saat ini." });
      } else if (data.failed === 0) {
        toast({ title: `Notifikasi terkirim ke ${data.sent} calon tenant`, description: `${data.skipped} dilewati (unit tidak cocok). Unit tersedia: ${(data.availableUnits ?? []).join(", ")}` });
      } else {
        toast({
          title: `Blast dikirim: ${data.sent} berhasil, ${data.failed} gagal, ${data.skipped} dilewati`,
          description: `dari total ${data.total} calon tenant.`,
          variant: data.sent === 0 ? "destructive" : "default",
        });
      }
      setShowBlastHistory(true);
    },
    onError: (err: Error) => {
      toast({ title: "Gagal blast notifikasi unit", description: err.message, variant: "destructive" });
    },
  });

  function setField(key: keyof CreateForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setEditField(key: keyof CreateForm, value: string) {
    setEditForm((f) => ({ ...f, [key]: value }));
  }

  function handleOpenEdit(d: DraftAgreement) {
    setEditDraft(d);
    setEditForm({
      docType: d.docType,
      picName: d.picName ?? "",
      tenantName: d.tenantName,
      brandName: d.brandName,
      businessType: d.businessType,
      email: d.email ?? "",
      phone: d.phone,
      address: d.address ?? "",
      unitCode: d.unitCode ?? "",
      areaName: d.areaName ?? "",
      interestedUnit: d.interestedUnit ?? "",
      startDate: d.startDate ?? "",
      endDate: d.endDate ?? "",
      durationMonths: d.durationMonths?.toString() ?? "",
      periodLabel: d.periodLabel ?? "",
      rentAmount: d.rentAmount?.toString() ?? "",
      depositAmount: d.depositAmount?.toString() ?? "",
      paymentTerms: d.paymentTerms ?? "",
      notes: d.notes ?? "",
      expiresInDays: "30",
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const pendingCount = summary?.pending ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Draf Perjanjian Sewa
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Buat dan kirim Surat Minat atau Perjanjian Sewa kepada calon tenant untuk ditandatangani secara online.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            className="gap-2 border-sky-300 text-sky-700 hover:bg-sky-50"
            onClick={() => setShowBlastUnit(true)}
            disabled={blastUnitMutation.isPending}
          >
            {blastUnitMutation.isPending
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <DoorOpen className="h-4 w-4" />}
            Notif Unit Kosong
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowBulkReminder(true)}
            disabled={pendingCount === 0 || bulkReminderMutation.isPending}
          >
            {bulkReminderMutation.isPending
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <BellRing className="h-4 w-4" />}
            Kirim Reminder WA
            {pendingCount > 0 && (
              <span className="ml-0.5 bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold px-1.5 py-0.5 rounded-full leading-none">
                {pendingCount}
              </span>
            )}
          </Button>
          <Button className="gap-2" onClick={() => setShowCreate(true)}>
            <FilePlus className="h-4 w-4" />
            Buat Draf Baru
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Total", value: summary?.total ?? 0,        color: "text-slate-700 bg-slate-50 border-slate-200" },
          { label: "Menunggu",  value: summary?.pending ?? 0,    color: "text-amber-700 bg-amber-50 border-amber-200" },
          { label: "Disetujui", value: summary?.approved ?? 0,   color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { label: "Ditolak",   value: summary?.rejected ?? 0,   color: "text-red-700 bg-red-50 border-red-200" },
          { label: "Hari Ini",  value: summary?.today ?? 0,      color: "text-sky-700 bg-sky-50 border-sky-200" },
          { label: "Bulan Ini", value: summary?.thisMonth ?? 0,  color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
          { label: "🌐 Mandiri",value: summary?.selfRegister ?? 0,color: "text-blue-700 bg-blue-50 border-blue-200" },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg border p-3 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Link Pendaftaran Mandiri */}
      {(() => {
        const registerUrl = registrationUrlData?.url ?? null;
        return (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 text-blue-700 shrink-0">
                <Link2 className="h-4 w-4" />
                <span className="text-sm font-medium">Link Pendaftaran Mandiri</span>
              </div>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <code className="text-xs bg-white border border-blue-200 rounded px-2 py-1 text-blue-800 truncate flex-1 block">
                  {registerUrl ?? <span className="text-gray-400 italic">Konfigurasi APP_URL di Secrets untuk menampilkan link</span>}
                </code>
                {registerUrl && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-7 px-2 border-blue-300 text-blue-700 hover:bg-blue-100"
                      onClick={() => {
                        navigator.clipboard.writeText(registerUrl);
                        toast({ title: "Link disalin!", description: "Bagikan link ini kepada calon tenant untuk mendaftar sendiri." });
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <a href={registerUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="shrink-0 h-7 px-2 border-blue-300 text-blue-700 hover:bg-blue-100">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  </>
                )}
              </div>
            </div>
            {/* Kirim WA langsung */}
            <div className="space-y-1 pt-1 border-t border-blue-200">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-600 shrink-0" />
                <div className="relative flex-1">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-400" />
                  <Input
                    className={`h-8 text-xs pl-8 bg-white focus:border-blue-400 ${kirimLinkWaTouched && !phoneIsValid ? "border-red-400 focus:border-red-500" : "border-blue-200"}`}
                    placeholder="Nomor WA tujuan (cth: 628123456789 / 08xxx)"
                    value={kirimLinkWaPhone}
                    onChange={(e) => {
                      setKirimLinkWaPhone(e.target.value);
                      setKirimLinkWaTouched(true);
                    }}
                    onBlur={() => {
                      setKirimLinkWaTouched(true);
                      if (kirimLinkWaPhone.trim() && phoneIsValid && phoneNormalized) {
                        setKirimLinkWaPhone(phoneNormalized);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && phoneIsValid && !kirimLinkWaMutation.isPending) {
                        kirimLinkWaMutation.mutate(phoneNormalized!);
                      }
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 shrink-0 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                  disabled={kirimLinkWaMutation.isPending || !phoneIsValid}
                  onClick={() => {
                    setKirimLinkWaTouched(true);
                    if (phoneIsValid && phoneNormalized) kirimLinkWaMutation.mutate(phoneNormalized);
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  {kirimLinkWaMutation.isPending ? "Mengirim..." : "Kirim WA"}
                </Button>
              </div>
              {kirimLinkWaTouched && !phoneIsValid && kirimLinkWaPhone.trim() ? (
                <p className="text-xs text-red-500 pl-6">{phoneError}</p>
              ) : phoneIsValid && phoneNormalized && phoneNormalized !== kirimLinkWaPhone ? (
                <p className="text-xs text-green-600 pl-6">Akan dikirim ke: <strong>{phoneNormalized}</strong></p>
              ) : (
                <p className="text-xs text-blue-500">Masukkan nomor WA calon tenant dan klik <strong>Kirim WA</strong> — link formulir pendaftaran akan langsung dikirim.</p>
              )}
            </div>
            {/* Riwayat pengiriman link WA */}
            {linkWaLogQuery.data && linkWaLogQuery.data.length > 0 && (
              <div className="pt-2 border-t border-blue-200">
                <p className="text-xs font-medium text-blue-700 mb-2 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />Riwayat Kirim Link WA (30 terakhir)
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {linkWaLogQuery.data.map((log) => (
                    <div key={log.id} className="flex items-start justify-between gap-2 text-xs bg-white/60 rounded px-2 py-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${log.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {log.status === "success" ? "✓ Berhasil" : "✗ Gagal"}
                        </span>
                        <span className="truncate text-gray-700 font-mono">{log.phoneNumber}</span>
                        {log.errorMessage && (
                          <span className="text-red-500 truncate" title={log.errorMessage}>— {log.errorMessage}</span>
                        )}
                      </div>
                      <div className="text-gray-400 shrink-0 text-right">
                        <div>{new Date(log.sentAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</div>
                        <div>{new Date(log.sentAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Riwayat Blast Notifikasi Unit */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-sky-800 hover:bg-sky-50 transition-colors rounded-lg"
          onClick={() => setShowBlastHistory((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-sky-600" />
            Riwayat Blast Notifikasi Unit Kosong
            {blastHistoryQuery.data && blastHistoryQuery.data.length > 0 && (
              <span className="bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold px-1.5 py-0.5 rounded-full leading-none">
                {blastHistoryQuery.data.length}
              </span>
            )}
          </span>
          {showBlastHistory ? <ChevronUp className="h-4 w-4 text-sky-400" /> : <ChevronDown className="h-4 w-4 text-sky-400" />}
        </button>

        {showBlastHistory && (
          <div className="px-4 pb-4">
            {blastHistoryQuery.isLoading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />Memuat riwayat...
              </div>
            ) : !blastHistoryQuery.data || blastHistoryQuery.data.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Belum ada riwayat blast notifikasi unit.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-sky-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-sky-50">
                      <TableHead className="text-xs">Waktu</TableHead>
                      <TableHead className="text-xs">Dikirim Oleh</TableHead>
                      <TableHead className="text-xs text-center">
                        <span className="flex items-center justify-center gap-1"><Users className="h-3 w-3" />Total</span>
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        <span className="flex items-center justify-center gap-1 text-green-700"><CheckCheck className="h-3 w-3" />Berhasil</span>
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        <span className="flex items-center justify-center gap-1 text-red-600"><AlertCircle className="h-3 w-3" />Gagal</span>
                      </TableHead>
                      <TableHead className="text-xs text-center">
                        <span className="flex items-center justify-center gap-1 text-amber-600"><SkipForward className="h-3 w-3" />Dilewati</span>
                      </TableHead>
                      <TableHead className="text-xs">Unit Tersedia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blastHistoryQuery.data.map((log) => (
                      <TableRow key={log.id} className="text-xs hover:bg-sky-50/50">
                        <TableCell className="py-2 whitespace-nowrap">
                          <div className="font-medium">{new Date(log.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</div>
                          <div className="text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
                        </TableCell>
                        <TableCell className="py-2 text-muted-foreground">{log.sentBy ?? "—"}</TableCell>
                        <TableCell className="py-2 text-center font-semibold">{log.total}</TableCell>
                        <TableCell className="py-2 text-center">
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-semibold ${log.sent > 0 ? "bg-green-100 text-green-700" : "text-muted-foreground"}`}>
                            {log.sent}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-semibold ${log.failed > 0 ? "bg-red-100 text-red-700" : "text-muted-foreground"}`}>
                            {log.failed}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-semibold ${log.skipped > 0 ? "bg-amber-100 text-amber-700" : "text-muted-foreground"}`}>
                            {log.skipped}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 max-w-[180px]">
                          {log.metadata?.unitCodes && log.metadata.unitCodes.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {log.metadata.unitCodes.slice(0, 5).map((u) => (
                                <span key={u} className="inline-block bg-sky-100 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded text-[10px] font-mono">{u}</span>
                              ))}
                              {log.metadata.unitCodes.length > 5 && (
                                <span className="text-[10px] text-muted-foreground">+{log.metadata.unitCodes.length - 5} lagi</span>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="rounded-lg border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Search className="h-4 w-4 text-muted-foreground" />
            Filter & Pencarian
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs h-5 px-1.5">{activeFilterCount} aktif</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => {
                  setSearchInput("");
                  resetFilters();
                }}
              >
                <X className="h-3.5 w-3.5" />
                Reset Filter
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* Status */}
          <div className="space-y-1 col-span-2 md:col-span-1">
            <p className="text-xs text-muted-foreground font-medium">Status</p>
            <Select value={status} onValueChange={(v) => setParams({ status: v === "all" ? null : v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Semua Status</SelectItem>
                <SelectItem value="pending" className="text-xs">⏳ Menunggu</SelectItem>
                <SelectItem value="approved" className="text-xs">✅ Disetujui</SelectItem>
                <SelectItem value="rejected" className="text-xs">❌ Ditolak</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Source */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Sumber</p>
            <Select value={source} onValueChange={(v) => setParams({ source: v === "all" ? null : v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Semua Sumber</SelectItem>
                <SelectItem value="admin" className="text-xs">👤 Admin</SelectItem>
                <SelectItem value="self_register" className="text-xs">🌐 Daftar Mandiri</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date From */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <CalendarRange className="h-3 w-3" />Dari Tanggal
            </p>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setParams({ dateFrom: e.target.value || null })}
              className="h-8 text-xs"
            />
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <CalendarRange className="h-3 w-3" />Sampai Tanggal
            </p>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setParams({ dateTo: e.target.value || null })}
              className="h-8 text-xs"
            />
          </div>

          {/* Search */}
          <div className="space-y-1 col-span-2">
            <p className="text-xs text-muted-foreground font-medium">Cari</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Nama, brand, email, telepon..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setParams({ search: searchInput || null });
                }}
                onBlur={() => {
                  if (searchInput !== search) setParams({ search: searchInput || null });
                }}
                className="pl-8 h-8 text-xs"
              />
              {searchInput && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setSearchInput(""); setParams({ search: null }); }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabel + Detail */}
      <div className="flex gap-4">
        {/* Tabel */}
        <div className={`flex-1 min-w-0 rounded-lg border overflow-hidden ${selected ? "hidden md:block" : ""}`}>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs">Jenis</TableHead>
                <TableHead className="text-xs">
                  <SortHeader label="Calon Tenant" colKey="brand_name" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                </TableHead>
                <TableHead className="text-xs">Unit / Lokasi</TableHead>
                <TableHead className="text-xs">Sewa/Bulan</TableHead>
                <TableHead className="text-xs">
                  <SortHeader label="Status" colKey="status" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                </TableHead>
                <TableHead className="text-xs">
                  <SortHeader label="Dibuat" colKey="created_at" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                </TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : drafts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {activeFilterCount > 0 ? "Tidak ada data sesuai filter" : "Belum ada draf perjanjian"}
                  </TableCell>
                </TableRow>
              ) : (
                drafts.map((d) => (
                  <TableRow
                    key={d.id}
                    className={`cursor-pointer hover:bg-muted/30 ${selectedId === d.id ? "bg-primary/5" : ""} ${isFetching ? "opacity-70" : ""}`}
                    onClick={() => setSelectedId(selectedId === d.id ? null : d.id)}
                  >
                    <TableCell className="py-2.5"><DocTypeBadge type={d.docType} /></TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm">{d.brandName}</p>
                        {d.source === "self_register" && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full leading-none">🌐</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{d.tenantName}</p>
                    </TableCell>
                    <TableCell className="py-2.5 text-sm">
                      {[d.unitCode, d.areaName].filter(Boolean).join(" · ") || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm font-medium">{formatRp(d.rentAmount)}</TableCell>
                    <TableCell className="py-2.5"><StatusBadge status={d.status} /></TableCell>
                    <TableCell className="py-2.5 text-xs text-muted-foreground">{formatTanggal(d.createdAt)}</TableCell>
                    <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-sm">
                          <DropdownMenuItem className="gap-2" onClick={() => setSelectedId(d.id)}>
                            <Eye className="h-3.5 w-3.5" />Detail
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => {
                            navigator.clipboard.writeText(d.publicUrl);
                            toast({ title: "Link disalin!" });
                          }}>
                            <Copy className="h-3.5 w-3.5" />Salin Link
                          </DropdownMenuItem>
                          {d.status === "pending" && (
                            <DropdownMenuItem className="gap-2" onClick={() => remindMutation.mutate(d.id)}>
                              <Send className="h-3.5 w-3.5" />Kirim WA
                            </DropdownMenuItem>
                          )}
                          {(d.status === "pending" || (d.status === "approved" && !d.bookingId)) && (<>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 text-emerald-700 focus:text-emerald-700"
                              onClick={() => setSelectedId(d.id)}
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                              {d.status === "approved" ? "Setujui & Buat Booking..." : "Setujui / Tolak..."}
                            </DropdownMenuItem>
                          </>)}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive" onClick={() => setDeleteId(d.id)}>
                            <Trash2 className="h-3.5 w-3.5" />Hapus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {pagination.total > 0 && (
            <div className="border-t px-2">
              <PaginationBar
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                limit={pagination.limit}
                onPage={(p) => setParams({ page: String(p) })}
                onLimit={(l) => setParams({ limit: String(l), page: "1" })}
              />
            </div>
          )}
        </div>

        {/* Panel detail */}
        {selected && (
          <div className="w-full md:w-80 lg:w-96 shrink-0 rounded-lg border overflow-hidden">
            <DetailPanel
              draft={selected}
              onClose={() => setSelectedId(null)}
              onDelete={(id) => setDeleteId(id)}
              onRemind={(id) => remindMutation.mutate(id)}
              onKirimWaApproved={(id) => kirimWaApprovedMutation.mutate(id)}
              onEdit={handleOpenEdit}
              onBookingCreated={() => {
                invalidate();
                refetch();
              }}
              onStatusChanged={() => {
                invalidate();
                qc.invalidateQueries({ queryKey: ["calon-tenant-pending-count"] });
              }}
            />
          </div>
        )}
      </div>

      {/* Dialog: Konfirmasi Bulk Reminder WA */}
      <Dialog open={showBulkReminder} onOpenChange={(open) => !bulkReminderMutation.isPending && setShowBulkReminder(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-amber-600" />Kirim Reminder WA
            </DialogTitle>
            <DialogDescription>
              Sistem akan mengirimkan pesan WhatsApp pengingat ke semua calon tenant yang pendaftarannya masih
              <span className="font-semibold text-amber-700"> menunggu proses</span>.
              {pendingCount > 0 && (
                <span className="block mt-1 text-slate-600">
                  Estimasi penerima: <strong>{pendingCount}</strong> calon tenant.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Catatan:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Hanya calon tenant dari <strong>pendaftaran mandiri</strong> yang dikirim</li>
              <li>Pesan dikirim satu per satu (400ms delay) agar tidak dianggap spam</li>
              <li>Jika satu nomor gagal, pengiriman ke nomor lain tetap berlanjut</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkReminder(false)} disabled={bulkReminderMutation.isPending}>
              Batal
            </Button>
            <Button
              className="gap-2 bg-amber-600 hover:bg-amber-700"
              onClick={() => bulkReminderMutation.mutate()}
              disabled={bulkReminderMutation.isPending}
            >
              {bulkReminderMutation.isPending
                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Mengirim...</>
                : <><BellRing className="h-3.5 w-3.5" />Ya, Kirim Reminder</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Blast Notif Unit Kosong */}
      <Dialog open={showBlastUnit} onOpenChange={(open) => !blastUnitMutation.isPending && setShowBlastUnit(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-sky-600" />Notifikasi Unit Kosong
            </DialogTitle>
            <DialogDescription>
              Sistem akan mengirimkan WhatsApp ke semua calon tenant yang masih
              <span className="font-semibold text-sky-700"> menunggu (pending)</span> dan belum mendapat unit,
              memberitahu bahwa ada unit yang kini kosong dan siap disewa.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-xs text-sky-800 space-y-1">
            <p className="font-semibold">Cara kerja:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Calon tenant yang mencantumkan unit minat → hanya dikirimi jika unit itu kosong</li>
              <li>Calon tenant tanpa minat unit → dikirimi semua unit yang kosong</li>
              <li>Delay 400ms per pesan agar tidak dianggap spam</li>
              <li>Juga berjalan otomatis saat booking diterminasi</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlastUnit(false)} disabled={blastUnitMutation.isPending}>
              Batal
            </Button>
            <Button
              className="gap-2 bg-sky-600 hover:bg-sky-700"
              onClick={() => blastUnitMutation.mutate()}
              disabled={blastUnitMutation.isPending}
            >
              {blastUnitMutation.isPending
                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Mengirim...</>
                : <><Megaphone className="h-3.5 w-3.5" />Ya, Kirim Notifikasi</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Buat Draf Baru */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="h-4 w-4" />Buat Draf Perjanjian Baru
            </DialogTitle>
            <DialogDescription>
              Isi data calon tenant. Setelah disimpan, link dokumen online akan dibuat dan dapat Anda kirimkan kepada calon tenant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label>Jenis Dokumen <span className="text-destructive">*</span></Label>
              <Select value={form.docType} onValueChange={(v) => setField("docType", v as CreateForm["docType"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="surat_minat">📄 Surat Minat Menyewa Tenant</SelectItem>
                  <SelectItem value="perjanjian_sewa">📋 Draf Perjanjian Sewa Tenant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">Data Calon Tenant</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Nama PIC / Penanggung Jawab</Label>
                  <Input placeholder="Nama pejabat/penanggung jawab (jika berbeda dari pemilik)" value={form.picName} onChange={(e) => setField("picName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nama Lengkap Pemilik <span className="text-destructive">*</span></Label>
                  <Input placeholder="Nama pemilik/penanggung jawab" value={form.tenantName} onChange={(e) => setField("tenantName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nama Brand/Usaha <span className="text-destructive">*</span></Label>
                  <Input placeholder="Nama toko/brand" value={form.brandName} onChange={(e) => setField("brandName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Jenis Usaha <span className="text-destructive">*</span></Label>
                  <Input placeholder="misal: Kuliner, Fashion, dll." value={form.businessType} onChange={(e) => setField("businessType", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>No. WhatsApp/Telepon <span className="text-destructive">*</span></Label>
                  <Input placeholder="628xxxxxxxxx" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input placeholder="email@domain.com" value={form.email} onChange={(e) => setField("email", e.target.value)} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Alamat</Label>
                  <Input placeholder="Alamat lengkap" value={form.address} onChange={(e) => setField("address", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">Unit &amp; Periode Sewa</h3>
              <div className="grid grid-cols-2 gap-3">
                <UnitPickerRow
                  unitCode={form.unitCode}
                  areaName={form.areaName}
                  onUnitCode={(v) => setField("unitCode", v)}
                  onAreaName={(v) => setField("areaName", v)}
                  onRentAmount={(v) => setField("rentAmount", v)}
                  availableUnits={availableUnits}
                  loadingUnits={loadingUnits}
                />
                <div className="space-y-1.5">
                  <Label>Tanggal Mulai</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setField("startDate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tanggal Selesai</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setField("endDate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Durasi (Bulan)</Label>
                  <Input type="number" placeholder="12" value={form.durationMonths} onChange={(e) => setField("durationMonths", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Label Periode</Label>
                  <Input placeholder="misal: 1 Tahun (Jan–Des 2025)" value={form.periodLabel} onChange={(e) => setField("periodLabel", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">Keuangan</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Harga Sewa/Bulan (Rp)</Label>
                  <Input placeholder="0" value={form.rentAmount} onChange={(e) => setField("rentAmount", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Deposit/Jaminan (Rp)</Label>
                  <Input placeholder="0" value={form.depositAmount} onChange={(e) => setField("depositAmount", e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Ketentuan Pembayaran</Label>
                  <Textarea rows={2} value={form.paymentTerms} onChange={(e) => setField("paymentTerms", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Catatan Tambahan</Label>
              <Textarea rows={2} placeholder="Catatan atau syarat khusus (opsional)" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Masa Berlaku Link (hari)</Label>
              <Input type="number" placeholder="30" value={form.expiresInDays} onChange={(e) => setField("expiresInDays", e.target.value)} className="max-w-xs" />
              <p className="text-xs text-muted-foreground">Link dokumen akan kedaluwarsa setelah {form.expiresInDays || 30} hari.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setForm(BLANK_FORM); }}>Batal</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.tenantName || !form.brandName || !form.businessType || !form.phone}
              className="gap-2"
            >
              {createMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FilePlus className="h-3.5 w-3.5" />}
              Buat &amp; Salin Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Konfirmasi hapus */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Draf?</DialogTitle>
            <DialogDescription>
              Draf ini akan dihapus permanen termasuk link dokumennya. Calon tenant tidak bisa lagi membuka link tersebut.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              Ya, Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit Draf */}
      <Dialog open={!!editDraft} onOpenChange={(open) => { if (!open) setEditDraft(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              ✏️ Edit Draf — {editDraft?.brandName}
            </DialogTitle>
            <DialogDescription>
              Perbarui data draf perjanjian. Perubahan tidak mengubah link dokumen yang sudah ada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label>Jenis Dokumen</Label>
              <Select value={editForm.docType} onValueChange={(v) => setEditField("docType", v as CreateForm["docType"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="surat_minat">📄 Surat Minat Menyewa Tenant</SelectItem>
                  <SelectItem value="perjanjian_sewa">📋 Draf Perjanjian Sewa Tenant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">Data Calon Tenant</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Nama PIC / Penanggung Jawab</Label>
                  <Input placeholder="Nama PIC (jika berbeda dari pemilik)" value={editForm.picName} onChange={(e) => setEditField("picName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nama Lengkap Pemilik <span className="text-destructive">*</span></Label>
                  <Input value={editForm.tenantName} onChange={(e) => setEditField("tenantName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nama Brand/Usaha <span className="text-destructive">*</span></Label>
                  <Input value={editForm.brandName} onChange={(e) => setEditField("brandName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Jenis Usaha <span className="text-destructive">*</span></Label>
                  <Input value={editForm.businessType} onChange={(e) => setEditField("businessType", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>No. WhatsApp/Telepon <span className="text-destructive">*</span></Label>
                  <Input value={editForm.phone} onChange={(e) => setEditField("phone", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={editForm.email} onChange={(e) => setEditField("email", e.target.value)} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Alamat</Label>
                  <Input value={editForm.address} onChange={(e) => setEditField("address", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">Unit &amp; Periode Sewa</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Unit / Lokasi yang Diminati</Label>
                  <Input placeholder="dari pendaftaran mandiri" value={editForm.interestedUnit} onChange={(e) => setEditField("interestedUnit", e.target.value)} />
                </div>
                <UnitPickerRow
                  unitCode={editForm.unitCode}
                  areaName={editForm.areaName}
                  onUnitCode={(v) => setEditField("unitCode", v)}
                  onAreaName={(v) => setEditField("areaName", v)}
                  onRentAmount={(v) => setEditField("rentAmount", v)}
                  availableUnits={availableUnits}
                  loadingUnits={loadingUnits}
                />
                <div className="space-y-1.5">
                  <Label>Tanggal Mulai</Label>
                  <Input type="date" value={editForm.startDate} onChange={(e) => setEditField("startDate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tanggal Selesai</Label>
                  <Input type="date" value={editForm.endDate} onChange={(e) => setEditField("endDate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Durasi (Bulan)</Label>
                  <Input type="number" placeholder="12" value={editForm.durationMonths} onChange={(e) => setEditField("durationMonths", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Label Periode</Label>
                  <Input placeholder="misal: 1 Tahun (Jan–Des 2025)" value={editForm.periodLabel} onChange={(e) => setEditField("periodLabel", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">Keuangan</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Harga Sewa/Bulan (Rp)</Label>
                  <Input placeholder="0" value={editForm.rentAmount} onChange={(e) => setEditField("rentAmount", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Deposit/Jaminan (Rp)</Label>
                  <Input placeholder="0" value={editForm.depositAmount} onChange={(e) => setEditField("depositAmount", e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Ketentuan Pembayaran</Label>
                  <Textarea rows={2} value={editForm.paymentTerms} onChange={(e) => setEditField("paymentTerms", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Catatan Tambahan</Label>
              <Textarea rows={2} value={editForm.notes} onChange={(e) => setEditField("notes", e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDraft(null)} disabled={editMutation.isPending}>Batal</Button>
            <Button
              onClick={() => editDraft && editMutation.mutate({ id: editDraft.id, f: editForm })}
              disabled={editMutation.isPending || !editForm.tenantName || !editForm.brandName || !editForm.businessType || !editForm.phone}
              className="gap-2"
            >
              {editMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
