import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil } from "lucide-react";

type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";
type BookingStatus = "aktif" | "selesai" | "pending" | "batal";

type Tenant = { id: number; businessName: string; boothNumber: string | null; areaName: string };

type BookingWithTenant = {
  id: number;
  tenantId: number;
  tenantName: string | null;
  boothNumber: string | null;
  areaName: string | null;
  startDate: string;
  endDate: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  dueDate: string | null;
  periodLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

type BookingForm = {
  tenantId: string;
  startDate: string;
  endDate: string;
  totalAmount: string;
  dueDate: string;
  periodLabel: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
};

const EMPTY_FORM: BookingForm = {
  tenantId: "",
  startDate: "",
  endDate: "",
  totalAmount: "",
  dueDate: "",
  periodLabel: "",
  bookingStatus: "aktif",
  paymentStatus: "UNPAID",
};

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Belum Bayar",
  PARTIAL: "Sebagian",
  PAID: "Lunas",
  OVERDUE: "Jatuh Tempo",
};

const BOOKING_LABEL: Record<BookingStatus, string> = {
  aktif: "Aktif",
  selesai: "Selesai",
  pending: "Pending",
  batal: "Batal",
};

function paymentVariant(s: PaymentStatus): "default" | "secondary" | "outline" | "destructive" {
  if (s === "PAID") return "default";
  if (s === "PARTIAL") return "outline";
  if (s === "OVERDUE") return "destructive";
  return "secondary";
}

function bookingVariant(s: BookingStatus): "default" | "secondary" | "outline" {
  if (s === "aktif") return "default";
  if (s === "selesai") return "secondary";
  return "outline";
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
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
    throw new Error((err as { error?: string }).error ?? "Gagal menyimpan booking");
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
    throw new Error((err as { error?: string }).error ?? "Gagal memperbarui booking");
  }
  return res.json() as Promise<BookingWithTenant>;
}

