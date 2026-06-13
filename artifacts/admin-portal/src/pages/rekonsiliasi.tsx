
import { apiFetch } from "@/lib/api";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, Download, Filter, X, FileSpreadsheet, FileText as FilePdf,
  TrendingUp, BarChart3, CircleDashed, AlertCircle, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE + "/api";

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtRp(v: number) {
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(2)}M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(2)}jt`;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
}
function fmtRpFull(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) { return `${v}%`; }
function today() { return new Date().toISOString().slice(0, 10); }
function nowLabel() {
  return new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PeriodeRow {
  periodeKey: string;
  periodeLabel: string;
  totalMutasi: number;
  totalMatched: number;
  totalTagihan: number;
  totalBayar: number;
  totalOutstanding: number;
  totalOverdue: number;
  totalBelumBayar: number;
  collectionRate: number;
}

interface RekonsiliasiData {
  data: PeriodeRow[];
  grand: {
    totalMutasi: number;
    totalMatched: number;
    totalTagihan: number;
    totalBayar: number;
    totalOutstanding: number;
    collectionRate: number;
  };
  tahun: number;
  dari: string | null;
  sampai: string | null;
  groupBy: string;
}

// ─── Excel Export (xlsx) ──────────────────────────────────────────────────────

async function exportExcel(data: RekonsiliasiData, siteName: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const periodeLabel = data.dari && data.sampai
    ? `${data.dari} s/d ${data.sampai}`
    : `Tahun ${data.tahun}`;

  // Sheet 1: Ringkasan per periode
  const headerRow = [
    "Periode",
    "Total Mutasi",
    "Total Matched",
    "Match Rate (%)",
    "Total Tagihan (IDR)",
    "Total Bayar (IDR)",
    "Outstanding (IDR)",
    "Overdue",
    "Belum Bayar",
    "Collection Rate (%)",
  ];

  const dataRows = data.data.map((r) => [
    r.periodeLabel,
    r.totalMutasi,
    r.totalMatched,
    r.totalMutasi > 0 ? Math.round((r.totalMatched / r.totalMutasi) * 100) : 0,
    r.totalTagihan,
    r.totalBayar,
    r.totalOutstanding,
    r.totalOverdue,
    r.totalBelumBayar,
    r.collectionRate,
  ]);

  const grandRow = [
    "TOTAL",
    data.grand.totalMutasi,
    data.grand.totalMatched,
    data.grand.totalMutasi > 0 ? Math.round((data.grand.totalMatched / data.grand.totalMutasi) * 100) : 0,
    data.grand.totalTagihan,
    data.grand.totalBayar,
    data.grand.totalOutstanding,
    "",
    "",
    data.grand.collectionRate,
  ];

  const infoRows = [
    ["Laporan Rekonsiliasi Tenant Mall"],
    [`Lokasi: ${siteName}`],
    [`Periode: ${periodeLabel}`],
    [`Dicetak: ${nowLabel()}`],
    [],
  ];

  const wsData = [...infoRows, headerRow, ...dataRows, [], grandRow];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws["!cols"] = [
    { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Rekonsiliasi");
  XLSX.writeFile(wb, `rekonsiliasi-${data.tahun}-${today()}.xlsx`);
}

// ─── PDF Export (jsPDF + autotable) ──────────────────────────────────────────

async function exportPdf(data: RekonsiliasiData, siteName: string) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const periodeLabel = data.dari && data.sampai
    ? `${data.dari} s/d ${data.sampai}`
    : `Tahun ${data.tahun}`;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Header
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Laporan Rekonsiliasi Tenant Mall", 14, 18);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Lokasi: ${siteName}`, 14, 25);
  doc.text(`Periode: ${periodeLabel}`, 14, 30);
  doc.text(`Dicetak: ${nowLabel()}`, 14, 35);

  const tableData = data.data.map((r) => [
    r.periodeLabel,
    r.totalMutasi.toString(),
    r.totalMatched.toString(),
    r.totalMutasi > 0 ? `${Math.round((r.totalMatched / r.totalMutasi) * 100)}%` : "0%",
    fmtRpFull(r.totalTagihan),
    fmtRpFull(r.totalBayar),
    fmtRpFull(r.totalOutstanding),
    `${r.collectionRate}%`,
  ]);

  autoTable(doc, {
    startY: 40,
    head: [[
      "Periode",
      "Total Mutasi",
      "Matched",
      "Match Rate",
      "Total Tagihan",
      "Total Bayar",
      "Outstanding",
      "Collection Rate",
    ]],
    body: tableData,
    foot: [[
      "TOTAL",
      data.grand.totalMutasi.toString(),
      data.grand.totalMatched.toString(),
      data.grand.totalMutasi > 0 ? `${Math.round((data.grand.totalMatched / data.grand.totalMutasi) * 100)}%` : "0%",
      fmtRpFull(data.grand.totalTagihan),
      fmtRpFull(data.grand.totalBayar),
      fmtRpFull(data.grand.totalOutstanding),
      `${data.grand.collectionRate}%`,
    ]],
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 28 },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Halaman ${i} dari ${pageCount}  —  Dokumen ini digenerate secara otomatis`,
      14,
      doc.internal.pageSize.getHeight() - 6,
    );
  }

  doc.save(`rekonsiliasi-${data.tahun}-${today()}.pdf`);
}

// ─── KPI Summary Cards ────────────────────────────────────────────────────────

function GrandSummary({ grand, isLoading }: { grand?: RekonsiliasiData["grand"]; isLoading: boolean }) {
  const cards = [
    {
      label: "Total Mutasi",
      value: grand?.totalMutasi ?? 0,
      isMoney: false,
      color: "border-blue-200 bg-blue-50/40",
      textColor: "text-blue-700",
      labelColor: "text-blue-600",
      icon: <BarChart3 className="w-4 h-4 text-blue-500" />,
      suffix: "invoice",
    },
    {
      label: "Total Matched",
      value: grand?.totalMatched ?? 0,
      isMoney: false,
      color: "border-emerald-200 bg-emerald-50/40",
      textColor: "text-emerald-700",
      labelColor: "text-emerald-600",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      suffix: "lunas",
    },
    {
      label: "Total Tagihan",
      value: grand?.totalTagihan ?? 0,
      isMoney: true,
      color: "border-slate-200 bg-slate-50/40",
      textColor: "text-slate-700",
      labelColor: "text-slate-600",
      icon: <CircleDashed className="w-4 h-4 text-slate-500" />,
    },
    {
      label: "Total Dibayar",
      value: grand?.totalBayar ?? 0,
      isMoney: true,
      color: "border-violet-200 bg-violet-50/40",
      textColor: "text-violet-700",
      labelColor: "text-violet-600",
      icon: <TrendingUp className="w-4 h-4 text-violet-500" />,
    },
    {
      label: "Outstanding",
      value: grand?.totalOutstanding ?? 0,
      isMoney: true,
      color: "border-amber-200 bg-amber-50/40",
      textColor: "text-amber-700",
      labelColor: "text-amber-600",
      icon: <AlertCircle className="w-4 h-4 text-amber-500" />,
    },
    {
      label: "Collection Rate",
      value: grand?.collectionRate ?? 0,
      isMoney: false,
      isPct: true,
      color: "border-teal-200 bg-teal-50/40",
      textColor: "text-teal-700",
      labelColor: "text-teal-600",
      icon: <CheckCircle2 className="w-4 h-4 text-teal-500" />,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className={c.color}>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              {c.icon}
              <p className={cn("text-[10px] font-semibold uppercase tracking-wide", c.labelColor)}>{c.label}</p>
            </div>
            {isLoading ? (
              <div className="h-7 bg-white/60 rounded animate-pulse mt-1" />
            ) : (c as any).isPct ? (
              <p className={cn("text-2xl font-bold tracking-tight mt-0.5", c.textColor)}>{fmtPct(c.value)}</p>
            ) : c.isMoney ? (
              <p className={cn("text-lg font-bold tracking-tight mt-0.5", c.textColor)}>{fmtRp(c.value)}</p>
            ) : (
              <p className={cn("text-2xl font-bold tracking-tight mt-0.5", c.textColor)}>
                {c.value.toLocaleString("id-ID")}
                {(c as any).suffix && <span className="text-sm font-normal ml-1">{(c as any).suffix}</span>}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Collection Rate Bar ──────────────────────────────────────────────────────

function CollectionBar({ rate }: { rate: number }) {
  const color = rate >= 80 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className={cn("text-xs font-semibold tabular-nums w-10 text-right", rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : "text-red-600")}>
        {rate}%
      </span>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function RekonsiliasiTable({ data, isLoading }: { data?: RekonsiliasiData; isLoading: boolean }) {
  const rows = data?.data ?? [];
  const grand = data?.grand;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
        <BarChart3 className="w-10 h-10 opacity-20" />
        <p className="text-sm">Tidak ada data untuk periode ini</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Periode</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Mutasi</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Matched</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Overdue</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Tagihan</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Bayar</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[140px]">Collection Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, idx) => {
            const matchRate = r.totalMutasi > 0 ? Math.round((r.totalMatched / r.totalMutasi) * 100) : 0;
            return (
              <tr key={r.periodeKey} className={cn("hover:bg-slate-50 transition-colors", idx % 2 === 1 && "bg-slate-50/40")}>
                <td className="px-4 py-2.5 font-medium text-slate-700">{r.periodeLabel}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{r.totalMutasi.toLocaleString("id-ID")}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-emerald-700 font-medium">{r.totalMatched.toLocaleString("id-ID")}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-200 text-emerald-600">
                      {matchRate}%
                    </Badge>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.totalOverdue > 0 ? (
                    <span className="text-red-600 font-medium">{r.totalOverdue.toLocaleString("id-ID")}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 font-medium">{fmtRpFull(r.totalTagihan)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 font-medium">{fmtRpFull(r.totalBayar)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span className={r.totalOutstanding > 0 ? "text-amber-700 font-medium" : "text-slate-400"}>
                    {r.totalOutstanding > 0 ? fmtRpFull(r.totalOutstanding) : "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <CollectionBar rate={r.collectionRate} />
                </td>
              </tr>
            );
          })}
        </tbody>
        {grand && (
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold">
              <td className="px-4 py-3 text-xs uppercase tracking-wide text-slate-600">Total Keseluruhan</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{grand.totalMutasi.toLocaleString("id-ID")}</td>
              <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{grand.totalMatched.toLocaleString("id-ID")}</td>
              <td className="px-4 py-3 text-right">—</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtRpFull(grand.totalTagihan)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{fmtRpFull(grand.totalBayar)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-amber-700">{fmtRpFull(grand.totalOutstanding)}</td>
              <td className="px-4 py-3">
                <CollectionBar rate={grand.collectionRate} />
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Rekonsiliasi() {
  const currentYear = new Date().getFullYear();
  const [tahun, setTahun] = useState(String(currentYear));
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [groupBy, setGroupBy] = useState<"bulan" | "harian">("bulan");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const params = new URLSearchParams({ tahun, groupBy });
  if (dari) params.set("dari", dari);
  if (sampai) params.set("sampai", sampai);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<RekonsiliasiData>({
    queryKey: ["rekonsiliasi", tahun, dari, sampai, groupBy],
    queryFn: () => apiFetch(`${API}/laporan/rekonsiliasi?${params}`, { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error("Gagal memuat data rekonsiliasi");
      return r.json();
    }),
  });

  const hasCustomRange = !!(dari && sampai);
  const hasFilter = hasCustomRange;

  const siteName = "Semua Lokasi";

  const handleExportPdf = async () => {
    if (!data) return;
    setExporting("pdf");
    try {
      await exportPdf(data, siteName);
    } finally {
      setExporting(null);
    }
  };

  const handleExportExcel = async () => {
    if (!data) return;
    setExporting("excel");
    try {
      await exportExcel(data, siteName);
    } finally {
      setExporting(null);
    }
  };

  const periodeLabel = data?.dari && data?.sampai
    ? `${data.dari} s/d ${data.sampai}`
    : `Tahun ${data?.tahun ?? tahun}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laporan Rekonsiliasi</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Ringkasan mutasi, matched, dan collection rate per periode — untuk keperluan audit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!data?.data.length || !!exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {exporting === "excel" ? "Mengekspor..." : "Export Excel"}
          </button>
          <button
            onClick={handleExportPdf}
            disabled={!data?.data.length || !!exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            <FilePdf className="w-3.5 h-3.5" />
            {exporting === "pdf" ? "Mengekspor..." : "Export PDF"}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border-slate-200 bg-slate-50/60">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Filter Periode</span>
            {hasFilter && (
              <button
                onClick={() => { setDari(""); setSampai(""); }}
                className="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
              >
                <X className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Tahun — hanya aktif jika tidak pakai range tanggal */}
            <div className="relative">
              <select
                value={tahun}
                onChange={(e) => setTahun(e.target.value)}
                disabled={hasCustomRange}
                className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                  <option key={y} value={String(y)}>Tahun {y}</option>
                ))}
              </select>
              <Download className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none hidden" />
            </div>

            {/* Tanggal range */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">atau range:</span>
              <input
                type="date"
                value={dari}
                onChange={(e) => setDari(e.target.value)}
                className="pl-3 pr-2 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-xs text-slate-400">s/d</span>
              <input
                type="date"
                value={sampai}
                onChange={(e) => setSampai(e.target.value)}
                className="pl-3 pr-2 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Group by */}
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-slate-500">Kelompokkan:</span>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {(["bulan", "harian"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGroupBy(g)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium transition-colors",
                      groupBy === g
                        ? "bg-primary text-white"
                        : "bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {g === "bulan" ? "Per Bulan" : "Per Hari"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grand Summary Cards */}
      <GrandSummary grand={data?.grand} isLoading={isLoading} />

      {/* Main Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Rincian Rekonsiliasi per Periode</CardTitle>
              <CardDescription>
                {periodeLabel} · {data?.data.length ?? 0} periode ·{" "}
                {groupBy === "bulan" ? "Dikelompokkan per bulan" : "Dikelompokkan per hari"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span className="text-xs text-slate-500">Collection ≥ 80%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                <span className="text-xs text-slate-500">50–79%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                <span className="text-xs text-slate-500">&lt; 50%</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isError ? (
            <div className="flex items-center gap-2 text-red-600 text-sm py-8 justify-center">
              <AlertCircle className="w-4 h-4" />
              Gagal memuat data. <button onClick={() => refetch()} className="underline">Coba lagi</button>
            </div>
          ) : (
            <RekonsiliasiTable data={data} isLoading={isLoading} />
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
  MessageCircle,
  Send,
  XCircle,
  SkipForward,
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

const LS_URL_KEY = "rekonsiliasi_spreadsheet_url";
const LS_TITLE_KEY = "rekonsiliasi_sheet_title";
type NotifyResult = {
  sent: string[];
  failed: Array<{ invoiceNumber: string; error: string }>;
  skipped: Array<{ invoiceNumber: string; reason: string }>;
};

export default function Rekonsiliasi() {
  const { toast } = useToast();
  const [spreadsheetUrl, setSpreadsheetUrlRaw] = useState(() => localStorage.getItem(LS_URL_KEY) ?? "");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [sheetData, setSheetData] = useState<string[][] | null>(null);
  const [readSheetTitle, setReadSheetTitleRaw] = useState(() => localStorage.getItem(LS_TITLE_KEY) ?? "");

  function setSpreadsheetUrl(val: string) {
    setSpreadsheetUrlRaw(val);
    localStorage.setItem(LS_URL_KEY, val);
  }

  function setReadSheetTitle(val: string) {
    setReadSheetTitleRaw(val);
    localStorage.setItem(LS_TITLE_KEY, val);
  }
  const [notifyResult, setNotifyResult] = useState<NotifyResult | null>(null);

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

  const invoiceColIdx = (sheetData?.[0] ?? []).findIndex((h) => h === "No. Invoice");
  const verifikasiColIdxEarly = (sheetData?.[0] ?? []).findIndex((h) => h.startsWith("Verifikasi"));
  const statusColIdxEarly = (sheetData?.[0] ?? []).findIndex((h) => h === "Status");

  const unverifiedInvoiceNumbers = (sheetData?.slice(1) ?? [])
    .filter((r) => {
      const belumVerif = !r[verifikasiColIdxEarly]?.trim();
      const bukan = r[statusColIdxEarly] !== "Dibatalkan";
      return belumVerif && bukan && r[invoiceColIdx]?.trim();
    })
    .map((r) => r[invoiceColIdx].trim());

  const notifyMutation = useMutation<NotifyResult, Error, void>({
    mutationFn: async () => {
      const r = await fetch("/api/reconciliation/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumbers: unverifiedInvoiceNumbers,
          monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal mengirim notifikasi");
      return data;
    },
    onSuccess: (data) => {
      setNotifyResult(data);
      const total = data.sent.length + data.failed.length + data.skipped.length;
      toast({
        title: `Notifikasi WA selesai`,
        description: `${data.sent.length} terkirim, ${data.failed.length} gagal, ${data.skipped.length} dilewati dari ${total} invoice`,
      });
    },
    onError: (err) => {
      toast({ title: "Gagal mengirim notifikasi", description: err.message, variant: "destructive" });
    },
  });

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);

  const headers = sheetData?.[0] ?? [];
  const dataRows = sheetData?.slice(1) ?? [];

  const statusColIdx = headers.findIndex((h) => h === "Status");
  const verifikasiColIdx = headers.findIndex((h) => h.startsWith("Verifikasi"));
  const totalColIdx = headers.findIndex((h) => h.startsWith("Total Tagihan"));
  const sisaColIdx = headers.findIndex((h) => h.startsWith("Sisa"));
  const kunciColIdx = headers.findIndex((h) => h === "Kunci Pencocokan");
  const hasilColIdx = headers.findIndex((h) => h === "Hasil Pencocokan Bank");

  const sudahCocok = hasilColIdx >= 0
    ? dataRows.filter((r) => r[hasilColIdx]?.trim() !== "").length
    : dataRows.filter((r) => r[verifikasiColIdx]?.trim() !== "").length;
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
    .filter((i) => !["Sewa (Rp)","Service Charge (Rp)","Listrik (Rp)","Air (Rp)","Lainnya (Rp)","Diskon (Rp)","Denda (Rp)","Catatan Invoice"].includes(headers[i]));

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

      {/* Info Audit */}
      <Card className="border-blue-100 bg-blue-50/30">
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <FilePdf className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-700 mb-0.5">Catatan Audit</p>
              <p className="text-xs text-blue-600">
                Laporan ini merangkum data dari <strong>tenant_invoices</strong> dan <strong>tenant_payments</strong>.
                "Total Mutasi" = jumlah invoice dalam periode. "Matched" = invoice dengan status <em>paid</em>.
                "Collection Rate" = total_bayar / total_tagihan × 100%. Invoice yang dibatalkan (<em>cancelled</em>) tidak termasuk.
              </p>
            </div>
          </div>
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

              {(hasilColIdx >= 0 || verifikasiColIdx >= 0) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>
                    <strong className="text-green-700">{sudahCocok}</strong> dari{" "}
                    <strong>{dataRows.length}</strong> invoice sudah cocok/diverifikasi bank
                  </span>
                </div>
              )}

              {verifikasiColIdx >= 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-muted/20 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <span>
                      <strong className="text-green-700">{sudahVerifikasi}</strong> dari{" "}
                      <strong>{dataRows.length}</strong> invoice sudah diverifikasi bank
                      {unverifiedInvoiceNumbers.length > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          — <strong className="text-orange-600">{unverifiedInvoiceNumbers.length}</strong> belum terverifikasi
                        </span>
                      )}
                    </span>
                  </div>
                  {unverifiedInvoiceNumbers.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-green-600 text-green-700 hover:bg-green-50"
                      onClick={() => { setNotifyResult(null); notifyMutation.mutate(); }}
                      disabled={notifyMutation.isPending}
                    >
                      {notifyMutation.isPending ? (
                        <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />Mengirim...</>
                      ) : (
                        <><MessageCircle className="mr-2 h-3.5 w-3.5" />Kirim Notifikasi WA ({unverifiedInvoiceNumbers.length})</>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {notifyResult && (
                <div className="rounded-lg border bg-muted/10 p-4 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-600" />
                    Hasil Pengiriman Notifikasi WhatsApp
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded border bg-green-50 py-2">
                      <p className="text-xs text-muted-foreground">Terkirim</p>
                      <p className="text-lg font-bold text-green-700">{notifyResult.sent.length}</p>
                    </div>
                    <div className="rounded border bg-red-50 py-2">
                      <p className="text-xs text-muted-foreground">Gagal</p>
                      <p className="text-lg font-bold text-red-700">{notifyResult.failed.length}</p>
                    </div>
                    <div className="rounded border bg-yellow-50 py-2">
                      <p className="text-xs text-muted-foreground">Dilewati</p>
                      <p className="text-lg font-bold text-yellow-700">{notifyResult.skipped.length}</p>
                    </div>
                  </div>
                  {notifyResult.failed.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-red-700 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" />Gagal:
                      </p>
                      {notifyResult.failed.map((f) => (
                        <p key={f.invoiceNumber} className="text-xs text-red-600 pl-5">
                          {f.invoiceNumber} — {f.error}
                        </p>
                      ))}
                    </div>
                  )}
                  {notifyResult.skipped.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-yellow-700 flex items-center gap-1">
                        <SkipForward className="h-3.5 w-3.5" />Dilewati:
                      </p>
                      {notifyResult.skipped.map((s) => (
                        <p key={s.invoiceNumber} className="text-xs text-yellow-700 pl-5">
                          {s.invoiceNumber} — {s.reason}
                        </p>
                      ))}
                    </div>
                  )}
                  {notifyResult.sent.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-green-700 flex items-center gap-1">
                        <Send className="h-3.5 w-3.5" />Terkirim:
                      </p>
                      <p className="text-xs text-green-700 pl-5">{notifyResult.sent.join(", ")}</p>
                    </div>
                  )}
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
                          (hasilColIdx >= 0 && row[hasilColIdx]?.trim()) ||
                          (verifikasiColIdx >= 0 && row[verifikasiColIdx]?.trim())
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
                          if (ci === kunciColIdx) {
                            return (
                              <TableCell key={ci} className="py-1.5">
                                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded border text-muted-foreground">
                                  {val || "—"}
                                </span>
                              </TableCell>
                            );
                          }
                          if (ci === hasilColIdx) {
                            return (
                              <TableCell key={ci} className="py-1.5 text-center">
                                {val ? (
                                  <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs font-medium">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />{val}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
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
