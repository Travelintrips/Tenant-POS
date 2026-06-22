import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  RefreshCw,
  Receipt,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
} from "@/components/ui/dialog";

function formatRupiah(val: number | string | null | undefined) {
  if (val == null || val === "") return "Rp 0";
  const num = typeof val === "string" ? parseFloat(val) : val;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatTanggal(val: string | null | undefined) {
  if (!val) return "-";
  return new Date(val).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const METODE_LABELS: Record<string, string> = {
  tunai: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
  edc: "EDC",
  other: "Lainnya",
};

const SOURCE_LABELS: Record<string, string> = {
  pos: "POS",
  manual: "Manual",
  bank_recon: "Rekonsiliasi Bank",
  ocr: "OCR Upload",
};

type Payment = {
  id: number;
  paymentNumber: string | null;
  receiptNumber: string | null;
  amount: number;
  discountAmount: number;
  penaltyAmount: number;
  paymentMethod: string;
  approvalStatus: string;
  isVoided: boolean;
  paidAt: string | null;
  sourceType: string | null;
  notes: string | null;
  referenceNumber: string | null;
  invoiceId: number | null;
  bookingId: number | null;
  tenantName: string | null;
  boothNumber: string | null;
  orderNumber: string | null;
  periodLabel: string | null;
};

type PaymentsResponse = {
  data: Payment[];
  total: number;
  page: number;
  pageSize: number;
};

type DetailPayment = Payment & {
  voidReason?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  refundAmount?: number;
  refundReason?: string | null;
};

export default function RiwayatPembayaran() {
  const [search, setSearch] = useState("");
  const [metode, setMetode] = useState("semua");
  const [status, setStatus] = useState("semua");
  const [source, setSource] = useState("semua");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState<DetailPayment | null>(null);
  const pageSize = 20;

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (metode !== "semua") params.set("method", metode);
  if (status !== "semua") params.set("status", status);
  if (source !== "semua") params.set("source", source);
  if (dateFrom) params.set("from", dateFrom);
  if (dateTo) params.set("to", dateTo);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const { data, isLoading, refetch, isFetching } = useQuery<PaymentsResponse>({
    queryKey: ["riwayat-pembayaran", search, metode, status, source, dateFrom, dateTo, page],
    queryFn: async () => {
      const res = await fetch(`/api/tenant-pos/payments-history?${params}`);
      if (!res.ok) throw new Error("Gagal mengambil data");
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  const payments = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  function resetFilter() {
    setSearch("");
    setMetode("semua");
    setStatus("semua");
    setSource("semua");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  function statusBadge(p: Payment) {
    if (p.isVoided)
      return <Badge variant="destructive" className="text-[10px]">Dibatalkan</Badge>;
    if (p.approvalStatus === "approved")
      return <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Disetujui</Badge>;
    if (p.approvalStatus === "pending_review")
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]"><AlertCircle className="h-3 w-3 mr-1" />Menunggu</Badge>;
    if (p.approvalStatus === "rejected")
      return <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Ditolak</Badge>;
    return <Badge variant="outline" className="text-[10px]">{p.approvalStatus}</Badge>;
  }

  function exportCsv() {
    if (!payments.length) return;
    const headers = ["No. Pembayaran", "Tenant", "Booth", "No. Penyewaan", "Metode", "Jumlah", "Diskon", "Denda", "Sumber", "Status", "Tanggal"];
    const rows = payments.map((p) => [
      p.paymentNumber ?? p.receiptNumber ?? "-",
      p.tenantName ?? "-",
      p.boothNumber ?? "-",
      p.orderNumber ?? "-",
      METODE_LABELS[p.paymentMethod] ?? p.paymentMethod,
      p.amount,
      p.discountAmount,
      p.penaltyAmount,
      SOURCE_LABELS[p.sourceType ?? ""] ?? p.sourceType ?? "-",
      p.isVoided ? "Dibatalkan" : p.approvalStatus,
      p.paidAt ? new Date(p.paidAt).toLocaleString("id-ID") : "-",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riwayat-pembayaran-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Riwayat Pembayaran
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Seluruh transaksi pembayaran tenant dari semua sumber
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!payments.length}>
            <Download className="h-4 w-4 mr-1" />
            Ekspor CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari tenant / no. pembayaran..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={metode} onValueChange={(v) => { setMetode(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Metode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Metode</SelectItem>
                <SelectItem value="tunai">Tunai</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="qris">QRIS</SelectItem>
                <SelectItem value="edc">EDC</SelectItem>
                <SelectItem value="other">Lainnya</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Status</SelectItem>
                <SelectItem value="approved">Disetujui</SelectItem>
                <SelectItem value="pending_review">Menunggu</SelectItem>
                <SelectItem value="rejected">Ditolak</SelectItem>
                <SelectItem value="voided">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => { setSource(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Sumber" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Sumber</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="bank_recon">Rekonsiliasi Bank</SelectItem>
                <SelectItem value="ocr">OCR Upload</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1.5 items-center">
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="text-xs" />
              <span className="text-muted-foreground text-xs shrink-0">–</span>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="text-xs" />
            </div>
          </div>
          {(search || metode !== "semua" || status !== "semua" || source !== "semua" || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={resetFilter} className="mt-2 text-xs h-7">
              Reset Filter
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tabel */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardDescription>
              {isLoading ? "Memuat..." : `${total.toLocaleString("id-ID")} transaksi ditemukan`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">No. Pembayaran</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="w-32">No. Penyewaan</TableHead>
                  <TableHead className="w-24">Metode</TableHead>
                  <TableHead className="w-24">Sumber</TableHead>
                  <TableHead className="w-36">Tanggal Bayar</TableHead>
                  <TableHead className="text-right w-32">Jumlah</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      Tidak ada data pembayaran
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelectedPayment(p as DetailPayment)}
                    >
                      <TableCell className="font-mono text-xs">
                        {p.paymentNumber ?? p.receiptNumber ?? (
                          <span className="text-muted-foreground italic">–</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{p.tenantName ?? "-"}</div>
                        {p.boothNumber && (
                          <div className="text-xs text-muted-foreground">Booth {p.boothNumber}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.orderNumber || <span className="text-muted-foreground italic">–</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {METODE_LABELS[p.paymentMethod] ?? p.paymentMethod}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {SOURCE_LABELS[p.sourceType ?? ""] ?? p.sourceType ?? "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTanggal(p.paidAt)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm">
                        {formatRupiah(p.amount)}
                        {p.discountAmount > 0 && (
                          <div className="text-xs text-green-600 font-normal">
                            -{formatRupiah(p.discountAmount)}
                          </div>
                        )}
                        {p.penaltyAmount > 0 && (
                          <div className="text-xs text-red-600 font-normal">
                            +{formatRupiah(p.penaltyAmount)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(p)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                Halaman {page} dari {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Detail Pembayaran
            </DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">No. Pembayaran</p>
                  <p className="font-mono font-medium">{selectedPayment.paymentNumber ?? selectedPayment.receiptNumber ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">No. Penyewaan</p>
                  <p className="font-mono">{selectedPayment.orderNumber || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Tenant</p>
                  <p className="font-medium">{selectedPayment.tenantName ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Booth</p>
                  <p>{selectedPayment.boothNumber ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Periode</p>
                  <p>{selectedPayment.periodLabel ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Sumber</p>
                  <p>{SOURCE_LABELS[selectedPayment.sourceType ?? ""] ?? selectedPayment.sourceType ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Metode Bayar</p>
                  <p>{METODE_LABELS[selectedPayment.paymentMethod] ?? selectedPayment.paymentMethod}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Tanggal Bayar</p>
                  <p>{formatTanggal(selectedPayment.paidAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Jumlah</p>
                  <p className="font-bold text-base">{formatRupiah(selectedPayment.amount)}</p>
                </div>
                {selectedPayment.discountAmount > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs">Diskon</p>
                    <p className="text-green-600">-{formatRupiah(selectedPayment.discountAmount)}</p>
                  </div>
                )}
                {selectedPayment.penaltyAmount > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs">Denda</p>
                    <p className="text-red-600">+{formatRupiah(selectedPayment.penaltyAmount)}</p>
                  </div>
                )}
                {selectedPayment.referenceNumber && (
                  <div>
                    <p className="text-muted-foreground text-xs">No. Referensi</p>
                    <p className="font-mono text-xs">{selectedPayment.referenceNumber}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <div className="mt-0.5">{statusBadge(selectedPayment)}</div>
                </div>
              </div>
              {selectedPayment.notes && (
                <div>
                  <p className="text-muted-foreground text-xs">Catatan</p>
                  <p className="bg-muted rounded px-2 py-1.5 text-xs mt-1">{selectedPayment.notes}</p>
                </div>
              )}
              {selectedPayment.isVoided && selectedPayment.voidReason && (
                <div className="bg-red-50 border border-red-100 rounded p-3">
                  <p className="text-red-700 text-xs font-medium">Alasan Pembatalan</p>
                  <p className="text-red-600 text-xs mt-1">{selectedPayment.voidReason}</p>
                  {selectedPayment.voidedAt && (
                    <p className="text-red-400 text-[10px] mt-1">{formatTanggal(selectedPayment.voidedAt)} oleh {selectedPayment.voidedBy ?? "-"}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
