import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
} from "lucide-react";

// ── Tipe data ──────────────────────────────────────────────────────────────────
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
  status: "pending" | "approved" | "rejected";
  respondedAt: string | null;
  respondedName: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  createdAt: string;
  publicUrl: string;
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
function DetailPanel({
  draft,
  onClose,
  onDelete,
  onRemind,
  onEdit,
}: {
  draft: DraftAgreement;
  onClose: () => void;
  onDelete: (id: number) => void;
  onRemind: (id: number) => void;
  onEdit: (draft: DraftAgreement) => void;
}) {
  const { toast } = useToast();

  function copyLink() {
    navigator.clipboard.writeText(draft.publicUrl).then(() => {
      toast({ title: "Link disalin!", description: draft.publicUrl });
    });
  }

  return (
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
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {/* Link publik */}
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
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onRemind(draft.id)}>
                <Send className="h-3 w-3" />Kirim WA
              </Button>
            )}
          </div>
        </div>

        {/* Data calon tenant */}
        {draft.picName && (
          <div><p className="text-xs text-muted-foreground">Nama PIC / Penanggung Jawab</p><p className="font-medium">{draft.picName}</p></div>
        )}
        {draft.interestedUnit && (
          <div><p className="text-xs text-muted-foreground">Unit yang Diminati</p><p className="font-medium">{draft.interestedUnit}</p></div>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{draft.email || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Jenis Usaha</p><p className="font-medium">{draft.businessType}</p></div>
          <div className="col-span-2"><p className="text-xs text-muted-foreground">Alamat</p><p className="font-medium">{draft.address || "—"}</p></div>
        </div>

        {/* Unit & periode */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div><p className="text-xs text-muted-foreground">Unit / Lokasi</p><p className="font-medium">{[draft.unitCode, draft.areaName].filter(Boolean).join(" — ") || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Durasi</p><p className="font-medium">{draft.periodLabel || (draft.durationMonths ? `${draft.durationMonths} bulan` : "—")}</p></div>
          <div><p className="text-xs text-muted-foreground">Mulai</p><p className="font-medium">{formatTanggal(draft.startDate)}</p></div>
          <div><p className="text-xs text-muted-foreground">Selesai</p><p className="font-medium">{formatTanggal(draft.endDate)}</p></div>
        </div>

        {/* Finansial */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div><p className="text-xs text-muted-foreground">Harga Sewa/Bulan</p><p className="font-semibold text-primary">{formatRp(draft.rentAmount)}</p></div>
          <div><p className="text-xs text-muted-foreground">Deposit/Jaminan</p><p className="font-semibold">{formatRp(draft.depositAmount)}</p></div>
        </div>

        {/* Status respon */}
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

        {/* Aksi */}
        <div className="flex flex-wrap justify-between gap-2 pt-2 border-t">
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={onClose}>Tutup</Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => onEdit(draft)}
            >
              ✏️ Edit
            </Button>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="gap-1" asChild>
              <a href={draft.publicUrl} target="_blank" rel="noopener noreferrer">
                🖨️ PDF
              </a>
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1"
              onClick={() => onDelete(draft.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />Hapus
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Komponen utama halaman ─────────────────────────────────────────────────────
export default function DrafPerjanjian() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQ, setSearchQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(BLANK_FORM);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: drafts = [], isLoading, refetch } = useQuery<DraftAgreement[]>({
    queryKey: ["draft-agreements", statusFilter],
    queryFn: () => {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      return apiFetchJson<DraftAgreement[]>(`/api/draft-agreements${qs}`);
    },
  });

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  const filtered = drafts.filter((d) => {
    if (!searchQ) return true;
    const q = searchQ.toLowerCase();
    return (
      d.tenantName.toLowerCase().includes(q) ||
      d.brandName.toLowerCase().includes(q) ||
      d.businessType.toLowerCase().includes(q) ||
      d.phone.includes(q)
    );
  });

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

  // ── Mutasi create ──────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (f: CreateForm) => {
      const body = formToBody(f);
      const res = await apiFetch("/api/draft-agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Error ${res.status}`);
      }
      return res.json() as Promise<DraftAgreement>;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["draft-agreements"] });
      setShowCreate(false);
      setForm(BLANK_FORM);
      setSelectedId(created.id);
      toast({ title: "Draf berhasil dibuat!", description: `Link telah dibuat untuk ${created.brandName}` });
      // salin link otomatis
      navigator.clipboard.writeText(created.publicUrl).catch(() => {});
    },
    onError: (err: Error) => {
      toast({ title: "Gagal membuat draf", description: err.message, variant: "destructive" });
    },
  });

  // ── Mutasi delete ──────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/draft-agreements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["draft-agreements"] });
      setSelectedId(null);
      setDeleteId(null);
      toast({ title: "Draf berhasil dihapus" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal menghapus", description: err.message, variant: "destructive" });
    },
  });

  // ── State edit ────────────────────────────────────────────────────────────
  const [editDraft, setEditDraft] = useState<DraftAgreement | null>(null);
  const [editForm, setEditForm] = useState<CreateForm>(BLANK_FORM);

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

  // ── Mutasi edit (PATCH) ────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: async ({ id, f }: { id: number; f: CreateForm }) => {
      const body = formToBody(f);
      const res = await apiFetch(`/api/draft-agreements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Error ${res.status}`);
      }
      return res.json() as Promise<DraftAgreement>;
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["draft-agreements"] });
      setEditDraft(null);
      setSelectedId(updated.id);
      toast({ title: "Draf berhasil diperbarui!" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal memperbarui", description: err.message, variant: "destructive" });
    },
  });

  function setEditField(key: keyof CreateForm, value: string) {
    setEditForm((f) => ({ ...f, [key]: value }));
  }

  // ── Mutasi remind ──────────────────────────────────────────────────────────
  const remindMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/draft-agreements/${id}/remind`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Pengingat terkirim!", description: "Link dokumen telah dikirim via WhatsApp" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal mengirim", description: err.message, variant: "destructive" });
    },
  });

  function setField(key: keyof CreateForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // ── Statistik ──────────────────────────────────────────────────────────────
  const stats = {
    total: drafts.length,
    pending: drafts.filter((d) => d.status === "pending").length,
    approved: drafts.filter((d) => d.status === "approved").length,
    rejected: drafts.filter((d) => d.status === "rejected").length,
  };

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
        <Button className="gap-2 shrink-0" onClick={() => setShowCreate(true)}>
          <FilePlus className="h-4 w-4" />
          Buat Draf Baru
        </Button>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-slate-700 bg-slate-50 border-slate-200" },
          { label: "Menunggu", value: stats.pending, color: "text-amber-700 bg-amber-50 border-amber-200" },
          { label: "Disetujui", value: stats.approved, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { label: "Tidak Disetujui", value: stats.rejected, color: "text-red-700 bg-red-50 border-red-200" },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg border p-3 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Link Pendaftaran Mandiri */}
      {(() => {
        const registerUrl = `${window.location.origin}/tenant/register`;
        return (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 text-blue-700 shrink-0">
              <Link2 className="h-4 w-4" />
              <span className="text-sm font-medium">Link Pendaftaran Mandiri</span>
            </div>
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <code className="text-xs bg-white border border-blue-200 rounded px-2 py-1 text-blue-800 truncate flex-1 block">
                {registerUrl}
              </code>
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
            </div>
            <p className="text-xs text-blue-600 sm:max-w-[200px]">Bagikan kepada calon tenant agar dapat mengisi formulir sendiri.</p>
          </div>
        );
      })()}

      {/* Filter & search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto">
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs h-6 px-2.5">Semua</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs h-6 px-2.5">Menunggu</TabsTrigger>
            <TabsTrigger value="approved" className="text-xs h-6 px-2.5">Disetujui</TabsTrigger>
            <TabsTrigger value="rejected" className="text-xs h-6 px-2.5">Ditolak</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2 flex-1">
          <Input
            placeholder="Cari nama, brand, telepon..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="max-w-xs h-8 text-sm"
          />
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
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
                <TableHead className="text-xs">Calon Tenant</TableHead>
                <TableHead className="text-xs">Unit / Lokasi</TableHead>
                <TableHead className="text-xs">Sewa/Bulan</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Dibuat</TableHead>
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
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Belum ada draf perjanjian
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((d) => (
                  <TableRow
                    key={d.id}
                    className={`cursor-pointer hover:bg-muted/30 ${selectedId === d.id ? "bg-primary/5" : ""}`}
                    onClick={() => setSelectedId(selectedId === d.id ? null : d.id)}
                  >
                    <TableCell className="py-2.5"><DocTypeBadge type={d.docType} /></TableCell>
                    <TableCell className="py-2.5">
                      <p className="font-medium text-sm">{d.brandName}</p>
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
        </div>

        {/* Panel detail */}
        {selected && (
          <div className="w-full md:w-80 lg:w-96 shrink-0 rounded-lg border overflow-hidden">
            <DetailPanel
              draft={selected}
              onClose={() => setSelectedId(null)}
              onDelete={(id) => setDeleteId(id)}
              onRemind={(id) => remindMutation.mutate(id)}
              onEdit={handleOpenEdit}
            />
          </div>
        )}
      </div>

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
            {/* Jenis dokumen */}
            <div className="space-y-1.5">
              <Label>Jenis Dokumen <span className="text-destructive">*</span></Label>
              <Select value={form.docType} onValueChange={(v) => setField("docType", v as CreateForm["docType"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="surat_minat">📄 Surat Minat Menyewa Tenant</SelectItem>
                  <SelectItem value="perjanjian_sewa">📋 Draf Perjanjian Sewa Tenant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Data calon tenant */}
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

            {/* Unit & periode */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">Unit & Periode Sewa</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Kode Unit</Label>
                  <Input placeholder="misal: SC-01" value={form.unitCode} onChange={(e) => setField("unitCode", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nama Area/Lokasi</Label>
                  <Input placeholder="misal: Sport Center Lantai 1" value={form.areaName} onChange={(e) => setField("areaName", e.target.value)} />
                </div>
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

            {/* Finansial */}
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

            {/* Catatan */}
            <div className="space-y-1.5">
              <Label>Catatan Tambahan</Label>
              <Textarea rows={2} placeholder="Catatan atau syarat khusus (opsional)" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
            </div>

            {/* Masa berlaku link */}
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
              Buat & Salin Link
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
            {/* Jenis dokumen */}
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

            {/* Data calon tenant */}
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

            {/* Unit & periode */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">Unit & Periode Sewa</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Unit / Lokasi yang Diminati</Label>
                  <Input placeholder="dari pendaftaran mandiri" value={editForm.interestedUnit} onChange={(e) => setEditField("interestedUnit", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Kode Unit</Label>
                  <Input placeholder="misal: SC-01" value={editForm.unitCode} onChange={(e) => setEditField("unitCode", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nama Area/Lokasi</Label>
                  <Input placeholder="misal: Sport Center Lantai 1" value={editForm.areaName} onChange={(e) => setEditField("areaName", e.target.value)} />
                </div>
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

            {/* Finansial */}
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

            {/* Catatan */}
            <div className="space-y-1.5">
              <Label>Catatan Tambahan</Label>
              <Textarea rows={2} value={editForm.notes} onChange={(e) => setEditField("notes", e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDraft(null)}>Batal</Button>
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
