import React, { useState } from "react";
import { Building2, MapPin, Receipt, X, CheckCircle2, AlertCircle, CircleDashed, Phone, Mail, Calendar, CreditCard, Printer, Banknote, Smartphone, WalletCards } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { cetakStrukPDF, buatNoStruk, formatTanggal, formatJam } from "@/lib/cetak-struk";

type StatusUnit = "aktif" | "kosong" | "menunggak";

interface Unit {
  id: string;
  nama: string;
  kategori: string;
  luas: string;
  status: StatusUnit;
  penyewa?: string;
  telepon?: string;
  email?: string;
  tagihanBulan?: string;
  jumlahTagihan?: number;
  jatuhTempo?: string;
  sewaBulanan?: number;
  mulaiSewa?: string;
  akhirSewa?: string;
}

const SPORT_CENTRE: Unit[] = [
  {
    id: "SC-01",
    nama: "Unit SC-01",
    kategori: "Olahraga & Fitness",
    luas: "120 m²",
    status: "aktif",
    penyewa: "Xtreme Gym",
    telepon: "0812-3456-7890",
    email: "xtremegym@email.com",
    sewaBulanan: 8500000,
    mulaiSewa: "2023-03-01",
    akhirSewa: "2025-02-28",
    tagihanBulan: "Juni 2026",
    jumlahTagihan: 8500000,
    jatuhTempo: "2026-06-15",
  },
  {
    id: "SC-02",
    nama: "Unit SC-02",
    kategori: "Peralatan Olahraga",
    luas: "80 m²",
    status: "menunggak",
    penyewa: "Sport Station",
    telepon: "0813-9988-1122",
    email: "sporstation@email.com",
    sewaBulanan: 6000000,
    mulaiSewa: "2022-11-01",
    akhirSewa: "2024-10-31",
    tagihanBulan: "April–Juni 2026",
    jumlahTagihan: 18000000,
    jatuhTempo: "2026-04-15",
  },
  {
    id: "SC-03",
    nama: "Unit SC-03",
    kategori: "F&B",
    luas: "60 m²",
    status: "aktif",
    penyewa: "Juice Bar Fresh",
    telepon: "0857-2211-3344",
    email: "juicefresh@email.com",
    sewaBulanan: 4500000,
    mulaiSewa: "2024-01-01",
    akhirSewa: "2026-12-31",
    tagihanBulan: "Juni 2026",
    jumlahTagihan: 4500000,
    jatuhTempo: "2026-06-15",
  },
  {
    id: "SC-04",
    nama: "Unit SC-04",
    kategori: "-",
    luas: "100 m²",
    status: "kosong",
  },
];

