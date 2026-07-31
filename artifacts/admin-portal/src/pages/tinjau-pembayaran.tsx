import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Loader2,
  RefreshCw,
  ClipboardCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

function formatRupiah(val: string | number | null | undefined) {
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
  transfer: "Transfer Bank",
  qris: "QRIS",
  tunai: "Tunai",
  edc: "EDC/Debit",
  other: "Lainnya",
};

const STATUS_CONFIG = {
  pending_review: {
    label: "Menunggu",
    variant: "secondary" as const,
    icon: <Clock className="h-3 w-3" />,
    color: "text-amber-600 bg-amber-50 border-amber-200",
  },
  approved: {
    label: "Disetujui",
    variant: "default" as const,
    icon: <CheckCircle className="h-3 w-3" />,
    color: "text-green-700 bg-green-50 border-green-200",
  },
  rejected: {
    label: "Ditolak",
    variant: "destructive" as const,
    icon: <XCircle className="h-3 w-3" />,
    color: "text-red-700 bg-red-50 border-red-200",
  },
};

interface PendingPayment {
  id: number;
  receiptNumber: string;
  amount: string;
  paymentMethod: string;
  proofUrl: string | null;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
  approvalStatus: string;
  rejectionReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  invoiceId: number | null;
  invoiceNumber: string | null;
  totalAmount: string | null;
  outstandingAmount: string | null;
  tenantName: string | null;
  ownerName: string | null;
  phone: string | null;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export default function TinjauPembayaran() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("pending_review");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [approveId, setApproveId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [alreadyPaidWarning, setAlreadyPaidWarning] = useState(false);

  const { data: payments = [], isLoading, refetch } = useQuery<PendingPayment[]>({
    queryKey: ["pending-payments", activeTab],
    queryFn: () => apiFetch(`/api/pending-payments?status=${activeTab}`),
    refetchInterval: activeTab === "pending_review" ? 30_000 : false,
  });

  const { data: counts } = useQuery<{ pending_review: number; approved: number; rejected: number }>({
    queryKey: ["pending-payments-counts"],
    queryFn: async () => {
      const [p, a, r] = await Promise.all([
        apiFetch("/api/pending-payments?status=pending_review"),
        apiFetch("/api/pending-payments?status=approved"),
        apiFetch("/api/pending-payments?status=rejected"),
      ]);
      return { pending_review: p.length, approved: a.length, rejected: r.length };
    },
    refetchInterval: 30_000,
  });

  const approveMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/pending-payments/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-payments"] });
      qc.invalidateQueries({ queryKey: ["pending-payments-counts"] });
      toast({ title: "Pembayaran disetujui", description: "Status invoice telah diperbarui." });
      setApproveId(null);
    },
    onError: (e: Error) => {
      // Jika invoice sudah lunas (outstanding = 0), tawarkan reject langsung
      if (e.message.includes("melebihi total invoice") || e.message.includes("OVERPAYMENT")) {
        setApproveId(null);
        setAlreadyPaidWarning(true);
        setRejectReason("Invoice sudah lunas melalui pembayaran lain. Bukti pembayaran ini ditolak.");
        // rejectId diset oleh approveId yang sudah tersimpan; re-set dari approveId
        setRejectId(approveId);
      } else {
        toast({ title: "Gagal", description: e.message, variant: "destructive" });
      }
    },
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiFetch(`/api/pending-payments/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-payments"] });
      qc.invalidateQueries({ queryKey: ["pending-payments-counts"] });
      toast({ title: "Pembayaran ditolak", description: "Tenant akan diberitahu via WhatsApp." });
      setRejectId(null);
      setRejectReason("");
      setAlreadyPaidWarning(false);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal", description: e.message, variant: "destructive" });
    },
  });

  function handleReject() {
    if (!rejectId || !rejectReason.trim()) return;
    rejectMut.mutate({ id: rejectId, reason: rejectReason.trim() });
  }

  function closeRejectDialog() {
    setRejectId(null);
    setRejectReason("");
    setAlreadyPaidWarning(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Tinjau Pembayaran
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Verifikasi bukti pembayaran yang dikirim tenant melalui WhatsApp
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending_review" className="gap-2">
            <Clock className="h-3.5 w-3.5" />
            Menunggu
            {(counts?.pending_review ?? 0) > 0 && (
              <Badge className="ml-1 h-5 min-w-5 text-[10px] bg-amber-500 hover:bg-amber-500 text-white px-1.5">
                {counts?.pending_review}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <CheckCircle className="h-3.5 w-3.5" />
            Disetujui
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-2">
            <XCircle className="h-3.5 w-3.5" />
            Ditolak
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {activeTab === "pending_review" && "Menunggu Verifikasi"}
            {activeTab === "approved" && "Pembayaran Disetujui"}
            {activeTab === "rejected" && "Pembayaran Ditolak"}
          </CardTitle>
          <CardDescription>
            {payments.length} data ditemukan
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <ClipboardCheck className="h-10 w-10 opacity-30" />
              <p className="text-sm">Tidak ada data</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant / Invoice</TableHead>
                    <TableHead>Nominal</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead>Tgl Kirim</TableHead>
                    <TableHead>Bukti</TableHead>
                    <TableHead>Status</TableHead>
                    {activeTab === "pending_review" && <TableHead className="text-right">Aksi</TableHead>}
                    {activeTab === "rejected" && <TableHead>Alasan</TableHead>}
                    {activeTab === "approved" && <TableHead>Disetujui Oleh</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => {
                    const statusCfg = STATUS_CONFIG[p.approvalStatus as keyof typeof STATUS_CONFIG];
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium text-sm">{p.tenantName ?? "-"}</p>
                            <p className="text-xs text-muted-foreground">{p.invoiceNumber ?? "-"}</p>
                            {p.phone && (
                              <p className="text-xs text-muted-foreground">{p.phone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-semibold text-sm">{formatRupiah(p.amount)}</p>
                            {p.totalAmount && (
                              <p className="text-xs text-muted-foreground">
                                dr {formatRupiah(p.totalAmount)}
                              </p>
                            )}
                            {p.approvalStatus === "pending_review" && Number(p.outstandingAmount) === 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                <AlertTriangle className="h-3 w-3" />
                                Invoice sudah lunas
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {METODE_LABELS[p.paymentMethod] ?? p.paymentMethod}
                          {p.referenceNumber && (
                            <p className="text-xs text-muted-foreground">{p.referenceNumber}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTanggal(p.createdAt)}
                        </TableCell>
                        <TableCell>
                          {p.proofUrl ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => setPreviewUrl(p.proofUrl)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Lihat
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {statusCfg ? (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusCfg.color}`}>
                              {statusCfg.icon}
                              {statusCfg.label}
                            </span>
                          ) : (
                            <Badge variant="secondary">{p.approvalStatus}</Badge>
                          )}
                        </TableCell>
                        {activeTab === "pending_review" && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-green-600 hover:bg-green-700"
                                onClick={() => setApproveId(p.id)}
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                Setujui
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 text-xs"
                                onClick={() => {
                                  setRejectId(p.id);
                                  setRejectReason("");
                                }}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Tolak
                              </Button>
                            </div>
                          </TableCell>
                        )}
                        {activeTab === "rejected" && (
                          <TableCell className="text-xs text-muted-foreground max-w-48">
                            {p.rejectionReason ?? "-"}
                          </TableCell>
                        )}
                        {activeTab === "approved" && (
                          <TableCell className="text-xs text-muted-foreground">
                            <div>
                              <p>{p.approvedBy ?? "-"}</p>
                              <p>{formatTanggal(p.approvedAt)}</p>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog preview bukti */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bukti Pembayaran</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            previewUrl.endsWith(".pdf") ? (
              <iframe src={previewUrl} className="w-full h-[500px] rounded border" title="Bukti" />
            ) : (
              <img
                src={previewUrl}
                alt="Bukti pembayaran"
                className="max-h-[500px] object-contain mx-auto rounded border"
              />
            )
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewUrl(null)}>Tutup</Button>
            {previewUrl && (
              <Button asChild>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                  Buka di Tab Baru
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog konfirmasi setujui */}
      <Dialog open={approveId !== null} onOpenChange={(o) => { if (!o) setApproveId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setujui Pembayaran</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menyetujui pembayaran ini? Nominal akan ditambahkan ke invoice
              dan tenant akan mendapat notifikasi via WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveId(null)} disabled={approveMut.isPending}>
              Batal
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={approveMut.isPending}
              onClick={() => approveId !== null && approveMut.mutate(approveId)}
            >
              {approveMut.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Memproses...</>
              ) : (
                <><CheckCircle className="h-4 w-4 mr-2" />Ya, Setujui</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog tolak + alasan */}
      <Dialog open={rejectId !== null} onOpenChange={(o) => { if (!o) closeRejectDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {alreadyPaidWarning && <AlertTriangle className="h-5 w-5 text-amber-500" />}
              Tolak Pembayaran
            </DialogTitle>
            <DialogDescription>
              {alreadyPaidWarning
                ? "Invoice ini sudah lunas melalui pembayaran lain — pembayaran ini tidak bisa disetujui. Silakan tolak dengan alasan di bawah agar tenant mendapat notifikasi."
                : "Masukkan alasan penolakan. Tenant akan mendapat notifikasi via WhatsApp beserta alasan ini."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reject-reason">Alasan Penolakan <span className="text-destructive">*</span></Label>
            <Textarea
              id="reject-reason"
              placeholder="Contoh: Bukti pembayaran tidak jelas / nominal tidak sesuai..."
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={closeRejectDialog}
              disabled={rejectMut.isPending}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMut.isPending}
              onClick={handleReject}
            >
              {rejectMut.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Memproses...</>
              ) : (
                <><XCircle className="h-4 w-4 mr-2" />Tolak Pembayaran</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
