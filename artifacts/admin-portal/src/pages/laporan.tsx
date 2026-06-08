import React, { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Sector,
} from "recharts";
import { TrendingUp, TrendingDown, Building2, AlertCircle, CheckCircle2, CircleDashed, Download, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatRupiah(v: number) {
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)}jt`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}
function formatRupiahFull(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

const DATA_2026 = [
  { bulan: "Jan", sport: 13000000, tod: 13600000 },
  { bulan: "Feb", sport: 13000000, tod: 12400000 },
  { bulan: "Mar", sport: 13000000, tod: 13600000 },
  { bulan: "Apr", sport: 8500000,  tod: 11200000 },
  { bulan: "Mei", sport: 13000000, tod: 11200000 },
  { bulan: "Jun", sport: 13000000, tod: 13600000 },
];

const DATA_2025 = [
  { bulan: "Jan", sport: 12000000, tod: 10800000 },
  { bulan: "Feb", sport: 12000000, tod: 11200000 },
  { bulan: "Mar", sport: 12000000, tod: 12400000 },
  { bulan: "Apr", sport: 12000000, tod: 12400000 },
  { bulan: "Mei", sport: 12000000, tod: 13600000 },
  { bulan: "Jun", sport: 8000000,  tod: 13600000 },
  { bulan: "Jul", sport: 12000000, tod: 13600000 },
  { bulan: "Ags", sport: 13000000, tod: 13600000 },
  { bulan: "Sep", sport: 13000000, tod: 12400000 },
  { bulan: "Okt", sport: 13000000, tod: 13600000 },
  { bulan: "Nov", sport: 13000000, tod: 13600000 },
  { bulan: "Des", sport: 13000000, tod: 13600000 },
];

const STATUS_SPORT = [
  { name: "Aktif", value: 2, color: "#10b981" },
  { name: "Kosong", value: 1, color: "#94a3b8" },
  { name: "Menunggak", value: 1, color: "#ef4444" },
];
const STATUS_TOD = [
  { name: "Aktif", value: 8, color: "#10b981" },
  { name: "Kosong", value: 2, color: "#94a3b8" },
  { name: "Menunggak", value: 2, color: "#ef4444" },
];

const REKAP_SPORT = [
  { id: "SC-01", nama: "Xtreme Gym", kategori: "Olahraga", sewa: 8500000, status: "Aktif", bayar: "Lunas" },
  { id: "SC-02", nama: "Sport Station", kategori: "Peralatan", sewa: 6000000, status: "Menunggak", bayar: "3 bulan" },
  { id: "SC-03", nama: "Juice Bar Fresh", kategori: "F&B", sewa: 4500000, status: "Aktif", bayar: "Lunas" },
  { id: "SC-04", nama: "—", kategori: "—", sewa: 0, status: "Kosong", bayar: "—" },
];
const REKAP_TOD = [
  { id: "TOD-B1", nama: "Batik Nusantara", kategori: "Fashion", sewa: 2500000, status: "Aktif", bayar: "Lunas" },
  { id: "TOD-B2", nama: "Gelang & Cincin", kategori: "Aksesori", sewa: 2500000, status: "Menunggak", bayar: "2 bulan" },
  { id: "TOD-B3", nama: "Martabak 99", kategori: "Kuliner", sewa: 2500000, status: "Aktif", bayar: "Lunas" },
  { id: "TOD-B4", nama: "—", kategori: "—", sewa: 0, status: "Kosong", bayar: "—" },
  { id: "TOD-B5", nama: "Cantik Alami", kategori: "Skincare", sewa: 2500000, status: "Aktif", bayar: "Lunas" },
  { id: "TOD-B6", nama: "Toys Kingdom Mini", kategori: "Mainan", sewa: 2500000, status: "Aktif", bayar: "Lunas" },
  { id: "TOD-S1", nama: "Batagor Pak Haji", kategori: "Jajanan", sewa: 1200000, status: "Aktif", bayar: "Lunas" },
  { id: "TOD-S2", nama: "Es Teh Manis", kategori: "Minuman", sewa: 1200000, status: "Menunggak", bayar: "1 bulan" },
  { id: "TOD-S3", nama: "—", kategori: "—", sewa: 0, status: "Kosong", bayar: "—" },
  { id: "TOD-S4", nama: "Harum Selalu", kategori: "Parfum", sewa: 1200000, status: "Aktif", bayar: "Lunas" },
  { id: "TOD-S5", nama: "—", kategori: "—", sewa: 0, status: "Kosong", bayar: "—" },
  { id: "TOD-S6", nama: "Keripik Mak Encum", kategori: "Camilan", sewa: 1200000, status: "Aktif", bayar: "Lunas" },
];

const statusBadge: Record<string, string> = {
  Aktif: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Menunggak: "bg-red-100 text-red-700 border-red-200",
  Kosong: "bg-slate-100 text-slate-500 border-slate-200",
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-medium">{formatRupiah(p.value)}</span>
        </div>
      ))}
      {payload.length === 2 && (
        <div className="border-t border-slate-100 mt-1.5 pt-1.5 flex justify-between">
          <span className="text-slate-400">Total</span>
          <span className="font-semibold">{formatRupiah(payload.reduce((s: number, p: any) => s + p.value, 0))}</span>
        </div>
      )}
    </div>
  );
}

function ActiveShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#1e293b" className="text-sm font-bold" fontSize={13} fontWeight={700}>{payload.name}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748b" fontSize={12}>{value} unit</text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 10} outerRadius={outerRadius + 12} startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
}

function DonutChart({ data, title }: { data: typeof STATUS_SPORT; title: string }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</p>
      <div className="flex items-center gap-4">
        <PieChart width={140} height={140}>
          <Pie
            activeIndex={active}
            activeShape={ActiveShape}
            data={data}
            cx={65}
            cy={65}
            innerRadius={42}
            outerRadius={58}
            dataKey="value"
            onMouseEnter={(_, i) => setActive(i)}
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
        </PieChart>
        <div className="space-y-1.5 flex-1">
          {data.map((d) => (
            <div key={d.name} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.color }} />
                <span className="text-slate-600">{d.name}</span>
              </span>
              <span className="font-semibold">{d.value} unit</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Laporan() {
  const [tahun, setTahun] = useState<"2026" | "2025">("2026");
  const [cabangRekap, setCabangRekap] = useState<"sport" | "tod">("sport");

  const data = tahun === "2026" ? DATA_2026 : DATA_2025;
  const totalSport = data.reduce((s, d) => s + d.sport, 0);
  const totalTod = data.reduce((s, d) => s + d.tod, 0);
  const totalAll = totalSport + totalTod;

  const prevData = tahun === "2026" ? DATA_2025 : DATA_2025;
  const prevSport = prevData.slice(0, data.length).reduce((s, d) => s + d.sport, 0);
  const prevTod = prevData.slice(0, data.length).reduce((s, d) => s + d.tod, 0);

  const diffSport = totalSport - prevSport;
  const diffTod = totalTod - prevTod;

  const tunggakanSport = 18000000;
  const tunggakanTod = 5000000 + 1200000;

  const rekapData = cabangRekap === "sport" ? REKAP_SPORT : REKAP_TOD;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laporan Rekap Pembayaran</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Ringkasan pendapatan & status pembayaran per cabang</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={tahun}
              onChange={(e) => setTahun(e.target.value as "2026" | "2025")}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-slate-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              <option value="2026">Tahun 2026</option>
              <option value="2025">Tahun 2025</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium bg-white hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4 text-slate-500" />
            Ekspor
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Pendapatan</p>
            <p className="text-2xl font-bold mt-1 tracking-tight">{formatRupiah(totalAll)}</p>
            <p className="text-xs text-muted-foreground mt-1">{data.length} bulan pertama {tahun}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Sport Centre</p>
            <p className="text-2xl font-bold mt-1 text-blue-700 tracking-tight">{formatRupiah(totalSport)}</p>
            <div className={cn("flex items-center gap-1 text-xs mt-1", diffSport >= 0 ? "text-emerald-600" : "text-red-500")}>
              {diffSport >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {diffSport >= 0 ? "+" : ""}{formatRupiah(Math.abs(diffSport))} vs periode sama
            </div>
          </CardContent>
        </Card>
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-violet-600 font-medium uppercase tracking-wide">TOD</p>
            <p className="text-2xl font-bold mt-1 text-violet-700 tracking-tight">{formatRupiah(totalTod)}</p>
            <div className={cn("flex items-center gap-1 text-xs mt-1", diffTod >= 0 ? "text-emerald-600" : "text-red-500")}>
              {diffTod >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {diffTod >= 0 ? "+" : ""}{formatRupiah(Math.abs(diffTod))} vs periode sama
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Total Tunggakan</p>
            <p className="text-2xl font-bold mt-1 text-red-600 tracking-tight">{formatRupiah(tunggakanSport + tunggakanTod)}</p>
            <div className="flex items-center gap-1 text-xs mt-1 text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              4 unit menunggak aktif
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Perbandingan Pendapatan Bulanan</CardTitle>
          <CardDescription>Sport Centre vs TOD — {tahun}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} barGap={4} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="bulan" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${v / 1_000_000}jt`} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={38} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
              <Legend
                formatter={(value) => <span className="text-xs text-slate-600 font-medium">{value}</span>}
                iconType="circle" iconSize={8}
              />
              <Bar dataKey="sport" name="Sport Centre" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tod" name="TOD" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Line Chart + Donut Charts */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tren Akumulasi Pendapatan</CardTitle>
            <CardDescription>Kumulatif per bulan — {tahun}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.map((d, i) => ({
                bulan: d.bulan,
                sport: data.slice(0, i + 1).reduce((s, x) => s + x.sport, 0),
                tod: data.slice(0, i + 1).reduce((s, x) => s + x.tod, 0),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="bulan" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${v / 1_000_000}jt`} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={38} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="sport" name="Sport Centre" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} />
                <Line type="monotone" dataKey="tod" name="TOD" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3, fill: "#7c3aed" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status Unit</CardTitle>
            <CardDescription>Distribusi per cabang</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <DonutChart data={STATUS_SPORT} title="Sport Centre (4 unit)" />
            <div className="border-t border-slate-100" />
            <DonutChart data={STATUS_TOD} title="TOD (12 unit)" />
          </CardContent>
        </Card>
      </div>

      {/* Rekap Tabel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Rekap Pembayaran Detail</CardTitle>
              <CardDescription>Status pembayaran per tenant</CardDescription>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setCabangRekap("sport")}
                className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                  cabangRekap === "sport" ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-600 hover:border-blue-300")}
              >
                Sport Centre
              </button>
              <button
                onClick={() => setCabangRekap("tod")}
                className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                  cabangRekap === "tod" ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-200 text-slate-600 hover:border-violet-300")}
              >
                TOD
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">ID</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nama Tenant</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Kategori</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sewa/Bulan</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pembayaran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rekapData.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.id}</td>
                    <td className="px-4 py-3 font-medium">{row.nama}</td>
                    <td className="px-4 py-3 text-slate-500">{row.kategori}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {row.sewa > 0 ? formatRupiahFull(row.sewa) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium", statusBadge[row.status])}>
                        {row.status === "Aktif" && <CheckCircle2 className="w-3 h-3" />}
                        {row.status === "Menunggak" && <AlertCircle className="w-3 h-3" />}
                        {row.status === "Kosong" && <CircleDashed className="w-3 h-3" />}
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">
                      {row.bayar === "Lunas"
                        ? <span className="text-emerald-600 font-medium text-xs">✓ Lunas</span>
                        : row.bayar === "—"
                        ? <span className="text-slate-400 text-xs">—</span>
                        : <span className="text-red-600 font-medium text-xs">Tunggak {row.bayar}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t">
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-slate-600">Total</td>
                  <td className="px-4 py-2.5 text-right font-bold text-sm tabular-nums">
                    {formatRupiahFull(rekapData.reduce((s, r) => s + r.sewa, 0))}
                  </td>
                  <td colSpan={2} className="px-4 py-2.5 text-xs text-slate-400 text-center">
                    {rekapData.filter(r => r.status === "Aktif").length} aktif ·{" "}
                    {rekapData.filter(r => r.status === "Menunggak").length} menunggak ·{" "}
                    {rekapData.filter(r => r.status === "Kosong").length} kosong
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
