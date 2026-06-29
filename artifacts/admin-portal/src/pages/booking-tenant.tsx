import { apiFetch } from "@/lib/api";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, AlertTriangle, Clock, Search, Upload, FileText, ExternalLink, X, Building2, Dumbbell, Trash2, ChevronsUpDown, Check, Download, FileSpreadsheet } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type ContractStatus = "draft" | "active" | "expiring_soon" | "expired" | "terminated";
type PaymentStatus = "unpaid" | "partial" | "paid" | "overdue" | "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";
type BillingCycle = "monthly" | "quarterly" | "yearly" | "custom";

type Tenant = {
  id: number;
  businessName: string;
  boothNumber: string | null;
  areaName: string;
  defaultRentAmount: string | null;
  defaultServiceChargeAmount: string | null;
  defaultElectricityChargeAmount: string | null;
  defaultWaterChargeAmount: string | null;
  defaultOtherChargeAmount: string | null;
  defaultTrashChargeAmount: string | null;
};

type BookingWithTenant = {
  id: number;
  tenantId: number;
  tenantName: string | null;
  boothNumber: string | null;
  areaName: string | null;
  orderNumber: string;
  contractNumber: string | null;
  unitCode: string | null;
  floor: string | null;
  startDate: string | null;
  endDate: string | null;
  billingCycle: BillingCycle | null;
  rentAmount: string | null;
  depositAmount: string | null;
  serviceChargeAmount: string | null;
  electricityChargeAmount: string | null;
  waterChargeAmount: string | null;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  paymentStatus: PaymentStatus;
  contractStatus: ContractStatus;
  bookingStatus: string;
  dueDate: string | null;
  periodLabel: string | null;
  notes: string | null;
  documentUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type BookingForm = {
  tenantId: string;
  contractNumber: string;
  unitCode: string;
  floor: string;
  startDate: string;
  endDate: string;
  billingCycle: BillingCycle;
  rentAmount: string;
  depositAmount: string;
  serviceChargeAmount: string;
  electricityChargeAmount: string;
  waterChargeAmount: string;
  trashChargeAmount: string;
  totalAmount: string;
  paidAmount: string;
  contractStatus: ContractStatus;
  paymentStatus: PaymentStatus;
  documentUrl: string;
  notes: string;
  dueDate: string;
  periodLabel: string;
};

const EMPTY_FORM: BookingForm = {
  tenantId: "",
  contractNumber: "",
  unitCode: "",
  floor: "",
  startDate: "",
  endDate: "",
  billingCycle: "monthly",
  rentAmount: "",
  depositAmount: "",
  serviceChargeAmount: "",
  electricityChargeAmount: "",
  waterChargeAmount: "",
  trashChargeAmount: "",
  totalAmount: "",
  paidAmount: "0",
  contractStatus: "draft",
  paymentStatus: "unpaid",
  documentUrl: "",
  notes: "",
  dueDate: "",
  periodLabel: "",
};

const CONTRACT_LABEL: Record<ContractStatus, string> = {
  draft: "Draft",
  active: "Aktif",
  expiring_soon: "Segera Habis",
  expired: "Kadaluarsa",
  terminated: "Diakhiri",
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Belum Bayar",
  partial: "Sebagian",
  paid: "Lunas",
  overdue: "Jatuh Tempo",
  UNPAID: "Belum Bayar",
  PARTIAL: "Sebagian",
  PAID: "Lunas",
  OVERDUE: "Jatuh Tempo",
};

const BILLING_LABEL: Record<BillingCycle, string> = {
  monthly: "Bulanan",
  quarterly: "Triwulan",
  yearly: "Tahunan",
  custom: "Kustom",
};

function contractBadgeClass(status: ContractStatus): string {
  switch (status) {
    case "active": return "bg-green-100 text-green-800 border-green-200";
    case "expiring_soon": return "bg-amber-100 text-amber-800 border-amber-200";
    case "draft": return "bg-blue-100 text-blue-800 border-blue-200";
    case "expired": return "bg-gray-100 text-gray-600 border-gray-200";
    case "terminated": return "bg-red-100 text-red-800 border-red-200";
  }
}

function paymentBadgeClass(status: string): string {
  const s = status.toLowerCase();
  switch (s) {
    case "paid": return "bg-green-100 text-green-800 border-green-200";
    case "partial": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "overdue": return "bg-red-100 text-red-800 border-red-200";
    default: return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function formatRupiah(amount: string | number | null | undefined): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
}

function daysUntil(endDate: string | null | undefined): number | null {
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function docFileName(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1] ?? "dokumen";
}

function isLocalUpload(url: string): boolean {
  return url.startsWith("/uploads/");
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchBookings(): Promise<BookingWithTenant[]> {
  const res = await apiFetch(`${BASE}/api/bookings`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<BookingWithTenant[]>;
}

async function fetchTenants(): Promise<Tenant[]> {
  const res = await apiFetch(`${BASE}/api/tenants`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Tenant[]>;
}

async function createBooking(data: object): Promise<BookingWithTenant> {
  const res = await apiFetch(`${BASE}/api/bookings`, { credentials: "include",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal menyimpan kontrak");
  }
  return res.json() as Promise<BookingWithTenant>;
}

async function updateBooking(id: number, data: object): Promise<BookingWithTenant> {
  const res = await apiFetch(`${BASE}/api/bookings/${id}`, { credentials: "include",
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal memperbarui kontrak");
  }
  return res.json() as Promise<BookingWithTenant>;
}

async function uploadDocFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch(`${BASE}/api/uploads/contract-document`, { method: "POST", credentials: "include", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal mengunggah dokumen");
  }
  const data = await res.json() as { url: string };
  return data.url;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 mt-1">{children}</p>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}{required && " *"}</Label>
      {children}
    </div>
  );
}

export default function BookingTenant() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const docInputRef = useRef<HTMLInputElement>(null);
  const { activeSite } = useSite();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BookingWithTenant | null>(null);
  const [form, setForm] = useState<BookingForm>(EMPTY_FORM);
  const [tenantComboOpen, setTenantComboOpen] = useState(false);
  const [filterContract, setFilterContract] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterFloor, setFilterFloor] = useState("");
  const [searchUnit, setSearchUnit] = useState("");

  const [docFile, setDocFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  useEffect(() => {
    if (dialogOpen && !editTarget) {
      apiFetch(`${BASE}/api/bookings/next-contract-number`)
        .then(async (resp) => {
          if (!resp.ok) return;
          const data = await resp.json() as { contractNumber: string };
          setForm(f => ({ ...f, contractNumber: f.contractNumber || data.contractNumber }));
        })
        .catch(() => {});
    }
  }, [dialogOpen, editTarget]);

  const { data: bookings, isLoading, isError } = useQuery<BookingWithTenant[]>({
    queryKey: ["/api/bookings"],
    queryFn: fetchBookings,
    refetchInterval: 30000,
  });

  const { data: tenants } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
    queryFn: fetchTenants,
  });

  const [deleteTarget, setDeleteTarget] = useState<BookingWithTenant | null>(null);

  const createMutation = useMutation({
    mutationFn: createBooking,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/tenant-pos"] });
      toast({ title: "Berhasil", description: "Kontrak baru berhasil ditambahkan." });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${BASE}/api/bookings/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Gagal menghapus kontrak");
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/tenant-pos"] });
      toast({ title: "Berhasil", description: "Kontrak berhasil dihapus." });
      setDeleteTarget(null);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal Menghapus", description: e.message, variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => updateBooking(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/tenant-pos"] });
      toast({ title: "Berhasil", description: "Kontrak berhasil diperbarui." });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDocFile(null);
    setDialogOpen(true);
  }

  function openEdit(b: BookingWithTenant) {
    setEditTarget(b);
    setForm({
      tenantId: String(b.tenantId),
      contractNumber: b.contractNumber ?? "",
      unitCode: b.unitCode ?? "",
      floor: b.floor ?? "",
      startDate: b.startDate ?? "",
      endDate: b.endDate ?? "",
      billingCycle: (b.billingCycle as BillingCycle) ?? "monthly",
      rentAmount: b.rentAmount ?? "",
      depositAmount: b.depositAmount ?? "",
      serviceChargeAmount: b.serviceChargeAmount ?? "",
      electricityChargeAmount: b.electricityChargeAmount ?? "",
      waterChargeAmount: b.waterChargeAmount ?? "",
      trashChargeAmount: (b as BookingWithTenant & { trashChargeAmount?: string | null }).trashChargeAmount ?? "",
      totalAmount: b.totalAmount,
      paidAmount: b.paidAmount,
      contractStatus: b.contractStatus,
      paymentStatus: b.paymentStatus.toLowerCase() as PaymentStatus,
      documentUrl: b.documentUrl ?? "",
      notes: b.notes ?? "",
      dueDate: b.dueDate ?? "",
      periodLabel: b.periodLabel ?? "",
    });
    setDocFile(null);
    setDialogOpen(true);
  }

  function handleDocChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Format Tidak Didukung", description: "Gunakan PDF, JPG, atau PNG.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File Terlalu Besar", description: "Maksimal ukuran dokumen 5MB.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    setDocFile(file);
  }

  function clearDoc() {
    setDocFile(null);
    setForm(f => ({ ...f, documentUrl: "" }));
    if (docInputRef.current) docInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.startDate || !form.endDate) {
      toast({ title: "Validasi Gagal", description: "Tanggal mulai dan selesai wajib diisi.", variant: "destructive" });
      return;
    }
    if (form.endDate <= form.startDate) {
      toast({ title: "Validasi Gagal", description: "Tanggal selesai tidak boleh sebelum tanggal mulai.", variant: "destructive" });
      return;
    }

    let finalDocUrl = form.documentUrl;

    if (docFile) {
      setIsUploadingDoc(true);
      try {
        finalDocUrl = await uploadDocFile(docFile);
      } catch (err) {
        toast({ title: "Upload Dokumen Gagal", description: (err as Error).message, variant: "destructive" });
        setIsUploadingDoc(false);
        return;
      }
      setIsUploadingDoc(false);
    }

    const totalComputed = [
      form.rentAmount, form.serviceChargeAmount,
      form.electricityChargeAmount, form.waterChargeAmount,
      form.trashChargeAmount,
    ].reduce((sum, v) => sum + Number(v || 0), 0);

    const totalAmount = form.totalAmount ? Number(form.totalAmount) : totalComputed;
    const paidAmount = Number(form.paidAmount || 0);

    const payload = {
      tenantId: Number(form.tenantId),
      contractNumber: form.contractNumber || null,
      unitCode: form.unitCode || null,
      floor: form.floor || null,
      startDate: form.startDate,
      endDate: form.endDate,
      billingCycle: form.billingCycle,
      rentAmount: form.rentAmount ? String(form.rentAmount) : null,
      depositAmount: form.depositAmount ? String(form.depositAmount) : null,
      serviceChargeAmount: form.serviceChargeAmount ? String(form.serviceChargeAmount) : null,
      electricityChargeAmount: form.electricityChargeAmount ? String(form.electricityChargeAmount) : null,
      waterChargeAmount: form.waterChargeAmount ? String(form.waterChargeAmount) : null,
      trashChargeAmount: form.trashChargeAmount ? String(form.trashChargeAmount) : null,
      totalAmount: String(totalAmount),
      paidAmount: String(paidAmount),
      remainingAmount: String(Math.max(0, totalAmount - paidAmount)),
      contractStatus: form.contractStatus,
      paymentStatus: form.paymentStatus,
      documentUrl: finalDocUrl || null,
      notes: form.notes || null,
      dueDate: form.dueDate || null,
      periodLabel: form.periodLabel || null,
      orderNumber: editTarget?.orderNumber ?? form.contractNumber ?? "",
    };

    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending || isUploadingDoc;

  const expiringContracts = useMemo(() =>
    (bookings ?? []).filter((b) => {
      const days = daysUntil(b.endDate);
      return (b.contractStatus === "active" || b.contractStatus === "expiring_soon") &&
             days !== null && days >= 0 && days <= 30;
    }),
    [bookings]
  );

  const filtered = useMemo(() => {
    return (bookings ?? []).filter((b) => {
      const matchContract = filterContract === "all" || b.contractStatus === filterContract;
      const matchPayment = filterPayment === "all" ||
        b.paymentStatus.toLowerCase() === filterPayment.toLowerCase();
      const matchFloor = filterFloor === "" ||
        (b.floor ?? "").toLowerCase().includes(filterFloor.toLowerCase());
      const matchUnit = searchUnit === "" ||
        (b.unitCode ?? "").toLowerCase().includes(searchUnit.toLowerCase()) ||
        (b.tenantName ?? "").toLowerCase().includes(searchUnit.toLowerCase()) ||
        (b.contractNumber ?? "").toLowerCase().includes(searchUnit.toLowerCase());
      return matchContract && matchPayment && matchFloor && matchUnit;
    });
  }, [bookings, filterContract, filterPayment, filterFloor, searchUnit]);

  const totalTagihan = (bookings ?? []).reduce((s, b) => s + Number(b.totalAmount), 0);
  const totalTerbayar = (bookings ?? []).reduce((s, b) => s + Number(b.paidAmount), 0);
  const totalSisa = totalTagihan - totalTerbayar;
  const jumlahAktif = (bookings ?? []).filter(b => b.contractStatus === "active" || b.contractStatus === "expiring_soon").length;
  const siteCfg = activeSite ? (SITE_TYPE_CONFIG[activeSite.type] ?? null) : null;

  const CONTRACT_STATUS_LABEL: Record<string, string> = {
    draft: "Draft", active: "Aktif", expiring_soon: "Segera Habis",
    expired: "Kadaluarsa", terminated: "Diakhiri",
  };
  const PAYMENT_STATUS_LABEL: Record<string, string> = {
    unpaid: "Belum Bayar", partial: "Sebagian", paid: "Lunas", overdue: "Jatuh Tempo",
  };

  const exportToExcel = useCallback(async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Mall Admin Portal";
    const ws = wb.addWorksheet("Daftar Kontrak");

    const siteName = activeSite?.name ?? "Semua Site";
    const now = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

    ws.mergeCells("A1:K1");
    const titleCell = ws.getCell("A1");
    titleCell.value = `Daftar Kontrak Sewa Tenant — ${siteName}`;
    titleCell.font = { bold: true, size: 13 };
    titleCell.alignment = { horizontal: "center" };

    ws.mergeCells("A2:K2");
    const subCell = ws.getCell("A2");
    subCell.value = `Dicetak: ${now}  |  Total: ${filtered.length} kontrak`;
    subCell.alignment = { horizontal: "center" };
    subCell.font = { color: { argb: "FF666666" }, size: 10 };

    ws.addRow([]);

    const headers = [
      "No. Kontrak", "Nama Tenant", "Kode Unit", "Lantai",
      "Tgl Mulai", "Tgl Selesai", "Harga Sewa (Rp)",
      "Total Tagihan (Rp)", "Terbayar (Rp)", "Sisa (Rp)",
      "Status Kontrak", "Status Pembayaran",
    ];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.alignment = { horizontal: "center" };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FF1D4ED8" } },
      };
    });

    ws.columns = [
      { key: "c0", width: 18 }, { key: "c1", width: 24 }, { key: "c2", width: 16 },
      { key: "c3", width: 10 }, { key: "c4", width: 14 }, { key: "c5", width: 14 },
      { key: "c6", width: 18 }, { key: "c7", width: 18 }, { key: "c8", width: 18 },
      { key: "c9", width: 18 }, { key: "c10", width: 16 }, { key: "c11", width: 18 },
    ];

    filtered.forEach((b, idx) => {
      const sisa = Math.max(0, Number(b.totalAmount) - Number(b.paidAmount));
      const row = ws.addRow([
        b.contractNumber || b.orderNumber,
        b.tenantName ?? "",
        b.unitCode ?? "",
        b.floor ?? "",
        b.startDate ? new Date(b.startDate).toLocaleDateString("id-ID") : "",
        b.endDate   ? new Date(b.endDate).toLocaleDateString("id-ID")   : "",
        Number(b.rentAmount ?? 0),
        Number(b.totalAmount),
        Number(b.paidAmount),
        sisa,
        CONTRACT_STATUS_LABEL[b.contractStatus] ?? b.contractStatus,
        PAYMENT_STATUS_LABEL[b.paymentStatus]   ?? b.paymentStatus,
      ]);
      row.getCell(7).numFmt  = '#,##0';
      row.getCell(8).numFmt  = '#,##0';
      row.getCell(9).numFmt  = '#,##0';
      row.getCell(10).numFmt = '#,##0';
      if (idx % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4FF" } };
        });
      }
    });

    // Summary row
    ws.addRow([]);
    const sumRow = ws.addRow([
      "TOTAL", "", "", "", "", "",
      filtered.reduce((s, b) => s + Number(b.rentAmount ?? 0), 0),
      filtered.reduce((s, b) => s + Number(b.totalAmount), 0),
      filtered.reduce((s, b) => s + Number(b.paidAmount), 0),
      filtered.reduce((s, b) => s + Math.max(0, Number(b.totalAmount) - Number(b.paidAmount)), 0),
    ]);
    sumRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    });
    sumRow.getCell(7).numFmt  = '#,##0';
    sumRow.getCell(8).numFmt  = '#,##0';
    sumRow.getCell(9).numFmt  = '#,##0';
    sumRow.getCell(10).numFmt = '#,##0';

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kontrak-sewa-${siteName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, activeSite]);

  const exportToPDF = useCallback(async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const siteName = activeSite?.name ?? "Semua Site";
    const now = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Daftar Kontrak Sewa Tenant — ${siteName}`, 14, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Dicetak: ${now}  |  Total: ${filtered.length} kontrak`, 14, 22);

    const fmt = (n: number) => n.toLocaleString("id-ID");

    autoTable(doc, {
      startY: 27,
      head: [[
        "No. Kontrak", "Tenant", "Unit", "Lantai",
        "Tgl Mulai", "Tgl Selesai",
        "Harga Sewa", "Total Tagihan", "Terbayar", "Sisa",
        "Kontrak", "Pembayaran",
      ]],
      body: filtered.map((b) => [
        b.contractNumber || b.orderNumber,
        b.tenantName ?? "",
        b.unitCode ?? "",
        b.floor ?? "",
        b.startDate ? new Date(b.startDate).toLocaleDateString("id-ID") : "",
        b.endDate   ? new Date(b.endDate).toLocaleDateString("id-ID")   : "",
        fmt(Number(b.rentAmount ?? 0)),
        fmt(Number(b.totalAmount)),
        fmt(Number(b.paidAmount)),
        fmt(Math.max(0, Number(b.totalAmount) - Number(b.paidAmount))),
        CONTRACT_STATUS_LABEL[b.contractStatus] ?? b.contractStatus,
        PAYMENT_STATUS_LABEL[b.paymentStatus]   ?? b.paymentStatus,
      ]),
      foot: [[
        "TOTAL", "", "", "", "", "",
        fmt(filtered.reduce((s, b) => s + Number(b.rentAmount ?? 0), 0)),
        fmt(filtered.reduce((s, b) => s + Number(b.totalAmount), 0)),
        fmt(filtered.reduce((s, b) => s + Number(b.paidAmount), 0)),
        fmt(filtered.reduce((s, b) => s + Math.max(0, Number(b.totalAmount) - Number(b.paidAmount)), 0)),
        "", "",
      ]],
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 7.5 },
      footStyles: { fillColor: [219, 234, 254], textColor: 30, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [240, 244, 255] },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        6: { halign: "right" }, 7: { halign: "right" },
        8: { halign: "right" }, 9: { halign: "right" },
      },
    });

    doc.save(`kontrak-sewa-${siteName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0,10)}.pdf`);
  }, [filtered, activeSite]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Kontrak Sewa Tenant</h1>
            {activeSite && siteCfg && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${siteCfg.color} ${siteCfg.bg} ${siteCfg.border}`}>
                {siteCfg.icon}
                {activeSite.name}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {activeSite
              ? `Kontrak sewa aktif di ${activeSite.name}`
              : "Kelola kontrak sewa dan status pembayaran tenant."}
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Kontrak
        </Button>
      </div>

      {/* Alert: kontrak segera habis */}
      {expiringContracts.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 !text-amber-600" />
          <AlertTitle className="text-amber-800">
            {expiringContracts.length} kontrak akan berakhir dalam 30 hari
          </AlertTitle>
          <AlertDescription className="text-amber-700">
            {expiringContracts.map((b, i) => (
              <span key={b.id}>
                <strong>{b.tenantName ?? "Tenant"}</strong>
                {b.unitCode ? ` (${b.unitCode})` : ""}
                {" — "}
                <span className="font-medium">
                  {daysUntil(b.endDate) === 0 ? "hari ini!" : `${daysUntil(b.endDate)} hari lagi`}
                </span>
                {i < expiringContracts.length - 1 ? ", " : ""}
              </span>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Kontrak Aktif", value: jumlahAktif, sub: "termasuk segera habis" },
          { label: "Total Tagihan", value: formatRupiah(totalTagihan), sub: "keseluruhan" },
          { label: "Total Terbayar", value: formatRupiah(totalTerbayar), sub: "sudah diterima" },
          { label: "Sisa Tagihan", value: formatRupiah(totalSisa), sub: "belum lunas", accent: true },
        ].map((item) => (
          <Card key={item.label} className={siteCfg ? `border-l-4 ${siteCfg.border}` : ""}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</p>
              <p className={`text-xl font-bold mt-1 ${(item as { accent?: boolean }).accent ? "text-orange-500" : ""}`}>{item.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CardTitle>Daftar Kontrak</CardTitle>
              {activeSite && siteCfg && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${siteCfg.color} ${siteCfg.bg} ${siteCfg.border}`}>
                  {siteCfg.icon}
                  {activeSite.name}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 w-44 h-9"
                  placeholder="Cari kontrak / tenant..."
                  value={searchUnit}
                  onChange={(e) => setSearchUnit(e.target.value)}
                />
              </div>
              <Select value={filterContract} onValueChange={setFilterContract}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Status kontrak" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="expiring_soon">Segera Habis</SelectItem>
                  <SelectItem value="expired">Kadaluarsa</SelectItem>
                  <SelectItem value="terminated">Diakhiri</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPayment} onValueChange={setFilterPayment}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Status bayar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Pembayaran</SelectItem>
                  <SelectItem value="unpaid">Belum Bayar</SelectItem>
                  <SelectItem value="partial">Sebagian</SelectItem>
                  <SelectItem value="paid">Lunas</SelectItem>
                  <SelectItem value="overdue">Jatuh Tempo</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="w-36 h-9"
                placeholder="Cari lantai..."
                value={filterFloor}
                onChange={(e) => setFilterFloor(e.target.value)}
              />
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                  onClick={() => void exportToExcel()}
                  disabled={filtered.length === 0}
                  title="Export ke Excel"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-red-700 border-red-300 hover:bg-red-50"
                  onClick={() => void exportToPDF()}
                  disabled={filtered.length === 0}
                  title="Export ke PDF"
                >
                  <Download className="h-4 w-4" />
                  PDF
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isError && (
            <p className="text-sm text-destructive py-4 text-center">
              Gagal memuat data kontrak. Periksa koneksi server.
            </p>
          )}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[110px]">No. Kontrak</TableHead>
                  <TableHead className="min-w-[130px]">Tenant</TableHead>
                  <TableHead>Unit / Lantai</TableHead>
                  <TableHead className="min-w-[140px]">Periode</TableHead>
                  <TableHead className="min-w-[110px]">Harga Sewa</TableHead>
                  <TableHead className="min-w-[110px]">Total Tagihan</TableHead>
                  <TableHead className="min-w-[110px]">Terbayar</TableHead>
                  <TableHead>Status Kontrak</TableHead>
                  <TableHead>Pembayaran</TableHead>
                  <TableHead className="w-[90px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 10 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : filtered.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        {bookings?.length === 0 ? "Belum ada kontrak terdaftar." : "Tidak ada hasil yang sesuai filter."}
                      </TableCell>
                    </TableRow>
                  )
                  : filtered.map((booking) => {
                      const days = daysUntil(booking.endDate);
                      return (
                        <TableRow key={booking.id}>
                          <TableCell>
                            <div className="font-mono text-xs">{booking.contractNumber || booking.orderNumber || `#${booking.id}`}</div>
                            {booking.documentUrl && (
                              <a
                                href={booking.documentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5"
                              >
                                <FileText className="h-3 w-3" />
                                Dok. Kontrak
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{booking.tenantName ?? "-"}</TableCell>
                          <TableCell>
                            <span className="font-medium">{booking.unitCode ?? (booking.boothNumber ?? "-")}</span>
                            {(booking.floor || booking.areaName) && (
                              <span className="block text-xs text-muted-foreground">
                                {booking.floor ?? booking.areaName}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="block">{formatDate(booking.startDate)}</span>
                            <span className="text-xs text-muted-foreground">s/d {formatDate(booking.endDate)}</span>
                            {(booking.contractStatus === "active" || booking.contractStatus === "expiring_soon") && days !== null && days <= 30 && days >= 0 && (
                              <span className="flex items-center gap-1 text-xs text-amber-600 mt-0.5">
                                <Clock className="h-3 w-3" />
                                {days === 0 ? "Berakhir hari ini!" : `${days} hari lagi`}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{formatRupiah(booking.rentAmount)}</TableCell>
                          <TableCell>{formatRupiah(booking.totalAmount)}</TableCell>
                          <TableCell>{formatRupiah(booking.paidAmount)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${contractBadgeClass(booking.contractStatus)}`}>
                              {CONTRACT_LABEL[booking.contractStatus] ?? booking.contractStatus}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${paymentBadgeClass(booking.paymentStatus)}`}>
                              {PAYMENT_LABEL[booking.paymentStatus] ?? booking.paymentStatus}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit kontrak" onClick={() => openEdit(booking)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {booking.contractStatus !== "active" && booking.contractStatus !== "expiring_soon" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Hapus kontrak"
                                  onClick={() => setDeleteTarget(booking)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* AlertDialog: Konfirmasi Hapus Kontrak */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Hapus Kontrak?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus kontrak{" "}
              <strong className="text-foreground font-mono">
                {deleteTarget?.contractNumber || deleteTarget?.orderNumber || `#${deleteTarget?.id}`}
              </strong>{" "}
              milik <strong className="text-foreground">{deleteTarget?.tenantName}</strong>?
              Tindakan ini <strong>tidak dapat dibatalkan</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Form Kontrak */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Kontrak Sewa" : "Tambah Kontrak Sewa Baru"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <form id="booking-form" onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4 py-2">

              {/* Seksi 1: Informasi Kontrak */}
              <SectionLabel>Informasi Kontrak</SectionLabel>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tenant" required>
                  {editTarget ? (
                    // Mode Edit: tampilkan nama tenant saja (tidak bisa diubah)
                    <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground">
                      {(tenants ?? []).find(t => String(t.id) === form.tenantId)?.businessName ?? "—"}
                    </div>
                  ) : (
                    // Mode Tambah: combobox dengan pencarian
                    <Popover open={tenantComboOpen} onOpenChange={setTenantComboOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={tenantComboOpen}
                          className="w-full justify-between font-normal truncate"
                        >
                          <span className="truncate">
                            {form.tenantId
                              ? (() => {
                                  const t = (tenants ?? []).find(t => String(t.id) === form.tenantId);
                                  return t ? `${t.businessName}${t.boothNumber ? ` · ${t.boothNumber}` : ""}` : "Pilih tenant...";
                                })()
                              : "Pilih tenant..."}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[340px] p-0" align="start">
                        <Command filter={(value, search) => {
                          const tenant = (tenants ?? []).find(t => String(t.id) === value);
                          if (!tenant) return 0;
                          const hay = `${tenant.businessName} ${tenant.boothNumber ?? ""} ${tenant.areaName ?? ""}`.toLowerCase();
                          return hay.includes(search.toLowerCase()) ? 1 : 0;
                        }}>
                          <CommandInput placeholder="Cari nama tenant, kode unit..." />
                          <CommandList>
                            <CommandEmpty>Tenant tidak ditemukan.</CommandEmpty>
                            <CommandGroup>
                              {(tenants ?? []).map((t) => (
                                <CommandItem
                                  key={t.id}
                                  value={String(t.id)}
                                  onSelect={(v) => {
                                    const tenant = (tenants ?? []).find(x => String(x.id) === v);
                                    setForm(f => ({
                                      ...f,
                                      tenantId: v,
                                      ...(tenant ? {
                                        unitCode: tenant.boothNumber ? tenant.boothNumber : f.unitCode,
                                        floor: tenant.areaName ? tenant.areaName : f.floor,
                                        rentAmount: Number(tenant.defaultRentAmount ?? 0) > 0
                                          ? String(tenant.defaultRentAmount)
                                          : f.rentAmount,
                                        serviceChargeAmount: Number(tenant.defaultServiceChargeAmount ?? 0) > 0
                                          ? String(tenant.defaultServiceChargeAmount)
                                          : f.serviceChargeAmount,
                                        electricityChargeAmount: Number(tenant.defaultElectricityChargeAmount ?? 0) > 0
                                          ? String(tenant.defaultElectricityChargeAmount)
                                          : f.electricityChargeAmount,
                                        waterChargeAmount: Number(tenant.defaultWaterChargeAmount ?? 0) > 0
                                          ? String(tenant.defaultWaterChargeAmount)
                                          : f.waterChargeAmount,
                                        trashChargeAmount: Number(tenant.defaultTrashChargeAmount ?? 0) > 0
                                          ? String(tenant.defaultTrashChargeAmount)
                                          : f.trashChargeAmount,
                                      } : {}),
                                    }));
                                    setTenantComboOpen(false);
                                    // Auto-generate nomor kontrak jika field masih kosong
                                    apiFetch(`${BASE}/api/bookings/next-contract-number`)
                                      .then(async (resp) => {
                                        if (!resp.ok) return;
                                        const data = await resp.json() as { contractNumber: string };
                                        setForm(f => ({ ...f, contractNumber: f.contractNumber || data.contractNumber }));
                                      })
                                      .catch(() => {});
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 shrink-0 ${form.tenantId === String(t.id) ? "opacity-100" : "opacity-0"}`}
                                  />
                                  <div className="flex flex-col min-w-0">
                                    <span className="truncate font-medium">{t.businessName}</span>
                                    {(t.boothNumber || t.areaName) && (
                                      <span className="truncate text-xs text-muted-foreground">
                                        {[t.boothNumber, t.areaName].filter(Boolean).join(" · ")}
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </Field>
                <Field label="Nomor Kontrak">
                  <Input
                    value={form.contractNumber}
                    onChange={(e) => setForm(f => ({ ...f, contractNumber: e.target.value }))}
                    placeholder="cth. KTR/2026/001"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Kode Unit" required>
                  <Input
                    value={form.unitCode}
                    onChange={(e) => setForm(f => ({ ...f, unitCode: e.target.value }))}
                    placeholder="cth. A-01"
                    required
                  />
                </Field>
                <Field label="Siklus Tagihan">
                  <Select value={form.billingCycle} onValueChange={(v) => setForm(f => ({ ...f, billingCycle: v as BillingCycle }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(BILLING_LABEL) as [BillingCycle, string][]).map(([v, label]) => (
                        <SelectItem key={v} value={v}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Separator />

              {/* Seksi 2: Periode Sewa */}
              <SectionLabel>Periode Sewa</SectionLabel>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Tanggal Mulai" required>
                  <Input
                    type="date" value={form.startDate} required
                    onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))}
                  />
                </Field>
                <Field label="Tanggal Selesai" required>
                  <Input
                    type="date" value={form.endDate} required
                    min={form.startDate || undefined}
                    onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))}
                  />
                </Field>
                <Field label="Status Kontrak">
                  <Select value={form.contractStatus} onValueChange={(v) => setForm(f => ({ ...f, contractStatus: v as ContractStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Aktif</SelectItem>
                      <SelectItem value="terminated">Diakhiri</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Separator />

              {/* Seksi 3: Biaya */}
              <SectionLabel>Rincian Biaya (Rp)</SectionLabel>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Harga Sewa" required>
                  <Input
                    type="number" min={0} value={form.rentAmount} required
                    onChange={(e) => setForm(f => ({ ...f, rentAmount: e.target.value }))}
                    placeholder="cth. 5000000"
                  />
                </Field>
                <Field label="Deposit / Jaminan">
                  <Input
                    type="number" min={0} value={form.depositAmount}
                    onChange={(e) => setForm(f => ({ ...f, depositAmount: e.target.value }))}
                    placeholder="cth. 10000000"
                  />
                </Field>
                <Field label="Biaya Servis">
                  <Input
                    type="number" min={0} value={form.serviceChargeAmount}
                    onChange={(e) => setForm(f => ({ ...f, serviceChargeAmount: e.target.value }))}
                    placeholder="cth. 750000"
                  />
                </Field>
                <Field label="Biaya Listrik">
                  <Input
                    type="number" min={0} value={form.electricityChargeAmount}
                    onChange={(e) => setForm(f => ({ ...f, electricityChargeAmount: e.target.value }))}
                    placeholder="cth. 400000"
                  />
                </Field>
                <Field label="Biaya Air">
                  <Input
                    type="number" min={0} value={form.waterChargeAmount}
                    onChange={(e) => setForm(f => ({ ...f, waterChargeAmount: e.target.value }))}
                    placeholder="cth. 150000"
                  />
                </Field>
                <Field label="Iuran Sampah / Kebersihan">
                  <Input
                    type="number" min={0} value={form.trashChargeAmount}
                    onChange={(e) => setForm(f => ({ ...f, trashChargeAmount: e.target.value }))}
                    placeholder="cth. 50000"
                  />
                </Field>
                <Field label="Override Total Tagihan">
                  <Input
                    type="number" min={0} value={form.totalAmount}
                    onChange={(e) => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                    placeholder="Kosongkan untuk auto-hitung"
                  />
                </Field>
              </div>

              <Separator />

              {/* Seksi 4: Pembayaran */}
              <SectionLabel>Status Pembayaran</SectionLabel>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Status Pembayaran">
                  <Select value={form.paymentStatus} onValueChange={(v) => setForm(f => ({ ...f, paymentStatus: v as PaymentStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Belum Bayar</SelectItem>
                      <SelectItem value="partial">Sebagian</SelectItem>
                      <SelectItem value="paid">Lunas</SelectItem>
                      <SelectItem value="overdue">Jatuh Tempo</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Jumlah Terbayar (Rp)">
                  <Input
                    type="number" min={0} value={form.paidAmount}
                    onChange={(e) => setForm(f => ({ ...f, paidAmount: e.target.value }))}
                    placeholder="0"
                  />
                </Field>
                <Field label="Jatuh Tempo">
                  <Input
                    type="date" value={form.dueDate}
                    onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  />
                </Field>
              </div>

              <Separator />

              {/* Seksi 5: Dokumen & Catatan */}
              <SectionLabel>Dokumen & Catatan</SectionLabel>

              {/* Dokumen kontrak */}
              <Field label="Dokumen Kontrak">
                <div className="flex flex-col gap-2">
                  {/* Dokumen yang sudah ada */}
                  {form.documentUrl && !docFile && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted border border-border text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate text-xs text-muted-foreground">
                        {isLocalUpload(form.documentUrl)
                          ? docFileName(form.documentUrl)
                          : form.documentUrl}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={form.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-accent"
                          title="Buka dokumen"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-blue-600" />
                        </a>
                        <button
                          type="button"
                          onClick={clearDoc}
                          className="p-1 rounded hover:bg-accent"
                          title="Hapus dokumen"
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* File baru dipilih */}
                  {docFile && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-blue-50 border border-blue-200 text-sm">
                      <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                      <span className="flex-1 truncate text-xs text-blue-700">{docFile.name}</span>
                      <button
                        type="button"
                        onClick={() => { setDocFile(null); if (docInputRef.current) docInputRef.current.value = ""; }}
                        className="p-1 rounded hover:bg-blue-100"
                      >
                        <X className="h-3.5 w-3.5 text-blue-600" />
                      </button>
                    </div>
                  )}

                  {/* Upload button */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => docInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {form.documentUrl || docFile ? "Ganti Dokumen" : "Upload Dokumen"}
                    </Button>
                    <span className="text-xs text-muted-foreground">PDF, JPG, PNG · Maks 5MB</span>
                  </div>
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleDocChange}
                  />

                  {/* Atau masukkan URL langsung */}
                  {!docFile && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">atau tempel URL dokumen:</span>
                      <Input
                        type="url"
                        value={form.documentUrl}
                        onChange={(e) => setForm(f => ({ ...f, documentUrl: e.target.value }))}
                        placeholder="https://drive.google.com/..."
                        className="text-sm"
                      />
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Catatan">
                <Textarea
                  value={form.notes} rows={3}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Catatan tambahan..."
                />
              </Field>
            </form>
          </ScrollArea>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button type="submit" form="booking-form" disabled={isSaving || !form.tenantId}>
              {isUploadingDoc ? "Mengunggah dokumen..." : isSaving ? "Menyimpan..." : editTarget ? "Simpan Perubahan" : "Buat Kontrak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
