import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Receipt, X, CheckCircle2, AlertCircle, CircleDashed,
  Clock, Phone, Mail, Calendar, CreditCard, Printer, Banknote,
  Smartphone, WalletCards, TrendingUp, Users, AlertTriangle, Zap,
  MoreHorizontal,
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
};

type Overview = {
  totalActiveTenants: number;
  unpaidCount: number;
  overdueCount: number;
  paidTodayAmount: number;
};

type PaymentResponse = {
  success: boolean;
  payment: { id: number; amount: number; paymentMethod: MetodeBayar; paidAt: string };
  receiptNumber: string;
  paymentStatus: string;
  paidAmount: number;
  remainingAmount: number;
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

const METODE_LABEL: Record<MetodeBayar, string> = {
  tunai: "Cash",
  transfer: "Transfer",
  qris: "QRIS",
  edc: "EDC",
  other: "Lainnya",
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
function todayString() {
  return new Date().toISOString().slice(0, 10);
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Fetch hooks ──────────────────────────────────────────────────────────────
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

// ─── Fetch hooks ──────────────────────────────────────────────────────────

function useOverview() {
  return useQuery<Overview>({
    queryKey: ["tenant-pos-overview"],
    queryFn: () => fetch(`${BASE}/api/tenant-pos/overview`).then((r) => r.json()),
    refetchInterval: 30_000,
  });
}

function useFloorPlan() {
  return useQuery<FloorPlanItem[]>({
    queryKey: ["tenant-pos-floor-plan"],
    queryFn: () => fetch(`${BASE}/api/tenant-pos/floor-plan`).then((r) => r.json()),
    refetchInterval: 30_000,
  });
}

function usePaymentHistory(bookingId: number | null) {
  return useQuery<PaymentHistoryItem[]>({
    queryKey: ["payment-history", bookingId],
    queryFn: () =>
      fetch(`${BASE}/api/tenant-pos/bookings/${bookingId}/payments`).then((r) => r.json()),
    enabled: bookingId !== null,
  });
}

function useReceiptData(paymentId: number | null) {
  return useQuery<ReceiptData>({
    queryKey: ["receipt", paymentId],
    queryFn: () =>
      fetch(`${BASE}/api/tenant-pos/payments/${paymentId}/receipt`).then((r) => {
        if (!r.ok) throw new Error("Gagal mengambil data receipt");
        return r.json();
      }),
    enabled: paymentId !== null,
  });
}

// ─── Modal Receipt / Kwitansi ─────────────────────────────────────────────────

function ModalReceipt({
  paymentId,
  onClose,
}: {
  paymentId: number;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useReceiptData(paymentId);

  const handlePrint = () => {
    window.print();
  };

  const metodeLabel: Record<string, string> = {
    tunai: "Cash / Tunai",
    transfer: "Transfer Bank",
    qris: "QRIS",
    edc: "EDC / Kartu Debit",
    other: "Lainnya",
  };

  const statusLabel: Record<string, { text: string; color: string }> = {
    PAID: { text: "LUNAS", color: "text-emerald-700" },
    PARTIAL: { text: "BAYAR SEBAGIAN", color: "text-blue-700" },
    UNPAID: { text: "BELUM BAYAR", color: "text-amber-700" },
    OVERDUE: { text: "JATUH TEMPO", color: "text-red-700" },
  };

  return (
    <>
      {/* Print Styles — hanya aktif saat window.print() */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #receipt-printable, #receipt-printable * { visibility: visible !important; }
          #receipt-printable {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important;
            padding: 32px !important;
            box-sizing: border-box !important;
            background: white !important;
          }
          .no-print { display: none !important; }
        }
      `}} />

      {/* Overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm no-print">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[90vh]">

          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-slate-50 shrink-0 no-print">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-sm text-slate-700">Kwitansi Pembayaran</span>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="p-8 space-y-3">
                <Skeleton className="h-6 w-48 mx-auto" />
                <Skeleton className="h-4 w-64 mx-auto" />
                <Skeleton className="h-px w-full" />
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
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
                {/* Header Kwitansi */}
                <div className="text-center mb-5">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-2">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <h1 className="text-base font-bold uppercase tracking-widest text-slate-800">Mall Admin Portal</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Sistem Manajemen Tenant Mal</p>
                  <div className="my-3 border-t border-dashed border-slate-300" />
                  <h2 className="text-lg font-extrabold uppercase tracking-wider text-slate-900">
                    Kwitansi Pembayaran Tenant
                  </h2>
                </div>

                {/* Receipt Meta */}
                <div className="bg-slate-50 rounded-lg px-4 py-3 mb-4 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">No. Kwitansi</span>
                    <span className="font-mono font-bold text-primary">{data.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Tanggal Bayar</span>
                    <span className="font-semibold">
                      {new Date(data.paymentDate).toLocaleDateString("id-ID", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </span>
                  </div>
                  {data.adminName && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Admin</span>
                      <span className="font-semibold">{data.adminName}</span>
                    </div>
                  )}
                </div>

                {/* Info Tenant */}
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Data Tenant</p>
                  <div className="divide-y divide-slate-100 text-xs">
                    {[
                      ["Nama Bisnis", data.businessName],
                      ["Nama Pemilik", data.ownerName],
                      ["Booth / Lapak", data.boothNumber],
                      ["Periode Sewa", data.billingPeriod],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between py-1.5">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-semibold text-right max-w-[60%]">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rincian Pembayaran */}
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Rincian Pembayaran</p>
                  <div className="divide-y divide-slate-100 text-xs">
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-500">Total Tagihan</span>
                      <span className="font-semibold">{formatRupiah(data.totalAmount)}</span>
                    </div>
                    {data.discountAmount > 0 && (
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">Diskon</span>
                        <span className="font-semibold text-emerald-600">− {formatRupiah(data.discountAmount)}</span>
                      </div>
                    )}
                    {data.penaltyAmount > 0 && (
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">Denda</span>
                        <span className="font-semibold text-red-600">+ {formatRupiah(data.penaltyAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-500">Metode Bayar</span>
                      <span className="font-semibold">{metodeLabel[data.paymentMethod] ?? data.paymentMethod}</span>
                    </div>
                  </div>
                </div>

                {/* Nominal Dibayar */}
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-600">Nominal Dibayar</span>
                    <span className="text-xl font-extrabold text-primary">{formatRupiah(data.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Sisa Pembayaran</span>
                    <span className={cn("text-sm font-bold", data.remainingAmount === 0 ? "text-emerald-600" : "text-amber-600")}>
                      {formatRupiah(data.remainingAmount)}
                    </span>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-primary/20 flex justify-between items-center">
                    <span className="text-xs text-slate-500">Status Pembayaran</span>
                    <span className={cn("text-xs font-bold uppercase", statusLabel[data.paymentStatus]?.color ?? "text-slate-700")}>
                      {statusLabel[data.paymentStatus]?.text ?? data.paymentStatus}
                    </span>
                  </div>
                </div>

                {/* Catatan */}
                {data.notes && (
                  <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                    <span className="font-semibold">Catatan: </span>{data.notes}
                  </div>
                )}

                {/* Footer */}
                <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[10px] text-slate-400">
                  <p>Kwitansi ini diterbitkan oleh sistem Mall Admin Portal</p>
                  <p className="mt-0.5">Dicetak pada: {new Date().toLocaleString("id-ID")}</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Tombol */}
          {data && (
            <div className="flex gap-2 px-5 py-3.5 border-t bg-white shrink-0 no-print">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                <X className="w-4 h-4 mr-1.5" />
                Tutup
              </Button>
              <Button className="flex-1 bg-primary" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-1.5" />
                Print
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
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
  item, selected, onClick,
}: {
  item: FloorPlanItem; selected: boolean; onClick: () => void;
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
          <p className={cn("text-xs font-semibold",
            status === "PAID" ? "text-emerald-600" : status === "OVERDUE" ? "text-red-600" : status === "PARTIAL" ? "text-blue-600" : "text-amber-600"
          )}>
            {status === "PAID" ? "✓ Lunas" : `Sisa ${formatRupiah(item.remainingAmount)}`}
          </p>
        </div>
      )}
    </button>
  );
}

// ─── Floor Plan Component ─────────────────────────────────────────────────────

function TenantFloorPlan({ items: rawItems, selected, onSelect }: {
  items: FloorPlanItem[]; selected: FloorPlanItem | null; onSelect: (item: FloorPlanItem) => void;
}) {
  const items = Array.isArray(rawItems) ? rawItems : [];
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
    PAID: "bg-emerald-400", UNPAID: "bg-amber-400", PARTIAL: "bg-blue-400",
    OVERDUE: "bg-red-400", VACANT: "bg-slate-300",
  };
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {items.map(({ status, label }) => (
        <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("w-2.5 h-2.5 rounded-sm inline-block border", colorMap[status])} />{label}
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
  const paymentHistory = usePaymentHistory(item?.bookingId ?? null);
  const [receiptPaymentId, setReceiptPaymentId] = useState<number | null>(null);

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
      {receiptPaymentId !== null && (
        <ModalReceipt
          paymentId={receiptPaymentId}
          onClose={() => setReceiptPaymentId(null)}
        />
      )}
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
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Info Penyewa</p>
              <div className="space-y-2 text-sm">
                {item.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span>{item.phone}</span></div>}
                {item.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="truncate">{item.email}</span></div>}
                {(item.startDate || item.endDate) && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{item.startDate ?? "?"} — {item.endDate ?? "?"}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Info Bisnis & Penyewa */}
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
              </div>
            )}

            {/* Riwayat Pembayaran */}
            {item.bookingId && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Riwayat Pembayaran
                </p>
                {paymentHistory.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full rounded-lg" />
                    <Skeleton className="h-14 w-full rounded-lg" />
                  </div>
                ) : Array.isArray(paymentHistory.data) && paymentHistory.data.length > 0 ? (
                  <div className="space-y-2">
                    {paymentHistory.data.map((p) => {
                      const tgl = new Date(p.paymentDate);
                      return (
                        <div key={p.id} className="rounded-lg border bg-muted/20 px-3 py-2.5 text-xs space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground truncate">
                              {p.receiptNumber ?? `#${p.id}`}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-emerald-100 text-emerald-700 border-emerald-300 shrink-0">
                              <CheckCircle2 className="w-2.5 h-2.5" />Lunas
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <div>
                              <p className="text-muted-foreground">Tanggal</p>
                              <p className="font-medium">{tgl.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Metode</p>
                              <p className="font-medium">{METODE_LABEL[p.paymentMethod] ?? p.paymentMethod}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-muted-foreground">Nominal</p>
                              <p className="font-bold text-emerald-700">{formatRupiah(p.amountPaid)}</p>
                            </div>
                            {p.discountAmount > 0 && (
                              <div>
                                <p className="text-muted-foreground">Diskon</p>
                                <p className="font-medium text-blue-600">{formatRupiah(p.discountAmount)}</p>
                              </div>
                            )}
                            {p.penaltyAmount > 0 && (
                              <div>
                                <p className="text-muted-foreground">Denda</p>
                                <p className="font-medium text-red-600">{formatRupiah(p.penaltyAmount)}</p>
                              </div>
                            )}
                          </div>
                          {p.notes && (
                            <p className="text-muted-foreground italic">&ldquo;{p.notes}&rdquo;</p>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-xs"
                            onClick={() => setReceiptPaymentId(p.id)}
                          >
                            <Printer className="w-3 h-3 mr-1.5" />
                            Cetak Receipt
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-xs">
                    <Receipt className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                    Belum ada riwayat pembayaran.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal Pembayaran ─────────────────────────────────────────────────────────

const METODE_OPTIONS: Array<{ value: MetodeBayar; label: string; icon: React.ReactNode }> = [
  { value: "tunai",    label: "Cash",     icon: <Banknote className="w-4 h-4" /> },
  { value: "transfer", label: "Transfer", icon: <WalletCards className="w-4 h-4" /> },
  { value: "qris",     label: "QRIS",     icon: <Smartphone className="w-4 h-4" /> },
  { value: "edc",      label: "EDC",      icon: <Zap className="w-4 h-4" /> },
  { value: "other",    label: "Lainnya",  icon: <MoreHorizontal className="w-4 h-4" /> },
];

function ModalPembayaran({ item, onClose, onSuccess }: {
  item: FloorPlanItem;
  onClose: () => void;
  onSuccess: (updatedItem: { paidAmount: number; remainingAmount: number; paymentStatus: string }) => void;
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

  // Computed values
  const nominalNum  = parseInt(nominal.replace(/\D/g, "")) || 0;
  const diskonNum   = parseInt(diskon.replace(/\D/g, ""))  || 0;
  const dendaNum    = parseInt(denda.replace(/\D/g, ""))   || 0;
  const finalBill   = item.totalAmount - diskonNum + dendaNum;
  const sisaSetelah = Math.max(finalBill - item.paidAmount - nominalNum, 0);

  // Validation
  const errNominal = nominalNum <= 0 ? "Nominal harus lebih dari 0" : "";
  const errMetode  = !metode ? "Pilih metode pembayaran" : "";
  const isValid    = !errNominal && !errMetode;

  const mutation = useMutation<PaymentResponse, Error>({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/tenant-pos/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: item.bookingId,
          tenantId: item.tenantId,
          amountPaid: nominalNum,
          discountAmount: diskonNum,
          penaltyAmount: dendaNum,
          paymentMethod: metode,
          paymentDate: tanggalBayar,
          notes: catatan || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Gagal memproses pembayaran");
      return data as PaymentResponse;
    },
    onSuccess: (data) => {
      setResult(data);
      setShowConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["tenant-pos-floor-plan"] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-pos-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["payment-history", item.bookingId] });
      toast({
        title: "Pembayaran Berhasil",
        description: `Kuitansi ${data.receiptNumber} · ${formatRupiah(nominalNum)} tersimpan.`,
      });
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

  const isOverdue = item.paymentStatus === "OVERDUE";
  const metodeLabel = METODE_OPTIONS.find(m => m.value === metode)?.label ?? metode;

  // ── Sukses screen ──
  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Pembayaran Berhasil!</h2>
          <p className="text-slate-500 text-sm mt-1">{item.businessName} · {item.periodLabel ?? "—"}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{formatRupiah(nominalNum)}</p>
          <p className="text-xs text-slate-400 mt-1 mb-1">via {metodeLabel}</p>
          <p className="text-xs font-mono bg-slate-100 px-3 py-1 rounded-full text-slate-600 mb-6">
            {result.receiptNumber}
          </p>
          {result.remainingAmount > 0 && (
            <p className="text-sm text-amber-600 font-medium mb-4">
              Sisa tagihan: {formatRupiah(result.remainingAmount)}
            </p>
          )}
          <div className="flex gap-3 w-full">
            <Button variant="outline" className="flex-1" onClick={onClose}>Tutup</Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
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
                  periodeBayar: item.periodLabel ?? "—",
                  sewaBulanan: item.totalAmount,
                  jumlahBayar: nominalNum,
                  metodeBayar: metodeLabel,
                  kasir: "Admin",
                  status: isOverdue ? "tunggakan" : "lunas",
                });
              }}
            >
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

          {/* Header */}
          <div className={cn("px-6 py-4 flex items-center justify-between shrink-0",
            isOverdue ? "bg-red-600" : "bg-primary")}>
            <div>
              <p className="text-white/70 text-xs">Form Pembayaran</p>
              <h2 className="text-white font-bold text-lg leading-tight">{item.businessName}</h2>
              <p className="text-white/80 text-xs mt-0.5">{item.boothNumber} · {item.areaName}</p>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white" disabled={mutation.isPending}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleClickBayar} className="overflow-y-auto flex-1">
            <div className="p-6 space-y-5">

              {/* Info Readonly */}
              <div className={cn("rounded-xl border p-4 space-y-2 text-sm",
                isOverdue ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200")}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div>
                    <p className="text-xs text-slate-400">Nama Tenant</p>
                    <p className="font-semibold truncate">{item.businessName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Booking ID</p>
                    <p className="font-semibold font-mono">#{item.bookingId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Nomor Booth</p>
                    <p className="font-semibold">{item.boothNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Periode</p>
                    <p className="font-semibold truncate">{item.periodLabel ?? "—"}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Tagihan</span>
                  <span className="font-semibold">{formatRupiah(item.totalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sudah Dibayar</span>
                  <span className="font-semibold text-emerald-600">{formatRupiah(item.paidAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Sisa Pembayaran</span>
                  <span className={cn("font-bold", isOverdue ? "text-red-600" : "text-amber-600")}>
                    {formatRupiah(item.remainingAmount)}
                  </span>
                </div>
              </div>

              {/* Diskon & Denda */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="diskon">Diskon (Rp)</Label>
                  <Input
                    id="diskon"
                    inputMode="numeric"
                    value={diskon}
                    onChange={e => setDiskon(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="denda">Denda (Rp)</Label>
                  <Input
                    id="denda"
                    inputMode="numeric"
                    value={denda}
                    onChange={e => setDenda(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
              </div>

              {/* Nominal */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nominal">
                  Nominal Dibayar (Rp) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nominal"
                  inputMode="numeric"
                  placeholder="Masukkan jumlah pembayaran"
                  value={nominal}
                  onChange={e => setNominal(e.target.value)}
                  disabled={mutation.isPending}
                  className={nominal && errNominal ? "border-red-400" : ""}
                />
                {nominal && errNominal && (
                  <p className="text-xs text-red-500">{errNominal}</p>
                )}
                {nominalNum > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sisa setelah bayar: <span className={cn("font-semibold", sisaSetelah === 0 ? "text-emerald-600" : "text-amber-600")}>
                      {formatRupiah(sisaSetelah)}
                    </span>
                  </p>
                )}
              </div>

              {/* Metode Pembayaran */}
              <div className="flex flex-col gap-2">
                <Label>Metode Pembayaran <span className="text-red-500">*</span></Label>
                <div className="grid grid-cols-5 gap-2">
                  {METODE_OPTIONS.map((m) => (
                    <button
                      type="button"
                      key={m.value}
                      onClick={() => setMetode(m.value)}
                      disabled={mutation.isPending}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 px-1 text-[11px] font-medium transition-all",
                        metode === m.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-slate-200 text-slate-500 hover:border-slate-300",
                        mutation.isPending && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {m.icon}{m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tanggal Pembayaran */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tanggal">Tanggal Pembayaran</Label>
                <Input
                  id="tanggal"
                  type="date"
                  value={tanggalBayar}
                  onChange={e => setTanggalBayar(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>

              {/* Catatan */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="catatan">Catatan Pembayaran</Label>
                <Input
                  id="catatan"
                  placeholder="Opsional"
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>

              {mutation.isError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {mutation.error?.message}
                </div>
              )}
            </div>
          </form>

          {/* Footer */}
          <div className="p-4 border-t bg-white shrink-0">
            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold"
              onClick={handleClickBayar}
              disabled={mutation.isPending || !nominalNum}
            >
              {mutation.isPending ? (
                <><span className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />Memproses...</>
              ) : (
                <><CreditCard className="w-4 h-4 mr-2" />Bayar Sekarang · {metodeLabel}</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Pembayaran</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Yakin ingin menyimpan pembayaran tenant ini?</p>
                <div className="rounded-lg bg-slate-50 border p-3 space-y-1.5 mt-2">
                  <div className="flex justify-between"><span className="text-slate-500">Tenant</span><span className="font-medium">{item.businessName}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Nominal Bayar</span><span className="font-semibold text-primary">{formatRupiah(nominalNum)}</span></div>
                  {diskonNum > 0 && <div className="flex justify-between"><span className="text-slate-500">Diskon</span><span className="text-emerald-600">-{formatRupiah(diskonNum)}</span></div>}
                  {dendaNum > 0 && <div className="flex justify-between"><span className="text-slate-500">Denda</span><span className="text-red-600">+{formatRupiah(dendaNum)}</span></div>}
                  <div className="flex justify-between"><span className="text-slate-500">Metode</span><span className="font-medium">{metodeLabel}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Sisa Setelah</span><span className={cn("font-semibold", sisaSetelah === 0 ? "text-emerald-600" : "text-amber-600")}>{formatRupiah(sisaSetelah)}</span></div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="bg-primary"
            >
              {mutation.isPending ? "Menyimpan..." : "Ya, Simpan Pembayaran"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
          <p className="text-muted-foreground mt-0.5 text-sm">Klik unit pada denah untuk melihat detail pembayaran</p>
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
                <Button variant="outline" size="sm" className="mt-3" onClick={() => floorPlan.refetch()}>Coba Lagi</Button>
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
          onSuccess={(updated) => {
            // Update selected item state langsung tanpa tunggu refetch
            if (selected?.id === modalItem.id) {
              setSelected(prev => prev ? {
                ...prev,
                paidAmount: updated.paidAmount,
                remainingAmount: updated.remainingAmount,
                paymentStatus: updated.paymentStatus as PaymentStatus,
              } : null);
            }
            setModalItem(null);
          }}
        />
      )}
    </div>
  );
}
