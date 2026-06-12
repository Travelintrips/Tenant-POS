import { apiFetch } from "@/lib/api";
import { useSite, ALL_SITES_SENTINEL } from "@/contexts/site-context";
import React, { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Receipt, X, CheckCircle2, AlertCircle, CircleDashed,
  Clock, Phone, Mail, Calendar, CreditCard, Printer, Banknote,
  Smartphone, WalletCards, TrendingUp, Users, AlertTriangle, Zap,
  MoreHorizontal, History, Filter, Search, RotateCcw, ChevronDown,
  ChevronRight, MapPin, Wrench, Package, RefreshCw, Info, FileText,
  Layers, LogIn, LogOut, Ban, ShieldAlert, DollarSign, Dumbbell,
  Plus, UserPlus, Camera, ImagePlus, Trash2,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  logoUrl: string | null;
  tenantStatus: string | null;
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
  if (!item.bookingId) {
    const isActive = item.tenantStatus === "aktif" || item.tenantStatus === "active";
    return isActive ? "UNPAID" : "VACANT";
  }
  const upper = (item.paymentStatus ?? "UNPAID").toUpperCase() as PaymentStatus;
  return statusConfig[upper] ? upper : "UNPAID";
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── API Hooks ────────────────────────────────────────────────────────────────

function useOverview(siteId: number | null) {
  return useQuery<Overview>({
    queryKey: ["tenant-pos-overview", siteId],
    queryFn: async () => {
      const r = await apiFetch(`${BASE}/api/tenant-pos/overview`, { credentials: "include" });
      if (!r.ok) throw new Error(`Overview error ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
    enabled: siteId !== null,
  });
}

function useFloorPlan(siteId: number | null) {
  return useQuery<FloorPlanItem[]>({
    queryKey: ["tenant-pos-floor-plan", siteId],
    queryFn: async () => {
      const r = await apiFetch(`${BASE}/api/tenant-pos/floor-plan`, { credentials: "include" });
      if (!r.ok) throw new Error(`Floor plan error ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
    enabled: siteId !== null,
  });
}

function usePaymentHistory(bookingId: number | null) {
  return useQuery<PaymentHistoryItem[]>({
    queryKey: ["payment-history", bookingId],
    queryFn: () =>
      apiFetch(`${BASE}/api/tenant-pos/bookings/${bookingId}/payments`, { credentials: "include" }).then((r) => r.json()),
    enabled: bookingId !== null,
  });
}

function useTenantInvoices(tenantId: number | null) {
  return useQuery<TenantInvoice[]>({
    queryKey: ["tenant-invoices-pos", tenantId],
    queryFn: () =>
      apiFetch(`${BASE}/api/tenant-pos/tenants/${tenantId}/invoices`, { credentials: "include" }).then((r) => r.json()),
    enabled: tenantId !== null,
  });
}

function useCurrentShift() {
  return useQuery<CashierShift | null>({
    queryKey: ["pos-current-shift"],
    queryFn: async () => {
      const r = await apiFetch(`${BASE}/api/tenant-pos/shifts/current`, { credentials: "include" });
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
      const r = await apiFetch(`${BASE}/api/tenant-pos/daily-report?date=${date}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal mengambil laporan");
      return r.json();
    },
  });
}

function useReceiptData(paymentId: number | null) {
  return useQuery<ReceiptData>({
    queryKey: ["receipt", paymentId],
    queryFn: () =>
      apiFetch(`${BASE}/api/tenant-pos/payments/${paymentId}/receipt`, { credentials: "include" }).then((r) => {
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
      const r = await apiFetch(`${BASE}/api/tenant-pos/shifts/open`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
      const r = await apiFetch(`${BASE}/api/tenant-pos/shifts/${shift.id}/close`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
      const r = await apiFetch(`${BASE}/api/tenant-pos/payments/${payment.id}/void`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
      const r = await apiFetch(`${BASE}/api/tenant-pos/payments/${payment.id}/refund`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
    {
      label: "Tenant Aktif",
      value: loading ? null : String(overview?.totalActiveTenants ?? 0),
      sub: "tenant terdaftar",
      icon: <Users className="w-5 h-5" />,
      iconBg: "bg-blue-100 text-blue-600",
      gradient: "from-blue-50/80 to-white",
      border: "border-blue-100",
      valueColor: "text-blue-700",
      accent: "bg-blue-500",
    },
    {
      label: "Belum Lunas",
      value: loading ? null : String(overview?.unpaidCount ?? 0),
      sub: "tagihan pending",
      icon: <Clock className="w-5 h-5" />,
      iconBg: "bg-amber-100 text-amber-600",
      gradient: "from-amber-50/80 to-white",
      border: "border-amber-100",
      valueColor: "text-amber-700",
      accent: "bg-amber-500",
    },
    {
      label: "Pendapatan Hari Ini",
      value: loading ? null : formatRupiah(overview?.paidTodayAmount ?? 0),
      sub: "total terkumpul",
      icon: <TrendingUp className="w-5 h-5" />,
      iconBg: "bg-emerald-100 text-emerald-600",
      gradient: "from-emerald-50/80 to-white",
      border: "border-emerald-100",
      valueColor: "text-emerald-700",
      accent: "bg-emerald-500",
    },
    {
      label: "Jatuh Tempo",
      value: loading ? null : String(overview?.overdueCount ?? 0),
      sub: "tagihan overdue",
      icon: <AlertTriangle className="w-5 h-5" />,
      iconBg: "bg-red-100 text-red-600",
      gradient: "from-red-50/80 to-white",
      border: "border-red-100",
      valueColor: "text-red-700",
      accent: "bg-red-500",
    },
  ];

  if (error) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-red-50/30 px-4 py-3 text-sm text-red-700 shadow-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Gagal memuat ringkasan.</span>
        <span className="text-xs text-red-500 ml-1">Periksa koneksi atau refresh halaman.</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={cn("relative rounded-2xl border bg-gradient-to-br shadow-sm overflow-hidden", c.gradient, c.border)}>
          <div className={cn("absolute top-0 left-0 w-1 h-full rounded-l-2xl", c.accent)} />
          <div className="px-4 py-3.5 pl-5">
            <div className="flex items-start justify-between gap-2 mb-2.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest leading-none mt-0.5">{c.label}</p>
              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", c.iconBg)}>
                {c.icon}
              </div>
            </div>
            {loading
              ? <Skeleton className="h-8 w-20 mb-1 rounded-lg" />
              : <p className={cn("text-[1.6rem] font-black tracking-tight leading-none mb-1", c.valueColor)}>{c.value}</p>
            }
            <p className="text-[11px] text-slate-400 font-medium">{c.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Booth Card ───────────────────────────────────────────────────────────────

function BoothCard({ item, selected, onClick }: { item: FloorPlanItem; selected: boolean; onClick: () => void }) {
  const status = resolveStatus(item);
  const cfg = statusConfig[status];
  const isVacant = status === "VACANT";

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer select-none w-full flex flex-col group overflow-hidden",
        cfg.box,
        selected
          ? "ring-2 ring-offset-2 ring-primary shadow-lg scale-[1.02] z-10"
          : "hover:shadow-md hover:scale-[1.01]"
      )}
    >
      {/* Status stripe top */}
      <div className={cn("absolute top-0 left-0 right-0 h-0.5 z-10",
        status === "PAID" ? "bg-emerald-400" :
        status === "OVERDUE" ? "bg-red-400" :
        status === "PARTIAL" ? "bg-blue-400" :
        status === "UNPAID" ? "bg-amber-400" : "bg-slate-300"
      )} />

      {/* Foto Tenant */}
      <div className="w-full h-[88px] bg-slate-100 overflow-hidden shrink-0 relative">
        {item.logoUrl ? (
          <img
            src={item.logoUrl}
            alt={item.businessName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className={cn(
            "w-full h-full flex flex-col items-center justify-center gap-1",
            isVacant ? "text-slate-300" : "text-slate-300"
          )}>
            <Building2 className="w-7 h-7" />
            <span className="text-[9px] font-medium tracking-wide text-slate-300">Belum ada foto</span>
          </div>
        )}
        {/* Status badge overlay */}
        <span className={cn(
          "absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shadow-sm",
          cfg.badge
        )}>
          {cfg.icon}{cfg.label}
        </span>
      </div>

      {/* Info section */}
      <div className="p-2.5 flex flex-col gap-0.5">
        {/* No. Tenant */}
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
          No. {item.boothNumber}
        </p>

        {/* Nama bisnis */}
        <p className={cn("text-[12px] font-bold leading-tight truncate", isVacant ? "text-slate-300 italic" : "text-slate-800")}>
          {isVacant ? "Kosong" : item.businessName}
        </p>

        {/* Harga Sewa */}
        {!isVacant && item.totalAmount > 0 && (
          <div className="mt-1 pt-1.5 border-t border-slate-200/60">
            <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">Harga Sewa</p>
            <p className={cn("text-[11px] font-bold",
              status === "PAID" ? "text-emerald-600" :
              status === "OVERDUE" ? "text-red-600" :
              status === "PARTIAL" ? "text-blue-600" : "text-amber-600"
            )}>
              {formatRupiah(item.totalAmount)}
            </p>
          </div>
        )}
      </div>
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
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => (
          <BoothCard key={item.id} item={item} selected={selected?.id === item.id} onClick={() => onSelect(item)} />
        ))}
      </div>
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

function FilterBar({ filters, onChange, totalCount, filteredCount }: {
  filters: FilterState; onChange: (f: Partial<FilterState>) => void; totalCount: number; filteredCount: number;
}) {
  const hasFilter = !!(filters.search || filters.status);
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-slate-50/60">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input value={filters.search} onChange={(e) => onChange({ search: e.target.value })} placeholder="Cari nama bisnis, owner, nomor booth..." className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-slate-400" />
        {filters.search && <button onClick={() => onChange({ search: "" })} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
      </div>
      <div className="flex items-center gap-1">
        {STATUS_FILTER_OPTS.map((opt) => (
          <button key={opt.value} onClick={() => onChange({ status: opt.value })} className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap", filters.status === opt.value ? opt.active : opt.inactive)}>
            {opt.label}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
        {hasFilter ? <span><span className="font-semibold text-primary">{filteredCount}</span>/{totalCount}</span> : <span>{totalCount} unit</span>}
      </span>
      {hasFilter && <button onClick={() => onChange({ search: "", status: "", area: "" })} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 transition-colors whitespace-nowrap"><RotateCcw className="w-3 h-3" /></button>}
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
  const user = useAuth().data;
  const canVoidRefund = !!user && ["owner", "admin", "finance"].includes(user.role);
  const canEditLogo = !!user && ["owner", "admin"].includes(user.role);
  const paymentHistory = usePaymentHistory(item?.bookingId ?? null);
  const tenantInvoices = useTenantInvoices(item?.tenantId ?? null);
  const [receiptPaymentId, setReceiptPaymentId] = useState<number | null>(null);
  const [voidTarget, setVoidTarget] = useState<PaymentHistoryItem | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentHistoryItem | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "tagihan" | "riwayat">("info");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await apiFetch(`${BASE}/api/uploads/tenant-logo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Upload gagal");
      }
      const { url } = await uploadRes.json() as { url: string };
      const patchRes = await apiFetch(`${BASE}/api/tenants/${item!.tenantId}/logo`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: url }),
      });
      if (!patchRes.ok) throw new Error("Gagal menyimpan foto");
      return url;
    },
    onSuccess: () => {
      toast({ title: "Foto berhasil diperbarui", description: "Foto tenant akan tampil sebagai background kartu." });
      void queryClient.invalidateQueries({ queryKey: ["tenant-pos-floor-plan"] });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal upload foto", description: err.message, variant: "destructive" });
    },
  });

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

  const openInvoices = Array.isArray(tenantInvoices.data) ? tenantInvoices.data.filter(inv => ["unpaid", "partial", "overdue"].includes(inv.status)) : [];

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
            {/* ── Foto Tenant ── */}
            {canEditLogo && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Foto / Logo Tenant</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogoMutation.mutate(file);
                    e.target.value = "";
                  }}
                />
                {item.logoUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 h-28">
                    <img src={item.logoUrl} alt="Foto tenant" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-end justify-end p-2 gap-1.5 bg-gradient-to-t from-black/30 to-transparent">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadLogoMutation.isPending}
                        className="flex items-center gap-1 text-[10px] bg-white/90 hover:bg-white text-slate-700 rounded-md px-2 py-1 font-medium shadow transition-colors"
                      >
                        <Camera className="w-3 h-3" />Ganti
                      </button>
                    </div>
                    {uploadLogoMutation.isPending && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                        <RefreshCw className="w-5 h-5 text-primary animate-spin" />
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadLogoMutation.isPending}
                    className="w-full h-20 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-1.5 hover:border-primary hover:bg-primary/5 transition-colors text-slate-400 hover:text-primary"
                  >
                    {uploadLogoMutation.isPending ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <ImagePlus className="w-5 h-5" />
                        <span className="text-[11px] font-medium">Upload foto tenant</span>
                        <span className="text-[10px]">JPG, PNG, WEBP · maks 5MB</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

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

function ModalPembayaran({ item, invoice, shiftId, cashierName, onClose, onSuccess }: {
  item: FloorPlanItem;
  invoice?: TenantInvoice | null;
  shiftId?: number | null;
  cashierName?: string;
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
  const [proofUrl, setProofUrl] = useState("");
  const [catatan, setCatatan] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<PaymentResponse | null>(null);

  const nominalNum = parseInt(nominal.replace(/\D/g, "")) || 0;
  const diskonNum  = parseInt(diskon.replace(/\D/g, ""))  || 0;
  const dendaNum   = parseInt(denda.replace(/\D/g, ""))   || 0;
  const finalBill  = invoice
    ? invoice.outstandingAmount - diskonNum + dendaNum
    : item.totalAmount - diskonNum + dendaNum;
  const sisaSetelah = invoice
    ? Math.max(finalBill - nominalNum, 0)
    : Math.max(finalBill - item.paidAmount - nominalNum, 0);
  const kembalian  = invoice
    ? Math.max(nominalNum - finalBill, 0)
    : Math.max(item.paidAmount + nominalNum - finalBill, 0);
  const isOverdue  = item.paymentStatus === "OVERDUE";
  const metodeLabel = METODE_OPTIONS.find((m) => m.value === metode)?.label ?? metode;
  const errNominal = nominalNum <= 0 ? "Nominal harus lebih dari 0" : "";
  const isValid    = !errNominal && !!metode;

  const needsReference = metode === "transfer" || metode === "qris" || metode === "edc";

  const mutation = useMutation<PaymentResponse, Error>({
    mutationFn: async () => {
      const r = await apiFetch(`${BASE}/api/tenant-pos/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
          proofUrl: proofUrl || undefined,
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
                kasir: cashierName ?? "Kasir",
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
                    Nomor Referensi / Transfer<span className="text-muted-foreground text-xs ml-1">(opsional)</span>
                  </Label>
                  <Input id="referenceNumber" placeholder="Masukkan nomor transaksi/referensi..." value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} disabled={mutation.isPending} />
                </div>
              )}

              {/* Bukti Pembayaran URL */}
              {needsReference && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="proofUrl">
                    URL Bukti Pembayaran<span className="text-muted-foreground text-xs ml-1">(opsional)</span>
                  </Label>
                  <Input id="proofUrl" type="url" placeholder="https://... (link screenshot/bukti transfer)" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} disabled={mutation.isPending} />
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

// ─── Tambah Tenant (Quick Add) ────────────────────────────────────────────────

const CATEGORIES_POS = ["Kuliner", "F&B", "Fashion", "Elektronik", "Kesehatan", "Kecantikan", "Olahraga", "Pendidikan", "Lainnya"];

type TenantFormPOS = {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  category: string;
  boothNumber: string;
  areaName: string;
  status: "active" | "inactive";
  notes: string;
};

const EMPTY_TENANT_FORM: TenantFormPOS = {
  businessName: "",
  ownerName: "",
  email: "",
  phone: "",
  category: "",
  boothNumber: "",
  areaName: "",
  status: "active",
  notes: "",
};

// Tipe ringkas untuk daftar tenant di modal
type TenantListItem = {
  id: number;
  siteId: number | null;
  businessName: string;
  ownerName: string;
  email: string | null;
  phone: string | null;
  category: string | null;
  boothNumber: string | null;
  areaName: string;
  status: string;
  notes: string | null;
  logoUrl: string | null;
};

// Fetch semua tenant dari SEMUA site (x-site-code: ALL)
async function fetchAllTenantsList(): Promise<TenantListItem[]> {
  const r = await fetch(`${BASE}/api/tenants`, {
    credentials: "include",
    headers: { "x-site-code": "ALL" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Assign tenant existing ke site aktif (ubah siteId via PUT)
async function assignTenantToSite(tenant: TenantListItem, siteId: number): Promise<void> {
  const r = await apiFetch(`${BASE}/api/tenants/${tenant.id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId,
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
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${r.status}`);
  }
}

// Buat tenant baru di site aktif
async function createTenantPOS(data: TenantFormPOS): Promise<void> {
  const r = await apiFetch(`${BASE}/api/tenants`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${r.status}`);
  }
}

type ModalTambahTab = "pilih" | "baru";

function ModalTambahTenant({
  open,
  siteId,
  siteName,
  onClose,
  onSuccess,
}: {
  open: boolean;
  siteId: number | null;
  siteName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<ModalTambahTab>("pilih");
  const [search, setSearch] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<TenantListItem | null>(null);
  const [form, setForm] = useState<TenantFormPOS>(EMPTY_TENANT_FORM);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Fetch semua tenant
  const { data: allTenants = [], isLoading: loadingTenants } = useQuery<TenantListItem[]>({
    queryKey: ["all-tenants-list"],
    queryFn: fetchAllTenantsList,
    enabled: open,
  });

  // Pisahkan: sudah di site ini vs lokasi lain
  const tenantsLainSite = allTenants.filter((t) => t.siteId !== siteId);
  const tenantsDisini = allTenants.filter((t) => t.siteId === siteId);

  const filtered = (tenantsLainSite.length > 0 ? tenantsLainSite : allTenants).filter((t) => {
    const q = search.toLowerCase();
    return (
      t.businessName.toLowerCase().includes(q) ||
      t.ownerName.toLowerCase().includes(q) ||
      (t.boothNumber?.toLowerCase().includes(q) ?? false) ||
      (t.category?.toLowerCase().includes(q) ?? false)
    );
  });

  // Mutation assign tenant existing
  const assignMutation = useMutation({
    mutationFn: () => assignTenantToSite(selectedTenant!, siteId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-pos-floor-plan"] });
      qc.invalidateQueries({ queryKey: ["tenant-pos-overview"] });
      qc.invalidateQueries({ queryKey: ["all-tenants-list"] });
      toast({ title: "Tenant dipindahkan", description: `${selectedTenant?.businessName} sekarang terdaftar di ${siteName}.` });
      handleClose();
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Gagal memindahkan tenant", description: err.message, variant: "destructive" });
    },
  });

  // Mutation buat tenant baru
  const createMutation = useMutation({
    mutationFn: () => createTenantPOS(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-pos-floor-plan"] });
      qc.invalidateQueries({ queryKey: ["tenant-pos-overview"] });
      qc.invalidateQueries({ queryKey: ["all-tenants-list"] });
      toast({ title: "Tenant berhasil ditambahkan", description: `${form.businessName} terdaftar di ${siteName}.` });
      handleClose();
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Gagal menambahkan tenant", description: err.message, variant: "destructive" });
    },
  });

  const handleClose = () => {
    setTab("pilih");
    setSearch("");
    setSelectedTenant(null);
    setForm(EMPTY_TENANT_FORM);
    onClose();
  };

  const setF = (k: keyof TenantFormPOS, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmitBaru = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessName.trim()) { toast({ title: "Nama usaha wajib diisi", variant: "destructive" }); return; }
    if (!form.ownerName.trim()) { toast({ title: "Nama pemilik wajib diisi", variant: "destructive" }); return; }
    if (!form.areaName.trim()) { toast({ title: "Nama area wajib diisi", variant: "destructive" }); return; }
    createMutation.mutate();
  };

  const isPending = assignMutation.isPending || createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Tambah Tenant ke Denah
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Lokasi: <span className="font-medium text-foreground">{siteName}</span>
          </p>
        </DialogHeader>

        {/* ── Tabs ── */}
        <div className="flex border-b shrink-0 -mx-1">
          <button
            onClick={() => setTab("pilih")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === "pilih"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Pilih dari Daftar Tenant
          </button>
          <button
            onClick={() => setTab("baru")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === "baru"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            + Buat Tenant Baru
          </button>
        </div>

        {/* ── Tab: Pilih dari Daftar ── */}
        {tab === "pilih" && (
          <div className="flex flex-col flex-1 min-h-0 gap-3 pt-1">
            <Input
              placeholder="Cari nama usaha, pemilik, booth..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedTenant(null); }}
              className="shrink-0"
            />

            {loadingTenants ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Memuat daftar tenant...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground py-6">
                <Users className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">
                  {tenantsLainSite.length === 0 && allTenants.length > 0
                    ? "Semua tenant sudah berada di lokasi ini"
                    : search
                    ? "Tenant tidak ditemukan"
                    : "Belum ada tenant di sistem"}
                </p>
                <button
                  className="mt-3 text-xs text-primary hover:underline"
                  onClick={() => setTab("baru")}
                >
                  Buat tenant baru
                </button>
              </div>
            ) : (
              <>
                {tenantsLainSite.length > 0 && !search && (
                  <p className="text-[11px] text-muted-foreground shrink-0 -mt-1">
                    Menampilkan {tenantsLainSite.length} tenant dari lokasi lain. Pilih untuk dipindahkan ke <strong>{siteName}</strong>.
                  </p>
                )}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {filtered.map((t) => {
                    const isSelected = selectedTenant?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTenant(isSelected ? null : t)}
                        className={cn(
                          "w-full text-left rounded-lg border px-3 py-2.5 transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:border-slate-300 hover:bg-slate-50/70"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{t.businessName}</p>
                            <p className="text-xs text-muted-foreground truncate">{t.ownerName}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {t.boothNumber && (
                                <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded">{t.boothNumber}</span>
                              )}
                              {t.areaName && (
                                <span className="text-[10px] text-muted-foreground">{t.areaName}</span>
                              )}
                              {t.category && (
                                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{t.category}</span>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <DialogFooter className="shrink-0 pt-2 border-t">
              <Button variant="outline" onClick={handleClose} disabled={isPending}>Batal</Button>
              <Button
                onClick={() => assignMutation.mutate()}
                disabled={!selectedTenant || !siteId || isPending}
                className="gap-2"
              >
                <MapPin className="w-4 h-4" />
                {isPending ? "Memindahkan..." : `Tambahkan ke ${siteName}`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Tab: Buat Tenant Baru ── */}
        {tab === "baru" && (
          <form onSubmit={handleSubmitBaru} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 py-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="pt-businessName">Nama Usaha <span className="text-destructive">*</span></Label>
                  <Input id="pt-businessName" value={form.businessName} onChange={(e) => setF("businessName", e.target.value)} placeholder="Contoh: Warung Bu Sari" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="pt-ownerName">Nama Pemilik <span className="text-destructive">*</span></Label>
                  <Input id="pt-ownerName" value={form.ownerName} onChange={(e) => setF("ownerName", e.target.value)} placeholder="Nama lengkap pemilik" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pt-phone">No. HP</Label>
                  <Input id="pt-phone" value={form.phone} onChange={(e) => setF("phone", e.target.value)} placeholder="08xx..." />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pt-email">Email</Label>
                  <Input id="pt-email" type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} placeholder="email@..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Kategori</Label>
                  <Select value={form.category} onValueChange={(v) => setF("category", v)}>
                    <SelectTrigger><SelectValue placeholder="Pilih kategori..." /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES_POS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setF("status", v as "active" | "inactive")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktif</SelectItem>
                      <SelectItem value="inactive">Non-Aktif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pt-boothNumber">Nomor Booth</Label>
                  <Input id="pt-boothNumber" value={form.boothNumber} onChange={(e) => setF("boothNumber", e.target.value)} placeholder="Contoh: A-01" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pt-areaName">Nama Area <span className="text-destructive">*</span></Label>
                  <Input id="pt-areaName" value={form.areaName} onChange={(e) => setF("areaName", e.target.value)} placeholder="Contoh: Lantai 1" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="pt-notes">Catatan</Label>
                  <Input id="pt-notes" value={form.notes} onChange={(e) => setF("notes", e.target.value)} placeholder="Catatan tambahan (opsional)" />
                </div>
              </div>
            </div>
            <DialogFooter className="pt-3 border-t shrink-0">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Batal</Button>
              <Button type="submit" disabled={isPending} className="gap-2">
                <Plus className="w-4 h-4" />
                {isPending ? "Menyimpan..." : "Buat & Tambahkan"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantPos() {
  const user = useAuth().data;
  const { activeSite, activeSiteId, sites, setActiveSite } = useSite();
  const [selected, setSelected] = useState<FloorPlanItem | null>(null);
  const [modalItem, setModalItem] = useState<FloorPlanItem | null>(null);
  const [modalInvoice, setModalInvoice] = useState<TenantInvoice | null>(null);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showTambahTenant, setShowTambahTenant] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ search: "", status: "", area: "" });

  const overview = useOverview(activeSiteId);
  const floorPlan = useFloorPlan(activeSiteId);
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
    <div className="flex flex-col h-[calc(100vh-4.5rem)] gap-3">
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

      <SummaryCards overview={overview.data} loading={overview.isLoading} error={overview.isError} />

      <div className="flex flex-1 gap-4 min-h-0">
        <Card className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {/* ── Tab Lokasi (Semua / Sport Center / TOD M1) ── */}
          {sites.length > 1 && (
            <div className="flex border-b bg-slate-50/70 shrink-0 px-3 pt-2 gap-1">
              {/* Tab Semua */}
              <button
                onClick={() => { setActiveSite(ALL_SITES_SENTINEL); setSelected(null); handleFilterChange({ search: "", status: "", area: "" }); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-lg border border-b-0 transition-all -mb-px",
                  activeSite?.code === "ALL"
                    ? "bg-white border-slate-300 text-slate-700 shadow-sm"
                    : "bg-transparent border-transparent text-muted-foreground hover:text-slate-700 hover:bg-slate-100"
                )}
              >
                <Layers className="w-3 h-3" />
                Semua
              </button>
              {sites.map((site) => {
                const isActive = activeSite?.id === site.id;
                const isSport = site.type === "sport_center";
                return (
                  <button
                    key={site.id}
                    onClick={() => { setActiveSite(site); setSelected(null); handleFilterChange({ search: "", status: "", area: "" }); }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-lg border border-b-0 transition-all -mb-px",
                      isActive
                        ? isSport
                          ? "bg-white border-emerald-300 text-emerald-700 shadow-sm"
                          : "bg-white border-blue-300 text-blue-700 shadow-sm"
                        : "bg-transparent border-transparent text-muted-foreground hover:text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {isSport
                      ? <Dumbbell className="w-3 h-3" />
                      : <Building2 className="w-3 h-3" />
                    }
                    {site.name}
                  </button>
                );
              })}
            </div>
          )}
          <CardHeader className="py-3 px-4 border-b flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Denah Tenant</CardTitle>
              {activeSite && sites.length === 1 && (
                <span className="text-[10px] text-muted-foreground">· {activeSite.name}</span>
              )}
              {hasFilter && !floorPlan.isLoading && (
                <span className="text-[10px] text-muted-foreground">({filteredItems.length}/{allItems.length} unit)</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-1">
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
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/5"
                onClick={() => setShowTambahTenant(true)}
              >
                <Plus className="w-3 h-3" />
                Tambah Tenant
              </Button>
            </div>
          </CardHeader>
          {!floorPlan.isLoading && !floorPlan.isError && (
            <FilterBar filters={filters} onChange={handleFilterChange} totalCount={allItems.length} filteredCount={filteredItems.length} />
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
            ) : allItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-10 text-muted-foreground">
                <div className="w-16 h-16 rounded-2xl bg-primary/5 border-2 border-dashed border-primary/20 flex items-center justify-center mb-4">
                  <Building2 className="w-8 h-8 text-primary/30" />
                </div>
                <p className="font-semibold text-slate-700 text-base">Belum ada tenant</p>
                <p className="text-sm mt-1 max-w-xs">
                  {activeSite ? `Lokasi "${activeSite.name}" belum memiliki tenant terdaftar.` : "Belum ada tenant terdaftar di lokasi ini."}
                </p>
                <Button
                  size="sm"
                  className="mt-4 gap-2"
                  onClick={() => setShowTambahTenant(true)}
                >
                  <Plus className="w-4 h-4" />
                  Tambah Tenant Pertama
                </Button>
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
          cashierName={currentShift.data?.cashierName ?? undefined}
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

      {/* Tambah Tenant */}
      <ModalTambahTenant
        open={showTambahTenant}
        siteId={activeSiteId}
        siteName={activeSite?.name ?? "Lokasi Ini"}
        onClose={() => setShowTambahTenant(false)}
        onSuccess={() => setShowTambahTenant(false)}
      />
    </div>
  );
}
