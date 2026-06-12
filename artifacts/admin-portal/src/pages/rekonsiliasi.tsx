import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Info,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Copy,
} from "lucide-react";

const MONTH_NAMES = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

const now = new Date();

type ExportResult = {
  success: boolean;
  sheetTitle: string;
  rowCount: number;
  sheetUrl: string;
};

type ReadResult = {
  rows: string[][];
};

export default function Rekonsiliasi() {
  const { toast } = useToast();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [sheetData, setSheetData] = useState<string[][] | null>(null);
  const [readSheetTitle, setReadSheetTitle] = useState("");

  const { data: info } = useQuery<{ serviceAccountEmail: string }>({
    queryKey: ["/api/reconciliation/info"],
    queryFn: async () => {
      const r = await fetch("/api/reconciliation/info");
      return r.json();
    },
  });

  const exportMutation = useMutation<ExportResult, Error, void>({
    mutationFn: async () => {
      const r = await fetch("/api/reconciliation/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId: spreadsheetUrl.trim(), year, month }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal export");
      return data;
    },
    onSuccess: (data) => {
      setExportResult(data);
      setReadSheetTitle(data.sheetTitle);
      toast({ title: "Export berhasil!", description: `${data.rowCount} invoice ditulis ke sheet "${data.sheetTitle}"` });
    },
    onError: (err) => {
      toast({ title: "Export gagal", description: err.message, variant: "destructive" });
    },
  });

  const readMutation = useMutation<ReadResult, Error, void>({
    mutationFn: async () => {
      const r = await fetch("/api/reconciliation/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: spreadsheetUrl.trim(),
          sheetTitle: readSheetTitle,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal membaca sheet");
      return data;
    },
    onSuccess: (data) => {
      setSheetData(data.rows);
      toast({ title: "Data berhasil dimuat", description: `${data.rows.length - 1} baris data` });
    },
    onError: (err) => {
      toast({ title: "Gagal membaca sheet", description: err.message, variant: "destructive" });
    },
  });

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);

  const headers = sheetData?.[0] ?? [];
  const dataRows = sheetData?.slice(1) ?? [];

  const statusColIdx = headers.findIndex((h) => h === "Status");
  const verifikasiColIdx = headers.findIndex((h) => h.startsWith("Verifikasi"));
  const totalColIdx = headers.findIndex((h) => h.startsWith("Total Tagihan"));
  const sisaColIdx = headers.findIndex((h) => h.startsWith("Sisa"));

  const sudahVerifikasi = dataRows.filter((r) => r[verifikasiColIdx]?.trim() !== "").length;
  const totalTagihan = dataRows.reduce((s, r) => s + (parseFloat(r[totalColIdx] ?? "0") || 0), 0);
  const totalSisa = dataRows.reduce((s, r) => s + (parseFloat(r[sisaColIdx] ?? "0") || 0), 0);

  const formatRp = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      Lunas: "bg-green-100 text-green-800 border-green-200",
      Sebagian: "bg-yellow-100 text-yellow-800 border-yellow-200",
      "Belum Bayar": "bg-gray-100 text-gray-600 border-gray-200",
      "Jatuh Tempo": "bg-red-100 text-red-700 border-red-200",
    };
    return map[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  }

  const visibleColIndices = headers
    .map((_, i) => i)
    .filter((i) => !["Sewa (Rp)","Service Charge (Rp)","Listrik (Rp)","Air (Rp)","Lainnya (Rp)","Diskon (Rp)","Denda (Rp)"].includes(headers[i]));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rekonsiliasi Pembayaran</h1>
        <p className="text-muted-foreground mt-1">
          Export data invoice ke Google Sheets untuk rekonsiliasi dengan data bank.
        </p>
      </div>

      {/* Info Service Account */}
      <Alert className="border-blue-200 bg-blue-50">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-800">Langkah Persiapan</AlertTitle>
        <AlertDescription className="text-blue-700 space-y-2 mt-1">
          <p>
            Share Google Sheet Anda ke alamat email berikut dengan akses <strong>Editor</strong>:
          </p>
          <div className="flex items-center gap-2 bg-white border border-blue-200 rounded px-3 py-2 font-mono text-sm">
            <span className="flex-1 break-all">{info?.serviceAccountEmail ?? "Memuat..."}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(info?.serviceAccountEmail ?? "");
                toast({ title: "Email disalin" });
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs">
            Kemudian paste URL atau ID spreadsheet di kolom di bawah.
          </p>
        </AlertDescription>
      </Alert>

      {/* Form Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            Export Data Invoice ke Google Sheets
          </CardTitle>
          <CardDescription>
            Buat atau perbarui sheet rekonsiliasi berdasarkan periode yang dipilih.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>URL atau ID Google Spreadsheet</Label>
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/... atau ID spreadsheet"
              value={spreadsheetUrl}
              onChange={(e) => setSpreadsheetUrl(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bulan</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((n, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tahun</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || !spreadsheetUrl.trim()}
            className="w-full"
          >
            {exportMutation.isPending ? (
              <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Mengekspor...</>
            ) : (
              <><Download className="mr-2 h-4 w-4" /> Export ke Google Sheets</>
            )}
          </Button>

          {exportResult && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Export Berhasil</AlertTitle>
              <AlertDescription className="text-green-700 space-y-2">
                <p>
                  <strong>{exportResult.rowCount}</strong> invoice berhasil ditulis ke sheet{" "}
                  <strong>"{exportResult.sheetTitle}"</strong>.
                </p>
                <a
                  href={exportResult.sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline font-medium"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Buka Google Sheets
                </a>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Preview Data dari Sheet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sheet className="h-5 w-5 text-blue-600" />
            Pratinjau Data dari Sheet
          </CardTitle>
          <CardDescription>
            Muat ulang data dari Google Sheets untuk melihat hasil rekonsiliasi tim keuangan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-[1fr,auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Nama Sheet (tab)</Label>
              <Input
                placeholder={`Rekonsiliasi ${MONTH_NAMES[month - 1]} ${year}`}
                value={readSheetTitle}
                onChange={(e) => setReadSheetTitle(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => readMutation.mutate()}
              disabled={readMutation.isPending || !spreadsheetUrl.trim() || !readSheetTitle.trim()}
            >
              {readMutation.isPending
                ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Memuat...</>
                : <><RefreshCw className="mr-2 h-4 w-4" />Muat Data</>}
            </Button>
          </div>

          {sheetData && (
            <>
              <Separator />
              {/* Ringkasan */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Invoice</p>
                  <p className="text-xl font-bold">{dataRows.length}</p>
                </div>
                <div className="rounded-lg border bg-green-50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Tagihan</p>
                  <p className="text-base font-bold text-green-700">{formatRp(totalTagihan)}</p>
                </div>
                <div className="rounded-lg border bg-red-50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Sisa</p>
                  <p className="text-base font-bold text-red-700">{formatRp(totalSisa)}</p>
                </div>
              </div>

              {verifikasiColIdx >= 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>
                    <strong className="text-green-700">{sudahVerifikasi}</strong> dari{" "}
                    <strong>{dataRows.length}</strong> invoice sudah diverifikasi bank
                  </span>
                </div>
              )}

              {/* Tabel */}
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {visibleColIndices.map((i) => (
                        <TableHead key={i} className="whitespace-nowrap text-xs py-2">
                          {headers[i]}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataRows.map((row, ri) => (
                      <TableRow
                        key={ri}
                        className={
                          verifikasiColIdx >= 0 && row[verifikasiColIdx]?.trim()
                            ? "bg-green-50/60"
                            : ""
                        }
                      >
                        {visibleColIndices.map((ci) => {
                          const val = row[ci] ?? "";
                          if (ci === statusColIdx) {
                            return (
                              <TableCell key={ci} className="py-1.5">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge(val)}`}>
                                  {val || "—"}
                                </span>
                              </TableCell>
                            );
                          }
                          if (ci === verifikasiColIdx) {
                            return (
                              <TableCell key={ci} className="py-1.5 text-center">
                                {val ? (
                                  <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 text-xs">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />{val}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            );
                          }
                          const isNum = !isNaN(parseFloat(val)) && val.trim() !== "" &&
                            ["Total Tagihan","Sudah Dibayar","Sisa"].some((k) => (headers[ci] ?? "").startsWith(k));
                          return (
                            <TableCell key={ci} className={`py-1.5 text-sm ${isNum ? "text-right font-medium" : ""}`}>
                              {isNum ? formatRp(parseFloat(val)) : (val || <span className="text-muted-foreground">—</span>)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {!sheetData && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p>Data dari sheet akan tampil di sini setelah Anda klik "Muat Data".</p>
              <p className="mt-1">Pastikan sudah export terlebih dahulu.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