const TOD_UNITS: Unit[] = [
  {
    id: "TOD-B1",
    nama: "Booth B1",
    kategori: "Fashion",
    luas: "9 m²",
    status: "aktif",
    penyewa: "Batik Nusantara",
    telepon: "0821-4455-6677",
    email: "batiknusantara@email.com",
    sewaBulanan: 2500000,
    mulaiSewa: "2025-01-01",
    akhirSewa: "2026-12-31",
    tagihanBulan: "Juni 2026",
    jumlahTagihan: 2500000,
    jatuhTempo: "2026-06-15",
  },
  {
    id: "TOD-B2",
    nama: "Booth B2",
    kategori: "Aksesori",
    luas: "9 m²",
    status: "menunggak",
    penyewa: "Gelang & Cincin",
    telepon: "0877-1234-5678",
    email: "gelangjaya@email.com",
    sewaBulanan: 2500000,
    mulaiSewa: "2024-06-01",
    akhirSewa: "2026-05-31",
    tagihanBulan: "Mei–Juni 2026",
    jumlahTagihan: 5000000,
    jatuhTempo: "2026-05-15",
  },
  {
    id: "TOD-B3",
    nama: "Booth B3",
    kategori: "Kuliner",
    luas: "9 m²",
    status: "aktif",
    penyewa: "Martabak 99",
    telepon: "0811-9988-7766",
    email: "martabak99@email.com",
    sewaBulanan: 2500000,
    mulaiSewa: "2025-03-01",
    akhirSewa: "2027-02-28",
    tagihanBulan: "Juni 2026",
    jumlahTagihan: 2500000,
    jatuhTempo: "2026-06-15",
  },
  {
    id: "TOD-B4",
    nama: "Booth B4",
    kategori: "-",
    luas: "9 m²",
    status: "kosong",
  },
  {
    id: "TOD-B5",
    nama: "Booth B5",
    kategori: "Skincare",
    luas: "9 m²",
    status: "aktif",
    penyewa: "Cantik Alami",
    telepon: "0856-3344-2211",
    email: "cantiikalami@email.com",
    sewaBulanan: 2500000,
    mulaiSewa: "2025-07-01",
    akhirSewa: "2027-06-30",
    tagihanBulan: "Juni 2026",
    jumlahTagihan: 2500000,
    jatuhTempo: "2026-06-15",
  },
  {
    id: "TOD-B6",
    nama: "Booth B6",
    kategori: "Mainan",
    luas: "9 m²",
    status: "aktif",
    penyewa: "Toys Kingdom Mini",
    telepon: "0819-6677-8899",
    email: "toysmini@email.com",
    sewaBulanan: 2500000,
    mulaiSewa: "2024-09-01",
    akhirSewa: "2026-08-31",
    tagihanBulan: "Juni 2026",
    jumlahTagihan: 2500000,
    jatuhTempo: "2026-06-15",
  },
  {
    id: "TOD-S1",
    nama: "Stand S1",
    kategori: "Jajanan",
    luas: "4 m²",
    status: "aktif",
    penyewa: "Batagor Pak Haji",
    telepon: "0822-5544-3322",
    email: "batagorpakhaji@email.com",
    sewaBulanan: 1200000,
    mulaiSewa: "2025-02-01",
    akhirSewa: "2027-01-31",
    tagihanBulan: "Juni 2026",
    jumlahTagihan: 1200000,
    jatuhTempo: "2026-06-15",
  },
  {
    id: "TOD-S2",
    nama: "Stand S2",
    kategori: "Minuman",
    luas: "4 m²",
    status: "menunggak",
    penyewa: "Es Teh Manis",
    telepon: "0833-1122-4455",
    email: "estehmanis@email.com",
    sewaBulanan: 1200000,
    mulaiSewa: "2024-10-01",
    akhirSewa: "2026-09-30",
    tagihanBulan: "Juni 2026",
    jumlahTagihan: 1200000,
    jatuhTempo: "2026-06-10",
  },
  {
    id: "TOD-S3",
    nama: "Stand S3",
    kategori: "Jajanan",
    luas: "4 m²",
    status: "kosong",
  },
  {
    id: "TOD-S4",
    nama: "Stand S4",
    kategori: "Parfum",
    luas: "4 m²",
    status: "aktif",
    penyewa: "Harum Selalu",
    telepon: "0844-9900-1122",
    email: "harumselalu@email.com",
    sewaBulanan: 1200000,
    mulaiSewa: "2025-05-01",
    akhirSewa: "2027-04-30",
    tagihanBulan: "Juni 2026",
    jumlahTagihan: 1200000,
    jatuhTempo: "2026-06-15",
  },
  {
    id: "TOD-S5",
    nama: "Stand S5",
    kategori: "-",
    luas: "4 m²",
    status: "kosong",
  },
  {
    id: "TOD-S6",
    nama: "Stand S6",
    kategori: "Camilan",
    luas: "4 m²",
    status: "aktif",
    penyewa: "Keripik Mak Encum",
    telepon: "0855-7788-9900",
    email: "keripikencum@email.com",
    sewaBulanan: 1200000,
    mulaiSewa: "2025-04-01",
    akhirSewa: "2027-03-31",
    tagihanBulan: "Juni 2026",
    jumlahTagihan: 1200000,
    jatuhTempo: "2026-06-15",
  },
];

const statusConfig: Record<StatusUnit, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; badge: string }> = {
  aktif: {
    label: "Aktif",
    color: "text-emerald-700",
    bg: "bg-emerald-100 hover:bg-emerald-200",
    border: "border-emerald-400",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    badge: "bg-emerald-100 text-emerald-700 border-emerald-300",
  },
  kosong: {
    label: "Kosong",
    color: "text-slate-500",
    bg: "bg-slate-100 hover:bg-slate-200",
    border: "border-slate-300",
    icon: <CircleDashed className="w-3.5 h-3.5" />,
    badge: "bg-slate-100 text-slate-500 border-slate-300",
  },
  menunggak: {
    label: "Menunggak",
    color: "text-red-700",
    bg: "bg-red-100 hover:bg-red-200",
    border: "border-red-400",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    badge: "bg-red-100 text-red-700 border-red-300",
  },
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function UnitCard({ unit, selected, onClick }: { unit: Unit; selected: boolean; onClick: () => void }) {
  const cfg = statusConfig[unit.status];
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-lg border-2 p-2 text-left transition-all duration-150 cursor-pointer select-none",
        cfg.bg,
        cfg.border,
        selected && "ring-2 ring-offset-1 ring-blue-500 scale-[1.03] shadow-md z-10"
      )}
    >
      <div className={cn("text-[11px] font-bold truncate", cfg.color)}>{unit.id}</div>
      <div className="text-[10px] text-slate-600 truncate mt-0.5 leading-tight">
        {unit.status !== "kosong" ? unit.penyewa : "Kosong"}
      </div>
      <div className={cn("flex items-center gap-0.5 mt-1", cfg.color)}>
        {cfg.icon}
      </div>
    </button>
  );
}

