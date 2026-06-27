import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type JournalEntry = {
  id: number;
  journalId: string | null;
  mutationId: number | null;
  transactionDate: string;
  description: string | null;
  debitAccountId: string | null;
  debitAccountName: string | null;
  creditAccountId: string | null;
  creditAccountName: string | null;
  debitAmount: string;
  creditAmount: string;
  taxAmount: string | null;
  taxAccountId: string | null;
  taxAccountName: string | null;
  currency: string;
  status: string;
  createdAt: string;
};

type JournalResponse = {
  data: JournalEntry[];
  total: number;
  page: number;
  limit: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(val: string | null): string {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_COLOR: Record<string, string> = {
  posted: "bg-green-100 text-green-700 border-green-200",
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  reversed: "bg-red-100 text-red-700 border-red-200",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BukuJurnal() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const [page, setPage] = useState(1);
  const [appliedFrom, setAppliedFrom] = useState(firstOfMonth);
  const [appliedTo, setAppliedTo] = useState(todayStr);
  const LIMIT = 50;

  const { data, isLoading, isFetching } = useQuery<JournalResponse>({
    queryKey: ["journal-entries", appliedFrom, appliedTo, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        date_from: appliedFrom,
        date_to: appliedTo,
        page: String(page),
        limit: String(LIMIT),
      });
      const r = await apiFetch(`/api/bank-reconciliation/journal-entries?${params}`);
      if (!r.ok) throw new Error("Gagal memuat jurnal");
      return r.json();
    },
  });

  const entries = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const totalDebit = entries.reduce((s, e) => s + parseFloat(e.debitAmount || "0"), 0);
  const totalCredit = entries.reduce((s, e) => s + parseFloat(e.creditAmount || "0"), 0);

  function handleCari() {
    setPage(1);
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  }

  function handleReset() {
    setDateFrom(firstOfMonth);
    setDateTo(todayStr);
    setPage(1);
    setAppliedFrom(firstOfMonth);
    setAppliedTo(todayStr);
  }

  function handleExport() {
    const header = ["Tanggal", "No Jurnal", "Keterangan", "Akun Debit", "Kode Debit", "Akun Kredit", "Kode Kredit", "Debit (IDR)", "Kredit (IDR)", "Pajak (IDR)", "Akun Pajak", "Status"];
    const rows = entries.map(e => [
      fmtDate(e.transactionDate),
      e.journalId ?? "",
      e.description ?? "",
      e.debitAccountName ?? "",
      e.debitAccountId ?? "",
      e.creditAccountName ?? "",
      e.creditAccountId ?? "",
      e.debitAmount,
      e.creditAmount,
      e.taxAmount ?? "0",
      e.taxAccountName ?? "",
      e.status,
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buku-jurnal-${appliedFrom}-${appliedTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-blue-600" />
          Buku Jurnal Akuntansi
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Semua entri jurnal debit/kredit yang tercatat di sistem
        </p>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Dari Tanggal</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 w-40 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Sampai Tanggal</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 w-40 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleCari} className="h-8 gap-1">
              <Search className="h-3.5 w-3.5" />
              Cari
            </Button>
            <Button size="sm" variant="ghost" onClick={handleReset} className="h-8 gap-1 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
              Reset
            </Button>
            <div className="ml-auto">
              <Button size="sm" variant="outline" onClick={handleExport} className="h-8 gap-1" disabled={entries.length === 0}>
                <Download className="h-3.5 w-3.5" />
                Ekspor CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ringkasan */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Entri</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <p className="text-2xl font-bold">{total.toLocaleString("id-ID")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Debit</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <p className="text-2xl font-bold text-red-600">
              {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(totalDebit)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Kredit</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <p className="text-2xl font-bold text-green-600">
              {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(totalCredit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabel */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-24">Tanggal</TableHead>
                  <TableHead className="w-32">No Jurnal</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Akun Debit</TableHead>
                  <TableHead>Akun Kredit</TableHead>
                  <TableHead className="text-right w-36">Debit</TableHead>
                  <TableHead className="text-right w-36">Kredit</TableHead>
                  <TableHead className="text-right w-32">Pajak</TableHead>
                  <TableHead className="w-20 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-12 text-sm">
                      Tidak ada entri jurnal untuk periode ini
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((e) => (
                    <TableRow key={e.id} className="text-sm hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(e.transactionDate)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-blue-600 whitespace-nowrap">
                        {e.journalId ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-56 truncate" title={e.description ?? ""}>
                        {e.description ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-muted-foreground">{e.debitAccountId ?? "—"}</span>
                          <span className="text-xs truncate max-w-36">{e.debitAccountName ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-muted-foreground">{e.creditAccountId ?? "—"}</span>
                          <span className="text-xs truncate max-w-36">{e.creditAccountName ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-600 whitespace-nowrap">
                        {parseFloat(e.debitAmount) > 0 ? fmt(e.debitAmount) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-green-600 whitespace-nowrap">
                        {parseFloat(e.creditAmount) > 0 ? fmt(e.creditAmount) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                        {e.taxAmount && parseFloat(e.taxAmount) > 0 ? (
                          <span title={e.taxAccountName ?? ""}>{fmt(e.taxAmount)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLOR[e.status] ?? ""}`}>
                          {e.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Menampilkan {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} dari {total.toLocaleString("id-ID")} entri
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 font-medium text-foreground">{page} / {totalPages}</span>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
