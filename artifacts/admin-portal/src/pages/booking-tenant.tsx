import { useState, useMemo, useRef } from "react";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, AlertTriangle, Clock, Search, Upload, FileText, ExternalLink, X } from "lucide-react";

type ContractStatus = "draft" | "active" | "expiring_soon" | "expired" | "terminated";
type PaymentStatus = "unpaid" | "partial" | "paid" | "overdue" | "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";
type BillingCycle = "monthly" | "quarterly" | "yearly" | "custom";

type Tenant = { id: number; businessName: string; boothNumber: string | null; areaName: string };

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
  const res = await fetch(`${BASE}/api/bookings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<BookingWithTenant[]>;
}

async function fetchTenants(): Promise<Tenant[]> {
  const res = await fetch(`${BASE}/api/tenants`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Tenant[]>;
}

async function createBooking(data: object): Promise<BookingWithTenant> {
  const res = await fetch(`${BASE}/api/bookings`, {
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
  const res = await fetch(`${BASE}/api/bookings/${id}`, {
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
  const res = await fetch(`${BASE}/api/uploads/contract-document`, { method: "POST", body: fd });
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BookingWithTenant | null>(null);
  const [form, setForm] = useState<BookingForm>(EMPTY_FORM);
  const [filterContract, setFilterContract] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterFloor, setFilterFloor] = useState("");
  const [searchUnit, setSearchUnit] = useState("");

  const [docFile, setDocFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const { data: bookings, isLoading, isError } = useQuery<BookingWithTenant[]>({
    queryKey: ["/api/bookings"],
    queryFn: fetchBookings,
    refetchInterval: 30000,
  });

  const { data: tenants } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
    queryFn: fetchTenants,
  });

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kontrak Sewa Tenant</h1>
          <p className="text-muted-foreground mt-1">Kelola kontrak sewa dan status pembayaran tenant.</p>
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
          <Card key={item.label}>
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
            <CardTitle>Daftar Kontrak</CardTitle>
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(booking)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Form Kontrak */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Kontrak Sewa" : "Tambah Kontrak Sewa Baru"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <form id="booking-form" onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4 py-2">

              {/* Seksi 1: Informasi Kontrak */}
              <SectionLabel>Informasi Kontrak</SectionLabel>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tenant" required>
                  <Select
                    value={form.tenantId}
                    onValueChange={(v) => setForm(f => ({ ...f, tenantId: v }))}
                    disabled={!!editTarget}
                  >
                    <SelectTrigger><SelectValue placeholder="Pilih tenant..." /></SelectTrigger>
                    <SelectContent>
                      {(tenants ?? []).map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.businessName}{t.boothNumber ? ` · ${t.boothNumber}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Nomor Kontrak">
                  <Input
                    value={form.contractNumber}
                    onChange={(e) => setForm(f => ({ ...f, contractNumber: e.target.value }))}
                    placeholder="cth. KTR/2026/001"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Field label="Kode Unit" required>
                  <Input
                    value={form.unitCode}
                    onChange={(e) => setForm(f => ({ ...f, unitCode: e.target.value }))}
                    placeholder="cth. A-01"
                    required
                  />
                </Field>
                <Field label="Lantai">
                  <Input
                    value={form.floor}
                    onChange={(e) => setForm(f => ({ ...f, floor: e.target.value }))}
                    placeholder="cth. Lantai 1"
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
