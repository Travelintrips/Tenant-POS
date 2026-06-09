import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Receipt, X, CheckCircle2, AlertCircle, CircleDashed,
  Clock, Phone, Mail, Calendar, CreditCard, Printer, Banknote,
  Smartphone, WalletCards, TrendingUp, Users, AlertTriangle, Zap,
  MoreHorizontal, History, Filter, Search, RotateCcw, ChevronDown,
  MoreHorizontal, History, Filter, Search, ChevronRight, MapPin,
  Wrench, Package, RefreshCw, Info, FileText, Layers,
  LogIn, LogOut, FileText, Ban, RefreshCw, ShieldAlert, DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { cetakStrukPDF, buatNoStruk, formatTanggal, formatJam } from "@/lib/cetak-struk";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentStatus = "PAID" | "UNPAID" | "PARTIAL" | "OVERDUE";
type MetodeBayar = "tunai" | "transfer" | "qris" | "edc" | "other";

type FloorPlanItem = {
  id: string;
  tenantId: number;
  bookingId: number | null;
  businessName: string;
  ownerName: string;
  email: string | null;
  phone: string | null;
  category: string | null;
  boothNumber: string;
  areaName: string;
  startDate: string | null;
  endDate: string | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  bookingStatus: string;
  dueDate: string | null;
  periodLabel: string | null;
  openInvoiceCount: number;
};

type Overview = {
  totalActiveTenants: number;
  unpaidCount: number;
  overdueCount: number;
  paidTodayAmount: number;
  currentShift: { id: number; cashierName: string; openedAt: string } | null;
};

type PaymentResponse = {
  success: boolean;
  payment: { id: number; amount: number; paymentMethod: MetodeBayar; paidAt: string };
  receiptNumber: string;
  paymentStatus: string;
  paidAmount: number;
  remainingAmount: number;
  change: number;
};

type PaymentHistoryItem = {
  id: number;
  receiptNumber: string | null;
  amountPaid: number;
  discountAmount: number;
  penaltyAmount: number;
  paymentMethod: MetodeBayar;
  paymentStatus: string;
  paymentDate: string;
  notes: string | null;
  createdAt: string;
  isVoided: boolean;
  voidReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  referenceNumber: string | null;
  invoiceId: number | null;
  shiftId: number | null;
  refundAmount: number;
  refundReason: string | null;
  refundStatus: string | null;
};

type ReceiptData = {
  receiptNumber: string;
  paymentDate: string;
  businessName: string;
  ownerName: string;
  boothNumber: string;
  billingPeriod: string;
  totalAmount: number;
  discountAmount: number;
  penaltyAmount: number;
  amountPaid: number;
  remainingAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  referenceNumber: string | null;
  invoiceNumber: string | null;
  cashierName: string;
  isVoided: boolean;
  notes: string | null;
};

type TenantInvoice = {
  id: number;
  invoiceNumber: string;
  tenantId: number;
  bookingId: number | null;
  unitCode: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: "draft" | "unpaid" | "partial" | "paid" | "overdue" | "cancelled";
  notes: string | null;
};

type CashierShift = {
  id: number;
  cashierName: string;
  cashierId: number | null;
  openedAt: string;
  closedAt: string | null;
  expectedCash: number;
  actualCash: number | null;
  cashDifference: number | null;
  notes: string | null;
  status: "open" | "closed";
  transactionCount: number;
  transactionTotal: number;
};

