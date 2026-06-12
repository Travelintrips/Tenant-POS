import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, RefreshCw, CheckCircle2, XCircle, AlertTriangle, HelpCircle,
  Zap, Search, ChevronRight, FileUp, BarChart2,
} from "lucide-react";

const formatRp = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    parseFloat(String(n ?? 0)) || 0
  );

type MutationStatus = "unmatched" | "matched" | "duplicate_need_review" | "approved" | "rejected";

type BankMutation = {
  id: number;
  bankAccountId: string | null;
  transactionDate: string;
  description: string;
  creditAmount: string;
  debitAmount: string;
  amount: string;
  direction: string;
  mutationKey: string;
  normalizedDescription: string;
  providerName: string | null;
  providerOrderId: string | null;
  status: MutationStatus;
  matchedPaymentId: number | null;
  matchedOrderId: number | null;
  siteId: number | null;
};

type MatchCandidate = {
  id: number;
  mutationId: number;
  candidateType: string;
  candidateId: number;
  matchScore: number;
  matchReason: string | null;
  amountMatch: boolean;
  dateMatch: boolean;
  nameMatch: boolean;
  orderIdMatch: boolean;
  proofMatch: boolean;
  status: string;
  detail: Record<string, unknown>;
};

type MutationWithMatches = {
  mutation: BankMutation;
  matches: MatchCandidate[];
};

