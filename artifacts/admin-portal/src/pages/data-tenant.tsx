import { apiFetch } from "@/lib/api";
import { useState, useRef } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Upload, X, ImageIcon, Building2, Dumbbell, Eye, CalendarClock, Download, Filter, Tag, Check, ChevronsUpDown, DoorOpen, ChevronDown, ChevronUp, Sheet, RefreshCw, AlertCircle, ArrowDownToLine, ArrowUpFromLine, Settings2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { useSite } from "@/contexts/site-context";

const SITE_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  mall_tenant: {
    label: "Mal",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: <Building2 className="h-4 w-4" />,
  },
  sport_center: {
    label: "Sport Center",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: <Dumbbell className="h-4 w-4" />,
  },
};

type TenantStatus = "active" | "inactive" | "blacklisted" | "aktif" | "kosong" | "nonaktif";

type Tenant = {
  id: number;
  businessName: string;
  ownerName: string;
  email: string | null;
  phone: string | null;
  category: string | null;
  boothNumber: string | null;
  areaName: string;
  status: TenantStatus;
  notes: string | null;
  logoUrl: string | null;
  defaultRentAmount: string | null;
  defaultServiceChargeAmount: string | null;
  defaultElectricityChargeAmount: string | null;
  defaultWaterChargeAmount: string | null;
  defaultOtherChargeAmount: string | null;
  defaultTrashChargeAmount: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  createdAt: string;
  updatedAt: string;
};

function getContractInfo(endDate: string | null | undefined): {
  label: string;
  colorClass: string;
  bgClass: string;
} {
  if (!endDate) return { label: "—", colorClass: "text-muted-foreground", bgClass: "" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { label: "Berakhir", colorClass: "text-red-700", bgClass: "bg-red-50 border-red-200" };
  if (diffDays === 0) return { label: "Hari ini", colorClass: "text-red-700", bgClass: "bg-red-50 border-red-200" };
  if (diffDays <= 30) return { label: `${diffDays} hari`, colorClass: "text-orange-700", bgClass: "bg-orange-50 border-orange-200" };
  if (diffDays <= 60) return { label: `${diffDays} hari`, colorClass: "text-amber-700", bgClass: "bg-amber-50 border-amber-200" };
  const months = Math.round(diffDays / 30);
  return { label: `~${months} bln`, colorClass: "text-green-700", bgClass: "bg-green-50 border-green-200" };
}

function formatRupiah(amount: string | number | null | undefined): string {
  if (amount == null || amount === "") return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(n)) return "—";
  return "Rp " + n.toLocaleString("id-ID");
}

type TenantForm = {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  category: string;
  boothNumber: string;
  areaName: string;
  status: TenantStatus;
  notes: string;
  logoUrl: string;
  defaultRentAmount: string;
  defaultServiceChargeAmount: string;
  defaultElectricityChargeAmount: string;
  defaultWaterChargeAmount: string;
  defaultOtherChargeAmount: string;
  defaultTrashChargeAmount: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
};

const EMPTY_FORM: TenantForm = {
  businessName: "",
  ownerName: "",
  email: "",
  phone: "",
  category: "",
  boothNumber: "",
  areaName: "",
  status: "active",
  notes: "",
  logoUrl: "",
  defaultRentAmount: "",
  defaultServiceChargeAmount: "",
  defaultElectricityChargeAmount: "",
  defaultWaterChargeAmount: "",
  defaultOtherChargeAmount: "",
  defaultTrashChargeAmount: "",
  contractStartDate: "",
  contractEndDate: "",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  inactive: "Non-Aktif",
  blacklisted: "Blacklist",
  aktif: "Aktif",
  kosong: "Kosong",
  nonaktif: "Non-Aktif",
};