export default function BookingTenant() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BookingWithTenant | null>(null);
  const [form, setForm] = useState<BookingForm>(EMPTY_FORM);

  const { data: bookings, isLoading, isError } = useQuery<BookingWithTenant[]>({
    queryKey: ["/api/bookings"],
    queryFn: fetchBookings,
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
      toast({ title: "Berhasil", description: "Booking baru berhasil ditambahkan." });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => updateBooking(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/tenant-pos"] });
      toast({ title: "Berhasil", description: "Booking berhasil diperbarui." });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(b: BookingWithTenant) {
    setEditTarget(b);
    setForm({
      tenantId: String(b.tenantId),
      startDate: b.startDate,
      endDate: b.endDate,
      totalAmount: String(b.totalAmount),
      dueDate: b.dueDate ?? "",
      periodLabel: b.periodLabel ?? "",
      bookingStatus: b.bookingStatus,
      paymentStatus: b.paymentStatus,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      tenantId: Number(form.tenantId),
      startDate: form.startDate,
      endDate: form.endDate,
      totalAmount: Number(form.totalAmount),
      paidAmount: editTarget?.paidAmount ?? 0,
      dueDate: form.dueDate || null,
      periodLabel: form.periodLabel || null,
      bookingStatus: form.bookingStatus,
      paymentStatus: form.paymentStatus,
    };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Ringkasan
  const totalTagihan = bookings?.reduce((s, b) => s + b.totalAmount, 0) ?? 0;
  const totalTerbayar = bookings?.reduce((s, b) => s + b.paidAmount, 0) ?? 0;
  const totalSisa = totalTagihan - totalTerbayar;
  const jumlahAktif = bookings?.filter(b => b.bookingStatus === "aktif").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Booking Tenant</h1>
          <p className="text-muted-foreground mt-1">Daftar penyewaan dan masa sewa tenant.</p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Booking
        </Button>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Booking Aktif", value: jumlahAktif, sub: "booking berjalan" },
          { label: "Total Tagihan", value: formatRupiah(totalTagihan), sub: "keseluruhan periode" },
          { label: "Total Terbayar", value: formatRupiah(totalTerbayar), sub: "sudah diterima" },
          { label: "Sisa Tagihan", value: formatRupiah(totalSisa), sub: "belum lunas", accent: true },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</p>
              <p className={`text-xl font-bold mt-1 ${item.accent ? "text-orange-500" : ""}`}>{item.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Booking</CardTitle>
        </CardHeader>
        <CardContent>
          {isError && (
            <p className="text-sm text-destructive py-4 text-center">
              Gagal memuat data booking. Periksa koneksi server.
            </p>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">ID</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Area / Booth</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Total Sewa</TableHead>
                  <TableHead>Terbayar</TableHead>
                  <TableHead>Bayar</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : !bookings || bookings.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Belum ada data booking.
                      </TableCell>
                    </TableRow>
                  )
                  : bookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="font-mono text-sm">{booking.id}</TableCell>
                        <TableCell className="font-medium">{booking.tenantName ?? "-"}</TableCell>
                        <TableCell>
                          {booking.areaName ?? ""}
                          {booking.boothNumber ? ` · ${booking.boothNumber}` : ""}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="block">{booking.periodLabel ?? `${booking.startDate} s/d ${booking.endDate}`}</span>
                          {booking.dueDate && (
                            <span className="text-xs text-muted-foreground">Jatuh tempo: {booking.dueDate}</span>
                          )}
                        </TableCell>
                        <TableCell>{formatRupiah(booking.totalAmount)}</TableCell>
                        <TableCell>{formatRupiah(booking.paidAmount)}</TableCell>
                        <TableCell>
                          <Badge variant={paymentVariant(booking.paymentStatus)}>
                            {PAYMENT_LABEL[booking.paymentStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={bookingVariant(booking.bookingStatus)}>
                            {BOOKING_LABEL[booking.bookingStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(booking)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Tambah / Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Booking" : "Tambah Booking Baru"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tenantId">Tenant *</Label>
              <Select
                value={form.tenantId}
                onValueChange={(v) => setForm(f => ({ ...f, tenantId: v }))}
                disabled={!!editTarget}
              >
                <SelectTrigger id="tenantId">
                  <SelectValue placeholder="Pilih tenant..." />
                </SelectTrigger>
                <SelectContent>
                  {(tenants ?? [])
                    .filter(t => t.id > 0)
                    .map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.businessName}
                        {t.boothNumber ? ` · ${t.boothNumber}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="startDate">Tanggal Mulai *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="endDate">Tanggal Selesai *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="totalAmount">Total Sewa (Rp) *</Label>
                <Input
                  id="totalAmount"
                  type="number"
                  min={0}
                  value={form.totalAmount}
                  onChange={(e) => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                  placeholder="cth. 2000000"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dueDate">Jatuh Tempo</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodLabel">Label Periode</Label>
              <Input
                id="periodLabel"
                value={form.periodLabel}
                onChange={(e) => setForm(f => ({ ...f, periodLabel: e.target.value }))}
                placeholder="cth. Juni - Agustus 2026"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bookingStatus">Status Booking</Label>
                <Select
                  value={form.bookingStatus}
                  onValueChange={(v) => setForm(f => ({ ...f, bookingStatus: v as BookingStatus }))}
                >
                  <SelectTrigger id="bookingStatus"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktif">Aktif</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="selesai">Selesai</SelectItem>
                    <SelectItem value="batal">Batal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paymentStatus">Status Pembayaran</Label>
                <Select
                  value={form.paymentStatus}
                  onValueChange={(v) => setForm(f => ({ ...f, paymentStatus: v as PaymentStatus }))}
                >
                  <SelectTrigger id="paymentStatus"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNPAID">Belum Bayar</SelectItem>
                    <SelectItem value="PARTIAL">Sebagian</SelectItem>
                    <SelectItem value="PAID">Lunas</SelectItem>
                    <SelectItem value="OVERDUE">Jatuh Tempo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isSaving || !form.tenantId}>
                {isSaving ? "Menyimpan..." : editTarget ? "Simpan Perubahan" : "Tambah Booking"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
