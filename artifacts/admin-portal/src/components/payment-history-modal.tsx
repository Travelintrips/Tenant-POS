import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  History, ChevronLeft, ChevronRight, ExternalLink, AlertCircle,
  CheckCircle2, Clock, Filter, ReceiptText,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type LedgerRow = {
  id: number;
  invoiceId: number;
  amount: string;
  paymentMethod: string;
  sourceType: string | null;
  approvalStatus: string;
  receiptNumber: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  notes: string | null;
  paidAt: string | null;
  remainingBalanceAfter: string | null;
  proofUrl: string | null;
  createdAt: string;
  kasirName: string | null;
};

type Pagination = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

type ApiResponse = {
  success: boolean;
  data: LedgerRow[];
  pagination: Pagination;
};

type InvoiceInfo = {
  id: number;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
};

function formatRupiah(v: string | number | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(v ?? 0));
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

const SOURCE_LABEL: Record<string, string> = {
  pos: "POS",
  ocr: "OCR",
  bank: "Bank",
  manual: "Manual",
};

const SOURCE_CLASS: Record<string, string> = {
  pos: "bg-blue-100 text-blue-700 border-blue-200",
  ocr: "bg-purple-100 text-purple-700 border-purple-200",
  bank: "bg-emerald-100 text-emerald-700 border-emerald-200",
  manual: "bg-slate-100 text-slate-600 border-slate-300",
};

const STATUS_CLASS: Record<string, string> = {
  partial: "bg-yellow-100 text-yellow-700 border-yellow-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  unpaid: "bg-orange-100 text-orange-700 border-orange-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-gray-100 text-gray-400 border-gray-200",
};

const STATUS_LABEL: Record<string, string> = {
  partial: "Sebagian",
  paid: "Lunas",
  unpaid: "Belum Bayar",
  overdue: "Jatuh Tempo",
  draft: "Draft",
  cancelled: "Dibatalkan",
};

const LIMIT = 10;

interface Props {
  open: boolean;
  onClose: () => void;
  invoice: InvoiceInfo | null;
}

export function PaymentHistoryModal({ open, onClose, invoice }: Props) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceType, setSourceType] = useState("all");
  const [offset, setOffset] = useState(0);

  const params = new URLSearchParams({
    invoiceId: String(invoice?.id ?? 0),
    limit: String(LIMIT),
    offset: String(offset),
  });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (sourceType !== "all") params.set("sourceType", sourceType);

  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ["/api/payments", invoice?.id, offset, dateFrom, dateTo, sourceType],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/payments?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Gagal memuat riwayat pembayaran");
      return res.json() as Promise<ApiResponse>;
    },
    enabled: open && !!invoice?.id,
  });

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setSourceType("all");
    setOffset(0);
  }

  const rows = data?.data ?? [];
  const pagination = data?.pagination;
  const total = pagination?.total ?? 0;
  const page = Math.floor(offset / LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Riwayat Pembayaran
            {invoice && (
              <span className="font-mono text-sm font-normal text-muted-foreground ml-1">
                Invoice {invoice.invoiceNumber}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {invoice && (
          <div className="shrink-0 flex gap-3 flex-wrap text-sm bg-muted/40 rounded-md px-4 py-2.5 border">
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-semibold">{formatRupiah(invoice.totalAmount)}</span>
            </div>
            <div className="text-muted-foreground">·</div>
            <div>
              <span className="text-muted-foreground">Terbayar: </span>
              <span className="font-semibold text-green-700">{formatRupiah(invoice.paidAmount)}</span>
            </div>
            <div className="text-muted-foreground">·</div>
            <div>
              <span className="text-muted-foreground">Status: </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[invoice.status] ?? "bg-slate-100 text-slate-600"}`}>
                {STATUS_LABEL[invoice.status] ?? invoice.status}
              </span>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="shrink-0 flex flex-wrap gap-3 items-end pt-1">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Dari Tanggal</Label>
            <Input
              type="date"
              className="h-8 text-sm w-36"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Sampai Tanggal</Label>
            <Input
              type="date"
              className="h-8 text-sm w-36"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Sumber Pembayaran</Label>
            <Select value={sourceType} onValueChange={(v) => { setSourceType(v); setOffset(0); }}>
              <SelectTrigger className="h-8 text-sm w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
                <SelectItem value="ocr">OCR</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(dateFrom || dateTo || sourceType !== "all") && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={resetFilters}>
              <Filter className="h-3 w-3" />
              Reset filter
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm">Gagal memuat data. Coba lagi.</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <ReceiptText className="h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">Belum ada pembayaran</p>
              {(dateFrom || dateTo || sourceType !== "all") && (
                <p className="text-xs">Tidak ada data sesuai filter yang dipilih.</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-14">No</TableHead>
                  <TableHead className="text-xs">No Ledger</TableHead>
                  <TableHead className="text-xs text-right">Nominal Bayar</TableHead>
                  <TableHead className="text-xs text-right">Sisa Bayar</TableHead>
                  <TableHead className="text-xs">Status Invoice</TableHead>
                  <TableHead className="text-xs">Sumber</TableHead>
                  <TableHead className="text-xs">Receipt ID</TableHead>
                  <TableHead className="text-xs">Metode</TableHead>
                  <TableHead className="text-xs">Kasir</TableHead>
                  <TableHead className="text-xs">Tanggal Bayar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const remaining = Number(row.remainingBalanceAfter ?? 0);
                  const invoiceStatus = remaining <= 0 ? "paid" : "partial";
                  const src = row.sourceType ?? "manual";
                  return (
                    <TableRow
                      key={row.id}
                      className={invoiceStatus === "paid" ? "bg-green-50/50" : ""}
                    >
                      <TableCell className="text-xs text-muted-foreground">{offset + idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs text-primary">#{row.id}</TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {formatRupiah(row.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {remaining <= 0 ? (
                          <span className="text-green-600 font-medium flex items-center justify-end gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Lunas
                          </span>
                        ) : (
                          <span className="text-orange-600">{formatRupiah(row.remainingBalanceAfter)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[invoiceStatus]}`}>
                          {invoiceStatus === "paid"
                            ? <><CheckCircle2 className="h-3 w-3" />Lunas</>
                            : <><Clock className="h-3 w-3" />Sebagian</>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${SOURCE_CLASS[src] ?? SOURCE_CLASS.manual}`}>
                          {SOURCE_LABEL[src] ?? src}
                        </span>
                      </TableCell>
                      <TableCell>
                        {row.receiptNumber ? (
                          <a
                            href={`${BASE}/api/payments/${row.id}/receipt`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                          >
                            {row.receiptNumber}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{row.paymentMethod}</TableCell>
                      <TableCell className="text-xs">{row.kasirName ?? "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(row.paidAt ?? row.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination footer */}
        {total > 0 && (
          <div className="shrink-0 flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
            <span className="text-xs">
              Menampilkan {offset + 1}–{Math.min(offset + rows.length, total)} dari {total} pembayaran
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs">Hal {page} / {totalPages}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={!pagination?.hasMore}
                onClick={() => setOffset(offset + LIMIT)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