function statusClass(status: string): string {
  switch (status) {
    case "active":
    case "aktif":
      return "bg-green-100 text-green-800 border-green-200";
    case "inactive":
    case "kosong":
    case "nonaktif":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "blacklisted":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

const CATEGORIES = ["Kuliner", "Fashion", "F&B", "Elektronik", "Kesehatan", "Kecantikan", "Olahraga", "Pendidikan", "Lainnya"];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchTenants(): Promise<Tenant[]> {
  const res = await apiFetch(`${BASE}/api/tenants`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Tenant[]>;
}

type MallUnit = {
  id: number;
  unitCode: string;
  areaKantin: string | null;
  zone: string | null;
  floor: string | null;
  status: string;
  tenantId: number | null;
  businessName: string | null;
  defaultRentAmount: string | null;
};

async function fetchMallUnits(): Promise<MallUnit[]> {
  const res = await apiFetch(`${BASE}/api/mall-units`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<MallUnit[]>;
}

async function createTenant(data: TenantForm): Promise<Tenant> {
  const res = await apiFetch(`${BASE}/api/tenants`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal menyimpan tenant");
  }
  return res.json() as Promise<Tenant>;
}

async function updateTenant(id: number, data: TenantForm): Promise<Tenant> {
  const res = await apiFetch(`${BASE}/api/tenants/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal memperbarui tenant");
  }
  return res.json() as Promise<Tenant>;
}

async function deleteTenant(id: number): Promise<void> {
  const res = await apiFetch(`${BASE}/api/tenants/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal menghapus tenant");
  }
}

async function bulkDeleteTenants(ids: number[]): Promise<{ deleted: number }> {
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("ids", String(id)));
  const res = await apiFetch(`${BASE}/api/tenants/bulk?${params.toString()}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal menghapus tenant");
  }
  return res.json() as Promise<{ deleted: number }>;
}

type SheetSyncConfig = {
  enabled: boolean;
  spreadsheetId: string;
  sheetName: string;
  intervalMinutes: number;
  lastSyncAt?: string;
  lastSyncResult?: { success: boolean; newRows: number; totalRows: number; error?: string | null; at: string };
};

type PreviewTenantRow = {
  businessName: string;
  ownerName: string;
  phone: string | null;
  email: string | null;
  category: string | null;
  boothNumber: string | null;
  areaName: string;
  status: string;
  defaultRentAmount: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  notes: string | null;
  isNew: boolean;
};

async function fetchSheetSyncConfig(): Promise<SheetSyncConfig> {
  const res = await apiFetch(`${BASE}/api/tenant-sheet-sync/config`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<SheetSyncConfig>;
}

async function fetchSheetSyncInfo(): Promise<{ serviceAccountEmail: string }> {
  const res = await apiFetch(`${BASE}/api/tenant-sheet-sync/info`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ serviceAccountEmail: string }>;
}

async function previewFromSheet(spreadsheetId: string, sheetName: string): Promise<{ tenants: PreviewTenantRow[]; totalRows: number }> {
  const res = await apiFetch(`${BASE}/api/tenant-sheet-sync/preview`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spreadsheetId, sheetName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal membaca sheet");
  }
  return res.json() as Promise<{ tenants: PreviewTenantRow[]; totalRows: number }>;
}

async function importFromSheet(spreadsheetId: string, sheetName: string, mode: "upsert" | "insert_only"): Promise<{ inserted: number; updated: number; skipped: number; totalRows: number }> {
  const res = await apiFetch(`${BASE}/api/tenant-sheet-sync/import`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spreadsheetId, sheetName, mode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal mengimpor data");
  }
  return res.json() as Promise<{ inserted: number; updated: number; skipped: number; totalRows: number }>;
}

async function exportToSheet(spreadsheetId: string, sheetTitle?: string): Promise<{ exported: number }> {
  const res = await apiFetch(`${BASE}/api/tenant-sheet-sync/export`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spreadsheetId, sheetTitle }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal mengekspor data");
  }
  return res.json() as Promise<{ exported: number }>;
}

async function saveSheetSyncConfig(config: Partial<SheetSyncConfig>): Promise<void> {
  const res = await apiFetch(`${BASE}/api/tenant-sheet-sync/config`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal menyimpan konfigurasi");
  }
}

async function uploadLogoFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch(`${BASE}/api/uploads/tenant-logo`, { method: "POST", credentials: "include", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal mengunggah logo");
  }
  const data = await res.json() as { url: string };
  return data.url;
}

export default function DataTenant() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { activeSite } = useSite();
  const [, navigate] = useLocation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Tenant | null>(null);
  const [form, setForm] = useState<TenantForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // ─── Unit combobox state ──────────────────────────────────────────────────────
  const [unitComboOpen, setUnitComboOpen] = useState(false);

  // ─── Bulk selection state ────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // ─── Google Sheets Sync state ─────────────────────────────────────────────
  const [sheetSyncOpen, setSheetSyncOpen] = useState(false);
  const [sheetSyncTab, setSheetSyncTab] = useState<"import" | "export" | "config">("import");
  const [sheetId, setSheetId] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [exportSheetId, setExportSheetId] = useState("");
  const [importMode, setImportMode] = useState<"upsert" | "insert_only">("upsert");
  const [previewData, setPreviewData] = useState<PreviewTenantRow[] | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [configForm, setConfigForm] = useState<SheetSyncConfig>({
    enabled: false, spreadsheetId: "", sheetName: "", intervalMinutes: 30,
  });

  const { data: tenants, isLoading, isError } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
    queryFn: fetchTenants,
  });

  const [showAllAvailable, setShowAllAvailable] = useState(false);

  const { data: mallUnits = [] } = useQuery<MallUnit[]>({
    queryKey: ["/api/mall-units"],
    queryFn: fetchMallUnits,
  });

  // Map unit_code → status untuk badge di tabel
  const unitStatusByCode = new Map(mallUnits.map(u => [u.unitCode, u.status as string]));

  const UNIT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    available:  { label: "Tersedia",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    occupied:   { label: "Terisi",      cls: "bg-blue-50 text-blue-700 border-blue-200" },
    maintenance:{ label: "Perawatan",   cls: "bg-slate-100 text-slate-600 border-slate-300" },
    overdue:    { label: "Tunggakan",   cls: "bg-red-50 text-red-700 border-red-200" },
    expired:    { label: "Berakhir",    cls: "bg-orange-50 text-orange-700 border-orange-200" },
    booked:     { label: "Dipesan",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
  };

  // Tampilkan SEMUA unit; jika edit, pastikan unit saat ini selalu ada
  const unitOptions = (() => {
    const allUnits = [...mallUnits];
    if (editTarget?.boothNumber && !allUnits.find((u) => u.unitCode === editTarget.boothNumber)) {
      allUnits.unshift({
        id: -1,
        unitCode: editTarget.boothNumber,
        areaKantin: editTarget.areaName,
        zone: null,
        floor: null,
        status: "occupied",
        tenantId: null,
        businessName: null,
        defaultRentAmount: null,
      });
    }
    return allUnits;
  })();

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/mall-units"] });
  };

  const createMutation = useMutation({
    mutationFn: createTenant,
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Berhasil", description: "Tenant baru berhasil ditambahkan." });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: TenantForm }) => updateTenant(id, data),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Berhasil", description: "Data tenant berhasil diperbarui." });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTenant,
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Berhasil", description: "Tenant berhasil dihapus." });
      setDeleteTarget(null);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal", description: e.message, variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteTenants,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Berhasil", description: `${result.deleted} tenant berhasil dihapus.` });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal", description: e.message, variant: "destructive" });
      setBulkDeleteOpen(false);
    },
  });

  const { data: sheetSyncConfig } = useQuery<SheetSyncConfig>({
    queryKey: ["/api/tenant-sheet-sync/config"],
    queryFn: fetchSheetSyncConfig,
    enabled: sheetSyncOpen,
  });

  const { data: sheetSyncInfo } = useQuery<{ serviceAccountEmail: string }>({
    queryKey: ["/api/tenant-sheet-sync/info"],
    queryFn: fetchSheetSyncInfo,
    enabled: sheetSyncOpen,
  });

  const importMutation = useMutation({
    mutationFn: ({ spreadsheetId, sheetName: sn, mode }: { spreadsheetId: string; sheetName: string; mode: "upsert" | "insert_only" }) =>
      importFromSheet(spreadsheetId, sn, mode),
    onSuccess: (result) => {
      invalidateAll();
      setPreviewData(null);
      toast({
        title: "Import Selesai",
        description: `${result.inserted} tenant baru ditambahkan, ${result.updated} diperbarui, ${result.skipped} dilewati dari total ${result.totalRows} baris.`,
      });
    },
    onError: (e: Error) => toast({ title: "Gagal Import", description: e.message, variant: "destructive" }),
  });

  const exportMutation = useMutation({
    mutationFn: ({ spreadsheetId: sid, sheetTitle }: { spreadsheetId: string; sheetTitle?: string }) =>
      exportToSheet(sid, sheetTitle),
    onSuccess: (result) => {
      toast({ title: "Export Selesai", description: `${result.exported} tenant berhasil diekspor ke Google Sheets.` });
    },
    onError: (e: Error) => toast({ title: "Gagal Export", description: e.message, variant: "destructive" }),
  });

  const saveConfigMutation = useMutation({
    mutationFn: saveSheetSyncConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/tenant-sheet-sync/config"] });
      toast({ title: "Konfigurasi Disimpan", description: "Auto-sync Google Sheets berhasil dikonfigurasi." });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  async function handlePreview() {
    if (!sheetId) { toast({ title: "ID Sheet wajib diisi", variant: "destructive" }); return; }
    setIsPreviewing(true);
    setPreviewData(null);
    try {
      const result = await previewFromSheet(sheetId, sheetName);
      setPreviewData(result.tenants);
      if (result.tenants.length === 0) toast({ title: "Tidak ada data", description: "Sheet kosong atau tidak ada baris yang valid." });
    } catch (e: unknown) {
      toast({ title: "Gagal Preview", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsPreviewing(false);
    }
  }

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setLogoPreview("");
    setDialogOpen(true);
  }

  function openEdit(tenant: Tenant) {
    setEditTarget(tenant);
    setForm({
      businessName: tenant.businessName,
      ownerName: tenant.ownerName,
      email: tenant.email ?? "",
      phone: tenant.phone ?? "",
      category: tenant.category ?? "",
      boothNumber: tenant.boothNumber ?? "",
      areaName: tenant.areaName,
      status: tenant.status,
      notes: tenant.notes ?? "",
      logoUrl: tenant.logoUrl ?? "",
      defaultRentAmount: tenant.defaultRentAmount ?? "",
      defaultServiceChargeAmount: tenant.defaultServiceChargeAmount ?? "",
      defaultElectricityChargeAmount: tenant.defaultElectricityChargeAmount ?? "",
      defaultWaterChargeAmount: tenant.defaultWaterChargeAmount ?? "",
      defaultOtherChargeAmount: tenant.defaultOtherChargeAmount ?? "",
      defaultTrashChargeAmount: tenant.defaultTrashChargeAmount ?? "",
      contractStartDate: tenant.contractStartDate ?? "",
      contractEndDate: tenant.contractEndDate ?? "",
    });
    setLogoFile(null);
    setLogoPreview(tenant.logoUrl ?? "");
    setDialogOpen(true);
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Format Tidak Didukung", description: "Gunakan JPG, PNG, atau WEBP.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File Terlalu Besar", description: "Maksimal ukuran logo 5MB.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function clearLogo() {
    setLogoFile(null);
    setLogoPreview("");
    setForm(f => ({ ...f, logoUrl: "" }));
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let finalLogoUrl = form.logoUrl;

    if (logoFile) {
      setIsUploadingLogo(true);
      try {
        finalLogoUrl = await uploadLogoFile(logoFile);
      } catch (err) {
        toast({ title: "Upload Logo Gagal", description: (err as Error).message, variant: "destructive" });
        setIsUploadingLogo(false);
        return;
      }
      setIsUploadingLogo(false);
    }

    const toNum = (v: string) => (v === "" ? "0" : v);
    const toDate = (v: string | null) => (!v || v === "" ? null : v);
    const payload = {
      ...form,
      logoUrl: finalLogoUrl,
      notes: form.notes || "",
      defaultRentAmount: toNum(form.defaultRentAmount),
      defaultServiceChargeAmount: toNum(form.defaultServiceChargeAmount),
      defaultElectricityChargeAmount: toNum(form.defaultElectricityChargeAmount),
      defaultWaterChargeAmount: toNum(form.defaultWaterChargeAmount),
      defaultOtherChargeAmount: toNum(form.defaultOtherChargeAmount),
      defaultTrashChargeAmount: toNum(form.defaultTrashChargeAmount),
      contractStartDate: toDate(form.contractStartDate),
      contractEndDate: toDate(form.contractEndDate),
    };

    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending || isUploadingLogo;

  const filtered = (tenants ?? []).filter((t) => {
    const q = search.toLowerCase();
    const matchSearch =
      search === "" ||
      t.businessName.toLowerCase().includes(q) ||
      t.ownerName.toLowerCase().includes(q) ||
      (t.boothNumber ?? "").toLowerCase().includes(q) ||
      (t.category ?? "").toLowerCase().includes(q) ||
      t.areaName.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    const matchCategory = filterCategory === "all" || (t.category ?? "") === filterCategory;
    return matchSearch && matchStatus && matchCategory;
  });

  const countActive = tenants?.filter((t) => t.status === "active" || t.status === "aktif").length ?? 0;
  const countInactive = tenants?.filter((t) => t.status === "inactive" || t.status === "kosong" || t.status === "nonaktif").length ?? 0;
  const countBlacklisted = tenants?.filter((t) => t.status === "blacklisted").length ?? 0;

  // Kategori unik dari data aktual (gabungan dengan CATEGORIES)
  const availableCategories = Array.from(
    new Set([
      ...CATEGORIES,
      ...(tenants ?? []).map((t) => t.category).filter(Boolean) as string[],
    ])
  ).sort();

  // Hitung per kategori (dari semua data, bukan hanya filtered)
  const categoryCounts = (tenants ?? []).reduce<Record<string, number>>((acc, t) => {
    const cat = t.category ?? "—";
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  const hasActiveFilter = filterStatus !== "all" || filterCategory !== "all" || search !== "";

  function resetFilters() {
    setSearch("");
    setFilterStatus("all");
    setFilterCategory("all");
  }

  const siteCfg = activeSite ? (SITE_TYPE_CONFIG[activeSite.type] ?? null) : null;

  // ─── Bulk selection helpers ───────────────────────────────────────────────────
  const allFilteredIds = filtered.map((t) => t.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));
  const someSelected = allFilteredIds.some((id) => selectedIds.has(id)) && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCount = selectedIds.size;
  const selectedNames = filtered
    .filter((t) => selectedIds.has(t.id))
    .map((t) => t.businessName)
    .slice(0, 5);

  // ─── Export CSV ───────────────────────────────────────────────────────────────
  function exportCSV(scope: "filtered" | "all") {
    const rows = scope === "filtered" ? filtered : (tenants ?? []);
    const headers = [
      "No", "Nama Usaha", "Pemilik", "Email", "Telepon",
      "Kategori", "No. Booth", "Area", "Status", "Akhir Kontrak", "Catatan",
    ];
    const body = rows.map((t, i) => [
      i + 1,
      t.businessName,
      t.ownerName,
      t.email ?? "",
      t.phone ?? "",
      t.category ?? "",
      t.boothNumber ?? "",
      t.areaName,
      STATUS_LABEL[t.status] ?? t.status,
      t.contractEndDate
        ? new Date(t.contractEndDate).toLocaleDateString("id-ID")
        : "",
      t.notes ?? "",
    ]);
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv =
      "\uFEFF" + // UTF-8 BOM agar Excel langsung baca encoding
      [headers, ...body].map((r) => r.map(escape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const siteName = (activeSite?.name ?? "tenant").replace(/\s+/g, "-");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `data-tenant-${siteName}-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "Export Berhasil", description: `${rows.length} tenant diekspor ke CSV.` });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Data Tenant</h1>
            {activeSite && siteCfg && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${siteCfg.color} ${siteCfg.bg} ${siteCfg.border}`}>
                {siteCfg.icon}
                {activeSite.name}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {activeSite
              ? `Tenant terdaftar di ${activeSite.name}`
              : "Daftar seluruh tenant yang terdaftar."}
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Tenant
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Tenant Aktif", value: countActive, color: "text-green-600", sub: "unit terisi" },
          { label: "Non-Aktif", value: countInactive, color: "text-gray-500", sub: "unit kosong" },
          { label: "Blacklist", value: countBlacklisted, color: "text-red-600", sub: "diblokir" },
        ].map((item) => (
          <Card key={item.label} className={siteCfg ? `border-l-4 ${siteCfg.border}` : ""}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</p>
              <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Unit Kosong / Tersedia ── */}
      {(() => {
        const availableUnits = mallUnits.filter(u => u.status === "available");
        if (availableUnits.length === 0) return null;
        const displayUnits = showAllAvailable ? availableUnits : availableUnits.slice(0, 8);
        return (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <DoorOpen className="h-4 w-4 text-sky-600" />
                <span className="text-sm font-semibold text-sky-800">
                  Unit Kosong / Tersedia
                </span>
                <span className="text-xs font-mono bg-sky-100 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5">
                  {availableUnits.length} unit
                </span>
              </div>
              {availableUnits.length > 8 && (
                <button
                  onClick={() => setShowAllAvailable(v => !v)}
                  className="text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1"
                >
                  {showAllAvailable ? <><ChevronUp className="h-3 w-3" />Sembunyikan</> : <><ChevronDown className="h-3 w-3" />Lihat semua</>}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {displayUnits.map(u => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-white px-2.5 py-0.5 text-xs font-medium text-sky-700"
                  title={[u.areaKantin, u.zone, u.floor].filter(Boolean).join(" · ") || "Unit tersedia"}
                >
                  <DoorOpen className="h-3 w-3 opacity-60" />
                  {u.unitCode}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Chip Kategori Cepat ── */}
      {!isLoading && (tenants ?? []).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
            <Filter className="h-3 w-3" />
            Kategori:
          </span>
          <button
            onClick={() => setFilterCategory("all")}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filterCategory === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted border-border text-foreground"
            }`}
          >
            Semua
            <span className={`font-mono text-[10px] ${filterCategory === "all" ? "opacity-80" : "text-muted-foreground"}`}>
              {(tenants ?? []).length}
            </span>
          </button>
          {availableCategories
            .filter((cat) => categoryCounts[cat] !== undefined)
            .map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(filterCategory === cat ? "all" : cat)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filterCategory === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted border-border text-foreground"
                }`}
              >
                {cat}
                <span className={`font-mono text-[10px] ${filterCategory === cat ? "opacity-80" : "text-muted-foreground"}`}>
                  {categoryCounts[cat]}
                </span>
              </button>
            ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Daftar Tenant</CardTitle>
              {activeSite && siteCfg && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${siteCfg.color} ${siteCfg.bg} ${siteCfg.border}`}>
                  {siteCfg.icon}
                  {activeSite.name}
                </span>
              )}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              {/* Bulk delete bar — muncul saat ada yang dipilih */}
              {selectedCount > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5">
                  <span className="text-sm font-medium text-destructive">
                    {selectedCount} dipilih
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setBulkDeleteOpen(true)}
                    disabled={bulkDeleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus Semua
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Batal Pilih
                  </Button>
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 w-48 h-9"
                  placeholder="Cari tenant..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Semua status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Non-Aktif</SelectItem>
                  <SelectItem value="blacklisted">Blacklist</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-40 h-9">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Semua Kategori" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      <span className="flex items-center justify-between w-full gap-3">
                        <span>{cat}</span>
                        {categoryCounts[cat] !== undefined && (
                          <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                            {categoryCounts[cat]}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 text-muted-foreground hover:text-foreground px-2"
                  onClick={resetFilters}
                >
                  <X className="h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={!tenants || tenants.length === 0}>
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportCSV("filtered")}>
                    Export tampilan ini ({filtered.length} tenant)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportCSV("all")}>
                    Export semua ({tenants?.length ?? 0} tenant)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => {
                  setSheetSyncOpen(true);
                  setPreviewData(null);
                  if (sheetSyncConfig) {
                    setSheetId(sheetSyncConfig.spreadsheetId ?? "");
                    setSheetName(sheetSyncConfig.sheetName ?? "");
                    setConfigForm(sheetSyncConfig);
                  }
                }}
              >
                <Sheet className="h-4 w-4" />
                Sheets Sync
                {sheetSyncConfig?.enabled && (
                  <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-green-500" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isError && (
            <p className="text-sm text-destructive py-4 text-center">
              Gagal memuat data tenant. Periksa koneksi server.
            </p>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Pilih semua"
                      disabled={isLoading || filtered.length === 0}
                    />
                  </TableHead>
                  <TableHead className="w-[40px]">Logo</TableHead>
                  <TableHead className="w-[50px]">ID</TableHead>
                  <TableHead>Nama Usaha</TableHead>
                  <TableHead>Pemilik</TableHead>
                  <TableHead>No. HP</TableHead>
                  <TableHead>Unit / Lantai</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Harga Sewa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Masa Kontrak</TableHead>
                  <TableHead className="w-[100px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 12 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : filtered.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        {tenants?.length === 0 ? "Belum ada tenant terdaftar." : "Tidak ada hasil pencarian."}
                      </TableCell>
                    </TableRow>
                  )
                  : filtered.map((tenant) => (
                      <TableRow
                        key={tenant.id}
                        className={selectedIds.has(tenant.id) ? "bg-destructive/5" : ""}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(tenant.id)}
                            onCheckedChange={() => toggleOne(tenant.id)}
                            aria-label={`Pilih ${tenant.businessName}`}
                          />
                        </TableCell>
                        <TableCell>
                          {tenant.logoUrl ? (
                            <img
                              src={tenant.logoUrl}
                              alt={tenant.businessName}
                              className="h-8 w-8 rounded-md object-cover border border-border"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{tenant.id}</TableCell>
                        <TableCell className="font-medium">{tenant.businessName}</TableCell>
                        <TableCell>{tenant.ownerName}</TableCell>
                        <TableCell>{tenant.phone ?? "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-sm">{tenant.boothNumber ?? "-"}</span>
                              {tenant.boothNumber && (() => {
                                const st = unitStatusByCode.get(tenant.boothNumber);
                                const badge = st ? UNIT_STATUS_BADGE[st] : null;
                                if (!badge) return null;
                                return (
                                  <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${badge.cls}`}>
                                    {badge.label}
                                  </span>
                                );
                              })()}
                            </div>
                            {tenant.areaName && (
                              <span className="text-[11px] text-muted-foreground">{tenant.areaName}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{tenant.category ?? "-"}</TableCell>
                        <TableCell className="font-medium text-sm">
                          {tenant.defaultRentAmount && Number(tenant.defaultRentAmount) > 0
                            ? formatRupiah(Number(tenant.defaultRentAmount))
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClass(tenant.status)}`}>
                            {STATUS_LABEL[tenant.status] ?? tenant.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const info = getContractInfo(tenant.contractEndDate);
                            if (!tenant.contractStartDate && !tenant.contractEndDate) {
                              return <span className="text-xs text-muted-foreground">—</span>;
                            }
                            const fmtDate = (d: string) =>
                              new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
                            return (
                              <div className="flex flex-col gap-0.5">
                                {tenant.contractEndDate && (
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${info.bgClass} ${info.colorClass}`}>
                                    <CalendarClock className="h-3 w-3" />
                                    {info.label}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground">
                                  {tenant.contractStartDate ? fmtDate(tenant.contractStartDate) : "?"}
                                  {" – "}
                                  {tenant.contractEndDate ? fmtDate(tenant.contractEndDate) : "?"}
                                </span>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700"
                              title="Lihat Profil"
                              onClick={() => navigate(`/tenant-profile/${tenant.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(tenant)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(tenant)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>

          {/* Footer info jumlah */}
          {!isLoading && filtered.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-right">
              {selectedCount > 0
                ? `${selectedCount} dari ${filtered.length} tenant dipilih`
                : `${filtered.length} tenant ditampilkan`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dialog Tambah / Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Tenant" : "Tambah Tenant Baru"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <form id="tenant-form" onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4 pt-2">

              {/* Logo Upload */}
              <div className="flex flex-col gap-2">
                <Label>Logo Usaha</Label>
                <div className="flex items-start gap-3">
                  {logoPreview ? (
                    <div className="relative">
                      <img
                        src={logoPreview}
                        alt="Preview logo"
                        className="h-16 w-16 rounded-lg object-cover border border-border"
                      />
                      <button
                        type="button"
                        onClick={clearLogo}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-muted border border-dashed border-border flex items-center justify-center shrink-0">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 h-8"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {logoPreview ? "Ganti Logo" : "Unggah Logo"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">JPG, PNG atau WEBP. Maks. 5MB.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label htmlFor="businessName">Nama Usaha <span className="text-destructive">*</span></Label>
                  <Input
                    id="businessName"
                    value={form.businessName}
                    onChange={(e) => setForm(f => ({ ...f, businessName: e.target.value }))}
                    required
                    placeholder="cth: Warung Makan Pak Budi"
                  />
                </div>
                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label htmlFor="ownerName">Nama Pemilik <span className="text-destructive">*</span></Label>
                  <Input
                    id="ownerName"
                    value={form.ownerName}
                    onChange={(e) => setForm(f => ({ ...f, ownerName: e.target.value }))}
                    required
                    placeholder="Nama lengkap pemilik"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">Nomor HP</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="08xx-xxxx-xxxx"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@contoh.com"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>No. Booth / Unit</Label>
                  <Popover open={unitComboOpen} onOpenChange={setUnitComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={unitComboOpen}
                        className="w-full justify-between font-normal"
                      >
                        {form.boothNumber
                          ? (() => {
                              const u = unitOptions.find(x => x.unitCode === form.boothNumber);
                              return (
                                <span className="flex items-center gap-1.5">
                                  <span className="font-mono font-medium">{form.boothNumber}</span>
                                  {(u?.areaKantin ?? u?.zone) && (
                                    <span className="text-muted-foreground text-xs">— {u?.areaKantin ?? u?.zone}</span>
                                  )}
                                </span>
                              );
                            })()
                          : <span className="text-muted-foreground">— Tidak dipilih —</span>
                        }
                        <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cari kode unit..." />
                        <CommandList>
                          <CommandEmpty>Unit tidak ditemukan.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => {
                                setForm(f => ({ ...f, boothNumber: "" }));
                                setUnitComboOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", !form.boothNumber ? "opacity-100" : "opacity-0")} />
                              <span className="text-muted-foreground">— Tidak dipilih —</span>
                            </CommandItem>
                            {unitOptions.map((u) => {
                              const isAvailable = u.status === "available";
                              const isCurrentUnit = editTarget?.boothNumber === u.unitCode;
                              return (
                                <CommandItem
                                  key={u.unitCode}
                                  value={`${u.unitCode} ${u.areaKantin ?? u.zone ?? ""}`}
                                  disabled={!isAvailable && !isCurrentUnit}
                                  onSelect={() => {
                                    if (!isAvailable && !isCurrentUnit) return;
                                    const area = u.areaKantin ?? u.zone ?? (u.floor ? `Lantai ${u.floor}` : "");
                                    const rentAmount = u.defaultRentAmount && Number(u.defaultRentAmount) > 0
                                      ? u.defaultRentAmount : undefined;
                                    setForm(f => ({
                                      ...f,
                                      boothNumber: u.unitCode,
                                      areaName: area || f.areaName,
                                      ...(rentAmount !== undefined && { defaultRentAmount: rentAmount }),
                                    }));
                                    setUnitComboOpen(false);
                                  }}
                                  className={cn(!isAvailable && !isCurrentUnit && "opacity-50 cursor-not-allowed")}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", form.boothNumber === u.unitCode ? "opacity-100" : "opacity-0")} />
                                  <span className="font-mono font-medium">{u.unitCode}</span>
                                  {(u.areaKantin ?? u.zone) && (
                                    <span className="text-muted-foreground ml-1.5 text-xs">— {u.areaKantin ?? u.zone}</span>
                                  )}
                                  {!isAvailable && (
                                    <span className={cn("ml-auto text-xs", isCurrentUnit ? "text-blue-600" : "text-orange-500")}>
                                      {isCurrentUnit ? "unit ini" : "terisi"}
                                    </span>
                                  )}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="areaName">Nama Area / Lantai</Label>
                  <Input
                    id="areaName"
                    value={form.areaName}
                    onChange={(e) => setForm(f => ({ ...f, areaName: e.target.value }))}
                    placeholder="cth: Lantai 1 / Food Court"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="category">Kategori Usaha</Label>
                  <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as TenantStatus }))}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktif</SelectItem>
                      <SelectItem value="inactive">Non-Aktif</SelectItem>
                      <SelectItem value="blacklisted">Blacklist</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label htmlFor="notes">Catatan</Label>
                  <Textarea
                    id="notes"
                    value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    placeholder="Catatan tambahan (opsional)"
                  />
                </div>
              </div>

              {/* ── Tarif Default ─────────────────────────────────────── */}
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                    Tarif Default (untuk Invoice)
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  Diisi otomatis saat membuat invoice baru untuk tenant ini. Bisa diubah manual saat buat invoice.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="defaultRentAmount">Harga Sewa (Rp)</Label>
                    <Input
                      id="defaultRentAmount"
                      type="number"
                      min="0"
                      value={form.defaultRentAmount}
                      onChange={(e) => setForm(f => ({ ...f, defaultRentAmount: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="defaultServiceChargeAmount">Service Charge (Rp)</Label>
                    <Input
                      id="defaultServiceChargeAmount"
                      type="number"
                      min="0"
                      value={form.defaultServiceChargeAmount}
                      onChange={(e) => setForm(f => ({ ...f, defaultServiceChargeAmount: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="defaultElectricityChargeAmount">Biaya Listrik (Rp)</Label>
                    <Input
                      id="defaultElectricityChargeAmount"
                      type="number"
                      min="0"
                      value={form.defaultElectricityChargeAmount}
                      onChange={(e) => setForm(f => ({ ...f, defaultElectricityChargeAmount: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="defaultWaterChargeAmount">Biaya Air (Rp)</Label>
                    <Input
                      id="defaultWaterChargeAmount"
                      type="number"
                      min="0"
                      value={form.defaultWaterChargeAmount}
                      onChange={(e) => setForm(f => ({ ...f, defaultWaterChargeAmount: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="defaultOtherChargeAmount">Biaya Lain-lain (Rp)</Label>
                    <Input
                      id="defaultOtherChargeAmount"
                      type="number"
                      min="0"
                      value={form.defaultOtherChargeAmount}
                      onChange={(e) => setForm(f => ({ ...f, defaultOtherChargeAmount: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="defaultTrashChargeAmount">Iuran Sampah / Kebersihan (Rp)</Label>
                    <Input
                      id="defaultTrashChargeAmount"
                      type="number"
                      min="0"
                      value={form.defaultTrashChargeAmount}
                      onChange={(e) => setForm(f => ({ ...f, defaultTrashChargeAmount: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* ── Masa Kontrak ─────────────────────────────────────── */}
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                    Masa Kontrak
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="contractStartDate">Tanggal Mulai Kontrak</Label>
                    <Input
                      id="contractStartDate"
                      type="date"
                      value={form.contractStartDate ?? ""}
                      onChange={(e) => setForm(f => ({ ...f, contractStartDate: e.target.value || null }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="contractEndDate">Tanggal Selesai Kontrak</Label>
                    <Input
                      id="contractEndDate"
                      type="date"
                      value={form.contractEndDate ?? ""}
                      onChange={(e) => setForm(f => ({ ...f, contractEndDate: e.target.value || null }))}
                    />
                  </div>
                </div>
              </div>
            </form>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Batal
            </Button>
            <Button type="submit" form="tenant-form" disabled={isSaving}>
              {isSaving ? (isUploadingLogo ? "Mengunggah logo..." : "Menyimpan...") : editTarget ? "Simpan Perubahan" : "Tambah Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi Hapus Satu */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus tenant{" "}
              <strong>{deleteTarget?.businessName}</strong>? Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Google Sheets Sync Dialog ──────────────────────────────── */}
      <Dialog open={sheetSyncOpen} onOpenChange={(o) => { setSheetSyncOpen(o); if (!o) setPreviewData(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sheet className="h-5 w-5 text-green-600" />
              Sinkronisasi Google Sheets
            </DialogTitle>
          </DialogHeader>

          {/* Tab switcher */}
          <div className="flex gap-1 border-b pb-2">
            {(["import", "export", "config"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSheetSyncTab(tab)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  sheetSyncTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab === "import" && <span className="flex items-center gap-1.5"><ArrowDownToLine className="h-3.5 w-3.5" />Import</span>}
                {tab === "export" && <span className="flex items-center gap-1.5"><ArrowUpFromLine className="h-3.5 w-3.5" />Export</span>}
                {tab === "config" && <span className="flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" />Auto-Sync</span>}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 pr-2">

              {/* ── Info service account ── */}
              {sheetSyncInfo && (
                <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                  <span className="font-medium">Bagikan spreadsheet ke:</span>{" "}
                  <span className="font-mono select-all">{sheetSyncInfo.serviceAccountEmail}</span>
                </div>
              )}

              {/* ─────────── TAB: IMPORT ─────────── */}
              {sheetSyncTab === "import" && (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs font-medium">ID / URL Google Spreadsheet</Label>
                      <Input
                        className="mt-1 h-9"
                        placeholder="https://docs.google.com/spreadsheets/d/... atau ID saja"
                        value={sheetId}
                        onChange={(e) => { setSheetId(e.target.value); setPreviewData(null); }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Nama Sheet (opsional)</Label>
                      <Input
                        className="mt-1 h-9"
                        placeholder='Kosong = sheet pertama, atau tulis mis. "Data Tenant"'
                        value={sheetName}
                        onChange={(e) => { setSheetName(e.target.value); setPreviewData(null); }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Mode Import</Label>
                      <Select value={importMode} onValueChange={(v) => setImportMode(v as "upsert" | "insert_only")}>
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="upsert">Upsert — tambah baru + perbarui yang sudah ada</SelectItem>
                          <SelectItem value="insert_only">Insert only — hanya tambah tenant baru</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 space-y-1">
                    <p className="font-medium text-foreground">Format kolom yang dikenali:</p>
                    <p>Baris pertama harus header. Kolom wajib: <strong>Nama Usaha</strong>, <strong>Nama Pemilik</strong>.</p>
                    <p>Kolom opsional: No HP, Email, Kategori, Nomor Booth, Area, Status, Sewa Default (Rp), Mulai/Akhir Kontrak, Catatan.</p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5"
                      onClick={handlePreview}
                      disabled={isPreviewing || !sheetId}
                    >
                      {isPreviewing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                      {isPreviewing ? "Membaca..." : "Preview"}
                    </Button>
                    {previewData && previewData.length > 0 && (
                      <Button
                        size="sm"
                        className="h-9 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => importMutation.mutate({ spreadsheetId: sheetId, sheetName, mode: importMode })}
                        disabled={importMutation.isPending}
                      >
                        {importMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                        {importMutation.isPending ? "Mengimpor..." : `Import ${previewData.length} Tenant`}
                      </Button>
                    )}
                  </div>

                  {/* Preview table */}
                  {previewData && previewData.length > 0 && (
                    <div className="rounded-md border">
                      <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/30">
                        <span className="text-xs font-medium">{previewData.length} baris ditemukan</span>
                        <div className="flex gap-3 text-xs">
                          <span className="text-green-600 font-medium">{previewData.filter((r) => r.isNew).length} baru</span>
                          <span className="text-amber-600 font-medium">{previewData.filter((r) => !r.isNew).length} akan diperbarui</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-48">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Status</th>
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Nama Usaha</th>
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Pemilik</th>
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">No HP</th>
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Kategori</th>
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Booth</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {previewData.map((row, i) => (
                              <tr key={i} className={row.isNew ? "bg-green-50/50" : "bg-amber-50/30"}>
                                <td className="px-3 py-1.5">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${
                                    row.isNew
                                      ? "bg-green-100 text-green-700 border-green-200"
                                      : "bg-amber-100 text-amber-700 border-amber-200"
                                  }`}>
                                    {row.isNew ? "Baru" : "Update"}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 font-medium">{row.businessName}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{row.ownerName}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{row.phone ?? "—"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{row.category ?? "—"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{row.boothNumber ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {previewData && previewData.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-md p-3">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      Tidak ada baris yang valid ditemukan di sheet ini.
                    </div>
                  )}
                </div>
              )}

              {/* ─────────── TAB: EXPORT ─────────── */}
              {sheetSyncTab === "export" && (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs font-medium">ID / URL Google Spreadsheet</Label>
                      <Input
                        className="mt-1 h-9"
                        placeholder="https://docs.google.com/spreadsheets/d/... atau ID saja"
                        value={exportSheetId}
                        onChange={(e) => setExportSheetId(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground space-y-1">
                    <p>Export akan menulis <strong>{tenants?.length ?? 0} tenant</strong> ke sheet bernama <strong>"Data Tenant"</strong> di spreadsheet yang dipilih.</p>
                    <p>Jika sheet sudah ada, isinya akan ditimpa. Pastikan service account sudah diberi akses <strong>Editor</strong> ke spreadsheet.</p>
                  </div>

                  <Button
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={() => exportMutation.mutate({ spreadsheetId: exportSheetId })}
                    disabled={exportMutation.isPending || !exportSheetId || !tenants?.length}
                  >
                    {exportMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                    {exportMutation.isPending ? "Mengekspor..." : `Export ${tenants?.length ?? 0} Tenant ke Sheets`}
                  </Button>
                </div>
              )}

              {/* ─────────── TAB: CONFIG / AUTO-SYNC ─────────── */}
              {sheetSyncTab === "config" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">Auto-Sync Aktif</p>
                      <p className="text-xs text-muted-foreground">Otomatis import tenant dari sheet setiap interval tertentu</p>
                    </div>
                    <button
                      onClick={() => setConfigForm((c) => ({ ...c, enabled: !c.enabled }))}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                        configForm.enabled ? "bg-green-500" : "bg-gray-300"
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${configForm.enabled ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>

                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs font-medium">ID / URL Google Spreadsheet</Label>
                      <Input
                        className="mt-1 h-9"
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        value={configForm.spreadsheetId}
                        onChange={(e) => setConfigForm((c) => ({ ...c, spreadsheetId: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Nama Sheet</Label>
                      <Input
                        className="mt-1 h-9"
                        placeholder='Kosong = sheet pertama, mis. "Data Tenant"'
                        value={configForm.sheetName}
                        onChange={(e) => setConfigForm((c) => ({ ...c, sheetName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Interval Sync (menit)</Label>
                      <Input
                        type="number"
                        min={5}
                        max={1440}
                        className="mt-1 h-9"
                        value={configForm.intervalMinutes}
                        onChange={(e) => setConfigForm((c) => ({ ...c, intervalMinutes: Number(e.target.value) }))}
                      />
                    </div>
                  </div>

                  {sheetSyncConfig?.lastSyncResult && (
                    <div className={`rounded-md border px-3 py-2 text-xs ${sheetSyncConfig.lastSyncResult.success ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                      <span className="font-medium">Sync terakhir:</span>{" "}
                      {sheetSyncConfig.lastSyncResult.success
                        ? `Berhasil — ${sheetSyncConfig.lastSyncResult.newRows} tenant baru dari ${sheetSyncConfig.lastSyncResult.totalRows} baris`
                        : `Gagal — ${sheetSyncConfig.lastSyncResult.error}`}
                      {sheetSyncConfig.lastSyncAt && (
                        <span className="ml-2 text-[10px] opacity-70">
                          {new Date(sheetSyncConfig.lastSyncAt).toLocaleString("id-ID")}
                        </span>
                      )}
                    </div>
                  )}

                  <Button
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={() => saveConfigMutation.mutate(configForm)}
                    disabled={saveConfigMutation.isPending}
                  >
                    {saveConfigMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Settings2 className="h-3.5 w-3.5" />}
                    {saveConfigMutation.isPending ? "Menyimpan..." : "Simpan Konfigurasi"}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi Hapus Massal */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Hapus {selectedCount} Tenant Sekaligus
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Anda akan menghapus <strong>{selectedCount} tenant</strong> beserta seluruh data terkait
                  (booking, invoice, dan pembayaran). Tindakan ini <strong>tidak dapat dibatalkan</strong>.
                </p>
                {selectedNames.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                    {selectedNames.map((name) => (
                      <li key={name} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive/60 shrink-0" />
                        {name}
                      </li>
                    ))}
                    {selectedCount > 5 && (
                      <li className="text-xs text-muted-foreground">
                        ...dan {selectedCount - 5} lainnya
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Menghapus..." : `Ya, Hapus ${selectedCount} Tenant`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
