import { apiFetchJson } from "@/lib/api";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, Dumbbell, Phone, Mail, MapPin, ArrowLeft, Store,
  CheckCircle2, AlertTriangle, Clock, TrendingDown, FileText,
  CreditCard, Calendar, Tag, User, Receipt,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tenant = {
  id: number; businessName: string; ownerName: string; phone: string | null;
  email: string | null; address: string | null; category: string | null;
  businessCategory: string | null; status: string; notes: string | null;
  boothNumber: string | null; siteId: number; siteName: string | null;
  siteType: string | null; createdAt: string;
};
type Booking = {
  id: number; contractNumber: string | null; orderNumber: string;
  unitCode: string | null; floor: string | null;
  startDate: string | null; endDate: string | null; durationMonths: number | null;
  billingCycle: string | null; rentAmount: string | null;
  depositAmount: string | null; serviceChargeAmount: string | null;
  contractStatus: string | null; bookingStatus: string; paymentStatus: string;
  totalAmount: string | null; paidAmount: string | null; remainingAmount: string | null;
  periodLabel: string | null; createdAt: string;
};
type Invoice = {
  id: number; invoiceNumber: string; unitCode: string | null;
  periodStart: string | null; periodEnd: string | null; dueDate: string | null;
  rentAmount: string; serviceChargeAmount: string; totalAmount: string;
  paidAmount: string; outstandingAmount: string; status: string;
  createdAt: string;
};
type Payment = {
  id: number; paymentNumber: string | null; receiptNumber: string | null;
  amount: string; method: string; status: string; paidAt: string | null;
  notes: string | null; invoiceId: number | null;
};
type Kpi = {
  totalBilled: number; totalPaid: number; totalOutstanding: number;
  paymentRate: number; overdueInvoices: number; activeBooking: Booking | null;
};
type ProfileData = {
  tenant: Tenant; bookings: Booking[]; invoices: Invoice[];
  payments: Payment[]; kpi: Kpi;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000)     return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}