function DetailPanel({ unit, onClose, onProses, onCetak }: {
  unit: Unit | null;
  onClose: () => void;
  onProses: (unit: Unit) => void;
  onCetak: (unit: Unit) => void;
}) {
  if (!unit) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
        <Receipt className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-base font-medium">Pilih unit pada denah</p>
        <p className="text-sm mt-1">untuk melihat detail pembayaran</p>
      </div>
    );
  }

  const cfg = statusConfig[unit.status];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <p className="text-xs text-muted-foreground">{unit.id}</p>
          <h3 className="font-bold text-base leading-tight">{unit.status !== "kosong" ? unit.penyewa : "Unit Kosong"}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium", cfg.badge)}>
            {cfg.icon} {cfg.label}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Kategori</p>
            <p className="font-medium">{unit.kategori}</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Luas Unit</p>
            <p className="font-medium">{unit.luas}</p>
          </div>
        </div>

        {unit.status === "kosong" ? (
          <div className="rounded-lg border-2 border-dashed border-slate-300 p-4 text-center text-muted-foreground">
            <CircleDashed className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">Unit Belum Tersewa</p>
            <p className="text-xs mt-1">Unit ini sedang tersedia untuk disewakan</p>
          </div>
        ) : (
          <>
            <Separator />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Info Penyewa</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span>{unit.telepon}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{unit.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span>{unit.mulaiSewa} — {unit.akhirSewa}</span>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Detail Tagihan</p>
              <div className={cn("rounded-lg border p-3 space-y-2", unit.status === "menunggak" ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200")}>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Periode</span>
                  <span className="font-medium">{unit.tagihanBulan}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sewa/Bulan</span>
                  <span className="font-medium">{formatRupiah(unit.sewaBulanan!)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-sm font-semibold">Total Tagihan</span>
                  <span className={cn("font-bold text-base", unit.status === "menunggak" ? "text-red-600" : "text-emerald-700")}>
                    {formatRupiah(unit.jumlahTagihan!)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Jatuh Tempo</span>
                  <span>{unit.jatuhTempo}</span>
                </div>
              </div>
            </div>

            {unit.status === "menunggak" && (
              <Button className="w-full bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => onProses(unit)}>
                <CreditCard className="w-4 h-4 mr-2" />
                Proses Pembayaran Tunggakan
              </Button>
            )}
            {unit.status === "aktif" && (
              <div className="flex flex-col gap-2">
                <Button className="w-full" size="sm" onClick={() => onProses(unit)}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Proses Pembayaran
                </Button>
                <Button className="w-full" variant="outline" size="sm" onClick={() => onCetak(unit)}>
                  <Printer className="w-4 h-4 mr-2" />
                  Cetak Struk Terakhir
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type MetodeBayar = "tunai" | "transfer" | "qris";

function ModalPembayaran({
  unit,
  cabang,
  onClose,
}: {
  unit: Unit;
  cabang: string;
  onClose: () => void;
}) {
  const [metode, setMetode] = useState<MetodeBayar>("tunai");
  const [selesai, setSelesai] = useState(false);
  const [noStruk] = useState(() => buatNoStruk());
  const now = new Date();

  const metodeLabel: Record<MetodeBayar, string> = { tunai: "Tunai", transfer: "Transfer Bank", qris: "QRIS" };

  const handleProses = () => setSelesai(true);

  const handleCetak = () => {
    cetakStrukPDF({
      noStruk,
      tanggal: formatTanggal(now),
      jam: formatJam(now),
      cabang,
      unitId: unit.id,
      unitNama: unit.nama,
      penyewa: unit.penyewa!,
      kategori: unit.kategori,
      luas: unit.luas,
      periodeBayar: unit.tagihanBulan!,
      sewaBulanan: unit.sewaBulanan!,
      jumlahBayar: unit.jumlahTagihan!,
      metodeBayar: metodeLabel[metode],
      kasir: "Admin",
      status: unit.status === "menunggak" ? "tunggakan" : "lunas",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {!selesai ? (
          <>
            {/* Header */}
            <div className={cn("px-6 py-4 flex items-center justify-between", unit.status === "menunggak" ? "bg-red-600" : "bg-primary")}>
              <div>
                <p className="text-white/70 text-xs">Konfirmasi Pembayaran</p>
                <h2 className="text-white font-bold text-lg leading-tight">{unit.penyewa}</h2>
                <p className="text-white/80 text-xs mt-0.5">{unit.id} · {cabang}</p>
              </div>
              <button onClick={onClose} className="text-white/70 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Ringkasan Tagihan */}
              <div className={cn("rounded-xl border p-4 space-y-2", unit.status === "menunggak" ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200")}>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Periode</span>
                  <span className="font-medium">{unit.tagihanBulan}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Sewa/Bulan</span>
                  <span className="font-medium">{formatRupiah(unit.sewaBulanan!)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="font-semibold">Total Bayar</span>
                  <span className={cn("font-bold text-xl", unit.status === "menunggak" ? "text-red-600" : "text-slate-900")}>
                    {formatRupiah(unit.jumlahTagihan!)}
                  </span>
                </div>
              </div>

              {/* Pilih Metode */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Metode Pembayaran</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["tunai", "transfer", "qris"] as MetodeBayar[]).map((m) => {
                    const icons = { tunai: <Banknote className="w-5 h-5" />, transfer: <WalletCards className="w-5 h-5" />, qris: <Smartphone className="w-5 h-5" /> };
                    return (
                      <button
                        key={m}
                        onClick={() => setMetode(m)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 px-2 text-xs font-medium transition-all",
                          metode === m ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:border-slate-300"
                        )}
                      >
                        {icons[m]}
                        {metodeLabel[m]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tombol Proses */}
              <Button className="w-full h-11 text-base font-semibold" onClick={handleProses}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Proses Pembayaran · {metodeLabel[metode]}
              </Button>
            </div>
          </>
        ) : (
          /* Sukses */
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Pembayaran Berhasil!</h2>
            <p className="text-slate-500 text-sm mt-1 mb-1">{unit.penyewa} · {unit.tagihanBulan}</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{formatRupiah(unit.jumlahTagihan!)}</p>
            <p className="text-xs text-slate-400 mt-1 mb-6">via {metodeLabel[metode]} · {noStruk}</p>

            <div className="flex gap-3 w-full">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Tutup
              </Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleCetak}>
                <Printer className="w-4 h-4 mr-2" />
                Cetak Struk PDF
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-3">Browser akan membuka dialog cetak. Pilih "Save as PDF" untuk simpan.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SportCentreMap({ selected, onSelect }: { selected: Unit | null; onSelect: (u: Unit) => void }) {
  const units = SPORT_CENTRE;
  return (
    <div className="p-4 h-full flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="w-4 h-4" />
        <span>Lantai 1 — Sport Centre</span>
      </div>

      <div className="flex-1 relative bg-slate-50 rounded-xl border border-slate-200 overflow-hidden p-4">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-slate-400 tracking-widest uppercase">Pintu Masuk</div>
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-slate-200/60 to-transparent" />
        <div className="absolute top-2 left-0 right-0 h-[2px] bg-slate-300 mx-4 rounded" />

        <div className="mt-6 grid grid-cols-2 gap-3 h-[calc(100%-2rem)]">
          {units.map((unit) => (
            <UnitCard
              key={unit.id}
              unit={unit}
              selected={selected?.id === unit.id}
              onClick={() => onSelect(unit)}
            />
          ))}
        </div>

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-3 bg-slate-300 rounded-t-sm" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] text-slate-400">Koridor</div>
      </div>
    </div>
  );
}

function TODMap({ selected, onSelect }: { selected: Unit | null; onSelect: (u: Unit) => void }) {
  const booths = TOD_UNITS.filter((u) => u.id.startsWith("TOD-B"));
  const stands = TOD_UNITS.filter((u) => u.id.startsWith("TOD-S"));
  return (
    <div className="p-4 h-full flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="w-4 h-4" />
        <span>Lantai G — TOD (Transit Oriented Development)</span>
      </div>

      <div className="flex-1 relative bg-slate-50 rounded-xl border border-slate-200 overflow-hidden p-4 flex flex-col gap-3">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-slate-400 tracking-widest uppercase">Pintu Masuk</div>
        <div className="absolute top-2 left-0 right-0 h-[2px] bg-slate-300 mx-4 rounded" />

        <div className="mt-6">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Booth (6 unit)</p>
          <div className="grid grid-cols-3 gap-2">
            {booths.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                selected={selected?.id === unit.id}
                onClick={() => onSelect(unit)}
              />
            ))}
          </div>
        </div>

        <div className="h-[1px] bg-slate-200 mx-2 my-1 relative">
          <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-slate-50 px-2 text-[9px] text-slate-400">KORIDOR TENGAH</span>
        </div>

        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Stand (6 unit)</p>
          <div className="grid grid-cols-3 gap-2">
            {stands.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                selected={selected?.id === unit.id}
                onClick={() => onSelect(unit)}
              />
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-3 bg-slate-300 rounded-t-sm" />
      </div>
    </div>
  );
}

export default function TenantPos() {
  const [cabang, setCabang] = useState<"sport" | "tod">("sport");
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [modalUnit, setModalUnit] = useState<Unit | null>(null);

  const cabangLabel = cabang === "sport" ? "Sport Centre" : "TOD";

  const handleSelect = (unit: Unit) => {
    setSelectedUnit((prev) => (prev?.id === unit.id ? null : unit));
  };

  const handleCabangChange = (c: "sport" | "tod") => {
    setCabang(c);
    setSelectedUnit(null);
  };

  const handleProses = (unit: Unit) => setModalUnit(unit);

  const handleCetak = (unit: Unit) => {
    const now = new Date();
    cetakStrukPDF({
      noStruk: buatNoStruk(),
      tanggal: formatTanggal(now),
      jam: formatJam(now),
      cabang: cabangLabel,
      unitId: unit.id,
      unitNama: unit.nama,
      penyewa: unit.penyewa!,
      kategori: unit.kategori,
      luas: unit.luas,
      periodeBayar: unit.tagihanBulan!,
      sewaBulanan: unit.sewaBulanan!,
      jumlahBayar: unit.jumlahTagihan!,
      metodeBayar: "—",
      kasir: "Admin",
      status: unit.status === "menunggak" ? "tunggakan" : "lunas",
    });
  };

  const allUnits = cabang === "sport" ? SPORT_CENTRE : TOD_UNITS;
  const countAktif = allUnits.filter((u) => u.status === "aktif").length;
  const countKosong = allUnits.filter((u) => u.status === "kosong").length;
  const countMenunggak = allUnits.filter((u) => u.status === "menunggak").length;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">POS Tenant</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Klik unit pada denah untuk melihat detail pembayaran</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-400 border border-emerald-500 inline-block" />
            <span className="text-muted-foreground">Aktif ({countAktif})</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-300 border border-slate-400 inline-block" />
            <span className="text-muted-foreground">Kosong ({countKosong})</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-400 border border-red-500 inline-block" />
            <span className="text-muted-foreground">Menunggak ({countMenunggak})</span>
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleCabangChange("sport")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
            cabang === "sport"
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
          )}
        >
          <MapPin className="w-4 h-4" />
          Sport Centre
          <span className={cn("text-xs px-1.5 py-0.5 rounded-full", cabang === "sport" ? "bg-white/20" : "bg-muted")}>4</span>
        </button>
        <button
          onClick={() => handleCabangChange("tod")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
            cabang === "tod"
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
          )}
        >
          <MapPin className="w-4 h-4" />
          TOD
          <span className={cn("text-xs px-1.5 py-0.5 rounded-full", cabang === "tod" ? "bg-white/20" : "bg-muted")}>12</span>
        </button>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        <Card className="flex-1 min-w-0 overflow-hidden">
          <CardContent className="p-0 h-full">
            {cabang === "sport" ? (
              <SportCentreMap selected={selectedUnit} onSelect={handleSelect} />
            ) : (
              <TODMap selected={selectedUnit} onSelect={handleSelect} />
            )}
          </CardContent>
        </Card>

        <Card className="w-72 flex-shrink-0 overflow-hidden">
          <CardContent className="p-0 h-full">
            <DetailPanel
              unit={selectedUnit}
              onClose={() => setSelectedUnit(null)}
              onProses={handleProses}
              onCetak={handleCetak}
            />
          </CardContent>
        </Card>
      </div>

      {modalUnit && (
        <ModalPembayaran
          unit={modalUnit}
          cabang={cabangLabel}
          onClose={() => setModalUnit(null)}
        />
      )}
    </div>
  );
}
