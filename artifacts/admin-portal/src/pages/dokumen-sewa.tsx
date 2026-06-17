import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  FileSignature,
  AlertTriangle,
  Building2,
  MapPin,
  CalendarRange,
  BadgeDollarSign,
  Phone,
  Mail,
  User,
  Loader2,
} from "lucide-react";

// ── Helper ──────────────────────────────────────────────────────────────────────
function formatRp(v: string | number | null | undefined) {
  if (!v || Number(v) === 0) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function formatTgl(v: string | null | undefined, long = false) {
  if (!v) return "—";
  const opts: Intl.DateTimeFormatOptions = long
    ? { day: "numeric", month: "long", year: "numeric" }
    : { day: "numeric", month: "short", year: "numeric" };
  return new Date(v).toLocaleDateString("id-ID", opts);
}

function today() {
  return new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

// ── Tipe data ──────────────────────────────────────────────────────────────────
interface DraftData {
  id: number;
  token: string;
  docType: "surat_minat" | "perjanjian_sewa";
  picName: string | null;
  tenantName: string;
  brandName: string;
  businessType: string;
  email: string | null;
  phone: string;
  address: string | null;
  unitCode: string | null;
  areaName: string | null;
  startDate: string | null;
  endDate: string | null;
  durationMonths: number | null;
  periodLabel: string | null;
  rentAmount: string;
  depositAmount: string;
  paymentTerms: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  respondedAt: string | null;
  respondedName: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
}

// ── Template dokumen ──────────────────────────────────────────────────────────
function SuratMinatDoc({ d }: { d: DraftData }) {
  const nomorSurat = `SM/${String(d.id).padStart(4, "0")}/${new Date().getFullYear()}`;
  const lokasi = [d.unitCode, d.areaName].filter(Boolean).join(" — ") || "Akan ditentukan";

  return (
    <div className="space-y-5 text-[15px] leading-relaxed text-slate-800 font-[Georgia,serif]">
      {/* KOP */}
      <div className="text-center space-y-1 border-b-2 border-slate-800 pb-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Building2 className="h-8 w-8 text-slate-700" />
        </div>
        <h1 className="text-lg font-bold uppercase tracking-widest">Manajemen Mal / Sport Center</h1>
        <p className="text-sm">Gedung Pusat Perbelanjaan & Olahraga</p>
        <p className="text-xs text-slate-500">Jl. Utama No. 1 · Bandung · Telp: (022) 0000-0000</p>
      </div>

      {/* Judul */}
      <div className="text-center space-y-1">
        <h2 className="text-base font-bold uppercase underline tracking-wide">Surat Minat Menyewa Tenant</h2>
        <p className="text-sm text-slate-500">Nomor: {nomorSurat}</p>
      </div>

      {/* Pembuka */}
      <p>Yang bertanda tangan di bawah ini:</p>

      {/* Identitas */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Nama Calon Tenant / PIC", d.picName || d.tenantName],
              ["Nama Brand / Usaha", d.brandName],
              ["Jenis Usaha", d.businessType],
              ["Nomor WhatsApp / Telepon", d.phone],
              ["Email", d.email || "—"],
              ["Alamat", d.address || "—"],
            ].map(([label, val]) => (
              <tr key={label} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-4 font-medium text-slate-600 w-44 bg-slate-50">{label}</td>
                <td className="py-2 px-4">: {val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        Dengan ini menyatakan <strong>minat untuk menyewa</strong> unit usaha di lingkungan Mal / Sport Center,
        dengan rincian sebagai berikut:
      </p>

      {/* Detail sewa */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Lokasi / Unit yang Diminati", lokasi],
              ["Periode Sewa", d.periodLabel || [d.startDate && formatTgl(d.startDate), d.endDate && formatTgl(d.endDate)].filter(Boolean).join(" s.d. ") || "—"],
              ["Durasi", d.durationMonths ? `${d.durationMonths} bulan` : "—"],
              ["Harga Sewa per Bulan", formatRp(d.rentAmount)],
              ["Deposit / Jaminan", formatRp(d.depositAmount)],
            ].map(([label, val]) => (
              <tr key={label} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-4 font-medium text-slate-600 w-44 bg-slate-50">{label}</td>
                <td className="py-2 px-4">: {val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ketentuan pembayaran */}
      {d.paymentTerms && (
        <>
          <h3 className="font-semibold">Ketentuan Pembayaran</h3>
          <p className="text-sm whitespace-pre-wrap">{d.paymentTerms}</p>
        </>
      )}

      {/* Pernyataan */}
      <div className="space-y-2">
        <h3 className="font-semibold">Pernyataan</h3>
        <p>
          Dengan mengirimkan surat minat ini, saya menyatakan bahwa:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm pl-2">
          <li>Data yang saya berikan adalah benar dan dapat dipertanggungjawabkan.</li>
          <li>Saya memahami bahwa surat minat ini bukan merupakan perjanjian yang mengikat secara hukum.</li>
          <li>Keputusan final penerimaan tenant berada di tangan pihak manajemen.</li>
          <li>Saya bersedia untuk mengikuti proses selanjutnya yang ditetapkan oleh pihak manajemen.</li>
          <li>Apabila diterima, saya akan menandatangani Perjanjian Sewa Tenant sesuai ketentuan yang berlaku.</li>
        </ol>
      </div>

      {/* Catatan */}
      {d.notes && (
        <>
          <h3 className="font-semibold">Catatan Tambahan</h3>
          <p className="text-sm whitespace-pre-wrap bg-amber-50 border border-amber-100 rounded-lg p-3">{d.notes}</p>
        </>
      )}

      {/* Footer persetujuan */}
      <div className="border-t pt-4 mt-2 space-y-2">
        <p className="text-sm font-semibold">Informasi Persetujuan:</p>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Tanggal Persetujuan", d.status !== "pending" && d.respondedAt ? formatTgl(d.respondedAt, true) : "— (menunggu persetujuan)"],
                ["Nama Calon Tenant", d.respondedName || d.tenantName],
                ["Status Dokumen", d.status === "approved" ? "✅ Disetujui" : d.status === "rejected" ? "❌ Tidak Disetujui" : "⏳ Menunggu Persetujuan"],
              ].map(([label, val]) => (
                <tr key={label} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 px-4 font-medium text-slate-600 w-44 bg-slate-50">{label}</td>
                  <td className="py-2 px-4">: {val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-sm text-slate-500">Dokumen ini dibuat pada {today()}.</p>
    </div>
  );
}

function PerjanjianSewaDoc({ d }: { d: DraftData }) {
  const nomorPerjanjian = `PST/${String(d.id).padStart(4, "0")}/${new Date().getFullYear()}`;
  const lokasi = [d.unitCode, d.areaName].filter(Boolean).join(" — ") || "sebagaimana akan ditentukan kemudian";
  const periodeLabel = d.periodLabel || [
    d.startDate ? formatTgl(d.startDate, true) : null,
    d.endDate ? formatTgl(d.endDate, true) : null,
  ].filter(Boolean).join(" sampai dengan ") || "—";

  return (
    <div className="space-y-5 text-[15px] leading-relaxed text-slate-800 font-[Georgia,serif]">
      {/* KOP */}
      <div className="text-center space-y-1 border-b-2 border-slate-800 pb-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Building2 className="h-8 w-8 text-slate-700" />
        </div>
        <h1 className="text-lg font-bold uppercase tracking-widest">Manajemen Mal / Sport Center</h1>
        <p className="text-sm">Gedung Pusat Perbelanjaan & Olahraga</p>
        <p className="text-xs text-slate-500">Jl. Utama No. 1 · Bandung · Telp: (022) 0000-0000</p>
      </div>

      {/* Judul */}
      <div className="text-center space-y-1">
        <h2 className="text-base font-bold uppercase underline tracking-wide">Draf Perjanjian Sewa Tenant</h2>
        <p className="text-sm text-slate-500">Nomor: {nomorPerjanjian}</p>
      </div>

      {/* Para pihak */}
      <div className="space-y-2">
        <h3 className="font-semibold">Para Pihak</h3>
        <p>Perjanjian ini dibuat dan disepakati oleh:</p>
        <div className="space-y-3 pl-2">
          <div>
            <p className="font-medium">Pihak Pertama (Pihak Pengelola)</p>
            <p className="text-sm text-slate-600">Manajemen Mal / Sport Center, berkedudukan di Bandung, selanjutnya disebut <strong>"Pengelola"</strong>.</p>
          </div>
          <div>
            <p className="font-medium">Pihak Kedua (Tenant)</p>
            <div className="text-sm text-slate-600 space-y-0.5">
              <p>Nama&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; : <strong>{d.tenantName}</strong></p>
              <p>Brand/Usaha : <strong>{d.brandName}</strong></p>
              <p>Jenis Usaha&nbsp; : {d.businessType}</p>
              <p>Telepon&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; : {d.phone}</p>
              {d.email && <p>Email&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; : {d.email}</p>}
              {d.address && <p>Alamat&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; : {d.address}</p>}
              <p className="mt-1">selanjutnya disebut <strong>"Tenant"</strong>.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pasal 1: Objek sewa */}
      <div className="space-y-2">
        <h3 className="font-semibold">Pasal 1 — Objek Sewa</h3>
        <p className="text-sm">
          Pengelola setuju untuk menyewakan, dan Tenant setuju untuk menyewa unit usaha dengan lokasi{" "}
          <strong>{lokasi}</strong> di lingkungan Mal / Sport Center, untuk digunakan sebagai tempat usaha
          jenis <strong>{d.businessType}</strong>.
        </p>
      </div>

      {/* Pasal 2: Jangka waktu */}
      <div className="space-y-2">
        <h3 className="font-semibold">Pasal 2 — Jangka Waktu Sewa</h3>
        <p className="text-sm">
          Perjanjian sewa ini berlaku selama <strong>{d.durationMonths ? `${d.durationMonths} (${d.durationMonths} bulan)` : "sesuai kesepakatan"}</strong>,
          terhitung {periodeLabel}.
        </p>
        <p className="text-sm">
          Apabila Tenant hendak memperpanjang masa sewa, wajib memberitahukan secara tertulis paling
          lambat <strong>30 (tiga puluh) hari</strong> sebelum berakhirnya perjanjian ini.
        </p>
      </div>

      {/* Pasal 3: Harga sewa */}
      <div className="space-y-2">
        <h3 className="font-semibold">Pasal 3 — Harga Sewa dan Deposit</h3>
        <p className="text-sm">
          Harga sewa yang disepakati adalah sebesar <strong>{formatRp(d.rentAmount)}</strong> per bulan.
        </p>
        <p className="text-sm">
          Tenant wajib membayar deposit / uang jaminan sebesar <strong>{formatRp(d.depositAmount)}</strong>{" "}
          sebelum menempati unit. Deposit akan dikembalikan pada akhir masa sewa, dikurangi kewajiban yang
          belum terpenuhi (jika ada).
        </p>
        {d.paymentTerms && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">Ketentuan Pembayaran:</p>
            <p className="whitespace-pre-wrap">{d.paymentTerms}</p>
          </div>
        )}
      </div>

      {/* Pasal 4: Hak & kewajiban */}
      <div className="space-y-2">
        <h3 className="font-semibold">Pasal 4 — Hak dan Kewajiban Tenant</h3>
        <div className="text-sm space-y-2">
          <p className="font-medium text-slate-600">Hak Tenant:</p>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>Menggunakan unit sesuai peruntukannya selama masa sewa berlaku.</li>
            <li>Mendapatkan fasilitas umum yang tersedia di lingkungan Mal / Sport Center.</li>
            <li>Mendapatkan informasi mengenai kebijakan yang memengaruhi usaha Tenant.</li>
          </ol>
          <p className="font-medium text-slate-600 mt-3">Kewajiban Tenant:</p>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>Membayar uang sewa tepat waktu sesuai ketentuan yang telah disepakati.</li>
            <li>Menjaga kebersihan dan ketertiban unit serta lingkungan sekitarnya.</li>
            <li>Tidak mengalihkan atau mensubleasingkan unit kepada pihak lain tanpa seizin Pengelola.</li>
            <li>Menggunakan unit sesuai jenis usaha yang telah disetujui.</li>
            <li>Mematuhi seluruh peraturan dan tata tertib yang berlaku di lingkungan Mal / Sport Center.</li>
            <li>Menanggung biaya perbaikan kerusakan yang disebabkan oleh kelalaian Tenant.</li>
            <li>Mengembalikan unit dalam kondisi baik pada akhir masa sewa.</li>
          </ol>
        </div>
      </div>

      {/* Pasal 5: Ketentuan pembatalan */}
      <div className="space-y-2">
        <h3 className="font-semibold">Pasal 5 — Ketentuan Pembatalan</h3>
        <div className="text-sm space-y-1.5">
          <p>Perjanjian ini dapat diakhiri sebelum masa sewa berakhir apabila:</p>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>Tenant tidak membayar uang sewa lebih dari <strong>30 (tiga puluh) hari</strong> dari tanggal jatuh tempo.</li>
            <li>Tenant melakukan pelanggaran berat terhadap peraturan yang berlaku.</li>
            <li>Tenant mengundurkan diri secara sukarela dengan pemberitahuan tertulis minimum 30 hari.</li>
          </ol>
          <p>
            Apabila perjanjian diakhiri atas permintaan Tenant sebelum berakhirnya masa sewa, deposit tidak
            dapat dikembalikan dan Tenant tetap berkewajiban membayar sisa sewa selama <strong>2 (dua) bulan</strong>.
          </p>
        </div>
      </div>

      {/* Pasal 6: Penyelesaian sengketa */}
      <div className="space-y-2">
        <h3 className="font-semibold">Pasal 6 — Penyelesaian Sengketa</h3>
        <p className="text-sm">
          Apabila terjadi perselisihan dalam pelaksanaan perjanjian ini, Para Pihak sepakat untuk
          menyelesaikannya secara musyawarah dan mufakat. Apabila tidak tercapai kesepakatan, Para Pihak
          sepakat untuk menyelesaikan melalui jalur hukum yang berlaku di Indonesia.
        </p>
      </div>

      {/* Catatan */}
      {d.notes && (
        <div className="space-y-2">
          <h3 className="font-semibold">Catatan Khusus</h3>
          <p className="text-sm whitespace-pre-wrap bg-amber-50 border border-amber-100 rounded-lg p-3">{d.notes}</p>
        </div>
      )}

      {/* Footer persetujuan */}
      <div className="border-t pt-4 mt-2 space-y-2">
        <p className="text-sm font-semibold">Informasi Persetujuan:</p>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Tanggal Persetujuan", d.status !== "pending" && d.respondedAt ? formatTgl(d.respondedAt, true) : "— (menunggu persetujuan)"],
                ["Nama Penyewa", d.respondedName || d.tenantName],
                ["Email / WA", [d.email, d.phone].filter(Boolean).join(" / ") || "—"],
                ["Status Dokumen", d.status === "approved" ? "✅ Disetujui" : d.status === "rejected" ? "❌ Tidak Disetujui" : "⏳ Menunggu Persetujuan"],
              ].map(([label, val]) => (
                <tr key={label} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 px-4 font-medium text-slate-600 w-44 bg-slate-50">{label}</td>
                  <td className="py-2 px-4">: {val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-sm text-slate-500">Dokumen ini dibuat pada {today()} dan merupakan draf yang perlu disetujui oleh Tenant sebelum diterbitkan sebagai perjanjian resmi.</p>
    </div>
  );
}

// ── Form setuju ───────────────────────────────────────────────────────────────
interface ResponseForm {
  respondedName: string;
  respondedEmail: string;
  respondedPhone: string;
}

// ── Halaman utama ─────────────────────────────────────────────────────────────
export default function DokumenSewa() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [showSetuju, setShowSetuju] = useState(false);
  const [showTolak, setShowTolak] = useState(false);
  const [respForm, setRespForm] = useState<ResponseForm>({ respondedName: "", respondedEmail: "", respondedPhone: "" });
  const [rejectionReason, setRejectionReason] = useState("");
  const [result, setResult] = useState<{ status: "approved" | "rejected"; message: string } | null>(null);

  const { data: draft, isLoading, error } = useQuery<DraftData>({
    queryKey: ["dokumen", token],
    queryFn: async () => {
      const res = await fetch(`/api/dokumen/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Terjadi kesalahan" }));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json();
    },
    retry: false,
    enabled: !!token,
  });

  const setujuMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/dokumen/${token}/setuju`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondedName: respForm.respondedName,
          respondedEmail: respForm.respondedEmail || undefined,
          respondedPhone: respForm.respondedPhone || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Gagal menyimpan persetujuan");
      return body;
    },
    onSuccess: (data) => {
      setShowSetuju(false);
      setResult({ status: "approved", message: data.message });
    },
    onError: (err: Error) => {
      alert(err.message);
    },
  });

  const tolakMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/dokumen/${token}/tolak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondedName: respForm.respondedName,
          respondedEmail: respForm.respondedEmail || undefined,
          respondedPhone: respForm.respondedPhone || undefined,
          rejectionReason,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Gagal menyimpan respon");
      return body;
    },
    onSuccess: (data) => {
      setShowTolak(false);
      setResult({ status: "rejected", message: data.message });
    },
    onError: (err: Error) => {
      alert(err.message);
    },
  });

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Memuat dokumen...</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !draft) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold">Dokumen Tidak Ditemukan</h1>
          <p className="text-muted-foreground text-sm">
            {error instanceof Error ? error.message : "Link ini tidak valid atau sudah kedaluwarsa."}
          </p>
          <p className="text-xs text-slate-400">
            Jika Anda merasa mendapatkan link ini dari pihak yang sah, silakan hubungi manajemen untuk mendapatkan link baru.
          </p>
        </div>
      </div>
    );
  }

  // ── Hasil respon ─────────────────────────────────────────────────────────────
  if (result) {
    const isApproved = result.status === "approved";
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center space-y-4">
          {isApproved ? (
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
          ) : (
            <XCircle className="h-14 w-14 text-slate-400 mx-auto" />
          )}
          <h2 className="text-xl font-semibold">
            {isApproved ? "Terima Kasih!" : "Respon Anda Telah Dicatat"}
          </h2>
          <p className="text-muted-foreground text-sm">{result.message}</p>
          {isApproved && (
            <div className="text-xs text-muted-foreground bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              Persetujuan Anda telah kami catat beserta tanggal dan waktu respon. Tim kami akan segera menghubungi Anda untuk langkah selanjutnya.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Dokumen sudah direspon sebelumnya ─────────────────────────────────────
  if (draft.status !== "pending") {
    const isApproved = draft.status === "approved";
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center space-y-4">
          {isApproved ? (
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
          ) : (
            <XCircle className="h-14 w-14 text-red-400 mx-auto" />
          )}
          <h2 className="text-xl font-semibold">
            Dokumen Telah {isApproved ? "Disetujui" : "Ditolak"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Dokumen ini telah direspon pada{" "}
            <strong>{formatTgl(draft.respondedAt, true)}</strong> oleh {draft.respondedName || "tenant"}.
          </p>
          {!isApproved && draft.rejectionReason && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 text-left">
              <p className="font-medium mb-1">Alasan Penolakan:</p>
              <p>{draft.rejectionReason}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const docTypeLabel = draft.docType === "perjanjian_sewa" ? "Draf Perjanjian Sewa Tenant" : "Surat Minat Menyewa Tenant";

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Topbar */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            {draft.docType === "perjanjian_sewa"
              ? <FileSignature className="h-4 w-4 text-primary" />
              : <FileText className="h-4 w-4 text-primary" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{docTypeLabel}</p>
            <p className="text-xs text-muted-foreground">Untuk: {draft.brandName} · {draft.tenantName}</p>
          </div>
          <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 text-xs font-medium">
            <Clock className="h-3 w-3" />Menunggu Persetujuan
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Ringkasan cepat */}
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: <User className="h-4 w-4 text-blue-500" />, label: "Calon Tenant", val: draft.brandName },
              { icon: <MapPin className="h-4 w-4 text-emerald-500" />, label: "Lokasi", val: [draft.unitCode, draft.areaName].filter(Boolean).join(" · ") || "—" },
              { icon: <CalendarRange className="h-4 w-4 text-violet-500" />, label: "Periode", val: draft.periodLabel || (draft.durationMonths ? `${draft.durationMonths} bulan` : "—") },
              { icon: <BadgeDollarSign className="h-4 w-4 text-amber-500" />, label: "Sewa/Bulan", val: formatRp(draft.rentAmount) },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0">{item.icon}</div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium">{item.val}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Kontak info */}
        <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            <span>{draft.phone}</span>
          </div>
          {draft.email && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>{draft.email}</span>
            </div>
          )}
          {draft.expiresAt && (
            <div className="flex items-center gap-1.5 text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs">Link berlaku hingga {formatTgl(draft.expiresAt, true)}</span>
            </div>
          )}
        </div>

        {/* Dokumen */}
        <div className="bg-white rounded-xl border shadow-sm p-6 md:p-10">
          {draft.docType === "perjanjian_sewa"
            ? <PerjanjianSewaDoc d={draft} />
            : <SuratMinatDoc d={draft} />
          }
        </div>

        {/* Tombol cetak */}
        <div className="flex justify-end">
          <button
            onClick={() => window.print()}
            className="text-xs text-muted-foreground border rounded-lg px-3 py-1.5 hover:bg-muted flex items-center gap-1.5"
          >
            🖨️ Cetak / Unduh PDF
          </button>
        </div>

        {/* Tombol aksi */}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <p className="text-sm text-center text-muted-foreground mb-4">
            Setelah membaca seluruh isi dokumen di atas, silakan berikan respon Anda:
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="flex-1 gap-2 h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setShowSetuju(true)}
            >
              <CheckCircle2 className="h-4 w-4" />
              Saya Setuju
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2 h-11 border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => setShowTolak(true)}
            >
              <XCircle className="h-4 w-4" />
              Saya Tidak Setuju
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-3">
            Dengan menekan tombol, Anda menyatakan telah membaca dan memahami isi dokumen. Persetujuan akan dicatat beserta waktu dan identitas Anda.
          </p>
        </div>
      </div>

      {/* Dialog: Setuju */}
      <Dialog open={showSetuju} onOpenChange={setShowSetuju}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />Konfirmasi Persetujuan
            </DialogTitle>
            <DialogDescription>
              Masukkan data Anda untuk mengkonfirmasi persetujuan atas <strong>{docTypeLabel}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nama Lengkap <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Nama sesuai KTP"
                value={respForm.respondedName}
                onChange={(e) => setRespForm((f) => ({ ...f, respondedName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="email@domain.com (opsional)"
                value={respForm.respondedEmail}
                onChange={(e) => setRespForm((f) => ({ ...f, respondedEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nomor Telepon</Label>
              <Input
                placeholder="628xxxxxxxxx (opsional)"
                value={respForm.respondedPhone}
                onChange={(e) => setRespForm((f) => ({ ...f, respondedPhone: e.target.value }))}
              />
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700">
              Dengan menekan "Ya, Saya Setuju", persetujuan Anda akan dicatat beserta tanggal, waktu, dan alamat IP Anda sebagai bukti digital.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetuju(false)}>Batal</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              disabled={!respForm.respondedName.trim() || setujuMutation.isPending}
              onClick={() => setujuMutation.mutate()}
            >
              {setujuMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Ya, Saya Setuju
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Tidak setuju */}
      <Dialog open={showTolak} onOpenChange={setShowTolak}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />Tidak Setuju
            </DialogTitle>
            <DialogDescription>
              Mohon berikan alasan ketidaksetujuan Anda agar tim kami dapat menindaklanjuti.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nama Lengkap <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Nama sesuai KTP"
                value={respForm.respondedName}
                onChange={(e) => setRespForm((f) => ({ ...f, respondedName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Alasan Penolakan <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Tuliskan alasan Anda tidak menyetujui dokumen ini..."
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email (opsional)</Label>
              <Input
                type="email"
                placeholder="email@domain.com"
                value={respForm.respondedEmail}
                onChange={(e) => setRespForm((f) => ({ ...f, respondedEmail: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTolak(false)}>Batal</Button>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={!respForm.respondedName.trim() || !rejectionReason.trim() || tolakMutation.isPending}
              onClick={() => tolakMutation.mutate()}
            >
              {tolakMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              Kirim Penolakan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