function fmtTgl(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function fmtTglWkt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function contractBadge(s: string | null) {
  switch (s) {
    case "active":        return <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">Aktif</Badge>;
    case "expiring_soon": return <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">Hampir Habis</Badge>;
    case "expired":       return <Badge variant="outline" className="border-gray-300 text-gray-600 bg-gray-50">Berakhir</Badge>;
    case "terminated":    return <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">Dihentikan</Badge>;
    case "draft":         return <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">Draft</Badge>;
    default:              return <Badge variant="outline" className="border-slate-300 text-slate-500">—</Badge>;
  }
}

function invoiceStatusBadge(s: string) {
  switch (s) {
    case "paid":      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">Lunas</Badge>;
    case "partial":   return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 border">Sebagian</Badge>;
    case "overdue":   return <Badge className="bg-red-100 text-red-700 border-red-200 border">Menunggak</Badge>;
    case "unpaid":    return <Badge className="bg-orange-100 text-orange-700 border-orange-200 border">Belum Bayar</Badge>;
    case "cancelled": return <Badge className="bg-gray-100 text-gray-500 border-gray-200 border">Dibatalkan</Badge>;
    default:          return <Badge variant="outline">{s}</Badge>;
  }
}

function payStatusBadge(s: string) {
  const up = (s ?? "").toUpperCase();
  if (up === "PAID")    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border"><CheckCircle2 className="h-3 w-3 mr-1" />Lunas</Badge>;
  if (up === "PARTIAL") return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 border"><Clock className="h-3 w-3 mr-1" />Sebagian</Badge>;
  if (up === "VOIDED")  return <Badge className="bg-gray-100 text-gray-500 border-gray-200 border">Void</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

const SITE_TYPE_CFG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  mall_tenant:  { icon: <Building2 className="h-4 w-4" />, color: "text-blue-600",   bg: "bg-blue-50"   },
  sport_center: { icon: <Dumbbell  className="h-4 w-4" />, color: "text-emerald-600", bg: "bg-emerald-50" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenantProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery<ProfileData>({
    queryKey: ["tenant-profile", id],
    queryFn:  () => apiFetchJson<ProfileData>(`/api/tenants/${id}/profile`),
    enabled:  !!id,
  });

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-64 col-span-1" />
        <Skeleton className="h-64 col-span-2" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );

  if (isError || !data) return (
    <div className="flex flex-col items-center py-24 gap-4">
      <Store className="h-12 w-12 text-muted-foreground/40" />
      <p className="text-muted-foreground">Tenant tidak ditemukan atau gagal memuat data.</p>
      <Button variant="outline" onClick={() => navigate("/data-tenant")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Kembali
      </Button>
    </div>
  );

  const { tenant, bookings, invoices, payments, kpi } = data;
  const siteCfg = SITE_TYPE_CFG[tenant.siteType ?? "mall_tenant"];

  return (
    <div className="space-y-6">

      {/* ── Breadcrumb & Back ── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1 as any)} className="gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Profil Tenant</span>
      </div>

      {/* ── Header Card ── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 bg-white border rounded-xl p-5 shadow-sm">
        <div className={`rounded-xl p-3 ${siteCfg.bg} flex-shrink-0`}>
          <div className={siteCfg.color}>{siteCfg.icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold truncate">{tenant.businessName}</h1>
            <Badge variant={tenant.status === "active" || tenant.status === "aktif" ? "default" : "secondary"}>
              {tenant.status === "active" || tenant.status === "aktif" ? "Aktif" : "Tidak Aktif"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{tenant.ownerName}</p>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
            {tenant.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{tenant.phone}</span>}
            {tenant.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{tenant.email}</span>}
            {(tenant.category || tenant.businessCategory) && (
              <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{tenant.category ?? tenant.businessCategory}</span>
            )}
            <span className={`flex items-center gap-1 ${siteCfg.color}`}>
              {siteCfg.icon}<span className="ml-0.5">{tenant.siteName ?? "—"}</span>
            </span>
          </div>
          {tenant.address && (
            <p className="flex items-start gap-1 mt-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />{tenant.address}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground whitespace-nowrap">
          Bergabung {fmtTgl(tenant.createdAt)}
        </p>
      </div>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Total Tagihan"
          value={fmt(kpi.totalBilled)}
          icon={<FileText className="h-5 w-5 text-muted-foreground" />}
        />
        <KpiCard
          label="Sudah Dibayar"
          value={fmt(kpi.totalPaid)}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          valueClass="text-emerald-600"
        />
        <KpiCard
          label="Tunggakan"
          value={fmt(kpi.totalOutstanding)}
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          valueClass={kpi.totalOutstanding > 0 ? "text-red-600" : "text-emerald-600"}
        />
        <KpiCard
          label="Tingkat Lunas"
          value={`${kpi.paymentRate}%`}
          icon={<TrendingDown className="h-5 w-5 text-blue-500" />}
          valueClass={kpi.paymentRate >= 80 ? "text-emerald-600" : kpi.paymentRate >= 50 ? "text-amber-600" : "text-red-600"}
        />
      </div>

      {/* ── Booking Aktif Banner ── */}
      {kpi.activeBooking && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Kontrak Aktif</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  {kpi.activeBooking.contractNumber && (
                    <span className="font-mono text-xs bg-white border border-emerald-200 px-2 py-1 rounded">
                      {kpi.activeBooking.contractNumber}
                    </span>
                  )}
                  {kpi.activeBooking.unitCode && (
                    <span className="flex items-center gap-1"><Store className="h-3.5 w-3.5 text-emerald-600" />Unit {kpi.activeBooking.unitCode}</span>
                  )}
                  {kpi.activeBooking.floor && (
                    <span className="text-muted-foreground">{kpi.activeBooking.floor}</span>
                  )}
                  {kpi.activeBooking.rentAmount && (
                    <span className="flex items-center gap-1 font-medium">
                      <CreditCard className="h-3.5 w-3.5 text-emerald-600" />{fmt(kpi.activeBooking.rentAmount)}/bln
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right text-sm">
                <p className="text-muted-foreground text-xs">Periode</p>
                <p className="font-medium">{fmtTgl(kpi.activeBooking.startDate)} — {fmtTgl(kpi.activeBooking.endDate)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Main Content: Invoice + Payment ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Invoice list */}
        <div className="xl:col-span-3 space-y-3">
          <SectionTitle icon={<FileText className="h-4 w-4" />} title="Riwayat Invoice" count={invoices.length} />
          {invoices.length === 0 ? (
            <EmptyState text="Belum ada invoice" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-36">No. Invoice</TableHead>
                        <TableHead className="w-28">Periode</TableHead>
                        <TableHead className="w-24">Jatuh Tempo</TableHead>
                        <TableHead className="text-right w-28">Total</TableHead>
                        <TableHead className="text-right w-28">Sudah Bayar</TableHead>
                        <TableHead className="text-right w-28">Sisa</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map(inv => (
                        <TableRow key={inv.id} className={inv.status === "overdue" ? "bg-red-50/40" : ""}>
                          <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-xs">
                            {inv.periodStart ? new Date(inv.periodStart).toLocaleDateString("id-ID", { month: "short", year: "numeric" }) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className={inv.status === "overdue" ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                              {fmtTgl(inv.dueDate)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm">{fmt(inv.totalAmount)}</TableCell>
                          <TableCell className="text-right text-sm text-emerald-600">{fmt(inv.paidAmount)}</TableCell>
                          <TableCell className="text-right text-sm">
                            {Number(inv.outstandingAmount) > 0
                              ? <span className="font-semibold text-red-600">{fmt(inv.outstandingAmount)}</span>
                              : <span className="text-emerald-600 text-xs">✓</span>}
                          </TableCell>
                          <TableCell>{invoiceStatusBadge(inv.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Payment list */}
        <div className="xl:col-span-2 space-y-3">
          <SectionTitle icon={<Receipt className="h-4 w-4" />} title="Riwayat Pembayaran" count={payments.length} />
          {payments.length === 0 ? (
            <EmptyState text="Belum ada pembayaran" />
          ) : (
            <div className="space-y-2">
              {payments.map(p => (
                <Card key={p.id} className="overflow-hidden">
                  <CardContent className="pt-3 pb-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {(p.receiptNumber || p.paymentNumber) && (
                          <p className="font-mono text-xs text-muted-foreground truncate">
                            {p.receiptNumber ?? p.paymentNumber}
                          </p>
                        )}
                        <p className="text-base font-semibold text-emerald-700">{fmt(p.amount)}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span className="capitalize">{p.method}</span>
                          {p.paidAt && <><span>•</span><span>{fmtTglWkt(p.paidAt)}</span></>}
                        </div>
                        {p.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.notes}</p>}
                      </div>
                      <div className="flex-shrink-0">{payStatusBadge(p.status)}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Riwayat Booking ── */}
      {bookings.length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={<Calendar className="h-4 w-4" />} title="Riwayat Booking / Kontrak" count={bookings.length} />
          <div className="grid gap-3 sm:grid-cols-2">
            {bookings.map(b => (
              <Card key={b.id} className={b.contractStatus === "active" ? "border-emerald-200" : ""}>
                <CardContent className="pt-4 pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {b.contractNumber && (
                        <p className="font-mono text-xs text-muted-foreground">{b.contractNumber}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {contractBadge(b.contractStatus)}
                        {b.unitCode && (
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{b.unitCode}</span>
                        )}
                        {b.floor && <span className="text-xs text-muted-foreground">{b.floor}</span>}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{fmtTgl(b.startDate)}</p>
                      <p>s/d {fmtTgl(b.endDate)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {b.rentAmount && (
                      <div>
                        <p className="text-muted-foreground">Sewa/bln</p>
                        <p className="font-medium">{fmt(b.rentAmount)}</p>
                      </div>
                    )}
                    {b.depositAmount && (
                      <div>
                        <p className="text-muted-foreground">Deposit</p>
                        <p className="font-medium">{fmt(b.depositAmount)}</p>
                      </div>
                    )}
                    {b.durationMonths && (
                      <div>
                        <p className="text-muted-foreground">Durasi</p>
                        <p className="font-medium">{b.durationMonths} bulan</p>
                      </div>
                    )}
                    {b.billingCycle && (
                      <div>
                        <p className="text-muted-foreground">Siklus</p>
                        <p className="font-medium capitalize">{b.billingCycle}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Info Tenant ── */}
      {tenant.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> Catatan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{tenant.notes}</p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, valueClass }: {
  label: string; value: string; icon: React.ReactNode; valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-xl font-bold ${valueClass ?? "text-foreground"}`}>{value}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="font-semibold text-sm">{title}</h2>
      <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{count}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-10 text-muted-foreground text-sm">
        {text}
      </CardContent>
    </Card>
  );
}
