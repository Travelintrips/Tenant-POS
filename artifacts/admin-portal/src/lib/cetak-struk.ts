export interface DataStruk {
  noStruk: string;
  tanggal: string;
  jam: string;
  cabang: string;
  unitId: string;
  unitNama: string;
  penyewa: string;
  kategori: string;
  luas: string;
  periodeBayar: string;
  sewaBulanan: number;
  jumlahBayar: number;
  metodeBayar: string;
  kasir: string;
  status: "lunas" | "tunggakan";
  invoiceNumber?: string;
  referenceNumber?: string;
  kembalian?: number;
  diskon?: number;
  denda?: number;
}

export interface MallConfigStruk {
  mallName?: string;
  tagline?: string;
  logoUrl?: string;
  invoiceFooterNote?: string;
  companyName?: string;
}

function formatRp(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(v);
}

async function fetchStrukConfig(): Promise<MallConfigStruk> {
  try {
    const res = await fetch("/api/settings", { credentials: "include" });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return {};
  }
}

export async function cetakStrukPDF(data: DataStruk, config?: MallConfigStruk) {
  const cfg = config ?? (await fetchStrukConfig());
  const mallName = cfg.mallName || "Mall Admin";
  const companyName = cfg.companyName || "";
  const tagline = cfg.tagline || "Sistem Manajemen Tenant";
  const logoUrl = cfg.logoUrl || "";
  const footerNote = cfg.invoiceFooterNote || "";

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" style="max-height:40px;max-width:120px;object-fit:contain;display:block;margin:0 auto 6px;" />`
    : "";

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Struk Pembayaran — ${data.noStruk}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      color: #111;
      background: #fff;
      padding: 0;
    }
    .page {
      width: 80mm;
      margin: 0 auto;
      padding: 8mm 6mm 12mm;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 15px; }
    .xlarge { font-size: 18px; }
    .small { font-size: 10px; }
    .muted { color: #555; }
    .divider {
      border: none;
      border-top: 1px dashed #999;
      margin: 6px 0;
    }
    .divider-solid {
      border: none;
      border-top: 2px solid #111;
      margin: 6px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin: 3px 0;
    }
    .row .label { color: #555; flex-shrink: 0; max-width: 45%; }
    .row .value { text-align: right; font-weight: 500; word-break: break-all; }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      font-weight: bold;
      margin: 4px 0;
    }
    .change-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: bold;
      margin: 4px 0;
      color: #1d4ed8;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border: 1px solid #111;
      border-radius: 2px;
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .badge-lunas { border-color: #16a34a; color: #16a34a; }
    .badge-tunggakan { border-color: #dc2626; color: #dc2626; }
    .logo-area { margin-bottom: 8px; }
    .footer { margin-top: 10px; text-align: center; color: #555; font-size: 10px; line-height: 1.6; }
    .footer .terimakasih { font-size: 12px; font-weight: bold; color: #111; margin-bottom: 3px; }
    .no-struk { letter-spacing: 1.5px; font-size: 11px; }
    .section-title {
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #555;
      margin: 8px 0 4px;
    }
    @media print {
      body { margin: 0; }
      .page { padding: 4mm 4mm 8mm; }
      @page {
        size: 80mm auto;
        margin: 0;
      }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="center logo-area">
    ${logoHtml}
    <div class="xlarge bold">${mallName.toUpperCase()}</div>
    ${companyName ? `<div class="small muted" style="font-size:9px;color:#666;">${companyName}</div>` : ""}
    <div class="small muted">${tagline}</div>
  </div>

  <hr class="divider-solid" />

  <div class="center" style="margin: 6px 0;">
    <div class="bold large">STRUK PEMBAYARAN</div>
    <div class="small muted no-struk">${data.noStruk}</div>
  </div>

  <hr class="divider" />

  <!-- Tanggal & Kasir -->
  <div class="section-title">Informasi Transaksi</div>
  <div class="row">
    <span class="label">Tanggal</span>
    <span class="value">${data.tanggal}</span>
  </div>
  <div class="row">
    <span class="label">Jam</span>
    <span class="value">${data.jam}</span>
  </div>
  <div class="row">
    <span class="label">Cabang</span>
    <span class="value">${data.cabang}</span>
  </div>
  <div class="row">
    <span class="label">Kasir</span>
    <span class="value">${data.kasir}</span>
  </div>
  ${data.invoiceNumber ? `<div class="row"><span class="label">No. Invoice</span><span class="value">${data.invoiceNumber}</span></div>` : ""}
  ${data.referenceNumber ? `<div class="row"><span class="label">No. Referensi</span><span class="value">${data.referenceNumber}</span></div>` : ""}

  <hr class="divider" />

  <!-- Info Tenant -->
  <div class="section-title">Data Tenant</div>
  <div class="row">
    <span class="label">ID Unit</span>
    <span class="value">${data.unitId}</span>
  </div>
  <div class="row">
    <span class="label">Nama</span>
    <span class="value">${data.penyewa}</span>
  </div>
  <div class="row">
    <span class="label">Kategori</span>
    <span class="value">${data.kategori}</span>
  </div>
  <div class="row">
    <span class="label">Luas</span>
    <span class="value">${data.luas}</span>
  </div>

  <hr class="divider" />

  <!-- Detail Pembayaran -->
  <div class="section-title">Rincian Pembayaran</div>
  <div class="row">
    <span class="label">Periode</span>
    <span class="value">${data.periodeBayar}</span>
  </div>
  <div class="row">
    <span class="label">Sewa/Bulan</span>
    <span class="value">${formatRp(data.sewaBulanan)}</span>
  </div>
  ${data.diskon && data.diskon > 0 ? `<div class="row"><span class="label">Diskon</span><span class="value" style="color:#16a34a;">- ${formatRp(data.diskon)}</span></div>` : ""}
  <div class="row">
    <span class="label">Metode</span>
    <span class="value">${data.metodeBayar}</span>
  </div>

  <hr class="divider-solid" />

  <div class="total-row">
    <span>TOTAL BAYAR</span>
    <span>${formatRp(data.jumlahBayar)}</span>
  </div>

  ${data.kembalian && data.kembalian > 0 ? `
  <hr class="divider" />
  <div class="change-row">
    <span>KEMBALIAN</span>
    <span>${formatRp(data.kembalian)}</span>
  </div>
  ` : ""}

  <hr class="divider-solid" />

  <div class="center" style="margin-top: 8px;">
    <span class="badge ${data.status === "lunas" ? "badge-lunas" : "badge-tunggakan"}">
      ${data.status === "lunas" ? "✓ LUNAS" : "⚠ TUNGGAKAN"}
    </span>
  </div>

  <!-- Footer -->
  <div class="footer" style="margin-top: 14px;">
    <div class="terimakasih">Terima Kasih</div>
    ${footerNote ? `<div style="margin-bottom:4px;">${footerNote}</div>` : ""}
    <div>Struk ini merupakan bukti pembayaran sah</div>
    <div>Simpan struk ini untuk keperluan administrasi</div>
    <div style="margin-top: 6px;">Dicetak oleh sistem pada ${data.tanggal} ${data.jam}</div>
  </div>

</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=400,height=700");
  if (!win) {
    alert("Popup diblokir. Izinkan popup di browser Anda.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 500);
}

export function buatNoStruk(): string {
  const now = new Date();
  const tgl = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `STR-${tgl}-${rand}`;
}

export function formatTanggal(d: Date): string {
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

export function formatJam(d: Date): string {
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