const STATUS_CONFIG: Record<MutationStatus, { label: string; color: string; icon: React.ReactNode }> = {
  unmatched:            { label: "Tidak Cocok",   color: "bg-gray-100 text-gray-700 border-gray-300",     icon: <HelpCircle className="h-3 w-3" /> },
  matched:              { label: "Ada Kandidat",  color: "bg-blue-100 text-blue-700 border-blue-300",     icon: <Search className="h-3 w-3" /> },
  duplicate_need_review:{ label: "Duplikat",      color: "bg-yellow-100 text-yellow-800 border-yellow-300",icon: <AlertTriangle className="h-3 w-3" /> },
  approved:             { label: "Disetujui",     color: "bg-green-100 text-green-800 border-green-300",  icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected:             { label: "Ditolak",       color: "bg-red-100 text-red-700 border-red-300",        icon: <XCircle className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: MutationStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unmatched;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 95 ? "bg-green-100 text-green-800" : score >= 80 ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-600";
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-bold ${color}`}>{score}</span>;
}

export default function BankRekonsiliasi() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDirection, setFilterDirection] = useState("all");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedMutation, setSelectedMutation] = useState<BankMutation | null>(null);
  const [manualCandidateType, setManualCandidateType] = useState<"payment" | "invoice">("payment");
  const [manualCandidateId, setManualCandidateId] = useState("");

  // Build query params
  const params = new URLSearchParams();
  if (filterStatus !== "all") params.set("status", filterStatus);
  if (filterDirection !== "all") params.set("direction", filterDirection);
  if (filterProvider) params.set("provider", filterProvider);
  if (filterDateFrom) params.set("dateFrom", filterDateFrom);
  if (filterDateTo) params.set("dateTo", filterDateTo);

  const { data: mutations = [], isLoading, refetch } = useQuery<BankMutation[]>({
    queryKey: ["/api/bank-reconciliation/mutations", params.toString()],
    queryFn: async () => {
      const r = await fetch(`/api/bank-reconciliation/mutations?${params}`);
      if (!r.ok) throw new Error("Gagal memuat data");
      return r.json();
    },
  });

  const { data: matchData, isLoading: loadingMatches } = useQuery<MutationWithMatches>({
    queryKey: ["/api/bank-reconciliation/matches", selectedMutation?.id],
    queryFn: async () => {
      const r = await fetch(`/api/bank-reconciliation/matches/${selectedMutation!.id}`);
      if (!r.ok) throw new Error("Gagal memuat kandidat");
      return r.json();
    },
    enabled: !!selectedMutation,
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/bank-reconciliation/import", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Import gagal");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Import berhasil", description: `${data.imported} mutasi diimport, ${data.autoMatched} auto-match, ${data.duplicates} duplikat` });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
    },
    onError: (e: Error) => toast({ title: "Import gagal", description: e.message, variant: "destructive" }),
  });

  const runMatchMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/bank-reconciliation/run-matching", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Matching selesai", description: `${data.total} diproses — ${data.autoMatched} auto-match, ${data.withCandidates} ada kandidat, ${data.unmatched} tidak cocok` });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
    },
    onError: (e: Error) => toast({ title: "Matching gagal", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ mutationId, matchId }: { mutationId: number; matchId: number }) => {
      const r = await fetch(`/api/bank-reconciliation/${mutationId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal approve");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Disetujui" });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/matches", selectedMutation?.id] });
      setSelectedMutation(null);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (mutationId: number) => {
      const r = await fetch(`/api/bank-reconciliation/${mutationId}/reject`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal reject");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Ditolak" });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
      setSelectedMutation(null);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const manualMatchMut = useMutation({
    mutationFn: async ({ mutationId, candidateType, candidateId }: { mutationId: number; candidateType: string; candidateId: number }) => {
      const r = await fetch(`/api/bank-reconciliation/${mutationId}/manual-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateType, candidateId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Manual match berhasil" });
      qc.invalidateQueries({ queryKey: ["/api/bank-reconciliation/mutations"] });
      setSelectedMutation(null);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  // Stats
  const stats = {
    total: mutations.length,
    unmatched: mutations.filter((m) => m.status === "unmatched").length,
    matched: mutations.filter((m) => m.status === "matched").length,
    duplicate: mutations.filter((m) => m.status === "duplicate_need_review").length,
    approved: mutations.filter((m) => m.status === "approved").length,
    rejected: mutations.filter((m) => m.status === "rejected").length,
  };

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rekonsiliasi Mutasi Bank</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Import mutasi rekening, cocokkan otomatis dengan transaksi/invoice, lalu setujui atau tolak.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total",        val: stats.total,     color: "text-gray-700",   bg: "" },
          { label: "Tidak Cocok",  val: stats.unmatched, color: "text-gray-600",   bg: "bg-gray-50" },
          { label: "Ada Kandidat", val: stats.matched,   color: "text-blue-700",   bg: "bg-blue-50" },
          { label: "Duplikat",     val: stats.duplicate, color: "text-yellow-700", bg: "bg-yellow-50" },
          { label: "Disetujui",    val: stats.approved,  color: "text-green-700",  bg: "bg-green-50" },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg border p-3 text-center ${s.bg}`}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={importMutation.isPending}
        >
          {importMutation.isPending
            ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Mengimport...</>
            : <><FileUp className="mr-2 h-4 w-4" />Import CSV</>}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { importMutation.mutate(f); e.target.value = ""; }
          }}
        />
        <Button
          variant="outline"
          onClick={() => runMatchMutation.mutate()}
          disabled={runMatchMutation.isPending}
        >
          {runMatchMutation.isPending
            ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Memproses...</>
            : <><Zap className="mr-2 h-4 w-4" />Jalankan Auto-Match</>}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* CSV format hint */}
      <Alert className="border-blue-200 bg-blue-50 py-3">
        <BarChart2 className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-700 text-xs">
          Format CSV: kolom <strong>tanggal</strong>, <strong>keterangan</strong>, <strong>kredit</strong>, <strong>debet</strong> (atau <strong>nominal</strong>).
          Baris pertama adalah header. GoPay/DOMPET ANAK BANGSA akan dideteksi otomatis.
        </AlertDescription>
      </Alert>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="unmatched">Tidak Cocok</SelectItem>
              <SelectItem value="matched">Ada Kandidat</SelectItem>
              <SelectItem value="duplicate_need_review">Duplikat</SelectItem>
              <SelectItem value="approved">Disetujui</SelectItem>
              <SelectItem value="rejected">Ditolak</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Arah</Label>
          <Select value={filterDirection} onValueChange={setFilterDirection}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">IN & OUT</SelectItem>
              <SelectItem value="IN">Masuk (IN)</SelectItem>
              <SelectItem value="OUT">Keluar (OUT)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Provider</Label>
          <Input
            className="h-8 w-36 text-xs"
            placeholder="GoPay / all"
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Dari Tanggal</Label>
          <Input type="date" className="h-8 text-xs" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sampai</Label>
          <Input type="date" className="h-8 text-xs" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
        </div>
        {(filterStatus !== "all" || filterDirection !== "all" || filterProvider || filterDateFrom || filterDateTo) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
            setFilterStatus("all"); setFilterDirection("all");
            setFilterProvider(""); setFilterDateFrom(""); setFilterDateTo("");
          }}>
            Reset Filter
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs whitespace-nowrap">Tanggal</TableHead>
              <TableHead className="text-xs">Keterangan</TableHead>
              <TableHead className="text-xs text-right">Kredit</TableHead>
              <TableHead className="text-xs text-right">Debet</TableHead>
              <TableHead className="text-xs">Arah</TableHead>
              <TableHead className="text-xs">Provider</TableHead>
              <TableHead className="text-xs">Mutation Key</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-center">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">Memuat data...</TableCell></TableRow>
            )}
            {!isLoading && mutations.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                  <Upload className="mx-auto mb-2 h-8 w-8 opacity-25" />
                  <p>Belum ada data mutasi.</p>
                  <p className="text-xs mt-1">Import file CSV mutasi rekening untuk memulai.</p>
                </TableCell>
              </TableRow>
            )}
            {mutations.map((m) => (
              <TableRow
                key={m.id}
                className={m.status === "approved" ? "bg-green-50/40" : m.status === "duplicate_need_review" ? "bg-yellow-50/40" : ""}
              >
                <TableCell className="text-xs whitespace-nowrap">{m.transactionDate}</TableCell>
                <TableCell className="text-xs max-w-xs">
                  <p className="truncate">{m.description}</p>
                  {m.providerOrderId && (
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{m.providerOrderId}</p>
                  )}
                </TableCell>
                <TableCell className="text-xs text-right font-medium text-green-700">
                  {parseFloat(m.creditAmount) > 0 ? formatRp(m.creditAmount) : "—"}
                </TableCell>
                <TableCell className="text-xs text-right font-medium text-red-700">
                  {parseFloat(m.debitAmount) > 0 ? formatRp(m.debitAmount) : "—"}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.direction === "IN" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {m.direction}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  {m.providerName ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 border-purple-300 text-purple-700 bg-purple-50">
                      {m.providerName}
                    </Badge>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-[10px] font-mono text-muted-foreground">{m.mutationKey}</TableCell>
                <TableCell><StatusBadge status={m.status} /></TableCell>
                <TableCell className="text-center">
                  {m.status !== "approved" && m.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setSelectedMutation(m)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                      Tinjau
                    </Button>
                  )}
                  {m.status === "approved" && <span className="text-xs text-green-600">✓ Selesai</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedMutation} onOpenChange={(o) => { if (!o) setSelectedMutation(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tinjau Mutasi</DialogTitle>
          </DialogHeader>

          {selectedMutation && (
            <div className="space-y-4">
              {/* Mutation info */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="text-muted-foreground text-xs">Tanggal</span><p className="font-medium">{selectedMutation.transactionDate}</p></div>
                  <div><span className="text-muted-foreground text-xs">Nominal</span><p className="font-medium">{formatRp(selectedMutation.amount)}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-xs">Keterangan</span><p>{selectedMutation.description}</p></div>
                  {selectedMutation.providerOrderId && (
                    <div className="col-span-2"><span className="text-muted-foreground text-xs">Order ID</span><p className="font-mono text-xs">{selectedMutation.providerOrderId}</p></div>
                  )}
                  <div><span className="text-muted-foreground text-xs">Arah</span>
                    <p><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${selectedMutation.direction === "IN" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{selectedMutation.direction}</span></p>
                  </div>
                  <div><span className="text-muted-foreground text-xs">Mutation Key</span><p className="font-mono text-xs">{selectedMutation.mutationKey}</p></div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <StatusBadge status={selectedMutation.status} />
                  {selectedMutation.providerName && (
                    <Badge variant="outline" className="text-xs border-purple-300 text-purple-700 bg-purple-50">{selectedMutation.providerName}</Badge>
                  )}
                </div>
              </div>

              {/* Match candidates */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Kandidat Match</h3>
                {loadingMatches && <p className="text-sm text-muted-foreground">Memuat kandidat...</p>}
                {matchData && matchData.matches.length === 0 && (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Tidak ada kandidat. Gunakan "Manual Match" di bawah.
                  </div>
                )}
                {matchData && matchData.matches.length > 0 && (
                  <div className="space-y-2">
                    {matchData.matches.map((m) => (
                      <div key={m.id} className={`rounded-lg border p-3 space-y-2 ${m.status === "approved" ? "border-green-400 bg-green-50" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium capitalize">{m.candidateType} #{m.candidateId}</span>
                              <ScoreBadge score={m.matchScore} />
                              {m.matchScore >= 95 && <span className="text-[10px] bg-green-100 text-green-800 px-1.5 rounded">Auto-match</span>}
                              {m.matchScore >= 80 && m.matchScore < 95 && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 rounded">Perlu review</span>}
                            </div>
                            <p className="text-xs text-muted-foreground">{m.matchReason}</p>
                            {m.detail && (
                              <div className="text-xs mt-1 space-y-0.5">
                                {!!(m.detail.tenantName || m.detail.businessName) && (
                                  <p><span className="text-muted-foreground">Tenant:</span> {String(m.detail.tenantName || m.detail.businessName || "")}</p>
                                )}
                                {!!m.detail.amount && <p><span className="text-muted-foreground">Nominal:</span> {formatRp(String(m.detail.amount))}</p>}
                                {!!m.detail.invoiceNumber && <p><span className="text-muted-foreground">Invoice:</span> {String(m.detail.invoiceNumber)}</p>}
                                {!!m.detail.paymentNumber && <p><span className="text-muted-foreground">No Bayar:</span> {String(m.detail.paymentNumber)}</p>}
                                {!!m.detail.dueDate && <p><span className="text-muted-foreground">Jatuh Tempo:</span> {String(m.detail.dueDate)}</p>}
                              </div>
                            )}
                            <div className="flex gap-2 mt-1">
                              {[
                                { v: m.amountMatch, l: "Nominal" },
                                { v: m.dateMatch,   l: "Tanggal" },
                                { v: m.nameMatch,   l: "Nama" },
                                { v: m.orderIdMatch,l: "Order ID" },
                              ].map(({ v, l }) => (
                                <span key={l} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${v ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                                  {v ? "✓" : "✗"} {l}
                                </span>
                              ))}
                            </div>
                          </div>
                          {m.status !== "approved" && (
                            <Button
                              size="sm"
                              className="shrink-0 bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                              onClick={() => approveMutation.mutate({ mutationId: selectedMutation.id, matchId: m.id })}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Setujui
                            </Button>
                          )}
                          {m.status === "approved" && (
                            <Badge className="bg-green-600 text-white shrink-0">Dipilih</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Manual match */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Manual Match</h3>
                <div className="flex gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipe</Label>
                    <Select value={manualCandidateType} onValueChange={(v) => setManualCandidateType(v as any)}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="payment">Payment</SelectItem>
                        <SelectItem value="invoice">Invoice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ID</Label>
                    <Input
                      className="h-8 w-28 text-xs"
                      placeholder="123"
                      value={manualCandidateId}
                      onChange={(e) => setManualCandidateId(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={!manualCandidateId || manualMatchMut.isPending}
                    onClick={() => manualMatchMut.mutate({
                      mutationId: selectedMutation.id,
                      candidateType: manualCandidateType,
                      candidateId: parseInt(manualCandidateId, 10),
                    })}
                  >
                    Terapkan Manual Match
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => selectedMutation && rejectMutation.mutate(selectedMutation.id)}
              disabled={rejectMutation.isPending}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />Tolak Mutasi
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedMutation(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
