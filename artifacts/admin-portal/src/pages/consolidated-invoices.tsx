import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useSite } from "@/contexts/site-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  Eye,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Search,
  RefreshCw,
  Building2,
  Receipt,
  MessageCircle,
  Send,
} from "lucide-react";

const BASE = "";

function formatRupiah(n: number | string | null | undefined) {
  const num = Number(n ?? 0);
  return `Rp ${num.toLocaleString("id-ID")}`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

type ConsolidatedInvoice = {
  id: number;
  invoiceNumber: string;
  tenantId: number;
  tenantName: string;
  tenantOwner: string;
  periodLabel: string | null;
  dueDate: string | null;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: string;
  notes: string | null;
  createdAt: string;
  itemCount: number;
};

type ConsolidatedInvoiceDetail = ConsolidatedInvoice & {
  tenantPhone: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  items: {
    id: number;
    invoiceId: number;
    invoiceNumber: string;
    unitCode: string | null;
    description: string | null;
    amount: string;
    invoiceStatus: string;
    invoicePaidAmount: string;
    invoiceOutstanding: string;
  }[];
};

type Tenant = {
  id: number;
  businessName: string;
  ownerName: string;
  status: string;
};

type UnpaidInvoice = {
  id: number;
  tenantId: number;
  tenantName: string;
  tenantOwner: string;
  invoiceNumber: string;
  unitCode: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: string;
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    draft:     { label: "Draft",     className: "bg-slate-100 text-slate-700",   icon: <Clock className="w-3 h-3" /> },
    unpaid:    { label: "Belum Lunas", className: "bg-amber-100 text-amber-700", icon: <AlertCircle className="w-3 h-3" /> },
    partial:   { label: "Sebagian",  className: "bg-blue-100 text-blue-700",     icon: <Clock className="w-3 h-3" /> },
    paid:      { label: "Lunas",     className: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
    cancelled: { label: "Dibatalkan",className: "bg-red-100 text-red-700",       icon: <XCircle className="w-3 h-3" /> },
  };
  const cfg = map[status] ?? map.unpaid;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.className}`}>
      {cfg.icon}{cfg.label}
    </Badge>
  );
}

// ── Modal Detail ──────────────────────────────────────────────────────────────
function DetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<ConsolidatedInvoiceDetail>({
    queryKey: ["consolidated-invoice-detail", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/consolidated-invoices/${id}`, { credentials: "include" });
      return r.json();
    },
  });

  const sendWaMutation = useMutation<{ ok: boolean; pending?: boolean }, Error, void>({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/consolidated-invoices/${id}/send-wa`, {
        method: "POST",
        credentials: "include",
      });
      const json = await r.json() as { ok?: boolean; error?: string; pending?: boolean };
      if (!r.ok) throw new Error(json.error ?? "Gagal mengirim WhatsApp");
      return json as { ok: boolean; pending?: boolean };
    },
    onSuccess: (res) => {
      if (res.pending) {
        toast({ title: "WhatsApp Dikirim (Pending)", description: "Pesan masuk antrian Fonnte. Pastikan device WA terhubung.", variant: "default" });
      } else {
        toast({ title: "WhatsApp Terkirim ✓", description: "Tagihan konsolidasi berhasil dikirim ke WhatsApp tenant." });
      }
    },
    onError: (e) => toast({ title: "Gagal Kirim WA", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            Invoice Konsolidasi
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Memuat...</div>
        ) : !data ? (
          <div className="py-12 text-center text-muted-foreground">Data tidak ditemukan</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-4">
              <div>
                <p className="text-xs text-muted-foreground">Nomor Invoice</p>
                <p className="font-semibold text-base">{data.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <StatusBadge status={data.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tenant</p>
                <p className="font-medium">{data.tenantName}</p>
                <p className="text-muted-foreground text-xs">{data.tenantOwner}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Periode</p>
                <p>{data.periodLabel || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Jatuh Tempo</p>
                <p>{formatDate(data.dueDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tanggal Dibuat</p>
                <p>{formatDate(data.createdAt)}</p>
              </div>
            </div>

            <div>
              <p className="font-medium mb-2 text-slate-700">Rincian Unit ({data.items.length} unit)</p>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Invoice / Unit</TableHead>
                      <TableHead className="text-right">Tagihan</TableHead>
                      <TableHead className="text-right">Terbayar</TableHead>
                      <TableHead className="text-right">Sisa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-mono text-xs">{item.invoiceNumber}</p>
                          <p className="text-muted-foreground text-xs">{item.unitCode || "-"}</p>
                        </TableCell>
                        <TableCell className="text-right">{formatRupiah(item.amount)}</TableCell>
                        <TableCell className="text-right">{formatRupiah(item.invoicePaidAmount)}</TableCell>
                        <TableCell className="text-right font-medium">{formatRupiah(item.invoiceOutstanding)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Separator />
            <div className="grid grid-cols-3 gap-4 bg-slate-50 rounded-lg p-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Tagihan</p>
                <p className="font-bold text-base">{formatRupiah(data.totalAmount)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Sudah Dibayar</p>
                <p className="font-bold text-base text-emerald-700">{formatRupiah(data.paidAmount)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Sisa Tagihan</p>
                <p className="font-bold text-base text-amber-700">{formatRupiah(data.outstandingAmount)}</p>
              </div>
            </div>
            {data.notes && (
              <div className="text-xs text-muted-foreground bg-slate-50 rounded p-3">
                <span className="font-medium">Catatan:</span> {data.notes}
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {data && data.status !== "paid" && data.status !== "cancelled" && (
            <Button
              variant="outline"
              className="gap-2 border-green-600 text-green-700 hover:bg-green-50"
              disabled={sendWaMutation.isPending}
              onClick={() => sendWaMutation.mutate()}
            >
              {sendWaMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" />Mengirim...</>
              ) : (
                <><Send className="w-4 h-4" />Kirim via WhatsApp</>
              )}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal Buat Invoice Konsolidasi ────────────────────────────────────────────
function CreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<number[]>([]);
  const [searchText, setSearchText] = useState("");
  const [expandedTenants, setExpandedTenants] = useState<Set<number>>(new Set());
  const [periodLabel, setPeriodLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: allUnpaidInvoices = [], isLoading: loadingInvoices } = useQuery<UnpaidInvoice[]>({
    queryKey: ["all-unpaid-invoices-for-consolidation"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/consolidated-invoices/all-unpaid`, { credentials: "include" });
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  // Expand semua tenant saat data pertama kali masuk (useEffect, bukan useMemo)
  const [hasInitExpanded, setHasInitExpanded] = useState(false);
  useEffect(() => {
    if (!hasInitExpanded && allUnpaidInvoices.length > 0) {
      setExpandedTenants(new Set(allUnpaidInvoices.map((inv) => inv.tenantId)));
      setHasInitExpanded(true);
    }
  }, [allUnpaidInvoices, hasInitExpanded]);

  // Kelompokkan invoice per tenant (untuk tampilan list)
  const tenantGroups = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const filtered = q
      ? allUnpaidInvoices.filter(
          (inv) =>
            inv.tenantName.toLowerCase().includes(q) ||
            inv.invoiceNumber.toLowerCase().includes(q) ||
            (inv.unitCode ?? "").toLowerCase().includes(q)
        )
      : allUnpaidInvoices;

    const map = new Map<number, { tenantId: number; tenantName: string; tenantOwner: string; invoices: UnpaidInvoice[] }>();
    for (const inv of filtered) {
      if (!map.has(inv.tenantId)) {
        map.set(inv.tenantId, { tenantId: inv.tenantId, tenantName: inv.tenantName, tenantOwner: inv.tenantOwner, invoices: [] });
      }
      map.get(inv.tenantId)!.invoices.push(inv);
    }
    return Array.from(map.values());
  }, [allUnpaidInvoices, searchText]);

  const selectedInvoices = useMemo(
    () => allUnpaidInvoices.filter((inv) => selectedInvoiceIds.includes(inv.id)),
    [allUnpaidInvoices, selectedInvoiceIds]
  );

  const totalSelected = useMemo(
    () => selectedInvoices.reduce((sum, inv) => sum + Number(inv.outstandingAmount), 0),
    [selectedInvoices]
  );

  // Kelompokkan invoice terpilih per tenant (untuk preview & ringkasan step 2)
  const selectedByTenant = useMemo(() => {
    const map = new Map<string, { name: string; owner: string; invoices: UnpaidInvoice[]; total: number }>();
    for (const inv of selectedInvoices) {
      const entry = map.get(inv.tenantName) ?? { name: inv.tenantName, owner: inv.tenantOwner, invoices: [], total: 0 };
      entry.invoices.push(inv);
      entry.total += Number(inv.outstandingAmount);
      map.set(inv.tenantName, entry);
    }
    return Array.from(map.values());
  }, [selectedInvoices]);

  const mutation = useMutation<unknown, Error>({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/consolidated-invoices`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceIds: selectedInvoiceIds,
          periodLabel: periodLabel || undefined,
          dueDate: dueDate || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Gagal membuat invoice");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Invoice konsolidasi berhasil dibuat" });
      onSuccess();
    },
    onError: (e) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const toggleInvoice = (id: number) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleTenant = (tenantId: number, invoiceIds: number[]) => {
    const allSelected = invoiceIds.every((id) => selectedInvoiceIds.includes(id));
    if (allSelected) {
      setSelectedInvoiceIds((prev) => prev.filter((id) => !invoiceIds.includes(id)));
    } else {
      setSelectedInvoiceIds((prev) => [...new Set([...prev, ...invoiceIds])]);
    }
  };

  const toggleExpand = (tenantId: number) => {
    setExpandedTenants((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  };

  const canProceed = step === 1 ? selectedInvoiceIds.length >= 2 : true;

  // Tanggal hari ini untuk pratinjau
  const todayStr = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            Buat Invoice Konsolidasi
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? "bg-blue-600 text-white" : "bg-emerald-100 text-emerald-700"}`}>
            {step > 1 ? "✓" : "1"}
          </div>
          <span className={step === 1 ? "font-medium text-foreground" : ""}>Pilih Tenant & Invoice</span>
          <div className="flex-1 border-t border-dashed" />
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>2</div>
          <span className={step === 2 ? "font-medium text-foreground" : ""}>Detail & Konfirmasi</span>
        </div>

        <Separator />

        {/* ── STEP 1: Pilih invoice ─────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Pilih Invoice yang Digabung *</Label>
                <span className="text-xs text-muted-foreground">Pilih minimal 2 invoice</span>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama tenant / nomor invoice / unit..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {loadingInvoices ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin opacity-40" />
                Memuat invoice...
              </div>
            ) : allUnpaidInvoices.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground border rounded-lg">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Tidak ada invoice belum lunas di site ini
              </div>
            ) : tenantGroups.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground border rounded-lg">
                Tidak ada hasil untuk &ldquo;{searchText}&rdquo;
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto divide-y">
                {tenantGroups.map((group) => {
                  const groupIds = group.invoices.map((i) => i.id);
                  const selectedCount = groupIds.filter((id) => selectedInvoiceIds.includes(id)).length;
                  const allChecked = selectedCount === groupIds.length;
                  const someChecked = selectedCount > 0 && !allChecked;
                  const groupTotal = group.invoices.reduce((s, i) => s + Number(i.outstandingAmount), 0);
                  const isExpanded = expandedTenants.has(group.tenantId);

                  return (
                    <div key={group.tenantId}>
                      <div
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none
                          ${selectedCount > 0 ? "bg-blue-50" : "bg-slate-50"}
                          hover:bg-blue-50 transition-colors`}
                        onClick={() => toggleExpand(group.tenantId)}
                      >
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={allChecked}
                            data-state={someChecked ? "indeterminate" : allChecked ? "checked" : "unchecked"}
                            className={someChecked ? "data-[state=indeterminate]:bg-blue-400 data-[state=indeterminate]:border-blue-400" : ""}
                            onCheckedChange={() => toggleTenant(group.tenantId, groupIds)}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="font-semibold text-sm truncate">{group.tenantName}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{group.tenantOwner}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={`text-xs ${selectedCount > 0 ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-white"}`}>
                            {selectedCount > 0 ? `${selectedCount}/` : ""}{group.invoices.length} invoice
                          </Badge>
                          <span className="text-xs font-semibold text-slate-600">{formatRupiah(groupTotal)}</span>
                          <span className="text-muted-foreground text-xs">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {isExpanded && group.invoices.map((inv) => {
                        const checked = selectedInvoiceIds.includes(inv.id);
                        return (
                          <div
                            key={inv.id}
                            className={`flex items-center gap-3 px-3 py-2 pl-10 cursor-pointer border-t border-slate-100
                              ${checked ? "bg-blue-50/70" : "bg-white hover:bg-slate-50"} transition-colors`}
                            onClick={() => toggleInvoice(inv.id)}
                          >
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={checked} onCheckedChange={() => toggleInvoice(inv.id)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-xs text-muted-foreground">{inv.invoiceNumber}</p>
                              {inv.unitCode && <p className="text-xs text-slate-500">Unit: {inv.unitCode}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold">{formatRupiah(inv.outstandingAmount)}</p>
                              {inv.dueDate && (
                                <p className={`text-xs ${inv.status === "overdue" ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                                  {inv.status === "overdue" ? "⚠ " : ""}Jatuh: {formatDate(inv.dueDate)}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {selectedInvoiceIds.length === 0 && allUnpaidInvoices.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Centang nama tenant untuk memilih semua invoice-nya, atau centang invoice satu per satu
              </p>
            )}
            {selectedInvoiceIds.length === 1 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>1 invoice dipilih — pilih 1 invoice lagi untuk membuat konsolidasi</span>
              </div>
            )}
            {selectedInvoiceIds.length >= 2 && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
                <span className="text-blue-700 font-medium">✓ {selectedInvoiceIds.length} invoice dipilih</span>
                <span className="font-bold text-blue-900">Total: {formatRupiah(totalSelected)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Detail + Pratinjau Invoice ───────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Form detail */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="periodLabel">Label Periode</Label>
                <Input
                  id="periodLabel"
                  placeholder="contoh: Juli 2026"
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dueDate">Jatuh Tempo</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Catatan (opsional)</Label>
              <Textarea
                id="notes"
                placeholder="Keterangan tambahan..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <Separator />

            {/* ── Pratinjau Invoice (gaya dokumen) ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                Pratinjau Invoice
              </p>
              <div className="border-2 border-dashed border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm">
                {/* Kop invoice */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-widest opacity-80 mb-0.5">Invoice Konsolidasi</p>
                      <p className="font-mono text-lg font-bold tracking-wide">KONS/202X/XXX</p>
                      <p className="text-xs opacity-75 mt-0.5">Auto-generate saat disimpan</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs opacity-75">Tanggal</p>
                      <p className="text-sm font-semibold">{todayStr}</p>
                      {dueDate && (
                        <>
                          <p className="text-xs opacity-75 mt-1">Jatuh Tempo</p>
                          <p className="text-sm font-semibold">{formatDate(dueDate)}</p>
                        </>
                      )}
                    </div>
                  </div>
                  {periodLabel && (
                    <div className="mt-2 inline-block bg-white/20 rounded px-2 py-0.5 text-xs font-medium">
                      Periode: {periodLabel}
                    </div>
                  )}
                </div>

                {/* Rincian per tenant */}
                <div className="px-5 py-4 space-y-4">
                  {selectedByTenant.map((tenant, tIdx) => (
                    <div key={tenant.name}>
                      {/* Header tenant */}
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-4 h-4 text-blue-500" />
                        <div>
                          <p className="font-semibold text-sm">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground">{tenant.owner}</p>
                        </div>
                      </div>

                      {/* Tabel invoice tenant ini */}
                      <div className="bg-slate-50 rounded-lg overflow-hidden text-xs">
                        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-1.5 bg-slate-100 text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                          <span>Invoice / Unit</span>
                          <span className="text-center">Status</span>
                          <span className="text-right">Sisa Tagihan</span>
                        </div>
                        {tenant.invoices.map((inv) => (
                          <div key={inv.id} className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 border-t border-slate-200">
                            <div>
                              <p className="font-mono text-[11px] text-slate-700">{inv.invoiceNumber}</p>
                              {inv.unitCode && <p className="text-muted-foreground">Unit: {inv.unitCode}</p>}
                            </div>
                            <div className="text-center">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                inv.status === "overdue" ? "bg-red-100 text-red-700" :
                                inv.status === "partial" ? "bg-blue-100 text-blue-700" :
                                "bg-amber-100 text-amber-700"
                              }`}>
                                {inv.status === "overdue" ? "Lewat Jatuh Tempo" : inv.status === "partial" ? "Sebagian" : "Belum Lunas"}
                              </span>
                            </div>
                            <div className="text-right font-semibold text-slate-800">
                              {formatRupiah(inv.outstandingAmount)}
                            </div>
                          </div>
                        ))}
                        {/* Subtotal tenant */}
                        <div className="grid grid-cols-[1fr_auto] gap-x-4 px-3 py-2 border-t border-slate-300 bg-slate-100">
                          <span className="text-muted-foreground font-medium">Subtotal {tenant.name}</span>
                          <span className="font-bold text-slate-800">{formatRupiah(tenant.total)}</span>
                        </div>
                      </div>

                      {tIdx < selectedByTenant.length - 1 && <div className="border-t border-dashed border-slate-200 mt-4" />}
                    </div>
                  ))}

                  {/* Total keseluruhan */}
                  <div className="border-t-2 border-blue-200 pt-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-base">TOTAL TAGIHAN</p>
                      <p className="text-xs text-muted-foreground">{selectedInvoices.length} invoice dari {selectedByTenant.length} tenant</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-700">{formatRupiah(totalSelected)}</p>
                  </div>

                  {notes && (
                    <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">
                      <span className="font-semibold">Catatan:</span> {notes}
                    </div>
                  )}
                </div>

                {/* Footer pratinjau */}
                <div className="bg-slate-50 border-t px-5 py-2 text-center">
                  <p className="text-[10px] text-muted-foreground italic">
                    Pratinjau ini belum disimpan — klik &ldquo;Buat Invoice&rdquo; untuk membuat invoice konsolidasi resmi
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)} disabled={mutation.isPending}>
              Kembali
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
          {step === 1 ? (
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setStep(2)}
              disabled={!canProceed}
            >
              Lanjut →
            </Button>
          ) : (
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</>
              ) : (
                <><Receipt className="w-4 h-4 mr-2" />Buat Invoice</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// ── Halaman Utama ─────────────────────────────────────────────────────────────
export default function ConsolidatedInvoicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: invoices = [], isLoading, refetch } = useQuery<ConsolidatedInvoice[]>({
    queryKey: ["consolidated-invoices"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/consolidated-invoices`, { credentials: "include" });
      return r.json();
    },
  });

  const deleteMutation = useMutation<unknown, Error, number>({
    mutationFn: async (id) => {
      const r = await fetch(`${BASE}/api/consolidated-invoices/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Gagal menghapus");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Invoice konsolidasi dihapus" });
      void queryClient.invalidateQueries({ queryKey: ["consolidated-invoices"] });
      setDeleteId(null);
    },
    onError: (e) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const [sendingWaId, setSendingWaId] = useState<number | null>(null);
  const sendWaFromTable = async (id: number) => {
    setSendingWaId(id);
    try {
      const r = await fetch(`${BASE}/api/consolidated-invoices/${id}/send-wa`, {
        method: "POST",
        credentials: "include",
      });
      const json = await r.json() as { ok?: boolean; error?: string; pending?: boolean };
      if (!r.ok) throw new Error(json.error ?? "Gagal mengirim WhatsApp");
      if (json.pending) {
        toast({ title: "WhatsApp Dikirim (Pending)", description: "Pesan masuk antrian Fonnte. Pastikan device WA terhubung." });
      } else {
        toast({ title: "WhatsApp Terkirim ✓", description: "Tagihan konsolidasi berhasil dikirim ke tenant." });
      }
    } catch (e) {
      toast({ title: "Gagal Kirim WA", description: e instanceof Error ? e.message : "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setSendingWaId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter((inv) => {
      const matchSearch = !q
        || inv.invoiceNumber.toLowerCase().includes(q)
        || inv.tenantName.toLowerCase().includes(q)
        || inv.tenantOwner.toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || inv.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [invoices, search, filterStatus]);

  // Summary cards
  const summary = useMemo(() => ({
    total: invoices.length,
    unpaid: invoices.filter((i) => i.status === "unpaid" || i.status === "partial").length,
    paid: invoices.filter((i) => i.status === "paid").length,
    totalTagihan: invoices.filter((i) => i.status !== "cancelled").reduce((s, i) => s + Number(i.outstandingAmount), 0),
  }), [invoices]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-600" />
            Invoice Konsolidasi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gabungkan beberapa invoice untuk penyewa yang menyewa lebih dari 1 unit
          </p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="w-4 h-4" />
          Buat Invoice Konsolidasi
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-normal">Total Dibuat</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-normal">Belum Lunas</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-amber-600">{summary.unpaid}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-normal">Sudah Lunas</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-emerald-600">{summary.paid}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-normal">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-lg font-bold text-blue-700">{formatRupiah(summary.totalTagihan)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cari nomor invoice atau nama tenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {[
            { value: "all", label: "Semua" },
            { value: "unpaid", label: "Belum Lunas" },
            { value: "partial", label: "Sebagian" },
            { value: "paid", label: "Lunas" },
          ].map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={filterStatus === opt.value ? "default" : "outline"}
              onClick={() => setFilterStatus(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabel */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>No. Invoice</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead className="text-center">Jml Unit</TableHead>
                <TableHead>Jatuh Tempo</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {search || filterStatus !== "all"
                      ? "Tidak ada hasil yang cocok"
                      : "Belum ada invoice konsolidasi. Klik \"Buat Invoice Konsolidasi\" untuk memulai."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-slate-50">
                    <TableCell>
                      <p className="font-mono text-xs font-medium">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(inv.createdAt)}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{inv.tenantName}</p>
                      <p className="text-xs text-muted-foreground">{inv.tenantOwner}</p>
                    </TableCell>
                    <TableCell className="text-sm">{inv.periodLabel || "-"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700">
                        <Building2 className="w-3 h-3 mr-1" />
                        {inv.itemCount} unit
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(inv.dueDate)}</TableCell>
                    <TableCell className="text-right font-medium">{formatRupiah(inv.totalAmount)}</TableCell>
                    <TableCell className="text-right font-medium text-amber-700">
                      {formatRupiah(inv.outstandingAmount)}
                    </TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setDetailId(inv.id)}
                          title="Lihat detail"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {inv.status !== "paid" && inv.status !== "cancelled" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-green-600 hover:text-green-800 hover:bg-green-50"
                            onClick={() => void sendWaFromTable(inv.id)}
                            disabled={sendingWaId === inv.id}
                            title="Kirim tagihan via WhatsApp"
                          >
                            {sendingWaId === inv.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <MessageCircle className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        )}
                        {inv.status !== "paid" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteId(inv.id)}
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Modals */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            void queryClient.invalidateQueries({ queryKey: ["consolidated-invoices"] });
          }}
        />
      )}
      {detailId && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}
      {deleteId && (
        <AlertDialog open onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus Invoice Konsolidasi?</AlertDialogTitle>
              <AlertDialogDescription>
                Invoice ini akan dihapus permanen. Invoice individual yang termasuk di dalamnya tidak akan terpengaruh.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteMutation.mutate(deleteId)}
              >
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
