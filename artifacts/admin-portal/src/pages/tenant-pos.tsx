import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Receipt, X, CheckCircle2, AlertCircle, CircleDashed,
  Clock, Phone, Mail, Calendar, CreditCard, Printer, Banknote,
  Smartphone, WalletCards, TrendingUp, Users, AlertTriangle, Zap,
  MoreHorizontal, History, Filter, Search, RotateCcw, ChevronDown,
  MoreHorizontal, History, Filter, Search, ChevronRight, MapPin,
  Wrench, Package, RefreshCw, Info, FileText, Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { cetakStrukPDF, formatTanggal, formatJam } from "@/lib/cetak-struk";
// ─── Types ────────────────────────────────────────────────────────────────────

type UnitStatus = "available" | "booked" | "occupied" | "overdue" | "expired" | "maintenance";
type PaymentStatus = "PAID" | "UNPAID" | "PARTIAL" | "OVERDUE";
type MetodeBayar = "tunai" | "transfer" | "qris" | "edc" | "other";

type MallUnit = {
  id: number;
  unitCode: string;
  floor: string;
  zone: string | null;
  sizeM2: string | null;
  storedStatus: string;
  status: UnitStatus;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  notes: string | null;
  bookingId: number | null;
  tenantId: number | null;
  businessName: string | null;
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  boothNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: string | null;
  periodLabel: string | null;
  dueDate: string | null;
  latestInvoiceId: number | null;
  latestInvoiceStatus: string | null;
  latestInvoiceAmount: number | null;
  latestInvoiceDueDate: string | null;
  latestInvoiceOutstanding: number | null;
};

type Overview = {
  totalActiveTenants: number;
  unpaidCount: number;
  overdueCount: number;
  paidTodayAmount: number;
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
  notes: string | null;
  adminName: string;
};

type PaymentResponse = {
  success: boolean;
  payment: { id: number; amount: number; paymentMethod: MetodeBayar; paidAt: string };
  receiptNumber: string;
  paymentStatus: string;
  paidAmount: number;
  remainingAmount: number;
};

// ─── Status Config ────────────────────────────────────────────────────────────