type DailyReport = {
  date: string;
  totalAmount: number;
  totalCount: number;
  voidedCount: number;
  byMethod: Record<string, number>;
  payments: Array<{ id: number; amount: number; paymentMethod: string; receiptNumber: string | null; paidAt: string; isVoided: boolean; businessName: string; boothNumber: string }>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const METODE_LABEL: Record<MetodeBayar, string> = {
  tunai: "Cash",
  transfer: "Transfer",
  qris: "QRIS",
  edc: "EDC",
  other: "Lainnya",
};

const METODE_OPTIONS: Array<{ value: MetodeBayar; label: string; icon: React.ReactNode }> = [
  { value: "tunai",    label: "Cash",     icon: <Banknote className="w-4 h-4" /> },
  { value: "transfer", label: "Transfer", icon: <WalletCards className="w-4 h-4" /> },
  { value: "qris",     label: "QRIS",     icon: <Smartphone className="w-4 h-4" /> },
  { value: "edc",      label: "EDC",      icon: <Zap className="w-4 h-4" /> },
  { value: "other",    label: "Lainnya",  icon: <MoreHorizontal className="w-4 h-4" /> },
];

const statusConfig: Record<
  PaymentStatus | "VACANT",
  { label: string; box: string; badge: string; icon: React.ReactNode }
> = {
  PAID: { label: "Lunas", box: "bg-emerald-50 border-emerald-400 hover:bg-emerald-100", badge: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: <CheckCircle2 className="w-3 h-3" /> },
  UNPAID: { label: "Belum Bayar", box: "bg-amber-50 border-amber-400 hover:bg-amber-100", badge: "bg-amber-100 text-amber-700 border-amber-300", icon: <Clock className="w-3 h-3" /> },
  PARTIAL: { label: "Bayar Sebagian", box: "bg-blue-50 border-blue-400 hover:bg-blue-100", badge: "bg-blue-100 text-blue-700 border-blue-300", icon: <AlertCircle className="w-3 h-3" /> },
  OVERDUE: { label: "Jatuh Tempo", box: "bg-red-50 border-red-400 hover:bg-red-100", badge: "bg-red-100 text-red-700 border-red-300", icon: <AlertTriangle className="w-3 h-3" /> },
  VACANT: { label: "Kosong", box: "bg-slate-100 border-slate-300 hover:bg-slate-200", badge: "bg-slate-100 text-slate-500 border-slate-300", icon: <CircleDashed className="w-3 h-3" /> },
};

const invoiceStatusConfig: Record<string, { label: string; badge: string }> = {
  unpaid: { label: "Belum Bayar", badge: "bg-amber-100 text-amber-700 border-amber-300" },
  partial: { label: "Sebagian", badge: "bg-blue-100 text-blue-700 border-blue-300" },
  overdue: { label: "Jatuh Tempo", badge: "bg-red-100 text-red-700 border-red-300" },
  paid: { label: "Lunas", badge: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  draft: { label: "Draft", badge: "bg-slate-100 text-slate-500 border-slate-300" },
  cancelled: { label: "Dibatalkan", badge: "bg-slate-100 text-slate-500 border-slate-300" },
};

const bookingStatusLabel: Record<string, string> = { aktif: "Aktif", selesai: "Selesai", pending: "Pending", batal: "Batal" };
const bookingStatusBadge: Record<string, string> = {
  aktif: "bg-emerald-100 text-emerald-700 border-emerald-300",
  selesai: "bg-slate-100 text-slate-600 border-slate-300",
  pending: "bg-amber-100 text-amber-700 border-amber-300",
  batal: "bg-red-100 text-red-600 border-red-300",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}
function todayString() { return new Date().toISOString().slice(0, 10); }
function formatTanggalID(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
function resolveStatus(item: FloorPlanItem): PaymentStatus | "VACANT" {
  if (!item.bookingId) return "VACANT";
  return item.paymentStatus;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── API Hooks ────────────────────────────────────────────────────────────────

function useOverview() {
  return useQuery<Overview>({
    queryKey: ["tenant-pos-overview"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tenant-pos/overview`, { credentials: "include" });
      if (!r.ok) throw new Error(`Overview error ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
  });
}

function useFloorPlan() {
  return useQuery<FloorPlanItem[]>({
    queryKey: ["tenant-pos-floor-plan"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tenant-pos/floor-plan`, { credentials: "include" });
      if (!r.ok) throw new Error(`Floor plan error ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
  });
}

function usePaymentHistory(bookingId: number | null) {
  return useQuery<PaymentHistoryItem[]>({
    queryKey: ["payment-history", bookingId],
    queryFn: () =>
      fetch(`${BASE}/api/tenant-pos/bookings/${bookingId}/payments`, { credentials: "include" }).then((r) => r.json()),
    enabled: bookingId !== null,
  });
}

function useTenantInvoices(tenantId: number | null) {
  return useQuery<TenantInvoice[]>({
    queryKey: ["tenant-invoices-pos", tenantId],
    queryFn: () =>
      fetch(`${BASE}/api/tenant-pos/tenants/${tenantId}/invoices`, { credentials: "include" }).then((r) => r.json()),
    enabled: tenantId !== null,
  });
}

function useCurrentShift() {
  return useQuery<CashierShift | null>({
    queryKey: ["pos-current-shift"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tenant-pos/shifts/current`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal mengambil data shift");
      return r.json();
    },
    refetchInterval: 30_000,
  });
}

function useDailyReport(date: string) {
  return useQuery<DailyReport>({
    queryKey: ["pos-daily-report", date],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tenant-pos/daily-report?date=${date}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal mengambil laporan");
      return r.json();
    },
  });
}

function useReceiptData(paymentId: number | null) {
  return useQuery<ReceiptData>({
    queryKey: ["receipt", paymentId],
    queryFn: () =>
      fetch(`${BASE}/api/tenant-pos/payments/${paymentId}/receipt`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Gagal mengambil data receipt");
        return r.json();
      }),
    enabled: paymentId !== null,
  });
}

// ─── Shift Panel ──────────────────────────────────────────────────────────────

function ShiftPanel({ shift, onOpenShift, onCloseShift }: {
  shift: CashierShift | null | undefined;
  onOpenShift: () => void;
  onCloseShift: () => void;
}) {
  if (shift === undefined) return null;

  if (!shift) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-sm text-amber-700 font-medium">Tidak ada shift aktif</span>
          <span className="text-xs text-amber-600">· Buka shift untuk mulai mencatat transaksi</span>
        </div>
        <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-100 text-xs" onClick={onOpenShift}>
          <LogIn className="w-3.5 h-3.5 mr-1.5" />
          Buka Shift
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
          <span className="text-sm font-semibold text-emerald-800">Shift Aktif</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <span className="text-sm text-emerald-700">Kasir: <strong>{shift.cashierName}</strong></span>
        <span className="text-xs text-emerald-600">
          · Dibuka: {new Date(shift.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="text-xs text-emerald-600">
          · {shift.transactionCount} transaksi · {formatRupiah(shift.transactionTotal)}
        </span>
      </div>
      <Button size="sm" variant="outline" className="border-emerald-400 text-emerald-700 hover:bg-emerald-100 text-xs" onClick={onCloseShift}>
        <LogOut className="w-3.5 h-3.5 mr-1.5" />
        Tutup Shift
      </Button>
    </div>
  );
}

// ─── Shift Open Dialog ────────────────────────────────────────────────────────

function ShiftOpenDialog({ open, onClose, defaultName }: { open: boolean; onClose: () => void; defaultName?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cashierName, setCashierName] = useState(defaultName ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/tenant-pos/shifts/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cashierName }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gagal membuka shift");
      return d;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pos-current-shift"] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-pos-overview"] });
      toast({ title: "Shift Dibuka", description: `Shift kasir ${cashierName} berhasil dibuka.` });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Gagal Buka Shift", description: e.message, variant: "destructive" });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Buka Shift Kasir</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              <p className="text-sm text-muted-foreground">Masukkan nama kasir untuk memulai shift.</p>
              <div className="flex flex-col gap-1.5">
                <Label>Nama Kasir</Label>
                <Input
                  placeholder="Nama kasir..."
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                  disabled={mutation.isPending}
                  autoFocus
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || cashierName.trim().length < 2}
          >
            {mutation.isPending ? "Membuka..." : "Buka Shift"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Shift Close Dialog ───────────────────────────────────────────────────────

function ShiftCloseDialog({ open, onClose, shift }: { open: boolean; onClose: () => void; shift: CashierShift | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [actualCash, setActualCash] = useState(String(shift?.expectedCash ?? "0"));
  const [showResult, setShowResult] = useState<{ transactionCount: number; transactionTotal: number; expectedCash: number; actualCash: number; cashDifference: number } | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!shift) throw new Error("Tidak ada shift aktif");
      const r = await fetch(`${BASE}/api/tenant-pos/shifts/${shift.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actualCash: parseInt(actualCash.replace(/\D/g, "")) || 0 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gagal menutup shift");
      return d;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["pos-current-shift"] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-pos-overview"] });
      setShowResult(data.summary);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal Tutup Shift", description: e.message, variant: "destructive" });
    },
  });

  if (showResult) {
    const diff = showResult.cashDifference;
    return (
      <AlertDialog open={open} onOpenChange={(v) => { if (!v) { setShowResult(null); onClose(); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Shift Ditutup
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm pt-1">
                <div className="rounded-lg border bg-slate-50 p-3 space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Transaksi</span><span className="font-semibold">{showResult.transactionCount} transaksi</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Pendapatan</span><span className="font-semibold text-emerald-700">{formatRupiah(showResult.transactionTotal)}</span></div>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Kas Tercatat</span><span className="font-semibold">{formatRupiah(showResult.expectedCash)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Kas Aktual</span><span className="font-semibold">{formatRupiah(showResult.actualCash)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Selisih Kas</span>
                    <span className={cn("font-bold", diff === 0 ? "text-emerald-700" : diff > 0 ? "text-blue-600" : "text-red-600")}>
                      {diff >= 0 ? "+" : ""}{formatRupiah(diff)}
                    </span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => { setShowResult(null); onClose(); }}>Selesai</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tutup Shift</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              {shift && (
                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Kasir</span><span className="font-medium">{shift.cashierName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Transaksi</span><span className="font-medium">{shift.transactionCount} transaksi</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Kas Tercatat (Cash)</span><span className="font-semibold text-emerald-700">{formatRupiah(shift.expectedCash)}</span></div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Kas Aktual di Laci (Rp)</Label>
                <Input
                  inputMode="numeric"
                  placeholder="Jumlah uang tunai di laci..."
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  disabled={mutation.isPending}
                  autoFocus
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Menutup..." : "Tutup Shift"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Void Payment Dialog ──────────────────────────────────────────────────────

function VoidPaymentDialog({ payment, onClose }: {
  payment: PaymentHistoryItem | null;
  onClose: (voided: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!payment) throw new Error("Tidak ada data");
      const r = await fetch(`${BASE}/api/tenant-pos/payments/${payment.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ voidReason: reason }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gagal void");
      return d;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payment-history"] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-pos-floor-plan"] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-pos-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-invoices-pos"] });
      toast({ title: "Void Berhasil", description: `Pembayaran ${payment?.receiptNumber ?? ""} berhasil di-void.` });
      onClose(true);
    },
    onError: (e: Error) => {
      toast({ title: "Void Gagal", description: e.message, variant: "destructive" });
    },
  });

  return (
    <AlertDialog open={payment !== null} onOpenChange={(v) => { if (!v && !mutation.isPending) onClose(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-700">
            <Ban className="w-5 h-5" />
            Void Pembayaran
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              {payment && (
                <div className="rounded-lg border bg-red-50 px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">No. Kwitansi</span><span className="font-mono font-medium">{payment.receiptNumber ?? `#${payment.id}`}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Nominal</span><span className="font-semibold text-red-700">{formatRupiah(payment.amountPaid)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tanggal</span><span className="font-medium">{formatTanggalID(payment.paymentDate?.slice(0, 10))}</span></div>
                </div>
              )}
              <p className="text-xs text-red-600 font-medium">⚠ Void akan membatalkan efek pembayaran ini pada booking/invoice. Tindakan tidak bisa dibatalkan.</p>
              <div className="flex flex-col gap-1.5">
                <Label>Alasan Void <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Masukkan alasan void..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={mutation.isPending}
                  autoFocus
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending} onClick={() => onClose(false)}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || reason.trim().length < 3}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {mutation.isPending ? "Memproses..." : "Ya, Void Sekarang"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Refund Payment Dialog ────────────────────────────────────────────────────

function RefundPaymentDialog({ payment, onClose }: {
  payment: PaymentHistoryItem | null;
  onClose: (refunded: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refundAmount, setRefundAmount] = useState("");
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!payment) throw new Error("Tidak ada data");
      const r = await fetch(`${BASE}/api/tenant-pos/payments/${payment.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ refundAmount: parseInt(refundAmount.replace(/\D/g, "")) || 0, refundReason: reason }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gagal refund");
      return d;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payment-history"] });
      toast({ title: "Refund Dicatat", description: "Data refund berhasil disimpan." });
      onClose(true);
    },
    onError: (e: Error) => {
      toast({ title: "Refund Gagal", description: e.message, variant: "destructive" });
    },
  });

  const refundNum = parseInt(refundAmount.replace(/\D/g, "")) || 0;
  const isValid = refundNum > 0 && refundNum <= (payment?.amountPaid ?? 0) && reason.trim().length >= 3;

  return (
    <AlertDialog open={payment !== null} onOpenChange={(v) => { if (!v && !mutation.isPending) onClose(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-600" />
            Catat Refund
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              {payment && (
                <div className="rounded-lg border bg-blue-50 px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">No. Kwitansi</span><span className="font-mono font-medium">{payment.receiptNumber ?? `#${payment.id}`}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Nominal Bayar</span><span className="font-semibold">{formatRupiah(payment.amountPaid)}</span></div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Jumlah Refund (Rp) <span className="text-red-500">*</span></Label>
                <Input
                  inputMode="numeric"
                  placeholder="Nominal yang di-refund..."
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  disabled={mutation.isPending}
                  autoFocus
                />
                {refundNum > 0 && payment && refundNum > payment.amountPaid && (
                  <p className="text-xs text-red-500">Refund tidak boleh melebihi nominal bayar</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Alasan Refund <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Masukkan alasan refund..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending} onClick={() => onClose(false)}>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={() => mutation.mutate()} disabled={mutation.isPending || !isValid} className="bg-blue-600 hover:bg-blue-700 text-white">
            {mutation.isPending ? "Menyimpan..." : "Simpan Refund"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Modal Receipt ────────────────────────────────────────────────────────────

function ModalReceipt({ paymentId, onClose }: { paymentId: number; onClose: () => void }) {
  const { data, isLoading, isError } = useReceiptData(paymentId);

  const metodeLabel: Record<string, string> = {
    tunai: "Cash / Tunai", transfer: "Transfer Bank", qris: "QRIS", edc: "EDC / Kartu Debit", other: "Lainnya",
  };
  const statusLabel: Record<string, { text: string; color: string }> = {
    PAID: { text: "LUNAS", color: "text-emerald-700" },
    PARTIAL: { text: "BAYAR SEBAGIAN", color: "text-blue-700" },
    UNPAID: { text: "BELUM BAYAR", color: "text-amber-700" },
    OVERDUE: { text: "JATUH TEMPO", color: "text-red-700" },
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #receipt-printable, #receipt-printable * { visibility: visible !important; }
          #receipt-printable { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; padding: 32px !important; box-sizing: border-box !important; background: white !important; }
          .no-print { display: none !important; }
        }
      `}} />
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm no-print">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-slate-50 shrink-0 no-print">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-sm text-slate-700">Kwitansi Pembayaran</span>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="p-8 space-y-3">
                <Skeleton className="h-6 w-48 mx-auto" />
                <Skeleton className="h-4 w-64 mx-auto" />
                <Skeleton className="h-px w-full" />
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
              </div>
            )}
            {isError && (
              <div className="p-8 text-center text-red-600">
                <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-60" />
                <p className="font-medium text-sm">Gagal memuat data kwitansi</p>
              </div>
            )}
            {data && (
              <div id="receipt-printable" className="p-6 font-sans text-slate-800">
                {data.isVoided && (
                  <div className="mb-3 bg-red-50 border border-red-300 rounded-lg px-3 py-2 text-center text-red-700 font-bold text-sm">
                    ⚠ PEMBAYARAN INI TELAH DI-VOID
                  </div>
                )}
                <div className="text-center mb-5">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-2">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <h1 className="text-base font-bold uppercase tracking-widest text-slate-800">Mall Admin Portal</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Sistem Manajemen Tenant Mal</p>
                  <div className="my-3 border-t border-dashed border-slate-300" />
                  <h2 className="text-lg font-extrabold uppercase tracking-wider text-slate-900">Kwitansi Pembayaran Tenant</h2>
                </div>

                <div className="bg-slate-50 rounded-lg px-4 py-3 mb-4 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">No. Kwitansi</span>
                    <span className="font-mono font-bold text-primary">{data.receiptNumber}</span>
                  </div>
                  {data.invoiceNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">No. Invoice</span>
                      <span className="font-mono font-semibold text-slate-700">{data.invoiceNumber}</span>
                    </div>
                  )}
                  {data.referenceNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">No. Referensi</span>
                      <span className="font-mono font-semibold text-slate-700">{data.referenceNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Tanggal Bayar</span>
                    <span className="font-semibold">{new Date(data.paymentDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Kasir</span>
                    <span className="font-semibold">{data.cashierName}</span>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Data Tenant</p>
                  <div className="divide-y divide-slate-100 text-xs">
                    {[["Nama Bisnis", data.businessName], ["Nama Pemilik", data.ownerName], ["Booth / Lapak", data.boothNumber], ["Periode Sewa", data.billingPeriod]].map(([label, value]) => (
                      <div key={label} className="flex justify-between py-1.5">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-semibold text-right max-w-[60%]">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Rincian Pembayaran</p>
                  <div className="divide-y divide-slate-100 text-xs">
                    <div className="flex justify-between py-1.5"><span className="text-slate-500">Total Tagihan</span><span className="font-semibold">{formatRupiah(data.totalAmount)}</span></div>
                    {data.discountAmount > 0 && <div className="flex justify-between py-1.5"><span className="text-slate-500">Diskon</span><span className="font-semibold text-emerald-600">− {formatRupiah(data.discountAmount)}</span></div>}
                    {data.penaltyAmount > 0 && <div className="flex justify-between py-1.5"><span className="text-slate-500">Denda</span><span className="font-semibold text-red-600">+ {formatRupiah(data.penaltyAmount)}</span></div>}
                    <div className="flex justify-between py-1.5"><span className="text-slate-500">Metode Bayar</span><span className="font-semibold">{metodeLabel[data.paymentMethod] ?? data.paymentMethod}</span></div>
                  </div>
                </div>

                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-600">Nominal Dibayar</span>
                    <span className="text-xl font-extrabold text-primary">{formatRupiah(data.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Sisa Pembayaran</span>
                    <span className={cn("text-sm font-bold", data.remainingAmount === 0 ? "text-emerald-600" : "text-amber-600")}>{formatRupiah(data.remainingAmount)}</span>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-primary/20 flex justify-between items-center">
                    <span className="text-xs text-slate-500">Status Pembayaran</span>
                    <span className={cn("text-xs font-bold uppercase", statusLabel[data.paymentStatus]?.color ?? "text-slate-700")}>
                      {statusLabel[data.paymentStatus]?.text ?? data.paymentStatus}
                    </span>
                  </div>
                </div>

                {data.notes && (
                  <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                    <span className="font-semibold">Catatan: </span>{data.notes}
                  </div>
                )}

                <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[10px] text-slate-400">
                  <p>Kwitansi ini diterbitkan oleh sistem Mall Admin Portal</p>
                  <p className="mt-0.5">Dicetak pada: {new Date().toLocaleString("id-ID")}</p>
                </div>
              </div>
            )}
          </div>

          {data && (
            <div className="flex gap-2 px-5 py-3.5 border-t bg-white shrink-0 no-print">
              <Button variant="outline" className="flex-1" onClick={onClose}><X className="w-4 h-4 mr-1.5" />Tutup</Button>
              <Button className="flex-1 bg-primary" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1.5" />Print</Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ overview, loading, error }: { overview?: Overview; loading: boolean; error?: boolean }) {
  const cards = [
    { label: "Total Tenant Aktif", value: loading ? null : String(overview?.totalActiveTenants ?? 0), sub: "tenant terdaftar", icon: <Users className="w-5 h-5 text-blue-500" />, color: "border-blue-200 bg-blue-50/40", valueColor: "text-blue-700" },
    { label: "Tagihan Belum Lunas", value: loading ? null : String(overview?.unpaidCount ?? 0), sub: "tagihan pending", icon: <Clock className="w-5 h-5 text-amber-500" />, color: "border-amber-200 bg-amber-50/40", valueColor: "text-amber-700" },
    { label: "Pembayaran Hari Ini", value: loading ? null : formatRupiah(overview?.paidTodayAmount ?? 0), sub: "total terkumpul", icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, color: "border-emerald-200 bg-emerald-50/40", valueColor: "text-emerald-700" },
    { label: "Overdue", value: loading ? null : String(overview?.overdueCount ?? 0), sub: "tagihan jatuh tempo", icon: <AlertTriangle className="w-5 h-5 text-red-500" />, color: "border-red-200 bg-red-50/40", valueColor: "text-red-700" },
  ];

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="w-4 h-4 shrink-0" />Gagal memuat ringkasan.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className={cn("border", c.color)}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.label}</p>
              {c.icon}
            </div>
            {loading ? <Skeleton className="h-7 w-24 mb-1" /> : <p className={cn("text-2xl font-bold tracking-tight", c.valueColor)}>{c.value}</p>}
            <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Booth Card ───────────────────────────────────────────────────────────────

function BoothCard({ item, selected, onClick }: { item: FloorPlanItem; selected: boolean; onClick: () => void }) {
  const status = resolveStatus(item);
  const cfg = statusConfig[status];
  return (
    <button
      onClick={onClick}
      className={cn("relative rounded-xl border-2 p-3 text-left transition-all duration-150 cursor-pointer select-none w-full", cfg.box, selected && "ring-2 ring-offset-2 ring-primary scale-[1.02] shadow-md z-10")}
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide leading-none">{item.boothNumber}</span>
        <span className={cn("inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0", cfg.badge)}>
          {cfg.icon}{cfg.label}
        </span>
      </div>
      <p className="text-sm font-semibold leading-tight text-slate-800 truncate">
        {status === "VACANT" ? <span className="text-slate-400 italic text-xs">Kosong</span> : item.businessName}
      </p>
      {status !== "VACANT" && item.bookingId && (
        <div className="mt-1.5 space-y-0.5">
          {item.periodLabel && <p className="text-[11px] text-slate-500 truncate">{item.periodLabel}</p>}
          <p className={cn("text-xs font-semibold", status === "PAID" ? "text-emerald-600" : status === "OVERDUE" ? "text-red-600" : status === "PARTIAL" ? "text-blue-600" : "text-amber-600")}>
            {status === "PAID" ? "✓ Lunas" : `Sisa ${formatRupiah(item.remainingAmount)}`}
          </p>
          {item.openInvoiceCount > 0 && (
            <p className="text-[10px] text-blue-600 font-medium">{item.openInvoiceCount} invoice terbuka</p>
          )}
        </div>
      )}
    </button>
  );
}

// ─── Floor Plan ───────────────────────────────────────────────────────────────

function TenantFloorPlan({ items: rawItems, selected, onSelect, isFiltered }: {
  items: FloorPlanItem[]; selected: FloorPlanItem | null; onSelect: (item: FloorPlanItem) => void; isFiltered?: boolean;
}) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-10 text-muted-foreground">
        {isFiltered ? (<><Search className="w-12 h-12 mb-4 opacity-25" /><p className="text-base font-medium">Tidak ada tenant yang cocok</p></>) : (<><Building2 className="w-12 h-12 mb-4 opacity-25" /><p className="text-base font-medium">Belum ada data tenant</p></>)}
      </div>
    );
  }
  const grouped = items.reduce<Record<string, FloorPlanItem[]>>((acc, item) => {
    if (!acc[item.areaName]) acc[item.areaName] = [];
    acc[item.areaName].push(item);
    return acc;
  }, {});
  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {Object.entries(grouped).map(([area, areaItems]) => (
        <div key={area}>
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{area}</h3>
            <span className="text-xs text-muted-foreground">({areaItems.length} unit)</span>
            <div className="flex-1 h-px bg-slate-200 ml-1" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {areaItems.map((item) => (
              <BoothCard key={item.id} item={item} selected={selected?.id === item.id} onClick={() => onSelect(item)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FloorPlanSkeleton() {
  return (
    <div className="h-full p-4 space-y-6">
      {[1, 2].map((g) => (
        <div key={g}>
          <Skeleton className="h-4 w-36 mb-3" />
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Filter / Legend ──────────────────────────────────────────────────────────

function StatusLegend() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {([["PAID", "Lunas", "bg-emerald-400"], ["UNPAID", "Belum Bayar", "bg-amber-400"], ["PARTIAL", "Sebagian", "bg-blue-400"], ["OVERDUE", "Jatuh Tempo", "bg-red-400"], ["VACANT", "Kosong", "bg-slate-300"]] as const).map(([s, label, color]) => (
        <span key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("w-2.5 h-2.5 rounded-sm inline-block border", color)} />{label}
        </span>
      ))}
    </div>
  );
}

type FilterState = { search: string; status: string; area: string };

const STATUS_FILTER_OPTS = [
  { value: "", label: "Semua", active: "bg-slate-800 text-white border-slate-800", inactive: "bg-white text-slate-600 border-slate-200 hover:border-slate-400" },
  { value: "PAID", label: "Lunas", active: "bg-emerald-600 text-white border-emerald-600", inactive: "bg-white text-emerald-700 border-emerald-200 hover:border-emerald-400" },
  { value: "UNPAID", label: "Belum Bayar", active: "bg-amber-500 text-white border-amber-500", inactive: "bg-white text-amber-700 border-amber-200 hover:border-amber-400" },
  { value: "PARTIAL", label: "Sebagian", active: "bg-blue-600 text-white border-blue-600", inactive: "bg-white text-blue-700 border-blue-200 hover:border-blue-400" },
  { value: "OVERDUE", label: "Jatuh Tempo", active: "bg-red-600 text-white border-red-600", inactive: "bg-white text-red-700 border-red-200 hover:border-red-400" },
];

function FilterBar({ filters, onChange, availableAreas, totalCount, filteredCount }: {
  filters: FilterState; onChange: (f: Partial<FilterState>) => void; availableAreas: string[]; totalCount: number; filteredCount: number;
}) {
  const hasFilter = !!(filters.search || filters.status || filters.area);
  return (
    <div className="flex flex-col gap-2 px-3 pt-2.5 pb-2 border-b bg-slate-50/60">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input value={filters.search} onChange={(e) => onChange({ search: e.target.value })} placeholder="Cari nama bisnis, owner, nomor booth..." className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-slate-400" />
          {filters.search && <button onClick={() => onChange({ search: "" })} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
        </div>
        {availableAreas.length > 1 && (
          <div className="relative">
            <select value={filters.area} onChange={(e) => onChange({ area: e.target.value })} className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer">
              <option value="">Semua Area</option>
              {availableAreas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        )}
        {hasFilter && <button onClick={() => onChange({ search: "", status: "", area: "" })} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 transition-colors whitespace-nowrap"><RotateCcw className="w-3 h-3" />Reset</button>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_FILTER_OPTS.map((opt) => (
            <button key={opt.value} onClick={() => onChange({ status: opt.value })} className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all", filters.status === opt.value ? opt.active : opt.inactive)}>
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {hasFilter ? <span><span className="font-semibold text-primary">{filteredCount}</span> dari {totalCount}</span> : <span>{totalCount} tenant</span>}
        </span>
      </div>
    </div>
  );
}

// ─── Detail Row helper ────────────────────────────────────────────────────────

function DetailRow({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 leading-5">{label}</span>
      <span className={cn("text-xs font-medium text-right leading-5 break-all", valueClass)}>{value}</span>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ item, onClose, onProses, onBayarInvoice, currentShiftId }: {
  item: FloorPlanItem | null;
  onClose: () => void;
  onProses: (item: FloorPlanItem) => void;
  onBayarInvoice: (item: FloorPlanItem, invoice: TenantInvoice) => void;
  currentShiftId: number | null;
}) {
  const { user } = useAuth();
  const canVoidRefund = !!user && ["owner", "admin", "finance"].includes((user as any).role ?? "");
  const paymentHistory = usePaymentHistory(item?.bookingId ?? null);
  const tenantInvoices = useTenantInvoices(item?.tenantId ?? null);
  const [receiptPaymentId, setReceiptPaymentId] = useState<number | null>(null);
  const [voidTarget, setVoidTarget] = useState<PaymentHistoryItem | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentHistoryItem | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "tagihan" | "riwayat">("info");
  const queryClient = useQueryClient();

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
        <Receipt className="w-12 h-12 mb-4 opacity-25" />
        <p className="text-base font-medium">Pilih tenant pada denah</p>
        <p className="text-sm mt-1">untuk melihat detail pembayaran</p>
      </div>
    );
  }

  const status = resolveStatus(item);
  const cfg = statusConfig[status];
  const isVacant = status === "VACANT";
  const canPay = !isVacant && item.bookingId !== null && status !== "PAID";

  const openInvoices = tenantInvoices.data?.filter(inv => ["unpaid", "partial", "overdue"].includes(inv.status)) ?? [];

  return (
    <div className="flex flex-col h-full">
      {receiptPaymentId !== null && (
        <ModalReceipt paymentId={receiptPaymentId} onClose={() => setReceiptPaymentId(null)} />
      )}
      <VoidPaymentDialog payment={voidTarget} onClose={(voided) => {
        setVoidTarget(null);
        if (voided) {
          void queryClient.invalidateQueries({ queryKey: ["payment-history", item.bookingId] });
          void queryClient.invalidateQueries({ queryKey: ["tenant-invoices-pos", item.tenantId] });
        }
      }} />
      <RefundPaymentDialog payment={refundTarget} onClose={(refunded) => {
        setRefundTarget(null);
        if (refunded) void queryClient.invalidateQueries({ queryKey: ["payment-history", item.bookingId] });
      }} />

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b bg-slate-50/60 shrink-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{item.boothNumber}{item.areaName ? ` · ${item.areaName}` : ""}</p>
            <h3 className="font-bold text-sm leading-tight mt-0.5">{isVacant ? "Unit Kosong" : item.businessName}</h3>
            {!isVacant && <p className="text-xs text-muted-foreground mt-0.5">{item.ownerName}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium", cfg.badge)}>
            {cfg.icon} {cfg.label}
          </span>
          {openInvoices.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium bg-blue-100 text-blue-700 border-blue-300">
              <FileText className="w-3 h-3" />{openInvoices.length} invoice
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      {!isVacant && (
        <div className="flex border-b shrink-0">
          {(["info", "tagihan", "riwayat"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 text-xs font-semibold border-b-2 transition-colors",
                activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-slate-700"
              )}
            >
              {tab === "info" ? "Info" : tab === "tagihan" ? `Tagihan${openInvoices.length > 0 ? ` (${openInvoices.length})` : ""}` : "Riwayat"}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isVacant ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
            <CircleDashed className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Unit Belum Tersewa</p>
            <p className="text-xs mt-1">Unit ini tersedia untuk disewakan</p>
          </div>
        ) : activeTab === "info" ? (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Info Bisnis &amp; Penyewa</p>
              <div className="bg-muted/30 rounded-lg px-3 divide-y divide-border/60">
                <DetailRow label="Nama Bisnis" value={item.businessName} />
                <DetailRow label="Nama Owner" value={item.ownerName} />
                {item.email && <DetailRow label="Email" value={<span className="flex items-center gap-1 justify-end"><Mail className="w-3 h-3 text-muted-foreground shrink-0" />{item.email}</span>} />}
                {item.phone && <DetailRow label="No. WA / Telp" value={<span className="flex items-center gap-1 justify-end"><Phone className="w-3 h-3 text-muted-foreground shrink-0" />{item.phone}</span>} />}
                <DetailRow label="Kategori" value={item.category ?? "—"} />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Info Booth</p>
              <div className="bg-muted/30 rounded-lg px-3 divide-y divide-border/60">
                <DetailRow label="Nomor Booth" value={item.boothNumber} />
                {item.areaName && <DetailRow label="Area / Zona" value={item.areaName} />}
              </div>
            </div>
            {item.bookingId && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Tagihan Booking</p>
                <div className="bg-muted/30 rounded-lg px-3 divide-y divide-border/60">
                  {item.periodLabel && <DetailRow label="Periode" value={item.periodLabel} />}
                  <DetailRow label="Total Tagihan" value={formatRupiah(item.totalAmount)} valueClass="font-semibold" />
                  <DetailRow label="Sudah Dibayar" value={formatRupiah(item.paidAmount)} valueClass="text-emerald-700" />
                  <div className="py-2 flex justify-between">
                    <span className="text-xs font-semibold">Sisa Pembayaran</span>
                    <span className={cn("text-sm font-bold", item.remainingAmount === 0 ? "text-emerald-600" : "text-amber-600")}>{formatRupiah(item.remainingAmount)}</span>
                  </div>
                  {item.dueDate && <DetailRow label="Jatuh Tempo" value={<span className={cn("flex items-center gap-1 justify-end", status === "OVERDUE" ? "text-red-600 font-semibold" : "")}><Clock className="w-3 h-3 shrink-0" />{formatTanggalID(item.dueDate)}</span>} />}
                </div>
              </div>
            )}
            {canPay && (
              <Button className={cn("w-full", status === "OVERDUE" && "bg-red-600 hover:bg-red-700 text-white")} size="sm" onClick={() => onProses(item)}>
                <CreditCard className="w-4 h-4 mr-2" />Bayar Sekarang (Booking)
              </Button>
            )}
          </div>
        ) : activeTab === "tagihan" ? (
          <div className="p-4 space-y-3">
            {tenantInvoices.isLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
            ) : !tenantInvoices.data?.length ? (
              <div className="rounded-lg border border-dashed p-5 text-center text-muted-foreground text-xs">
                <FileText className="w-7 h-7 mx-auto mb-2 opacity-30" />
                <p>Belum ada invoice untuk tenant ini.</p>
              </div>
            ) : (
              tenantInvoices.data.map((inv) => {
                const invCfg = invoiceStatusConfig[inv.status] ?? invoiceStatusConfig.draft;
                const isPaid = inv.status === "paid";
                const isPayable = ["unpaid", "partial", "overdue"].includes(inv.status) && item.bookingId !== null;
                return (
                  <div key={inv.id} className={cn("rounded-lg border p-3 space-y-2 text-xs", isPaid ? "bg-emerald-50/50" : inv.status === "overdue" ? "bg-red-50/50" : "bg-white")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-slate-700 truncate text-[11px]">{inv.invoiceNumber}</p>
                        {inv.periodStart && <p className="text-muted-foreground mt-0.5">{formatTanggalID(inv.periodStart)} — {formatTanggalID(inv.periodEnd)}</p>}
                      </div>
                      <span className={cn("inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0", invCfg.badge)}>{invCfg.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <div><p className="text-muted-foreground">Total</p><p className="font-semibold">{formatRupiah(inv.totalAmount)}</p></div>
                      <div><p className="text-muted-foreground">Sisa</p><p className={cn("font-bold", inv.outstandingAmount === 0 ? "text-emerald-700" : "text-amber-600")}>{formatRupiah(inv.outstandingAmount)}</p></div>
                    </div>
                    {inv.dueDate && <p className={cn("text-muted-foreground", inv.status === "overdue" ? "text-red-600 font-semibold" : "")}>Jatuh tempo: {formatTanggalID(inv.dueDate)}</p>}
                    {isPayable && (
                      <Button size="sm" className="w-full h-7 text-xs" onClick={() => onBayarInvoice(item, inv)}>
                        <CreditCard className="w-3 h-3 mr-1.5" />
                        Bayar Invoice · {formatRupiah(inv.outstandingAmount)}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Riwayat Tab */
          <div className="p-4 space-y-2">
            {paymentHistory.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
            ) : Array.isArray(paymentHistory.data) && paymentHistory.data.length > 0 ? (
              paymentHistory.data.map((p) => {
                const isVoided = p.isVoided;
                const hasRefund = p.refundStatus === "processed";
                return (
                  <div key={p.id} className={cn("rounded-lg border px-3 py-2.5 text-xs space-y-1.5", isVoided ? "bg-red-50/50 border-red-200 opacity-70" : "bg-muted/20")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground truncate">{p.receiptNumber ?? `#${p.id}`}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {isVoided && <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-bold bg-red-100 text-red-700 border-red-300"><Ban className="w-2.5 h-2.5" />VOID</span>}
                        {hasRefund && <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-blue-100 text-blue-700 border-blue-300"><RefreshCw className="w-2.5 h-2.5" />Refund</span>}
                        {!isVoided && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-emerald-100 text-emerald-700 border-emerald-300"><CheckCircle2 className="w-2.5 h-2.5" />Lunas</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      <div><p className="text-muted-foreground">Tanggal</p><p className="font-medium">{new Date(p.paymentDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</p></div>
                      <div><p className="text-muted-foreground">Metode</p><p className="font-medium">{METODE_LABEL[p.paymentMethod] ?? p.paymentMethod}</p></div>
                      <div className="col-span-2"><p className="text-muted-foreground">Nominal</p><p className={cn("font-bold", isVoided ? "text-red-700 line-through" : "text-emerald-700")}>{formatRupiah(p.amountPaid)}</p></div>
                    </div>
                    {p.referenceNumber && <p className="text-muted-foreground">Ref: <span className="font-medium font-mono">{p.referenceNumber}</span></p>}
                    {isVoided && p.voidReason && <p className="text-red-600 italic">Alasan: {p.voidReason}</p>}
                    {hasRefund && <p className="text-blue-600">Refund: {formatRupiah(p.refundAmount)} · {p.refundReason}</p>}
                    <div className="flex gap-1.5 pt-0.5">
                      {!isVoided && (
                        <Button variant="outline" size="sm" className="flex-1 h-6 text-[10px]" onClick={() => setReceiptPaymentId(p.id)}>
                          <Printer className="w-2.5 h-2.5 mr-1" />Receipt
                        </Button>
                      )}
                      {!isVoided && canVoidRefund && (
                        <Button variant="outline" size="sm" className="h-6 text-[10px] text-red-600 border-red-200 hover:bg-red-50 px-2" onClick={() => setVoidTarget(p)}>
                          <Ban className="w-2.5 h-2.5 mr-1" />Void
                        </Button>
                      )}
                      {!isVoided && !hasRefund && canVoidRefund && (
                        <Button variant="outline" size="sm" className="h-6 text-[10px] text-blue-600 border-blue-200 hover:bg-blue-50 px-2" onClick={() => setRefundTarget(p)}>
                          <RefreshCw className="w-2.5 h-2.5 mr-1" />Refund
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-xs">
                <Receipt className="w-6 h-6 mx-auto mb-1.5 opacity-30" />Belum ada riwayat pembayaran.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal Pembayaran ─────────────────────────────────────────────────────────

function ModalPembayaran({ item, invoice, shiftId, onClose, onSuccess }: {
  item: FloorPlanItem;
  invoice?: TenantInvoice | null;
  shiftId?: number | null;
  onClose: () => void;
  onSuccess: (updatedItem: { paidAmount: number; remainingAmount: number; paymentStatus: string }) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const defaultAmount = invoice ? String(invoice.outstandingAmount) : String(item.remainingAmount > 0 ? item.remainingAmount : "");
  const [nominal, setNominal] = useState(defaultAmount);
  const [diskon, setDiskon] = useState("0");
  const [denda, setDenda] = useState("0");
  const [metode, setMetode] = useState<MetodeBayar>("tunai");
  const [tanggalBayar, setTanggalBayar] = useState(todayString());
  const [referenceNumber, setReferenceNumber] = useState("");
  const [catatan, setCatatan] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<PaymentResponse | null>(null);

  const nominalNum = parseInt(nominal.replace(/\D/g, "")) || 0;
  const diskonNum  = parseInt(diskon.replace(/\D/g, ""))  || 0;
  const dendaNum   = parseInt(denda.replace(/\D/g, ""))   || 0;
  const finalBill  = item.totalAmount - diskonNum + dendaNum;
  const sisaSetelah = Math.max(finalBill - item.paidAmount - nominalNum, 0);
  const kembalian  = Math.max(item.paidAmount + nominalNum - finalBill, 0);
  const isOverdue  = item.paymentStatus === "OVERDUE";
  const metodeLabel = METODE_OPTIONS.find((m) => m.value === metode)?.label ?? metode;
  const errNominal = nominalNum <= 0 ? "Nominal harus lebih dari 0" : "";
  const isValid    = !errNominal && !!metode;

  const needsReference = metode === "transfer" || metode === "qris" || metode === "edc";

  const mutation = useMutation<PaymentResponse, Error>({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/tenant-pos/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bookingId: item.bookingId,
          tenantId: item.tenantId,
          invoiceId: invoice?.id ?? undefined,
          amountPaid: nominalNum,
          discountAmount: diskonNum,
          penaltyAmount: dendaNum,
          paymentMethod: metode,
          paymentDate: tanggalBayar,
          referenceNumber: referenceNumber || undefined,
          shiftId: shiftId ?? undefined,
          notes: catatan || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error((data as { error?: string }).error ?? "Gagal memproses pembayaran");
      return data as PaymentResponse;
    },
    onSuccess: (data) => {
      setResult(data);
      setShowConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["tenant-pos-floor-plan"] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-pos-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["payment-history", item.bookingId] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-invoices-pos", item.tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["pos-current-shift"] });
      toast({ title: "Pembayaran Berhasil", description: `Kuitansi ${data.receiptNumber} · ${formatRupiah(nominalNum)} tersimpan.` });
      onSuccess({ paidAmount: data.paidAmount, remainingAmount: data.remainingAmount, paymentStatus: data.paymentStatus });
    },
    onError: (e) => {
      setShowConfirm(false);
      toast({ title: "Pembayaran Gagal", description: e.message, variant: "destructive" });
    },
  });

  function handleClickBayar(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setShowConfirm(true);
  }

  // ── Sukses screen ──
  if (result) {
    const change = result.change ?? 0;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Pembayaran Berhasil!</h2>
          <p className="text-slate-500 text-sm mt-1">{item.businessName} · {item.periodLabel ?? invoice?.invoiceNumber ?? "—"}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{formatRupiah(nominalNum)}</p>
          <p className="text-xs text-slate-400 mt-1">via {metodeLabel}</p>
          <p className="text-xs font-mono bg-slate-100 px-3 py-1 rounded-full text-slate-600 my-3">{result.receiptNumber}</p>
          {change > 0 && (
            <div className="w-full rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 mb-3">
              <p className="text-sm font-semibold text-blue-800">Kembalian</p>
              <p className="text-xl font-bold text-blue-700">{formatRupiah(change)}</p>
            </div>
          )}
          {result.remainingAmount > 0 && change === 0 && (
            <p className="text-sm text-amber-600 font-medium mb-3">Sisa tagihan: {formatRupiah(result.remainingAmount)}</p>
          )}
          <div className="flex gap-3 w-full mt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Tutup</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => {
              const now = new Date();
              cetakStrukPDF({
                noStruk: result.receiptNumber,
                tanggal: formatTanggal(now),
                jam: formatJam(now),
                cabang: item.areaName,
                unitId: item.boothNumber,
                unitNama: item.businessName,
                penyewa: item.businessName,
                kategori: item.category ?? "—",
                luas: "—",
                periodeBayar: item.periodLabel ?? invoice?.invoiceNumber ?? "—",
                sewaBulanan: item.totalAmount,
                jumlahBayar: nominalNum,
                metodeBayar: metodeLabel,
                kasir: "Admin",
                status: isOverdue ? "tunggakan" : "lunas",
                invoiceNumber: invoice?.invoiceNumber,
                referenceNumber: referenceNumber || undefined,
                kembalian: change > 0 ? change : undefined,
                diskon: diskonNum > 0 ? diskonNum : undefined,
                denda: dendaNum > 0 ? dendaNum : undefined,
              });
            }}>
              <Printer className="w-4 h-4 mr-2" />Cetak Struk
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form screen ──
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]">
          <div className={cn("px-6 py-4 flex items-center justify-between shrink-0", isOverdue ? "bg-red-600" : "bg-primary")}>
            <div>
              <p className="text-white/70 text-xs">{invoice ? `Invoice: ${invoice.invoiceNumber}` : "Form Pembayaran Booking"}</p>
              <h2 className="text-white font-bold text-lg leading-tight">{item.businessName}</h2>
              <p className="text-white/80 text-xs mt-0.5">{item.boothNumber} · {item.areaName}</p>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white" disabled={mutation.isPending}><X className="w-5 h-5" /></button>
          </div>

          <form onSubmit={handleClickBayar} className="overflow-y-auto flex-1">
            <div className="p-6 space-y-5">
              {/* Info */}
              <div className={cn("rounded-xl border p-4 space-y-2 text-sm", isOverdue ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200")}>
                {invoice ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between"><span className="text-slate-500">No. Invoice</span><span className="font-mono font-semibold">{invoice.invoiceNumber}</span></div>
                    {invoice.periodStart && <div className="flex justify-between"><span className="text-slate-500">Periode</span><span className="font-medium">{formatTanggalID(invoice.periodStart)} — {formatTanggalID(invoice.periodEnd)}</span></div>}
                    <Separator />
                    <div className="flex justify-between"><span className="text-slate-500">Total Invoice</span><span className="font-semibold">{formatRupiah(invoice.totalAmount)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Sudah Dibayar</span><span className="font-semibold text-emerald-600">{formatRupiah(invoice.paidAmount)}</span></div>
                    <div className="flex justify-between"><span className="font-semibold">Sisa Invoice</span><span className={cn("font-bold", isOverdue ? "text-red-600" : "text-amber-600")}>{formatRupiah(invoice.outstandingAmount)}</span></div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <div><p className="text-xs text-slate-400">Nama Tenant</p><p className="font-semibold truncate">{item.businessName}</p></div>
                      <div><p className="text-xs text-slate-400">Booking ID</p><p className="font-semibold font-mono">#{item.bookingId}</p></div>
                      <div><p className="text-xs text-slate-400">Nomor Booth</p><p className="font-semibold">{item.boothNumber}</p></div>
                      <div><p className="text-xs text-slate-400">Periode</p><p className="font-semibold truncate">{item.periodLabel ?? "—"}</p></div>
                    </div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-slate-500">Total Tagihan</span><span className="font-semibold">{formatRupiah(item.totalAmount)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Sudah Dibayar</span><span className="font-semibold text-emerald-600">{formatRupiah(item.paidAmount)}</span></div>
                    <div className="flex justify-between"><span className="font-semibold">Sisa Pembayaran</span><span className={cn("font-bold", isOverdue ? "text-red-600" : "text-amber-600")}>{formatRupiah(item.remainingAmount)}</span></div>
                  </div>
                )}
              </div>

              {/* Diskon & Denda */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="diskon">Diskon (Rp)</Label>
                  <Input id="diskon" inputMode="numeric" value={diskon} onChange={(e) => setDiskon(e.target.value)} disabled={mutation.isPending} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="denda">Denda (Rp)</Label>
                  <Input id="denda" inputMode="numeric" value={denda} onChange={(e) => setDenda(e.target.value)} disabled={mutation.isPending} />
                </div>
              </div>

              {/* Nominal */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="nominal">Nominal Dibayar (Rp) <span className="text-red-500">*</span></Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline font-medium"
                    onClick={() => {
                      const target = invoice ? invoice.outstandingAmount : item.remainingAmount;
                      setNominal(String(target));
                    }}
                  >
                    <DollarSign className="w-3 h-3 inline" /> Bayar Penuh
                  </button>
                </div>
                <Input
                  id="nominal"
                  inputMode="numeric"
                  placeholder="Masukkan jumlah pembayaran"
                  value={nominal}
                  onChange={(e) => setNominal(e.target.value)}
                  disabled={mutation.isPending}
                  className={nominal && errNominal ? "border-red-400" : ""}
                />
                {nominal && errNominal && <p className="text-xs text-red-500">{errNominal}</p>}
                {nominalNum > 0 && kembalian > 0 && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs">
                    <span className="text-blue-700 font-semibold">Kembalian: {formatRupiah(kembalian)}</span>
                  </div>
                )}
                {nominalNum > 0 && kembalian === 0 && sisaSetelah >= 0 && (
                  <p className="text-xs text-muted-foreground">Sisa setelah bayar: <span className={cn("font-semibold", sisaSetelah === 0 ? "text-emerald-600" : "text-amber-600")}>{formatRupiah(sisaSetelah)}</span></p>
                )}
              </div>

              {/* Metode */}
              <div className="flex flex-col gap-2">
                <Label>Metode Pembayaran <span className="text-red-500">*</span></Label>
                <div className="grid grid-cols-5 gap-2">
                  {METODE_OPTIONS.map((m) => (
                    <button type="button" key={m.value} onClick={() => setMetode(m.value)} disabled={mutation.isPending}
                      className={cn("flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 px-1 text-[11px] font-medium transition-all",
                        metode === m.value ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:border-slate-300",
                        mutation.isPending && "opacity-50 cursor-not-allowed"
                      )}>
                      {m.icon}{m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nomor Referensi */}
              {needsReference && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="referenceNumber">
                    Nomor Referensi / Transfer{metode !== "tunai" && <span className="text-muted-foreground text-xs ml-1">(opsional)</span>}
                  </Label>
                  <Input id="referenceNumber" placeholder="Masukkan nomor transaksi/referensi..." value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} disabled={mutation.isPending} />
                </div>
              )}

              {/* Tanggal */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tanggal">Tanggal Pembayaran</Label>
                <Input id="tanggal" type="date" value={tanggalBayar} onChange={(e) => setTanggalBayar(e.target.value)} disabled={mutation.isPending} />
              </div>

              {/* Catatan */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="catatan">Catatan Pembayaran</Label>
                <Input id="catatan" placeholder="Opsional" value={catatan} onChange={(e) => setCatatan(e.target.value)} disabled={mutation.isPending} />
              </div>

              {mutation.isError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />{mutation.error?.message}
                </div>
              )}
            </div>
          </form>

          <div className="p-4 border-t bg-white shrink-0">
            <Button type="submit" className="w-full h-11 text-base font-semibold" onClick={handleClickBayar} disabled={mutation.isPending || !nominalNum}>
              {mutation.isPending ? (<><span className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />Memproses...</>) : (<><CreditCard className="w-4 h-4 mr-2" />Bayar Sekarang · {metodeLabel}</>)}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Pembayaran</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Yakin ingin menyimpan pembayaran tenant ini?</p>
                <div className="rounded-lg bg-slate-50 border p-3 space-y-1.5 mt-2">
                  <div className="flex justify-between"><span className="text-slate-500">Tenant</span><span className="font-medium">{item.businessName}</span></div>
                  {invoice && <div className="flex justify-between"><span className="text-slate-500">Invoice</span><span className="font-mono text-xs font-medium">{invoice.invoiceNumber}</span></div>}
                  <div className="flex justify-between"><span className="text-slate-500">Nominal Bayar</span><span className="font-semibold text-primary">{formatRupiah(nominalNum)}</span></div>
                  {diskonNum > 0 && <div className="flex justify-between"><span className="text-slate-500">Diskon</span><span className="text-emerald-600">-{formatRupiah(diskonNum)}</span></div>}
                  {dendaNum > 0 && <div className="flex justify-between"><span className="text-slate-500">Denda</span><span className="text-red-600">+{formatRupiah(dendaNum)}</span></div>}
                  <div className="flex justify-between"><span className="text-slate-500">Metode</span><span className="font-medium">{metodeLabel}</span></div>
                  {referenceNumber && <div className="flex justify-between"><span className="text-slate-500">No. Referensi</span><span className="font-mono text-xs">{referenceNumber}</span></div>}
                  {kembalian > 0 && <div className="flex justify-between"><span className="text-slate-500">Kembalian</span><span className="font-bold text-blue-600">{formatRupiah(kembalian)}</span></div>}
                  {kembalian === 0 && <div className="flex justify-between"><span className="text-slate-500">Sisa Setelah</span><span className={cn("font-semibold", sisaSetelah === 0 ? "text-emerald-600" : "text-amber-600")}>{formatRupiah(sisaSetelah)}</span></div>}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate()} disabled={mutation.isPending} className="bg-primary">
              {mutation.isPending ? "Menyimpan..." : "Ya, Simpan Pembayaran"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Daily Report Modal ───────────────────────────────────────────────────────

function DailyReportModal({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(todayString());
  const { data, isLoading, isError } = useDailyReport(date);

  const METODE_LABELS: Record<string, string> = { tunai: "Cash", transfer: "Transfer", qris: "QRIS", edc: "EDC", other: "Lainnya" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="bg-primary px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <p className="text-white/70 text-xs">Laporan Kasir</p>
            <h2 className="text-white font-bold text-lg leading-tight">Laporan Harian</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-3 border-b shrink-0">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-xs" />
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : isError ? (
            <div className="text-center text-destructive py-8"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-60" /><p>Gagal memuat laporan</p></div>
          ) : data ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border bg-emerald-50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Pendapatan</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">{formatRupiah(data.totalAmount)}</p>
                </div>
                <div className="rounded-xl border bg-blue-50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Transaksi</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{data.totalCount}</p>
                </div>
                <div className="rounded-xl border bg-red-50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Void</p>
                  <p className="text-lg font-bold text-red-700 mt-1">{data.voidedCount}</p>
                </div>
              </div>

              {Object.keys(data.byMethod).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Per Metode Bayar</p>
                  <div className="space-y-1.5">
                    {Object.entries(data.byMethod).map(([method, amount]) => (
                      <div key={method} className="flex justify-between items-center rounded-lg bg-slate-50 border px-3 py-2 text-sm">
                        <span className="font-medium">{METODE_LABELS[method] ?? method}</span>
                        <span className="font-bold text-emerald-700">{formatRupiah(amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.payments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Detail Transaksi</p>
                  <div className="space-y-1.5">
                    {data.payments.map((p) => (
                      <div key={p.id} className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-xs", p.isVoided ? "bg-red-50/50 opacity-60" : "bg-white")}>
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] text-muted-foreground truncate">{p.receiptNumber ?? `#${p.id}`}</p>
                          <p className="font-medium truncate">{p.businessName} · {p.boothNumber}</p>
                          <p className="text-muted-foreground">{METODE_LABELS[p.paymentMethod] ?? p.paymentMethod} · {new Date(p.paidAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          {p.isVoided ? (
                            <span className="text-red-600 font-bold text-[10px]">VOID</span>
                          ) : (
                            <span className="font-bold text-emerald-700">{formatRupiah(p.amount)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="p-4 border-t bg-white shrink-0">
          <Button variant="outline" className="w-full" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantPos() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<FloorPlanItem | null>(null);
  const [modalItem, setModalItem] = useState<FloorPlanItem | null>(null);
  const [modalInvoice, setModalInvoice] = useState<TenantInvoice | null>(null);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ search: "", status: "", area: "" });

  const overview = useOverview();
  const floorPlan = useFloorPlan();
  const currentShift = useCurrentShift();

  const allItems = floorPlan.data ?? [];
  const availableAreas = useMemo(() => [...new Set(allItems.map((i) => i.areaName))].sort(), [allItems]);

  const filteredItems = useMemo(() => {
    let items = allItems;
    const q = filters.search.toLowerCase().trim();
    if (q) items = items.filter((i) => i.businessName.toLowerCase().includes(q) || i.ownerName.toLowerCase().includes(q) || (i.email?.toLowerCase().includes(q) ?? false) || i.boothNumber.toLowerCase().includes(q));
    if (filters.status) items = items.filter((i) => resolveStatus(i) === filters.status);
    if (filters.area) items = items.filter((i) => i.areaName === filters.area);
    return items;
  }, [allItems, filters]);

  const hasFilter = !!(filters.search || filters.status || filters.area);
  const handleFilterChange = (partial: Partial<FilterState>) => setFilters((prev) => ({ ...prev, ...partial }));
  const handleSelect = (item: FloorPlanItem) => setSelected((prev) => (prev?.id === item.id ? null : item));

  const handleBayarInvoice = (item: FloorPlanItem, invoice: TenantInvoice) => {
    setModalItem(item);
    setModalInvoice(invoice);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">POS Kasir</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Klik unit pada denah untuk melihat detail dan memproses pembayaran</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowDailyReport(true)}>
            <FileText className="w-3.5 h-3.5 mr-1.5" />Laporan
          </Button>
          <StatusLegend />
        </div>
      </div>

      {/* Summary */}
      <div className="shrink-0">
        <SummaryCards overview={overview} loading={overviewLoading} />
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {/* Floor tabs */}
        {floors.length > 1 && (
          <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1">
            <button
              onClick={() => setActiveFloor("all")}
              className={cn("text-xs px-3 py-1.5 rounded-md font-medium transition-all", activeFloor === "all" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              Semua
            </button>
            {floors.map(f => (
              <button
                key={f}
                onClick={() => setActiveFloor(f)}
                className={cn("text-xs px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1", activeFloor === f ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Layers className="w-3 h-3" />Lantai {f}
              </button>
            ))}
          </div>
        )}

        <Card className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <CardHeader className="py-3 px-4 border-b flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Denah Tenant</CardTitle>
              {filters.status && !floorPlan.isLoading && (
                <span className="text-[10px] text-muted-foreground">
                  ({filteredItems.length}/{(floorPlan.data ?? []).length} unit)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <Filter className="w-3.5 h-3.5 text-muted-foreground mr-0.5" />
              {(["", "PAID", "UNPAID", "PARTIAL", "OVERDUE", "VACANT"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleFilterChange({ status: s === filters.status ? "" : s })}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all",
                    filters.status === s
                      ? "bg-primary text-white border-primary"
                      : "text-muted-foreground border-muted hover:border-slate-300"
                  )}
                >
                  {s === "" ? "Semua" : s === "PAID" ? "Lunas" : s === "UNPAID" ? "Belum Bayar" : s === "PARTIAL" ? "Sebagian" : s === "OVERDUE" ? "Jatuh Tempo" : "Kosong"}
                </button>
              ))}
            </div>
          </CardHeader>
          {!floorPlan.isLoading && !floorPlan.isError && (
            <FilterBar
              filters={filters}
              onChange={handleFilterChange}
              availableAreas={availableAreas}
              totalCount={allItems.length}
              filteredCount={filteredItems.length}
            />
          )}
          <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">

            {floorPlan.isLoading ? (
              <FloorPlanSkeleton />
            ) : floorPlan.isError ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-10 text-destructive">
                <AlertTriangle className="w-10 h-10 mb-3 opacity-60" />
                <p className="font-medium">Gagal memuat data denah</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => floorPlan.refetch()}>Coba Lagi</Button>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-10 text-muted-foreground">
                <Building2 className="w-10 h-10 mb-3 opacity-25" />
                <p className="font-medium text-sm">Tidak ada unit dengan status ini</p>
                <button
                  className="text-xs text-primary mt-2 hover:underline"
                  onClick={() => handleFilterChange({ status: "" })}
                >
                  Tampilkan semua
                </button>
              </div>
            ) : (
              <TenantFloorPlan
                items={filteredItems}
                selected={selected}
                onSelect={handleSelect}
                isFiltered={hasFilter}
        {/* Status filter */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-all", statusFilter === "all" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/40")}
          >
            Semua <span className="opacity-60">({statusCounts.all ?? 0})</span>
          </button>
          {(Object.entries(UNIT_STATUS_CONFIG) as [UnitStatus, typeof UNIT_STATUS_CONFIG[UnitStatus]][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
              className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-all flex items-center gap-1",
                statusFilter === key ? cn(cfg.badge, "shadow-sm") : "border-border text-muted-foreground hover:border-foreground/40"
              )}
            >
              {cfg.icon}{cfg.label}
              {statusCounts[key] != null && <span className="opacity-60">({statusCounts[key]})</span>}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs w-44"
            placeholder="Cari unit / tenant..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
      </div>

      {/* Main content: floor plan + side panel */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Floor Plan */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between">
            <Legend />
            <span className="text-xs text-muted-foreground">{filteredUnits.length} unit</span>
          </div>

          {unitsLoading ? (
            <div className="flex-1 rounded-xl border bg-white p-6 flex items-center justify-center">
              <div className="space-y-3 w-full">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-3/4 rounded-lg" />
              </div>
            </div>
          ) : unitsError ? (
            <div className="flex-1 rounded-xl border bg-red-50 flex items-center justify-center">
              <div className="text-center text-red-600">
                <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-60" />
                <p className="font-medium text-sm">Gagal memuat data unit</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Coba Lagi</Button>
              </div>
            </div>
          ) : isEmpty ? (
            <div className="flex-1 rounded-xl border bg-slate-50 flex flex-col items-center justify-center text-center gap-4">
              <Building2 className="w-16 h-16 text-slate-300" />
              <div>
                <p className="font-semibold text-slate-600">Belum ada unit mall</p>
                <p className="text-sm text-muted-foreground mt-1">Tambahkan unit secara manual atau gunakan data contoh</p>
              </div>
              {import.meta.env.DEV && (
                <Button onClick={handleSeed} disabled={seedMutation.isPending}>
                  {seedMutation.isPending ? "Memuat..." : "Tambah Data Contoh"}
                </Button>
              )}
            </div>
          ) : filteredUnits.length === 0 ? (
            <div className="flex-1 rounded-xl border bg-slate-50 flex items-center justify-center text-center">
              <div>
                <Search className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-muted-foreground">Tidak ada unit yang cocok dengan filter</p>
                <button className="text-xs text-primary mt-2" onClick={() => { setStatusFilter("all"); setSearchQ(""); setActiveFloor("all"); }}>Reset filter</button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <FloorPlan
                units={filteredUnits}
                selectedId={selectedUnitId}
                onSelect={(u) => setSelectedUnitId(prev => prev === u.id ? null : u.id)}
              />
            </div>
          )}
        </div>

        {/* Side Panel */}
        {selectedUnit && (
          <div className="w-72 shrink-0 rounded-xl border bg-white overflow-hidden flex flex-col shadow-md">
            <SidePanel
              unit={selectedUnit}
              onClose={() => setSelectedUnitId(null)}
              onPay={() => setPayUnit(selectedUnit)}
              onCetak={(id) => setReceiptPaymentId(id)}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      {payUnit && (
        <ModalPembayaran
          unit={payUnit}
          onClose={() => setPayUnit(null)}
          onSuccess={() => { setPayUnit(null); void refetch(); }}
      {/* Shift Panel */}
      {!currentShift.isLoading && (
        <ShiftPanel
          shift={currentShift.data}
          onOpenShift={() => setShowOpenShift(true)}
          onCloseShift={() => setShowCloseShift(true)}
        />
      )}

      <SummaryCards overview={overview.data} loading={overview.isLoading} error={overview.isError} />

      <div className="flex flex-1 gap-4 min-h-0">
        <Card className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <CardHeader className="py-3 px-4 border-b flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Denah Tenant</CardTitle>
              {hasFilter && !floorPlan.isLoading && (
                <span className="text-[10px] text-muted-foreground">({filteredItems.length}/{allItems.length} unit)</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <Filter className="w-3.5 h-3.5 text-muted-foreground mr-0.5" />
              {([null, "PAID", "UNPAID", "PARTIAL", "OVERDUE", "VACANT"] as const).map((s) => (
                <button
                  key={String(s)}
                  onClick={() => handleFilterChange({ status: s === null ? "" : (s === filters.status ? "" : s) })}
                  className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all",
                    filters.status === (s ?? "")
                      ? "bg-primary text-white border-primary"
                      : "text-muted-foreground border-muted hover:border-slate-300"
                  )}
                >
                  {s === null ? "Semua" : s === "PAID" ? "Lunas" : s === "UNPAID" ? "Belum Bayar" : s === "PARTIAL" ? "Sebagian" : s === "OVERDUE" ? "Jatuh Tempo" : "Kosong"}
                </button>
              ))}
            </div>
          </CardHeader>
          {!floorPlan.isLoading && !floorPlan.isError && (
            <FilterBar filters={filters} onChange={handleFilterChange} availableAreas={availableAreas} totalCount={allItems.length} filteredCount={filteredItems.length} />
          )}
          <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
            {floorPlan.isLoading ? (
              <FloorPlanSkeleton />
            ) : floorPlan.isError ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-10 text-destructive">
                <AlertTriangle className="w-10 h-10 mb-3 opacity-60" />
                <p className="font-medium">Gagal memuat data denah</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => floorPlan.refetch()}>Coba Lagi</Button>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-10 text-muted-foreground">
                <Building2 className="w-10 h-10 mb-3 opacity-25" />
                <p className="font-medium text-sm">Tidak ada unit dengan status ini</p>
                <button className="text-xs text-primary mt-2 hover:underline" onClick={() => handleFilterChange({ status: "" })}>Tampilkan semua</button>
              </div>
            ) : (
              <TenantFloorPlan items={filteredItems} selected={selected} onSelect={handleSelect} isFiltered={hasFilter} />
            )}
          </CardContent>
        </Card>

        <Card className="w-80 flex-shrink-0 overflow-hidden">
          <CardContent className="p-0 h-full">
            <DetailPanel
              item={selected}
              onClose={() => setSelected(null)}
              onProses={setModalItem}
              onBayarInvoice={handleBayarInvoice}
              currentShiftId={currentShift.data?.id ?? null}
            />
          </CardContent>
        </Card>
      </div>

      {/* Modal Pembayaran */}
      {modalItem && (
        <ModalPembayaran
          item={modalItem}
          invoice={modalInvoice}
          shiftId={currentShift.data?.id ?? null}
          onClose={() => { setModalItem(null); setModalInvoice(null); }}
          onSuccess={(updated) => {
            if (selected?.id === modalItem.id) {
              setSelected((prev) => prev ? { ...prev, paidAmount: updated.paidAmount, remainingAmount: updated.remainingAmount, paymentStatus: updated.paymentStatus as PaymentStatus } : null);
            }
            setModalItem(null);
            setModalInvoice(null);
          }}
        />
      )}

      {/* Shift Dialogs */}
      <ShiftOpenDialog open={showOpenShift} onClose={() => setShowOpenShift(false)} defaultName={(user as any)?.name ?? ""} />
      <ShiftCloseDialog open={showCloseShift} onClose={() => setShowCloseShift(false)} shift={currentShift.data ?? null} />

      {/* Daily Report */}
      {showDailyReport && <DailyReportModal onClose={() => setShowDailyReport(false)} />}
    </div>
  );
}
