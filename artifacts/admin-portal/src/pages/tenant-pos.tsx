import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Building2, Receipt, X, CheckCircle2, AlertCircle, CircleDashed,
  Clock, Phone, Mail, Calendar, CreditCard, Printer, Banknote,
  Smartphone, WalletCards, TrendingUp, Users, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { cetakStrukPDF, buatNoStruk, formatTanggal, formatJam } from "@/lib/cetak-struk";

// ─── Types ───────────────────────────────────────────────────────────────────

type PaymentStatus = "PAID" | "UNPAID" | "PARTIAL" | "OVERDUE";

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
};

type Overview = {
  totalActiveTenants: number;
  unpaidCount: number;
  overdueCount: number;
  paidTodayAmount: number;
};

// ─── Status Config ────────────────────────────────────────────────────────────

const statusConfig: Record<
  PaymentStatus | "VACANT",
  { label: string; box: string; badge: string; icon: React.ReactNode }
> = {
  PAID: {
    label: "Lunas",
    box: "bg-emerald-50 border-emerald-400 hover:bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-300",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  UNPAID: {
    label: "Belum Bayar",
    box: "bg-amber-50 border-amber-400 hover:bg-amber-100",
    badge: "bg-amber-100 text-amber-700 border-amber-300",
    icon: <Clock className="w-3 h-3" />,
  },
  PARTIAL: {
    label: "Bayar Sebagian",
    box: "bg-blue-50 border-blue-400 hover:bg-blue-100",
    badge: "bg-blue-100 text-blue-700 border-blue-300",
    icon: <AlertCircle className="w-3 h-3" />,
  },
  OVERDUE: {
    label: "Jatuh Tempo",
    box: "bg-red-50 border-red-400 hover:bg-red-100",
    badge: "bg-red-100 text-red-700 border-red-300",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  VACANT: {
    label: "Kosong",
    box: "bg-slate-100 border-slate-300 hover:bg-slate-200",
    badge: "bg-slate-100 text-slate-500 border-slate-300",
    icon: <CircleDashed className="w-3 h-3" />,
  },
};

function resolveStatus(item: FloorPlanItem): PaymentStatus | "VACANT" {
  if (!item.bookingId) return "VACANT";
  return item.paymentStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatTanggalID(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const bookingStatusLabel: Record<string, string> = {
  aktif: "Aktif",
  selesai: "Selesai",
  pending: "Pending",
  batal: "Batal",
};

const bookingStatusBadge: Record<string, string> = {
  aktif: "bg-emerald-100 text-emerald-700 border-emerald-300",
  selesai: "bg-slate-100 text-slate-600 border-slate-300",
  pending: "bg-amber-100 text-amber-700 border-amber-300",
  batal: "bg-red-100 text-red-600 border-red-300",
};

// ─── Fetch hooks ─────────────────────────────────────────────────────────────

function useOverview() {
  return useQuery<Overview>({
    queryKey: ["tenant-pos-overview"],
    queryFn: () => fetch("/api/tenant-pos/overview").then((r) => r.json()),
    refetchInterval: 30_000,
  });
}

function useFloorPlan() {
  return useQuery<FloorPlanItem[]>({
    queryKey: ["tenant-pos-floor-plan"],
    queryFn: () => fetch("/api/tenant-pos/floor-plan").then((r) => r.json()),
    refetchInterval: 30_000,
  });
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ overview, loading }: { overview?: Overview; loading: boolean }) {
  const cards = [
    {
      label: "Total Tenant Aktif",
      value: loading ? null : String(overview?.totalActiveTenants ?? 0),
      sub: "tenant terdaftar",
      icon: <Users className="w-5 h-5 text-blue-500" />,
      color: "border-blue-200 bg-blue-50/40",
      valueColor: "text-blue-700",
    },
    {
      label: "Tagihan Belum Lunas",
      value: loading ? null : String(overview?.unpaidCount ?? 0),
      sub: "tagihan pending",
      icon: <Clock className="w-5 h-5 text-amber-500" />,
      color: "border-amber-200 bg-amber-50/40",
      valueColor: "text-amber-700",
    },
    {
      label: "Pembayaran Hari Ini",
      value: loading ? null : formatRupiah(overview?.paidTodayAmount ?? 0),
      sub: "total terkumpul",
      icon: <TrendingUp className="w-5 h-5 text-emerald-500" />,
      color: "border-emerald-200 bg-emerald-50/40",
      valueColor: "text-emerald-700",
    },
    {
      label: "Overdue",
      value: loading ? null : String(overview?.overdueCount ?? 0),
      sub: "tagihan jatuh tempo",
      icon: <AlertTriangle className="w-5 h-5 text-red-500" />,
      color: "border-red-200 bg-red-50/40",
      valueColor: "text-red-700",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className={cn("border", c.color)}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {c.label}
              </p>
              {c.icon}
            </div>
            {loading ? (
              <Skeleton className="h-7 w-24 mb-1" />
            ) : (
              <p className={cn("text-2xl font-bold tracking-tight", c.valueColor)}>
                {c.value}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Booth Card ───────────────────────────────────────────────────────────────

function BoothCard({
  item,
  selected,
  onClick,
}: {
  item: FloorPlanItem;
  selected: boolean;
  onClick: () => void;
}) {
  const status = resolveStatus(item);
  const cfg = statusConfig[status];

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-xl border-2 p-3 text-left transition-all duration-150 cursor-pointer select-none w-full",
        cfg.box,
        selected && "ring-2 ring-offset-2 ring-primary scale-[1.02] shadow-md z-10"
      )}
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide leading-none">
          {item.boothNumber}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0",
            cfg.badge
          )}
        >
          {cfg.icon}
          {cfg.label}
        </span>
      </div>

      <p className="text-sm font-semibold leading-tight text-slate-800 truncate">
        {status === "VACANT" ? (
          <span className="text-slate-400 italic text-xs">Kosong</span>
        ) : (
          item.businessName
        )}
      </p>

      {status !== "VACANT" && item.bookingId && (
        <div className="mt-1.5 space-y-0.5">
          {item.periodLabel && (
            <p className="text-[11px] text-slate-500 truncate">{item.periodLabel}</p>
          )}
          <p
            className={cn(
              "text-xs font-semibold",
              status === "PAID"
                ? "text-emerald-600"
                : status === "OVERDUE"
                ? "text-red-600"
                : status === "PARTIAL"
                ? "text-blue-600"
                : "text-amber-600"
            )}
          >
            {status === "PAID"
              ? "✓ Lunas"
              : `Sisa ${formatRupiah(item.remainingAmount)}`}
          </p>
        </div>
      )}
    </button>
  );
}

// ─── Floor Plan Component ─────────────────────────────────────────────────────

function TenantFloorPlan({
  items,
  selected,
  onSelect,
}: {
  items: FloorPlanItem[];
  selected: FloorPlanItem | null;
  onSelect: (item: FloorPlanItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-10 text-muted-foreground">
        <Building2 className="w-12 h-12 mb-4 opacity-25" />
        <p className="text-base font-medium">Belum ada data tenant</p>
        <p className="text-sm mt-1">Tambahkan tenant terlebih dahulu untuk melihat denah.</p>
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
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              {area}
            </h3>
            <span className="text-xs text-muted-foreground">({areaItems.length} unit)</span>
            <div className="flex-1 h-px bg-slate-200 ml-1" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {areaItems.map((item) => (
              <BoothCard
                key={item.id}
                item={item}
                selected={selected?.id === item.id}
                onClick={() => onSelect(item)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Floor Plan Skeleton ──────────────────────────────────────────────────────

function FloorPlanSkeleton() {
  return (
    <div className="h-full p-4 space-y-6">
      {[1, 2].map((g) => (
        <div key={g}>
          <Skeleton className="h-4 w-36 mb-3" />
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px] rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function StatusLegend() {
  const items: Array<{ status: PaymentStatus | "VACANT"; label: string }> = [
    { status: "PAID", label: "Lunas" },
    { status: "UNPAID", label: "Belum Bayar" },
    { status: "PARTIAL", label: "Sebagian" },
    { status: "OVERDUE", label: "Jatuh Tempo" },
    { status: "VACANT", label: "Kosong" },
  ];
  const colorMap: Record<string, string> = {
    PAID: "bg-emerald-400",
    UNPAID: "bg-amber-400",
    PARTIAL: "bg-blue-400",
    OVERDUE: "bg-red-400",
    VACANT: "bg-slate-300",
  };
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {items.map(({ status, label }) => (
        <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("w-2.5 h-2.5 rounded-sm inline-block border", colorMap[status])} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 leading-5">{label}</span>
      <span className={cn("text-xs font-medium text-right leading-5 break-all", valueClass)}>
        {value}
      </span>
    </div>
  );
}

function DetailPanel({
  item,
  onClose,
  onProses,
  onCetak,
}: {
  item: FloorPlanItem | null;
  onClose: () => void;
  onProses: (item: FloorPlanItem) => void;
  onCetak: (item: FloorPlanItem) => void;
}) {
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
  const hasPaid = item.paidAmount > 0;
  const canPay = !isVacant && item.bookingId !== null && status !== "PAID";
  const canPrint = !isVacant && item.bookingId !== null && status === "PAID";

  const billingBg =
    status === "OVERDUE"
      ? "bg-red-50 border-red-200"
      : status === "PAID"
      ? "bg-emerald-50 border-emerald-200"
      : status === "PARTIAL"
      ? "bg-blue-50 border-blue-200"
      : "bg-amber-50 border-amber-200";

  const remainingColor =
    status === "PAID"
      ? "text-emerald-700"
      : status === "OVERDUE"
      ? "text-red-600"
      : status === "PARTIAL"
      ? "text-blue-600"
      : "text-amber-600";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b bg-slate-50/60">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">
              {item.boothNumber}{item.areaName ? ` · ${item.areaName}` : ""}
            </p>
            <h3 className="font-bold text-sm leading-tight mt-0.5">
              {isVacant ? "Unit Kosong" : item.businessName}
            </h3>
            {!isVacant && (
              <p className="text-xs text-muted-foreground mt-0.5">{item.ownerName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium",
              cfg.badge
            )}
          >
            {cfg.icon}
            Pembayaran: {cfg.label}
          </span>
          {!isVacant && item.bookingStatus && (
            <span
              className={cn(
                "inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border font-medium",
                bookingStatusBadge[item.bookingStatus] ?? "bg-slate-100 text-slate-600 border-slate-300"
              )}
            >
              Booking: {bookingStatusLabel[item.bookingStatus] ?? item.bookingStatus}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isVacant ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
            <CircleDashed className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Unit Belum Tersewa</p>
            <p className="text-xs mt-1">Unit ini tersedia untuk disewakan</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">

            {/* Info Bisnis */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Info Bisnis &amp; Penyewa
              </p>
              <div className="bg-muted/30 rounded-lg px-3 divide-y divide-border/60">
                <DetailRow label="Nama Bisnis" value={item.businessName} />
                <DetailRow label="Nama Owner" value={item.ownerName} />
                {item.email && (
                  <DetailRow
                    label="Email"
                    value={
                      <span className="flex items-center gap-1 justify-end">
                        <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                        {item.email}
                      </span>
                    }
                  />
                )}
                {item.phone && (
                  <DetailRow
                    label="No. WA / Telp"
                    value={
                      <span className="flex items-center gap-1 justify-end">
                        <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                        {item.phone}
                      </span>
                    }
                  />
                )}
                <DetailRow label="Kategori" value={item.category ?? "—"} />
              </div>
            </div>

            {/* Info Booth */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Info Booth / Lapak
              </p>
              <div className="bg-muted/30 rounded-lg px-3 divide-y divide-border/60">
                <DetailRow label="Nomor Booth" value={item.boothNumber} />
                {item.areaName && (
                  <DetailRow label="Area / Zona" value={item.areaName} />
                )}
              </div>
            </div>

            {/* Info Sewa */}
            {item.bookingId && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Periode Sewa
                </p>
                <div className="bg-muted/30 rounded-lg px-3 divide-y divide-border/60">
                  <DetailRow
                    label="Tanggal Mulai"
                    value={
                      <span className="flex items-center gap-1 justify-end">
                        <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                        {formatTanggalID(item.startDate)}
                      </span>
                    }
                  />
                  <DetailRow
                    label="Tanggal Akhir"
                    value={
                      <span className="flex items-center gap-1 justify-end">
                        <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                        {formatTanggalID(item.endDate)}
                      </span>
                    }
                  />
                  <DetailRow
                    label="Status Booking"
                    value={
                      <span
                        className={cn(
                          "inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border font-medium",
                          bookingStatusBadge[item.bookingStatus] ?? "bg-slate-100 text-slate-600 border-slate-300"
                        )}
                      >
                        {bookingStatusLabel[item.bookingStatus] ?? item.bookingStatus}
                      </span>
                    }
                  />
                </div>
              </div>
            )}

            {/* Detail Tagihan */}
            {item.bookingId && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Detail Tagihan
                </p>
                <div className={cn("rounded-lg border px-3 divide-y divide-border/60", billingBg)}>
                  {item.periodLabel && (
                    <DetailRow label="Periode" value={item.periodLabel} />
                  )}
                  <DetailRow
                    label="Status Pembayaran"
                    value={
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium",
                          cfg.badge
                        )}
                      >
                        {cfg.icon} {cfg.label}
                      </span>
                    }
                  />
                  <DetailRow
                    label="Total Tagihan"
                    value={formatRupiah(item.totalAmount)}
                    valueClass="font-semibold"
                  />
                  <DetailRow
                    label="Sudah Dibayar"
                    value={hasPaid ? formatRupiah(item.paidAmount) : "Belum ada"}
                    valueClass={hasPaid ? "text-emerald-700" : "text-muted-foreground"}
                  />
                  <div className="py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Sisa Pembayaran</span>
                      <span className={cn("text-sm font-bold", remainingColor)}>
                        {formatRupiah(item.remainingAmount)}
                      </span>
                    </div>
                  </div>
                  {item.dueDate && (
                    <DetailRow
                      label="Jatuh Tempo"
                      value={
                        <span className={cn(
                          "flex items-center gap-1 justify-end",
                          status === "OVERDUE" ? "text-red-600 font-semibold" : ""
                        )}>
                          <Clock className="w-3 h-3 shrink-0" />
                          {formatTanggalID(item.dueDate)}
                        </span>
                      }
                    />
                  )}
                </div>
              </div>
            )}

            {/* Tombol Aksi */}
            {item.bookingId && (
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  className={cn(
                    "w-full",
                    !canPay && "hidden",
                    status === "OVERDUE" && "bg-red-600 hover:bg-red-700 text-white"
                  )}
                  size="sm"
                  onClick={() => onProses(item)}
                  disabled={!canPay}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Bayar Sekarang
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  size="sm"
                  disabled
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Lihat Riwayat
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  size="sm"
                  onClick={() => canPrint && onCetak(item)}
                  disabled={!canPrint}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Cetak Receipt
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal Pembayaran ─────────────────────────────────────────────────────────

type MetodeBayar = "tunai" | "transfer" | "qris";

interface PaymentResult {
  payment: { id: number; amount: number; paymentMethod: MetodeBayar; paidAt: string };
  booking: { paidAmount: number; paymentStatus: string };
  remainingAmount: number;
}

async function postPembayaran(body: {
  bookingId: number;
  amount: number;
  paymentMethod: MetodeBayar;
  notes?: string;
}): Promise<PaymentResult> {
  const res = await fetch("/api/tenant-pos/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Gagal memproses pembayaran");
  return data;
}

function ModalPembayaran({
  item,
  onClose,
  onSuccess,
}: {
  item: FloorPlanItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [metode, setMetode] = useState<MetodeBayar>("tunai");
  const [noStruk] = useState(() => buatNoStruk());
  const [paidAt, setPaidAt] = useState<Date | null>(null);

  const metodeLabel: Record<MetodeBayar, string> = {
    tunai: "Tunai",
    transfer: "Transfer Bank",
    qris: "QRIS",
  };

  const mutation = useMutation<PaymentResult, Error, void>({
    mutationFn: () =>
      postPembayaran({
        bookingId: item.bookingId!,
        amount: item.remainingAmount,
        paymentMethod: metode,
      }),
    onSuccess: () => {
      setPaidAt(new Date());
    },
  });

  const handleCetak = () => {
    const now = paidAt ?? new Date();
    cetakStrukPDF({
      noStruk,
      tanggal: formatTanggal(now),
      jam: formatJam(now),
      cabang: item.areaName,
      unitId: item.boothNumber,
      unitNama: item.businessName,
      penyewa: item.businessName,
      kategori: item.category ?? "—",
      luas: "—",
      periodeBayar: item.periodLabel ?? "—",
      sewaBulanan: item.totalAmount,
      jumlahBayar: item.remainingAmount,
      metodeBayar: metodeLabel[metode],
      kasir: "Admin",
      status: item.paymentStatus === "OVERDUE" ? "tunggakan" : "lunas",
    });
  };

  const selesai = mutation.isSuccess;
  const isOverdue = item.paymentStatus === "OVERDUE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {!selesai ? (
          <>
            <div
              className={cn(
                "px-6 py-4 flex items-center justify-between",
                isOverdue ? "bg-red-600" : "bg-primary"
              )}
            >
              <div>
                <p className="text-white/70 text-xs">Konfirmasi Pembayaran</p>
                <h2 className="text-white font-bold text-lg leading-tight">
                  {item.businessName}
                </h2>
                <p className="text-white/80 text-xs mt-0.5">
                  {item.boothNumber} · {item.areaName}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-white/70 hover:text-white"
                disabled={mutation.isPending}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div
                className={cn(
                  "rounded-xl border p-4 space-y-2",
                  isOverdue ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"
                )}
              >
                {item.periodLabel && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Periode</span>
                    <span className="font-medium">{item.periodLabel}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Tagihan</span>
                  <span className="font-medium">{formatRupiah(item.totalAmount)}</span>
                </div>
                {item.paidAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Sudah Dibayar</span>
                    <span className="font-medium text-emerald-600">
                      {formatRupiah(item.paidAmount)}
                    </span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="font-semibold">Total Bayar</span>
                  <span
                    className={cn(
                      "font-bold text-xl",
                      isOverdue ? "text-red-600" : "text-slate-900"
                    )}
                  >
                    {formatRupiah(item.remainingAmount)}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Metode Pembayaran
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(["tunai", "transfer", "qris"] as MetodeBayar[]).map((m) => {
                    const icons = {
                      tunai: <Banknote className="w-5 h-5" />,
                      transfer: <WalletCards className="w-5 h-5" />,
                      qris: <Smartphone className="w-5 h-5" />,
                    };
                    return (
                      <button
                        key={m}
                        onClick={() => setMetode(m)}
                        disabled={mutation.isPending}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 px-2 text-xs font-medium transition-all",
                          metode === m
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-slate-200 text-slate-500 hover:border-slate-300",
                          mutation.isPending && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {icons[m]}
                        {metodeLabel[m]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {mutation.isError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {mutation.error.message}
                </div>
              )}

              <Button
                className="w-full h-11 text-base font-semibold"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <>
                    <span className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Proses Pembayaran · {metodeLabel[metode]}
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Pembayaran Berhasil!</h2>
            <p className="text-slate-500 text-sm mt-1 mb-1">
              {item.businessName} · {item.periodLabel ?? "—"}
            </p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {formatRupiah(item.remainingAmount)}
            </p>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              via {metodeLabel[metode]} · {noStruk}
            </p>
            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
              >
                Tutup
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleCetak}
              >
                <Printer className="w-4 h-4 mr-2" />
                Cetak Struk PDF
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Browser akan membuka dialog cetak. Pilih "Save as PDF" untuk simpan.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantPos() {
  const [selected, setSelected] = useState<FloorPlanItem | null>(null);
  const [modalItem, setModalItem] = useState<FloorPlanItem | null>(null);

  const overview = useOverview();
  const floorPlan = useFloorPlan();

  const handleSelect = (item: FloorPlanItem) => {
    setSelected((prev) => (prev?.id === item.id ? null : item));
  };

  const handleCetak = (item: FloorPlanItem) => {
    const now = new Date();
    cetakStrukPDF({
      noStruk: buatNoStruk(),
      tanggal: formatTanggal(now),
      jam: formatJam(now),
      cabang: item.areaName,
      unitId: item.boothNumber,
      unitNama: item.businessName,
      penyewa: item.businessName,
      kategori: item.category ?? "—",
      luas: "—",
      periodeBayar: item.periodLabel ?? "—",
      sewaBulanan: item.totalAmount,
      jumlahBayar: item.remainingAmount,
      metodeBayar: "—",
      kasir: "Admin",
      status: item.paymentStatus === "OVERDUE" ? "tunggakan" : "lunas",
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">POS Tenant</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Klik unit pada denah untuk melihat detail pembayaran
          </p>
        </div>
        <StatusLegend />
      </div>

      <SummaryCards overview={overview.data} loading={overview.isLoading} />

      <div className="flex flex-1 gap-4 min-h-0">
        <Card className="flex-1 min-w-0 overflow-hidden">
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-semibold text-slate-700">Denah Tenant</CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-[calc(100%-3rem)]">
            {floorPlan.isLoading ? (
              <FloorPlanSkeleton />
            ) : floorPlan.isError ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-10 text-destructive">
                <AlertTriangle className="w-10 h-10 mb-3 opacity-60" />
                <p className="font-medium">Gagal memuat data denah</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => floorPlan.refetch()}
                >
                  Coba Lagi
                </Button>
              </div>
            ) : (
              <TenantFloorPlan
                items={floorPlan.data ?? []}
                selected={selected}
                onSelect={handleSelect}
              />
            )}
          </CardContent>
        </Card>

        <Card className="w-80 flex-shrink-0 overflow-hidden">
          <CardContent className="p-0 h-full">
            <DetailPanel
              item={selected}
              onClose={() => setSelected(null)}
              onProses={setModalItem}
              onCetak={handleCetak}
            />
          </CardContent>
        </Card>
      </div>

      {modalItem && (
        <ModalPembayaran
          item={modalItem}
          onClose={() => setModalItem(null)}
          onSuccess={() => {
            floorPlan.refetch();
            overview.refetch();
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
