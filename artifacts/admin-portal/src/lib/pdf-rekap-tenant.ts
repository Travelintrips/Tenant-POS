import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type RekapTenant = {
  tenantId: number;
  businessName: string;
  ownerName: string;
  phone: string | null;
  category: string | null;
  tenantStatus: string;
  siteId: number;
  siteName: string;
  unitCode: string | null;
  contractStatus: string | null;
  bookingPaymentStatus: string | null;
  endDate: string | null;
  monthlyRent: number;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
  overdueCount: number;
  lastPaidAt: string | null;
  dueDate: string | null;
};

function fmtRp(v: number): string {
  if (v <= 0) return "-";
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)}jt`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}

function fmtTgl(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function contractLabel(s: string | null): string {
  switch (s) {
    case "active":        return "Aktif";
    case "expiring_soon": return "Hampir Habis";
    case "draft":         return "Draft";
    case "expired":       return "Berakhir";
    case "terminated":    return "Dihentikan";
    default:              return "Belum Ada";
  }
}

function paymentLabel(s: string | null): string {
  switch ((s ?? "").toLowerCase()) {
    case "paid":    return "Lunas";
    case "partial": return "Sebagian";
    case "overdue": return "Menunggak";
    case "unpaid":  return "Belum Bayar";
    default:        return "-";
  }
}

export function generateRekapTenantPDF(opts: {
  data: RekapTenant[];
  siteName: string;
  filterLabel?: string;
  periodLabel?: string;
}) {
  const { data, siteName, filterLabel, periodLabel } = opts;
  const now = new Date();
  const tglCetak = now.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const jamCetak = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ── Warna ────────────────────────────────────────────────────────────────
  const PRIMARY   = [37, 99, 235] as [number, number, number];   // biru
  const DARK      = [15, 23, 42]  as [number, number, number];   // slate-900
  const MUTED     = [100, 116, 139] as [number, number, number]; // slate-500
  const LIGHT_BG  = [241, 245, 249] as [number, number, number]; // slate-100
  const RED       = [220, 38, 38] as [number, number, number];
  const GREEN     = [5, 150, 105] as [number, number, number];
  const AMBER     = [217, 119, 6] as [number, number, number];

  // ── KOP: strip biru ──────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageW, 18, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("MALL ADMIN PORTAL", margin, 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Sistem Manajemen Tenant", margin, 13);

  // Judul di kanan
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("LAPORAN REKAP TENANT", pageW - margin, 8, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(siteName, pageW - margin, 13, { align: "right" });

  // ── Sub-header info ───────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT_BG);
  doc.rect(0, 18, pageW, 10, "F");

  doc.setTextColor(...MUTED);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");

  const infoY = 23.5;
  doc.text(`Dicetak : ${tglCetak}, pukul ${jamCetak}`, margin, infoY);
  if (filterLabel) doc.text(`Filter : ${filterLabel}`, margin + 100, infoY);
  if (periodLabel) doc.text(`Periode : ${periodLabel}`, margin + 170, infoY);
  doc.text(`Total Data : ${data.length} tenant`, pageW - margin, infoY, { align: "right" });

  // ── KPI Summary boxes ─────────────────────────────────────────────────────
  const kpiY    = 31;
  const kpiH    = 16;
  const kpiW    = (pageW - margin * 2 - 9) / 4;

  const totalBilled      = data.reduce((s, r) => s + r.totalBilled, 0);
  const totalPaid        = data.reduce((s, r) => s + r.totalPaid, 0);
  const totalOutstanding = data.reduce((s, r) => s + r.totalOutstanding, 0);
  const countOverdue     = data.filter(r => (r.bookingPaymentStatus ?? "").toLowerCase() === "overdue").length;
  const countActive      = data.filter(r => r.contractStatus === "active").length;
  const pctLunas         = totalBilled > 0 ? Math.round(totalPaid / totalBilled * 100) : 0;

  const kpis = [
    { label: "Total Tenant",     value: String(data.length),     sub: `${countActive} kontrak aktif`,     color: PRIMARY },
    { label: "Total Tagihan",    value: fmtRp(totalBilled),      sub: `${data.length} invoice`,           color: PRIMARY },
    { label: "Total Diterima",   value: fmtRp(totalPaid),        sub: `${pctLunas}% tingkat pelunasan`,   color: GREEN },
    { label: "Total Tunggakan",  value: fmtRp(totalOutstanding), sub: `${countOverdue} tenant menunggak`, color: countOverdue > 0 ? RED : GREEN },
  ] as const;

  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 3);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, kpiY, kpiW, kpiH, 2, 2, "FD");

    doc.setFillColor(...k.color);
    doc.roundedRect(x, kpiY, 2.5, kpiH, 1, 1, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(k.label, x + 5, kpiY + 4.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(k.value, x + 5, kpiY + 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(k.sub, x + 5, kpiY + 14);
  });

  // ── Tabel ─────────────────────────────────────────────────────────────────
  const tableTop = kpiY + kpiH + 5;

  // Group by site jika all-sites
  const grouped = new Map<string, RekapTenant[]>();
  for (const row of data) {
    if (!grouped.has(row.siteName)) grouped.set(row.siteName, []);
    grouped.get(row.siteName)!.push(row);
  }

  let currentY = tableTop;

  for (const [site, rows] of grouped) {
    // Header group lokasi
    if (grouped.size > 1) {
      doc.setFillColor(...PRIMARY);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.rect(margin, currentY, pageW - margin * 2, 6, "F");
      doc.text(`  ${site}  (${rows.length} tenant)`, margin + 2, currentY + 4.2);
      currentY += 6;
    }

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [[
        "No", "Nama Usaha", "Pemilik", "Kategori", "Unit",
        "Status Kontrak", "Status Bayar",
        "Sewa/bln", "Total Tagihan", "Sudah Bayar", "Tunggakan",
        "Jatuh Tempo", "Tgl Bayar Terakhir",
      ]],
      body: rows.map((r, idx) => [
        idx + 1,
        r.businessName,
        r.ownerName,
        r.category ?? "-",
        r.unitCode ?? "-",
        contractLabel(r.contractStatus),
        paymentLabel(r.bookingPaymentStatus),
        fmtRp(r.monthlyRent),
        fmtRp(r.totalBilled),
        fmtRp(r.totalPaid),
        fmtRp(r.totalOutstanding),
        fmtTgl(r.dueDate),
        fmtTgl(r.lastPaidAt),
      ]),
      styles: {
        fontSize: 7,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        font: "helvetica",
        textColor: DARK,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: MUTED,
        fontStyle: "bold",
        fontSize: 6.5,
        halign: "center",
      },
      columnStyles: {
        0:  { halign: "center", cellWidth: 7 },
        1:  { cellWidth: 32, fontStyle: "bold" },
        2:  { cellWidth: 24 },
        3:  { cellWidth: 20 },
        4:  { halign: "center", cellWidth: 14 },
        5:  { halign: "center", cellWidth: 20 },
        6:  { halign: "center", cellWidth: 20 },
        7:  { halign: "right",  cellWidth: 20 },
        8:  { halign: "right",  cellWidth: 22 },
        9:  { halign: "right",  cellWidth: 22, textColor: GREEN },
        10: { halign: "right",  cellWidth: 22 },
        11: { halign: "center", cellWidth: 20 },
        12: { halign: "center", cellWidth: 24 },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      didParseCell(info) {
        // Warnai baris menunggak
        const row = rows[info.row.index];
        if (!row) return;
        if ((row.bookingPaymentStatus ?? "").toLowerCase() === "overdue") {
          info.cell.styles.fillColor = [255, 245, 245];
        }
        // Warnai kolom tunggakan merah jika > 0
        if (info.column.index === 10 && row.totalOutstanding > 0) {
          info.cell.styles.textColor = RED;
          info.cell.styles.fontStyle = "bold";
        }
        // Warnai status bayar
        if (info.column.index === 6 && info.section === "body") {
          const ps = (row.bookingPaymentStatus ?? "").toLowerCase();
          if (ps === "paid")    info.cell.styles.textColor = GREEN;
          if (ps === "overdue") info.cell.styles.textColor = RED;
          if (ps === "partial") info.cell.styles.textColor = AMBER;
        }
        // Warnai status kontrak
        if (info.column.index === 5 && info.section === "body") {
          if (row.contractStatus === "active") info.cell.styles.textColor = GREEN;
          if (row.contractStatus === "expired") info.cell.styles.textColor = MUTED;
        }
      },
      didDrawPage(info) {
        currentY = (info.cursor?.y ?? currentY);
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 5;

    // Summary per lokasi (jika multiple sites)
    if (grouped.size > 1) {
      const locBilled      = rows.reduce((s, r) => s + r.totalBilled, 0);
      const locPaid        = rows.reduce((s, r) => s + r.totalPaid, 0);
      const locOutstanding = rows.reduce((s, r) => s + r.totalOutstanding, 0);
      const locPct         = locBilled > 0 ? Math.round(locPaid / locBilled * 100) : 0;

      doc.setFillColor(...LIGHT_BG);
      doc.rect(margin, currentY - 4, pageW - margin * 2, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...DARK);
      doc.text(
        `Subtotal ${site}: Tagihan ${fmtRp(locBilled)}  |  Diterima ${fmtRp(locPaid)}  |  Tunggakan ${fmtRp(locOutstanding)}  |  Pelunasan ${locPct}%`,
        margin + 3, currentY,
      );
      currentY += 6;
    }
  }

  // ── Grand Total baris ─────────────────────────────────────────────────────
  if (grouped.size > 1) {
    doc.setFillColor(...PRIMARY);
    doc.rect(margin, currentY, pageW - margin * 2, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(
      `  TOTAL KESELURUHAN (${data.length} tenant):  Tagihan ${fmtRp(totalBilled)}  |  Diterima ${fmtRp(totalPaid)}  |  Tunggakan ${fmtRp(totalOutstanding)}  |  Pelunasan ${pctLunas}%`,
      margin, currentY + 5.2,
    );
    currentY += 8;
  }

  // ── Footer per halaman ────────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text("Mall Admin Portal — Dokumen ini digenerate otomatis oleh sistem", margin, pageH - 6);
    doc.text(`Halaman ${p} dari ${totalPages}`, pageW - margin, pageH - 6, { align: "right" });
  }

  // ── Simpan ────────────────────────────────────────────────────────────────
  const filename = `rekap-tenant_${siteName.replace(/\s+/g, "-").toLowerCase()}_${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