const UNIT_STATUS_CONFIG: Record<UnitStatus, {
  label: string;
  tile: string;
  tileBorder: string;
  badge: string;
  dot: string;
  icon: React.ReactNode;
}> = {
  available: {
    label: "Tersedia",
    tile: "bg-emerald-50 hover:bg-emerald-100",
    tileBorder: "border-emerald-400",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-300",
    dot: "bg-emerald-500",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  occupied: {
    label: "Terisi",
    tile: "bg-blue-50 hover:bg-blue-100",
    tileBorder: "border-blue-400",
    badge: "bg-blue-100 text-blue-700 border-blue-300",
    dot: "bg-blue-500",
    icon: <Building2 className="w-3 h-3" />,
  },
  booked: {
    label: "Dipesan",
    tile: "bg-amber-50 hover:bg-amber-100",
    tileBorder: "border-amber-400",
    badge: "bg-amber-100 text-amber-700 border-amber-300",
    dot: "bg-amber-400",
    icon: <Clock className="w-3 h-3" />,
  },
  overdue: {
    label: "Tunggakan",
    tile: "bg-red-50 hover:bg-red-100",
    tileBorder: "border-red-500",
    badge: "bg-red-100 text-red-700 border-red-300",
    dot: "bg-red-500",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  maintenance: {
    label: "Perawatan",
    tile: "bg-slate-100 hover:bg-slate-200",
    tileBorder: "border-slate-400",
    badge: "bg-slate-100 text-slate-600 border-slate-300",
    dot: "bg-slate-400",
    icon: <Wrench className="w-3 h-3" />,
  },
  expired: {
    label: "Kadaluarsa",
    tile: "bg-zinc-100 hover:bg-zinc-200",
    tileBorder: "border-zinc-500",
    badge: "bg-zinc-800 text-zinc-100 border-zinc-700",
    dot: "bg-zinc-600",
    icon: <Package className="w-3 h-3" />,
  },
};

const METODE_LABEL: Record<MetodeBayar, string> = {
  tunai: "Cash",
  transfer: "Transfer",
  qris: "QRIS",
  edc: "EDC",
  other: "Lainnya",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function formatTanggalID(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Data Hooks ───────────────────────────────────────────────────────────────

function useMallUnits() {
  return useQuery<MallUnit[]>({
    queryKey: ["mall-units"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/mall-units`, { credentials: "include" });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
  });
}

function useOverview() {
  return useQuery<Overview>({
    queryKey: ["pos-overview"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tenant-pos/overview`, { credentials: "include" });
      if (!r.ok) throw new Error(`Overview error ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
  });
}

function usePaymentHistory(bookingId: number | null) {
  return useQuery<PaymentHistoryItem[]>({
    queryKey: ["payment-history", bookingId],
    queryFn: () =>
      fetch(`${BASE}/api/tenant-pos/bookings/${bookingId}/payments`, { credentials: "include" }).then(r => r.json()),
    enabled: bookingId !== null,
  });
}

function useReceiptData(paymentId: number | null) {
  return useQuery<ReceiptData>({
    queryKey: ["receipt", paymentId],
    queryFn: () =>
      fetch(`${BASE}/api/tenant-pos/payments/${paymentId}/receipt`, { credentials: "include" }).then(r => {
        if (!r.ok) throw new Error("Gagal mengambil data receipt");
        return r.json();
      }),
    enabled: paymentId !== null,
  });
}

// ─── Seed hook ────────────────────────────────────────────────────────────────

function useSeedUnits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/mall-units/seed`, {
        method: "POST",
        credentials: "include",
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mall-units"] }),
  });
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ overview, loading }: { overview?: Overview; loading: boolean }) {
  const cards = [
    { label: "Tenant Aktif", value: String(overview?.totalActiveTenants ?? 0), sub: "terdaftar", icon: <Users className="w-5 h-5 text-blue-500" />, color: "border-blue-200 bg-blue-50/40", valueColor: "text-blue-700" },
    { label: "Belum Lunas", value: String(overview?.unpaidCount ?? 0), sub: "tagihan pending", icon: <Clock className="w-5 h-5 text-amber-500" />, color: "border-amber-200 bg-amber-50/40", valueColor: "text-amber-700" },
    { label: "Bayar Hari Ini", value: formatRupiah(overview?.paidTodayAmount ?? 0), sub: "terkumpul", icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, color: "border-emerald-200 bg-emerald-50/40", valueColor: "text-emerald-700" },
    { label: "Overdue", value: String(overview?.overdueCount ?? 0), sub: "jatuh tempo", icon: <AlertTriangle className="w-5 h-5 text-red-500" />, color: "border-red-200 bg-red-50/40", valueColor: "text-red-700" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(c => (
        <Card key={c.label} className={cn("border", c.color)}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.label}</p>
              {c.icon}
            </div>
            {loading ? <Skeleton className="h-7 w-24 mb-1" /> : (
              <p className={cn("text-2xl font-bold tracking-tight", c.valueColor)}>{c.value}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Floor Plan Tile ──────────────────────────────────────────────────────────

const CELL_W = 76;
const CELL_H = 64;

function UnitTile({ unit, selected, onClick }: { unit: MallUnit; selected: boolean; onClick: () => void }) {
  const cfg = UNIT_STATUS_CONFIG[unit.status];
  const left = unit.positionX * CELL_W;
  const top = unit.positionY * CELL_H;
  const w = unit.width * CELL_W - 4;
  const h = unit.height * CELL_H - 4;

  return (
    <button
      onClick={onClick}
      style={{ left, top, width: w, height: h }}
      className={cn(
        "absolute rounded-lg border-2 text-left transition-all duration-150 cursor-pointer select-none overflow-hidden p-1.5",
        cfg.tile,
        cfg.tileBorder,
        selected && "ring-2 ring-offset-1 ring-primary shadow-lg scale-[1.02] z-20"
      )}
    >
      <div className="flex items-start justify-between gap-1 mb-0.5">
        <span className="text-[10px] font-bold text-slate-600 uppercase leading-none truncate">{unit.unitCode}</span>
        <span className={cn("w-2 h-2 rounded-full shrink-0 mt-0.5", cfg.dot)} />
      </div>
      {h >= 48 && (
        <p className="text-[10px] font-semibold leading-tight text-slate-700 truncate">
          {unit.status === "available" ? (
            <span className="text-slate-400 italic">Kosong</span>
          ) : unit.status === "maintenance" ? (
            <span className="text-slate-500">Perawatan</span>
          ) : unit.status === "expired" ? (
            <span className="text-zinc-500">Kadaluarsa</span>
          ) : (
            unit.businessName ?? unit.unitCode
          )}
        </p>
      )}
      {h >= 64 && unit.status !== "available" && unit.status !== "maintenance" && unit.status !== "expired" && (
        <span className={cn(
          "inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded-full border font-medium mt-0.5",
          cfg.badge
        )}>
          {cfg.icon}
          <span className="truncate">{cfg.label}</span>
        </span>
      )}
    </button>
  );
}

// ─── Floor Plan ───────────────────────────────────────────────────────────────

function FloorPlan({
  units,
  selectedId,
  onSelect,
}: {
  units: MallUnit[];
  selectedId: number | null;
  onSelect: (unit: MallUnit) => void;
}) {
  const maxX = useMemo(() => Math.max(...units.map(u => u.positionX + u.width), 8), [units]);
  const maxY = useMemo(() => Math.max(...units.map(u => u.positionY + u.height), 6), [units]);
  const containerW = maxX * CELL_W;
  const containerH = maxY * CELL_H;

  // Grid lines
  const vLines = Array.from({ length: maxX + 1 }, (_, i) => i);
  const hLines = Array.from({ length: maxY + 1 }, (_, i) => i);

  return (
    <div className="overflow-auto rounded-xl border bg-white p-2">
      <div className="relative" style={{ width: containerW, height: containerH, minWidth: containerW }}>
        {/* Grid lines */}
        <svg className="absolute inset-0 pointer-events-none" width={containerW} height={containerH}>
          {vLines.map(i => (
            <line key={`v${i}`} x1={i * CELL_W} y1={0} x2={i * CELL_W} y2={containerH} stroke="#e2e8f0" strokeWidth={1} />
          ))}
          {hLines.map(i => (
            <line key={`h${i}`} x1={0} y1={i * CELL_H} x2={containerW} y2={i * CELL_H} stroke="#e2e8f0" strokeWidth={1} />
          ))}
        </svg>
        {/* Unit Tiles */}
        {units.map(unit => (
          <UnitTile
            key={unit.id}
            unit={unit}
            selected={selectedId === unit.id}
            onClick={() => onSelect(unit)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Detail Row ───────────────────────────────────────────────────────────────

function DetailRow({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right font-medium max-w-[60%]", valueClass)}>{value}</span>
    </div>
  );
}

// ─── Side Panel ───────────────────────────────────────────────────────────────

function SidePanel({
  unit,
  onClose,
  onPay,
  onCetak,
}: {
  unit: MallUnit;
  onClose: () => void;
  onPay: () => void;
  onCetak: (paymentId: number) => void;
}) {
  const cfg = UNIT_STATUS_CONFIG[unit.status];
  const paymentHistory = usePaymentHistory(unit.bookingId);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const ps = (unit.paymentStatus ?? "").toUpperCase() as PaymentStatus | "";
  const canPay = !!unit.bookingId && ps !== "PAID";
  const isOverdue = unit.status === "overdue";

  const billingBg = isOverdue
    ? "bg-red-50 border-red-200"
    : ps === "PAID"
    ? "bg-emerald-50 border-emerald-200"
    : "bg-slate-50 border-slate-200";

  const remainingColor =
    unit.remainingAmount === 0 ? "text-emerald-600" : isOverdue ? "text-red-600" : "text-amber-600";

  const historyItems = paymentHistory.data ?? [];
  const visibleHistory = showAllHistory ? historyItems : historyItems.slice(0, 3);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={cn("flex items-start justify-between px-4 py-3 shrink-0 border-b",
        isOverdue ? "bg-red-600" : unit.status === "occupied" ? "bg-blue-600" : unit.status === "available" ? "bg-emerald-600" : "bg-slate-600"
      )}>
        <div className="min-w-0">
          <p className="text-white/70 text-[10px] uppercase tracking-wider font-medium">Unit</p>
          <h2 className="text-white font-bold text-lg leading-tight">{unit.unitCode}</h2>
          <p className="text-white/80 text-xs mt-0.5">
            Lantai {unit.floor}{unit.zone ? ` · ${unit.zone}` : ""}
            {unit.sizeM2 ? ` · ${unit.sizeM2} m²` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border font-semibold bg-white/20 text-white border-white/30")}>
            {cfg.icon} {cfg.label}
          </span>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* Unit Info */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Info Unit</p>
          <div className="rounded-lg border px-3 divide-y divide-border/60 bg-slate-50">
            <DetailRow label="Kode Unit" value={<span className="font-mono font-bold">{unit.unitCode}</span>} />
            <DetailRow label="Lantai" value={`Lantai ${unit.floor}`} />
            {unit.zone && <DetailRow label="Zona" value={unit.zone} />}
            {unit.sizeM2 && <DetailRow label="Luas" value={`${unit.sizeM2} m²`} />}
            {unit.notes && <DetailRow label="Catatan" value={<span className="text-muted-foreground italic">{unit.notes}</span>} />}
          </div>
        </div>

        {/* Tenant Info */}
        {unit.businessName && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Data Tenant</p>
            <div className="rounded-lg border px-3 divide-y divide-border/60">
              <DetailRow label="Nama Bisnis" value={<span className="font-semibold">{unit.businessName}</span>} />
              {unit.ownerName && <DetailRow label="Pemilik" value={unit.ownerName} />}
              {unit.category && <DetailRow label="Kategori" value={unit.category} />}
              {unit.phone && (
                <DetailRow label="Telepon" value={
                  <a href={`tel:${unit.phone}`} className="text-blue-600 underline underline-offset-2">{unit.phone}</a>
                } />
              )}
              {unit.email && (
                <DetailRow label="Email" value={
                  <a href={`mailto:${unit.email}`} className="text-blue-600 underline underline-offset-2 truncate">{unit.email}</a>
                } />
              )}
            </div>
          </div>
        )}

        {/* Contract Info */}
        {unit.bookingId && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Detail Kontrak</p>
            <div className="rounded-lg border px-3 divide-y divide-border/60">
              <DetailRow label="Booking ID" value={<span className="font-mono">#{unit.bookingId}</span>} />
              {unit.periodLabel && <DetailRow label="Periode" value={unit.periodLabel} />}
              <DetailRow label="Mulai" value={formatTanggalID(unit.startDate)} />
              <DetailRow label="Selesai" value={formatTanggalID(unit.endDate)} />
            </div>
          </div>
        )}

        {/* Billing Info */}
        {unit.bookingId && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Detail Tagihan</p>
            <div className={cn("rounded-lg border px-3 divide-y divide-border/60", billingBg)}>
              <DetailRow
                label="Status Pembayaran"
                value={
                  <span className={cn("inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium", cfg.badge)}>
                    {cfg.icon}
                    {ps === "PAID" ? "Lunas" : ps === "PARTIAL" ? "Bayar Sebagian" : ps === "OVERDUE" ? "Jatuh Tempo" : isOverdue ? "Tunggakan" : "Belum Bayar"}
                  </span>
                }
              />
              <DetailRow label="Total Tagihan" value={formatRupiah(unit.totalAmount)} valueClass="font-semibold" />
              <DetailRow label="Sudah Dibayar" value={formatRupiah(unit.paidAmount)} valueClass={unit.paidAmount > 0 ? "text-emerald-700" : "text-muted-foreground"} />
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Sisa Pembayaran</span>
                <span className={cn("text-sm font-bold", remainingColor)}>{formatRupiah(unit.remainingAmount)}</span>
              </div>
              {unit.dueDate && (
                <DetailRow
                  label="Jatuh Tempo"
                  value={
                    <span className={cn("flex items-center gap-1", isOverdue && "text-red-600 font-semibold")}>
                      <Clock className="w-3 h-3 shrink-0" />
                      {formatTanggalID(unit.dueDate)}
                    </span>
                  }
                />
              )}
            </div>
          </div>
        )}

        {/* Latest Invoice */}
        {unit.latestInvoiceId && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Invoice Terbaru</p>
            <div className="rounded-lg border px-3 divide-y divide-border/60 bg-slate-50">
              <DetailRow label="Invoice ID" value={<span className="font-mono">#{unit.latestInvoiceId}</span>} />
              <DetailRow
                label="Status"
                value={
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                    unit.latestInvoiceStatus === "paid" ? "bg-emerald-100 text-emerald-700 border-emerald-300" :
                    unit.latestInvoiceStatus === "overdue" ? "bg-red-100 text-red-700 border-red-300" :
                    "bg-amber-100 text-amber-700 border-amber-300"
                  )}>
                    {unit.latestInvoiceStatus === "paid" ? "Lunas" :
                     unit.latestInvoiceStatus === "overdue" ? "Jatuh Tempo" :
                     unit.latestInvoiceStatus === "unpaid" ? "Belum Bayar" :
                     unit.latestInvoiceStatus ?? "—"}
                  </span>
                }
              />
              {unit.latestInvoiceAmount != null && (
                <DetailRow label="Nominal" value={formatRupiah(unit.latestInvoiceAmount)} />
              )}
              {unit.latestInvoiceOutstanding != null && unit.latestInvoiceOutstanding > 0 && (
                <DetailRow label="Outstanding" value={formatRupiah(unit.latestInvoiceOutstanding)} valueClass="text-amber-700 font-semibold" />
              )}
              {unit.latestInvoiceDueDate && (
                <DetailRow label="Jatuh Tempo" value={formatTanggalID(unit.latestInvoiceDueDate)} />
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          {canPay && (
            <Button
              className={cn("w-full", isOverdue && "bg-red-600 hover:bg-red-700 text-white")}
              size="sm"
              onClick={onPay}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Bayar Sekarang
            </Button>
          )}
          {unit.bookingId && (
            <Button
              className="w-full"
              variant="outline"
              size="sm"
              onClick={() => window.open(`/booking-tenant`, "_blank")}
            >
              <FileText className="w-4 h-4 mr-2" />
              Lihat Kontrak
            </Button>
          )}
        </div>

        {/* Payment History */}
        {unit.bookingId && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Riwayat Pembayaran</p>
            {paymentHistory.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            ) : historyItems.length > 0 ? (
              <div className="space-y-2">
                {visibleHistory.map(p => (
                  <div key={p.id} className="rounded-lg border bg-muted/20 px-3 py-2.5 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground truncate">{p.receiptNumber ?? `#${p.id}`}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-emerald-100 text-emerald-700 border-emerald-300 shrink-0">
                        <CheckCircle2 className="w-2.5 h-2.5" />Lunas
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <div>
                        <p className="text-muted-foreground">Tanggal</p>
                        <p className="font-medium">{new Date(p.paymentDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Metode</p>
                        <p className="font-medium">{METODE_LABEL[p.paymentMethod] ?? p.paymentMethod}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Nominal</p>
                        <p className="font-bold text-emerald-700">{formatRupiah(p.amountPaid)}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => onCetak(p.id)}>
                      <Printer className="w-3 h-3 mr-1.5" />Cetak Receipt
                    </Button>
                  </div>
                ))}
                {historyItems.length > 3 && (
                  <button
                    className="w-full text-xs text-muted-foreground hover:text-foreground py-1 flex items-center justify-center gap-1"
                    onClick={() => setShowAllHistory(v => !v)}
                  >
                    {showAllHistory ? "Sembunyikan" : `Lihat ${historyItems.length - 3} lainnya`}
                    <ChevronRight className={cn("w-3 h-3 transition-transform", showAllHistory && "rotate-90")} />
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-xs">
                <Receipt className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                Belum ada riwayat pembayaran.
              </div>
            )}
          </div>
        )}

        {/* Maintenance info */}
        {unit.status === "maintenance" && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
            <Wrench className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
            Unit sedang dalam perawatan.
            {unit.notes && <p className="mt-1 italic">"{unit.notes}"</p>}
          </div>
        )}

        {/* Available info */}
        {unit.status === "available" && (
          <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-4 text-center text-xs text-emerald-700">
            <CheckCircle2 className="w-6 h-6 mx-auto mb-1.5 opacity-60" />
            Unit tersedia untuk disewa.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal Receipt ────────────────────────────────────────────────────────────

function ModalReceipt({ paymentId, onClose }: { paymentId: number; onClose: () => void }) {
  const { data, isLoading, isError } = useReceiptData(paymentId);

  const metodeLabel: Record<string, string> = { tunai: "Cash / Tunai", transfer: "Transfer Bank", qris: "QRIS", edc: "EDC / Kartu Debit", other: "Lainnya" };
  const statusLabel: Record<string, { text: string; color: string }> = {
    PAID: { text: "LUNAS", color: "text-emerald-700" },
    PARTIAL: { text: "BAYAR SEBAGIAN", color: "text-blue-700" },
    UNPAID: { text: "BELUM BAYAR", color: "text-amber-700" },
    OVERDUE: { text: "JATUH TEMPO", color: "text-red-700" },
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@media print { body * { visibility: hidden !important; } #receipt-printable, #receipt-printable * { visibility: visible !important; } #receipt-printable { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; padding: 32px !important; background: white !important; } .no-print { display: none !important; } }` }} />
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
            {isLoading && <div className="p-8 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>}
            {isError && <div className="p-8 text-center text-red-600"><AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-60" /><p>Gagal memuat kwitansi</p></div>}
            {data && (
              <div id="receipt-printable" className="p-6 font-sans text-slate-800">
                <div className="text-center mb-5">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-2"><Building2 className="w-5 h-5 text-primary" /></div>
                  <h1 className="text-base font-bold uppercase tracking-widest">Mall Admin Portal</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Sistem Manajemen Tenant Mal</p>
                  <div className="my-3 border-t border-dashed border-slate-300" />
                  <h2 className="text-lg font-extrabold uppercase tracking-wider">Kwitansi Pembayaran Tenant</h2>
                </div>
                <div className="bg-slate-50 rounded-lg px-4 py-3 mb-4 space-y-1.5 text-xs">
                  {[["No. Kwitansi", <span className="font-mono font-bold text-primary">{data.receiptNumber}</span>], ["Tanggal", new Date(data.paymentDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })], ["Admin", data.adminName]].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-semibold">{v}</span></div>
                  ))}
                </div>
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Data Tenant</p>
                  <div className="divide-y divide-slate-100 text-xs">
                    {[["Nama Bisnis", data.businessName], ["Pemilik", data.ownerName], ["Booth", data.boothNumber], ["Periode", data.billingPeriod]].map(([k, v]) => (
                      <div key={String(k)} className="flex justify-between py-1.5"><span className="text-slate-500">{k}</span><span className="font-semibold text-right">{v}</span></div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-600">Nominal Dibayar</span>
                    <span className="text-xl font-extrabold text-primary">{formatRupiah(data.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Sisa</span>
                    <span className={cn("text-sm font-bold", data.remainingAmount === 0 ? "text-emerald-600" : "text-amber-600")}>{formatRupiah(data.remainingAmount)}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-primary/20 flex justify-between">
                    <span className="text-xs text-slate-500">Status</span>
                    <span className={cn("text-xs font-bold uppercase", statusLabel[data.paymentStatus]?.color)}>{statusLabel[data.paymentStatus]?.text ?? data.paymentStatus}</span>
                  </div>
                </div>
                <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[10px] text-slate-400">
                  <p>Diterbitkan oleh sistem Mall Admin Portal</p>
                  <p className="mt-0.5">Dicetak: {new Date().toLocaleString("id-ID")}</p>
                </div>
              </div>
            )}
          </div>
          {data && (
            <div className="flex gap-2 px-5 py-3.5 border-t bg-white shrink-0 no-print">
              <Button variant="outline" className="flex-1" onClick={onClose}><X className="w-4 h-4 mr-1.5" />Tutup</Button>
              <Button className="flex-1" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1.5" />Print</Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Modal Pembayaran ─────────────────────────────────────────────────────────

const METODE_OPTIONS: Array<{ value: MetodeBayar; label: string; icon: React.ReactNode }> = [
  { value: "tunai", label: "Cash", icon: <Banknote className="w-4 h-4" /> },
  { value: "transfer", label: "Transfer", icon: <WalletCards className="w-4 h-4" /> },
  { value: "qris", label: "QRIS", icon: <Smartphone className="w-4 h-4" /> },
  { value: "edc", label: "EDC", icon: <Zap className="w-4 h-4" /> },
  { value: "other", label: "Lainnya", icon: <MoreHorizontal className="w-4 h-4" /> },
];

function ModalPembayaran({ unit, onClose, onSuccess }: {
  unit: MallUnit;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [nominal, setNominal] = useState("");
  const [diskon, setDiskon] = useState("0");
  const [denda, setDenda] = useState("0");
  const [metode, setMetode] = useState<MetodeBayar>("tunai");
  const [tanggalBayar, setTanggalBayar] = useState(todayString());
  const [catatan, setCatatan] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<PaymentResponse | null>(null);

  const nominalNum = parseInt(nominal.replace(/\D/g, "")) || 0;
  const diskonNum = parseInt(diskon.replace(/\D/g, "")) || 0;
  const dendaNum = parseInt(denda.replace(/\D/g, "")) || 0;
  const finalBill = unit.totalAmount - diskonNum + dendaNum;
  const sisaSetelah = Math.max(finalBill - unit.paidAmount - nominalNum, 0);
  const isValid = nominalNum > 0 && !!metode;
  const isOverdue = unit.status === "overdue";
  const metodeLabel = METODE_OPTIONS.find(m => m.value === metode)?.label ?? metode;

  const mutation = useMutation<PaymentResponse, Error>({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/tenant-pos/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bookingId: unit.bookingId,
          tenantId: unit.tenantId,
          amountPaid: nominalNum,
          discountAmount: diskonNum,
          penaltyAmount: dendaNum,
          paymentMethod: metode,
          paymentDate: tanggalBayar,
          notes: catatan || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error((data as { error?: string }).error ?? "Gagal");
      return data as PaymentResponse;
    },
    onSuccess: (data) => {
      setResult(data);
      setShowConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["mall-units"] });
      void queryClient.invalidateQueries({ queryKey: ["pos-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["payment-history", unit.bookingId] });
      toast({ title: "Pembayaran Berhasil", description: `${data.receiptNumber} · ${formatRupiah(nominalNum)}` });
      onSuccess();
    },
    onError: (e) => {
      setShowConfirm(false);
      toast({ title: "Pembayaran Gagal", description: e.message, variant: "destructive" });
    },
  });

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold">Pembayaran Berhasil!</h2>
          <p className="text-slate-500 text-sm mt-1">{unit.businessName} · {unit.unitCode}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{formatRupiah(nominalNum)}</p>
          <p className="text-xs text-slate-400 mt-1">via {metodeLabel}</p>
          <p className="text-xs font-mono bg-slate-100 px-3 py-1 rounded-full text-slate-600 mt-1 mb-4">{result.receiptNumber}</p>
          {result.remainingAmount > 0 && (
            <p className="text-sm text-amber-600 font-medium mb-4">Sisa: {formatRupiah(result.remainingAmount)}</p>
          )}
          <div className="flex gap-3 w-full">
            <Button variant="outline" className="flex-1" onClick={onClose}>Tutup</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => {
              const now = new Date();
              cetakStrukPDF({
                noStruk: result.receiptNumber, tanggal: formatTanggal(now), jam: formatJam(now),
                cabang: unit.zone ?? unit.floor, unitId: unit.unitCode, unitNama: unit.businessName ?? unit.unitCode,
                penyewa: unit.businessName ?? "—", kategori: unit.category ?? "—",
                luas: unit.sizeM2 ? `${unit.sizeM2} m²` : "—",
                periodeBayar: unit.periodLabel ?? "—", sewaBulanan: unit.totalAmount,
                jumlahBayar: nominalNum, metodeBayar: metodeLabel, kasir: "Admin",
                status: isOverdue ? "tunggakan" : "lunas",
              });
            }}>
              <Printer className="w-4 h-4 mr-2" />Cetak Struk
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]">
          <div className={cn("px-6 py-4 flex items-center justify-between shrink-0", isOverdue ? "bg-red-600" : "bg-primary")}>
            <div>
              <p className="text-white/70 text-xs">Form Pembayaran</p>
              <h2 className="text-white font-bold text-lg">{unit.businessName ?? unit.unitCode}</h2>
              <p className="text-white/80 text-xs mt-0.5">{unit.unitCode} · {unit.periodLabel ?? "—"}</p>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white" disabled={mutation.isPending}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={e => { e.preventDefault(); if (isValid) setShowConfirm(true); }} className="overflow-y-auto flex-1">
            <div className="p-6 space-y-5">
              <div className={cn("rounded-xl border p-4 space-y-2 text-sm", isOverdue ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200")}>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-slate-400">Unit</p><p className="font-semibold">{unit.unitCode}</p></div>
                  <div><p className="text-xs text-slate-400">Booking ID</p><p className="font-mono font-semibold">#{unit.bookingId}</p></div>
                  <div><p className="text-xs text-slate-400">Periode</p><p className="font-semibold truncate">{unit.periodLabel ?? "—"}</p></div>
                  <div><p className="text-xs text-slate-400">Jatuh Tempo</p><p className="font-semibold">{unit.dueDate ? new Date(unit.dueDate).toLocaleDateString("id-ID") : "—"}</p></div>
                </div>
                <Separator />
                <div className="flex justify-between"><span className="text-slate-500">Total Tagihan</span><span className="font-semibold">{formatRupiah(unit.totalAmount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Sudah Dibayar</span><span className="font-semibold text-emerald-600">{formatRupiah(unit.paidAmount)}</span></div>
                <div className="flex justify-between"><span className="font-semibold">Sisa</span><span className={cn("font-bold", isOverdue ? "text-red-600" : "text-amber-600")}>{formatRupiah(unit.remainingAmount)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Diskon (Rp)</Label>
                  <Input inputMode="numeric" value={diskon} onChange={e => setDiskon(e.target.value)} disabled={mutation.isPending} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Denda (Rp)</Label>
                  <Input inputMode="numeric" value={denda} onChange={e => setDenda(e.target.value)} disabled={mutation.isPending} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Nominal Dibayar (Rp) <span className="text-red-500">*</span></Label>
                <Input
                  inputMode="numeric"
                  placeholder="Masukkan jumlah pembayaran"
                  value={nominal}
                  onChange={e => setNominal(e.target.value)}
                  disabled={mutation.isPending}
                />
                {nominalNum > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sisa setelah bayar: <span className={cn("font-semibold", sisaSetelah === 0 ? "text-emerald-600" : "text-amber-600")}>{formatRupiah(sisaSetelah)}</span>
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label>Metode Pembayaran <span className="text-red-500">*</span></Label>
                <div className="grid grid-cols-5 gap-2">
                  {METODE_OPTIONS.map(m => (
                    <button type="button" key={m.value} onClick={() => setMetode(m.value)} disabled={mutation.isPending}
                      className={cn("flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 px-1 text-[11px] font-medium transition-all",
                        metode === m.value ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:border-slate-300"
                      )}>
                      {m.icon}{m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tanggal Pembayaran</Label>
                <Input type="date" value={tanggalBayar} onChange={e => setTanggalBayar(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Catatan</Label>
                <Input placeholder="Opsional" value={catatan} onChange={e => setCatatan(e.target.value)} disabled={mutation.isPending} />
              </div>
              {mutation.isError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />{mutation.error?.message}
                </div>
              )}
            </div>
          </form>
          <div className="p-4 border-t bg-white shrink-0">
            <Button type="button" className="w-full h-11 text-base font-semibold" onClick={() => { if (isValid) setShowConfirm(true); }} disabled={mutation.isPending || !nominalNum}>
              {mutation.isPending ? "Memproses..." : `Bayar ${nominalNum > 0 ? formatRupiah(nominalNum) : ""}`}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Pembayaran</AlertDialogTitle>
            <AlertDialogDescription>
              Bayar <strong>{formatRupiah(nominalNum)}</strong> via <strong>{metodeLabel}</strong> untuk <strong>{unit.businessName ?? unit.unitCode}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConfirm(false)} disabled={mutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Memproses..." : "Konfirmasi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {(Object.entries(UNIT_STATUS_CONFIG) as [UnitStatus, typeof UNIT_STATUS_CONFIG[UnitStatus]][]).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={cn("w-2.5 h-2.5 rounded-full", cfg.dot)} />
          <span className="text-muted-foreground">{cfg.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantPos() {
  const { data: units, isLoading: unitsLoading, error: unitsError, refetch } = useMallUnits();
  const { data: overview, isLoading: overviewLoading } = useOverview();
  const seedMutation = useSeedUnits();
  const { toast } = useToast();

  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [activeFloor, setActiveFloor] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "all">("all");
  const [searchQ, setSearchQ] = useState("");

  const [payUnit, setPayUnit] = useState<MallUnit | null>(null);
  const [receiptPaymentId, setReceiptPaymentId] = useState<number | null>(null);

  // Floors list
  const floors = useMemo(() => {
    if (!units) return [];
    return Array.from(new Set(units.map(u => u.floor))).sort();
  }, [units]);

  // Set default floor
  useEffect(() => {
    if (floors.length > 0 && activeFloor === "all" && floors.length > 1) {
      // keep "all" if multiple floors; set to first if only one
    }
    if (floors.length === 1) setActiveFloor(floors[0]);
  }, [floors]);

  // Filtered units
  const filteredUnits = useMemo(() => {
    if (!units) return [];
    return units.filter(u => {
      if (activeFloor !== "all" && u.floor !== activeFloor) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        return (
          u.unitCode.toLowerCase().includes(q) ||
          (u.businessName ?? "").toLowerCase().includes(q) ||
          (u.zone ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [units, activeFloor, statusFilter, searchQ]);

  const selectedUnit = useMemo(() => units?.find(u => u.id === selectedUnitId) ?? null, [units, selectedUnitId]);

  // Status counts
  const statusCounts = useMemo(() => {
    if (!units) return {} as Record<string, number>;
    const counts: Record<string, number> = { all: units.length };
    for (const u of units) {
      counts[u.status] = (counts[u.status] ?? 0) + 1;
    }
    return counts;
  }, [units]);

  const isEmpty = !unitsLoading && (!units || units.length === 0);

  const handleSeed = async () => {
    const result = await seedMutation.mutateAsync();
    toast({
      title: result.count > 0 ? `${result.count} unit berhasil ditambahkan` : "Data sudah ada",
      description: result.message,
    });
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4 lg:p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Denah Lantai</h1>
          <p className="text-sm text-muted-foreground">Manajemen unit dan pembayaran tenant</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1.5" />Refresh
          </Button>
          {process.env.NODE_ENV !== "production" && import.meta.env.DEV && (
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={seedMutation.isPending}>
              {seedMutation.isPending ? "Loading..." : "Seed Data"}
            </Button>
          )}
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
        />
      )}
      {receiptPaymentId != null && (
        <ModalReceipt paymentId={receiptPaymentId} onClose={() => setReceiptPaymentId(null)} />
      )}
    </div>
  );
}
