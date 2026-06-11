import { apiFetch as apiFetchBase } from "@/lib/api";
import { useState, useMemo, useRef } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, FileText, Printer, CreditCard, X, Search, Zap, AlertCircle,
  CheckCircle2, Clock, Ban, CircleDashed, MessageCircle, Send, Link2, Loader2,
  Copy, WifiOff, CheckCheck,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = "draft" | "unpaid" | "partial" | "paid" | "overdue" | "cancelled";

type Invoice = {
  id: number;
  invoiceNumber: string;
  tenantId: number;
  bookingId: number | null;
  unitCode: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  rentAmount: string;
  serviceChargeAmount: string;
  electricityChargeAmount: string;
  waterChargeAmount: string;
  otherChargeAmount: string;
  discountAmount: string;
  penaltyAmount: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tenantName: string | null;
  ownerName: string | null;
  boothNumber: string | null;
  areaName: string | null;
  email: string | null;
  phone: string | null;
  payments?: Payment[];
};

type Payment = {
  id: number;
  amount: string;
  paymentMethod: string;
  receiptNumber: string | null;
  notes: string | null;
  paidAt: string | null;
};

type Tenant = { id: number; businessName: string };
type Booking = { id: number; tenantId: number; tenantName: string | null; unitCode: string | null; contractNumber: string | null };

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  unpaid: "Belum Bayar",
  partial: "Sebagian",
  paid: "Lunas",
  overdue: "Jatuh Tempo",
  cancelled: "Dibatalkan",
};

const STATUS_CLASS: Record<InvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  unpaid: "bg-orange-100 text-orange-700 border-orange-200",
  partial: "bg-yellow-100 text-yellow-700 border-yellow-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-400 border-gray-200",
};

const STATUS_ICON: Record<InvoiceStatus, React.ReactNode> = {
  draft: <CircleDashed className="h-3.5 w-3.5" />,
  unpaid: <Clock className="h-3.5 w-3.5" />,
  partial: <AlertCircle className="h-3.5 w-3.5" />,
  paid: <CheckCircle2 className="h-3.5 w-3.5" />,
  overdue: <AlertCircle className="h-3.5 w-3.5" />,
  cancelled: <Ban className="h-3.5 w-3.5" />,
};

// ─── Utils ────────────────────────────────────────────────────────────────────

function formatRupiah(v: string | number | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(v ?? 0));
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "-";
  const opts: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
  const s = start ? new Intl.DateTimeFormat("id-ID", opts).format(new Date(start)) : "";
  const e = end ? new Intl.DateTimeFormat("id-ID", opts).format(new Date(end)) : "";
  if (s === e) return s;
  return `${s} – ${e}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await apiFetchBase(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(url: string, body: object): Promise<T> {
  const res = await apiFetchBase(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? "Gagal memproses permintaan");
  }
  return res.json() as Promise<T>;
}

async function apiPatch<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? "Gagal memperbarui");
  }
  return res.json() as Promise<T>;
}

// ─── Print Invoice ────────────────────────────────────────────────────────────

function printInvoice(inv: Invoice) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;

  const rows = [
    ["Sewa Ruang / Booth", inv.rentAmount],
    ["Service Charge", inv.serviceChargeAmount],
    ["Biaya Listrik", inv.electricityChargeAmount],
    ["Biaya Air", inv.waterChargeAmount],
    ["Biaya Lain-lain", inv.otherChargeAmount],
  ]
    .filter(([, v]) => Number(v) > 0)
    .map(([label, v]) =>
      `<tr><td style="padding:4px 8px">${label}</td><td style="padding:4px 8px;text-align:right">${formatRupiah(v)}</td></tr>`
    ).join("");

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${inv.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 40px; max-width: 700px; margin: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .brand { font-size: 22px; font-weight: 700; color: #1e3a5f; }
    .brand-sub { font-size: 12px; color: #666; margin-top: 2px; }
    .inv-meta { text-align: right; }
    .inv-number { font-size: 15px; font-weight: 700; color: #1e3a5f; }
    .status-badge { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; }
    .divider { border: none; border-top: 2px solid #e5e7eb; margin: 20px 0; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .value { font-size: 13px; color: #1a1a1a; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead tr { background: #f1f5f9; }
    th { text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    td { padding: 6px 10px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .totals { margin-left: auto; width: 280px; }
    .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .total-grand { display: flex; justify-content: space-between; padding: 8px 0; font-size: 16px; font-weight: 700; border-top: 2px solid #1e3a5f; margin-top: 4px; color: #1e3a5f; }
    .outstanding { display: flex; justify-content: space-between; padding: 6px 10px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; margin-top: 8px; font-weight: 600; color: #c2410c; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Portal Admin Mall</div>
      <div class="brand-sub">Manajemen Tenant Mall</div>
    </div>
    <div class="inv-meta">
      <div class="inv-number">${inv.invoiceNumber}</div>
      <div style="font-size:12px;color:#666;margin-top:4px">Tanggal: ${formatDate(inv.createdAt)}</div>
      <div class="status-badge">${STATUS_LABEL[inv.status]}</div>
    </div>
  </div>

  <hr class="divider" />

  <div class="grid-2">
    <div>
      <div class="label">Tenant</div>
      <div class="value">${inv.tenantName ?? "-"}</div>
      <div style="font-size:12px;color:#666;margin-top:2px">${inv.ownerName ?? ""}</div>
      ${inv.email ? `<div style="font-size:12px;color:#666">${inv.email}</div>` : ""}
      ${inv.phone ? `<div style="font-size:12px;color:#666">${inv.phone}</div>` : ""}
    </div>
    <div>
      <div class="label">Detail Invoice</div>
      <table style="width:auto;margin:0">
        <tr><td style="padding:2px 4px;color:#666;font-size:12px">Unit/Booth</td><td style="padding:2px 8px;font-size:12px;font-weight:500">${inv.unitCode ?? (inv.boothNumber ?? "-")}</td></tr>
        <tr><td style="padding:2px 4px;color:#666;font-size:12px">Periode</td><td style="padding:2px 8px;font-size:12px;font-weight:500">${formatPeriod(inv.periodStart, inv.periodEnd)}</td></tr>
        <tr><td style="padding:2px 4px;color:#666;font-size:12px">Jatuh Tempo</td><td style="padding:2px 8px;font-size:12px;font-weight:500">${formatDate(inv.dueDate)}</td></tr>
      </table>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Uraian</th><th style="text-align:right">Jumlah</th></tr>
    </thead>
    <tbody>
      ${rows}
      ${Number(inv.discountAmount) > 0 ? `<tr><td style="padding:4px 8px;color:#059669">Diskon</td><td style="padding:4px 8px;text-align:right;color:#059669">- ${formatRupiah(inv.discountAmount)}</td></tr>` : ""}
      ${Number(inv.penaltyAmount) > 0 ? `<tr><td style="padding:4px 8px;color:#dc2626">Denda</td><td style="padding:4px 8px;text-align:right;color:#dc2626">+ ${formatRupiah(inv.penaltyAmount)}</td></tr>` : ""}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span>${formatRupiah(inv.subtotal)}</span></div>
    ${Number(inv.taxAmount) > 0 ? `<div class="total-row"><span>Pajak</span><span>${formatRupiah(inv.taxAmount)}</span></div>` : ""}
    <div class="total-grand"><span>Total</span><span>${formatRupiah(inv.totalAmount)}</span></div>
    <div class="total-row" style="color:#059669;padding-top:6px"><span>Terbayar</span><span>${formatRupiah(inv.paidAmount)}</span></div>
    ${Number(inv.outstandingAmount) > 0 ? `<div class="outstanding"><span>Sisa Tagihan</span><span>${formatRupiah(inv.outstandingAmount)}</span></div>` : ""}
  </div>

  ${inv.notes ? `<div style="margin-top:24px;padding:12px;background:#f8fafc;border-radius:8px;font-size:12px;color:#555"><strong>Catatan:</strong> ${inv.notes}</div>` : ""}

  <div class="footer">
    Dokumen ini dibuat secara otomatis oleh sistem Portal Admin Mall. Harap simpan sebagai bukti pembayaran.
  </div>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// ─── Create Invoice Form ───────────────────────────────────────────────────────

type CreateForm = {
  tenantId: string;
  bookingId: string;
  unitCode: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  rentAmount: string;
  serviceChargeAmount: string;
  electricityChargeAmount: string;
  waterChargeAmount: string;
  otherChargeAmount: string;
  discountAmount: string;
  penaltyAmount: string;
  taxAmount: string;
  notes: string;
  status: InvoiceStatus;
};

const EMPTY_FORM: CreateForm = {
  tenantId: "", bookingId: "",
  unitCode: "", periodStart: "", periodEnd: "", dueDate: "",
  rentAmount: "", serviceChargeAmount: "", electricityChargeAmount: "",
  waterChargeAmount: "", otherChargeAmount: "",
  discountAmount: "0", penaltyAmount: "0", taxAmount: "0",
  notes: "", status: "unpaid",
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}{required && " *"}</Label>
      {children}
    </div>
  );
}

// ─── Payment Form ─────────────────────────────────────────────────────────────

type PaymentForm = {
  amountPaid: string;
  paymentMethod: "tunai" | "transfer" | "qris" | "edc" | "other";
  paymentDate: string;
  notes: string;
};

const EMPTY_PAYMENT: PaymentForm = {
  amountPaid: "", paymentMethod: "tunai", paymentDate: todayStr(), notes: "",
};

// ─── Generate from Booking Form ───────────────────────────────────────────────

type GenerateForm = { bookingId: string; notes: string };

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantInvoices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const printRef = useRef<Invoice | null>(null);

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTenant, setFilterTenant] = useState("all");
  const [filterDueDate, setFilterDueDate] = useState("all");
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState<GenerateForm>({ bookingId: "", notes: "" });

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(EMPTY_PAYMENT);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Invoice | null>(null);

  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [sendingLinkId, setSendingLinkId] = useState<number | null>(null);
  const [paymentLinkDialog, setPaymentLinkDialog] = useState<{ link: string; error: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // ─── Queries ────────────────────────────────────────────────────────────────

  const qParams = new URLSearchParams();
  if (filterStatus !== "all") qParams.set("status", filterStatus);
  if (filterTenant !== "all") qParams.set("tenantId", filterTenant);
  if (search) qParams.set("search", search);

  const { data: invoices, isLoading, isError } = useQuery<Invoice[]>({
    queryKey: ["/api/tenant-invoices", filterStatus, filterTenant, search],
    queryFn: () => apiFetch<Invoice[]>(`${BASE}/api/tenant-invoices?${qParams}`),
    refetchInterval: 30000,
  });

  const { data: tenants } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
    queryFn: () => apiFetch<Tenant[]>(`${BASE}/api/tenants`),
  });

  const { data: bookings } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    queryFn: () => apiFetch<Booking[]>(`${BASE}/api/bookings`),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<Invoice>({
    queryKey: ["/api/tenant-invoices", detailTarget?.id],
    queryFn: () => apiFetch<Invoice>(`${BASE}/api/tenant-invoices/${detailTarget!.id}`),
    enabled: !!detailTarget,
  });

  const { data: waStatus, isLoading: waStatusLoading } = useQuery<{
    configured: boolean;
    connected: boolean | null;
    provider: string;
    message: string;
  }>({
    queryKey: ["/api/whatsapp/status"],
    queryFn: () => apiFetch(`${BASE}/api/whatsapp/status`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: object) => apiPost<Invoice>(`${BASE}/api/tenant-invoices`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/tenant-invoices"] });
      toast({ title: "Berhasil", description: "Invoice baru berhasil dibuat." });
      setCreateOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: ({ bookingId, notes }: { bookingId: number; notes?: string }) =>
      apiPost<Invoice>(`${BASE}/api/tenant-invoices/generate-from-booking/${bookingId}`, { notes }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/tenant-invoices"] });
      toast({ title: "Berhasil", description: "Invoice berhasil dibuat dari kontrak booking." });
      setGenerateOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      apiPost<{ success: boolean; receiptNumber: string; invoiceStatus: string }>(`${BASE}/api/tenant-invoices/${id}/payment`, data),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/tenant-invoices"] });
      toast({
        title: "Pembayaran Dicatat",
        description: `No. Kwitansi: ${res.receiptNumber} — Status: ${STATUS_LABEL[res.invoiceStatus as InvoiceStatus] ?? res.invoiceStatus}`,
      });
      setPaymentOpen(false);
      setPaymentTarget(null);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiPost<Invoice>(`${BASE}/api/tenant-invoices/${id}/cancel`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/tenant-invoices"] });
      toast({ title: "Invoice Dibatalkan", description: "Invoice telah berhasil dibatalkan." });
      setCancelTarget(null);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const waSendMutation = useMutation({
    mutationFn: ({ id, type }: { id: number; type: "send" | "overdue-reminder" }) =>
      apiPost<{ ok: boolean; skipped?: boolean; message: string }>(`${BASE}/api/whatsapp/invoice/${id}/${type}`, {}),
    onSuccess: (res) => {
      if (res.skipped) {
        toast({ title: "WA Tidak Terkirim", description: res.message, variant: "destructive" });
      } else {
        toast({ title: "WhatsApp Terkirim", description: res.message });
      }
    },
    onError: (e: Error) => toast({ title: "Gagal Kirim WA", description: e.message, variant: "destructive" }),
  });

  const sendLinkMutation = useMutation({
    mutationFn: (id: number) =>
      apiPost<{ ok: boolean; skipped?: boolean; waFailed?: boolean; error?: string; message?: string; paymentLink?: string | null }>(`${BASE}/api/whatsapp/invoice/${id}/send`, {}),
    onMutate: (id) => setSendingLinkId(id),
    onSettled: () => setSendingLinkId(null),
    onSuccess: (res) => {
      if (res.skipped) {
        if (res.paymentLink) {
          setLinkCopied(false);
          setPaymentLinkDialog({ link: res.paymentLink, error: "WhatsApp belum dikonfigurasi (FONNTE_TOKEN kosong)." });
        } else {
          toast({ title: "WA Tidak Terkirim", description: "FONNTE_TOKEN belum dikonfigurasi.", variant: "destructive" });
        }
      } else if (res.waFailed) {
        if (res.paymentLink) {
          setLinkCopied(false);
          setPaymentLinkDialog({ link: res.paymentLink, error: res.error ?? "Gagal kirim WA" });
        } else {
          toast({ title: "Gagal Kirim WA", description: res.error, variant: "destructive" });
        }
      } else {
        toast({ title: "Link Bayar Terkirim! 🔗", description: res.message });
      }
    },
    onError: (e: Error) => toast({ title: "Gagal Kirim Link", description: e.message, variant: "destructive" }),
  });

  const waBlastMutation = useMutation({
    mutationFn: () =>
      apiPost<{ ok: boolean; skipped?: boolean; sent: number; failed: number; total: number; message: string }>(`${BASE}/api/whatsapp/blast-overdue`, {}),
    onSuccess: (res) => {
      if (res.skipped) {
        toast({ title: "WA Tidak Terkirim", description: res.message, variant: "destructive" });
      } else {
        toast({ title: "Blast WA Selesai", description: res.message });
      }
    },
    onError: (e: Error) => toast({ title: "Gagal Blast WA", description: e.message, variant: "destructive" }),
  });

  const blastLinkMutation = useMutation({
    mutationFn: () =>
      apiPost<{ ok: boolean; skipped?: boolean; sent: number; failed: number; total: number; message: string }>(`${BASE}/api/whatsapp/blast-link-unpaid`, {}),
    onSuccess: (res) => {
      if (res.skipped) {
        toast({ title: "Link Tidak Terkirim", description: res.message, variant: "destructive" });
      } else {
        toast({ title: "Blast Link Selesai 🔗", description: res.message });
      }
    },
    onError: (e: Error) => toast({ title: "Gagal Blast Link", description: e.message, variant: "destructive" }),
  });

  // ─── Derived ────────────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const all = invoices ?? [];
    return {
      total: all.length,
      unpaid: all.filter(i => i.status === "unpaid").length,
      overdue: all.filter(i => i.status === "overdue").length,
      unpaidAll: all.filter(i => ["unpaid", "partial", "overdue"].includes(i.status)).length,
      totalOutstanding: all.reduce((s, i) => s + Number(i.outstandingAmount), 0),
    };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const all = invoices ?? [];
    if (filterDueDate === "all") return all;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return all.filter(inv => {
      if (!inv.dueDate) return false;
      const due = new Date(inv.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

      if (filterDueDate === "overdue") return diffDays < 0;
      if (filterDueDate === "today")   return diffDays === 0;
      if (filterDueDate === "7")       return diffDays >= 0 && diffDays <= 7;
      if (filterDueDate === "14")      return diffDays >= 0 && diffDays <= 14;
      if (filterDueDate === "30")      return diffDays >= 0 && diffDays <= 30;
      return true;
    });
  }, [invoices, filterDueDate]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.tenantId) {
      toast({ title: "Validasi Gagal", description: "Tenant wajib dipilih.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      tenantId: Number(createForm.tenantId),
      bookingId: createForm.bookingId ? Number(createForm.bookingId) : null,
      unitCode: createForm.unitCode || null,
      periodStart: createForm.periodStart || null,
      periodEnd: createForm.periodEnd || null,
      dueDate: createForm.dueDate || null,
      rentAmount: createForm.rentAmount || "0",
      serviceChargeAmount: createForm.serviceChargeAmount || "0",
      electricityChargeAmount: createForm.electricityChargeAmount || "0",
      waterChargeAmount: createForm.waterChargeAmount || "0",
      otherChargeAmount: createForm.otherChargeAmount || "0",
      discountAmount: createForm.discountAmount || "0",
      penaltyAmount: createForm.penaltyAmount || "0",
      taxAmount: createForm.taxAmount || "0",
      notes: createForm.notes || null,
      status: createForm.status,
    });
  }

  function handleGenerateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!generateForm.bookingId) {
      toast({ title: "Validasi Gagal", description: "Booking wajib dipilih.", variant: "destructive" });
      return;
    }
    generateMutation.mutate({ bookingId: Number(generateForm.bookingId), notes: generateForm.notes || undefined });
  }

  function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentTarget) return;
    if (!paymentForm.amountPaid || Number(paymentForm.amountPaid) <= 0) {
      toast({ title: "Validasi Gagal", description: "Jumlah bayar harus lebih dari 0.", variant: "destructive" });
      return;
    }
    paymentMutation.mutate({
      id: paymentTarget.id,
      data: {
        amountPaid: Number(paymentForm.amountPaid),
        paymentMethod: paymentForm.paymentMethod,
        paymentDate: paymentForm.paymentDate || undefined,
        notes: paymentForm.notes || null,
      },
    });
  }

  function openPayment(inv: Invoice) {
    setPaymentTarget(inv);
    setPaymentForm({ ...EMPTY_PAYMENT, amountPaid: inv.outstandingAmount, paymentDate: todayStr() });
    setPaymentOpen(true);
  }

  function openDetail(inv: Invoice) {
    setDetailTarget(inv);
    setDetailOpen(true);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoice Tenant</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-sm">Kelola tagihan dan pembayaran invoice tenant.</p>
            {/* Indikator status WhatsApp */}
            {!waStatusLoading && waStatus && (
              <span
                title={waStatus.message}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium cursor-default select-none ${
                  !waStatus.configured
                    ? "border-gray-200 bg-gray-50 text-gray-500"
                    : waStatus.connected === true
                    ? "border-green-200 bg-green-50 text-green-700"
                    : waStatus.connected === false
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-yellow-200 bg-yellow-50 text-yellow-700"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${
                  !waStatus.configured
                    ? "bg-gray-400"
                    : waStatus.connected === true
                    ? "bg-green-500"
                    : waStatus.connected === false
                    ? "bg-red-500 animate-pulse"
                    : "bg-yellow-500"
                }`} />
                WA {!waStatus.configured
                  ? "Tidak Dikonfigurasi"
                  : waStatus.connected === true
                  ? "Terhubung"
                  : waStatus.connected === false
                  ? "Terputus"
                  : "Tidak Diketahui"}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
            disabled={blastLinkMutation.isPending || summary.unpaidAll === 0}
            onClick={() => blastLinkMutation.mutate()}
            title={summary.unpaidAll === 0 ? "Tidak ada invoice belum lunas" : `Kirim link bayar ke ${summary.unpaidAll} invoice belum lunas`}
          >
            {blastLinkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {blastLinkMutation.isPending ? "Mengirim..." : `Kirim Link (${summary.unpaidAll})`}
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
            disabled={waBlastMutation.isPending || summary.overdue === 0}
            onClick={() => waBlastMutation.mutate()}
            title={summary.overdue === 0 ? "Tidak ada invoice overdue" : `Kirim pengingat ke ${summary.overdue} invoice overdue`}
          >
            <Send className="h-4 w-4" />
            {waBlastMutation.isPending ? "Mengirim..." : `Blast WA Overdue (${summary.overdue})`}
          </Button>
          <Button variant="outline" onClick={() => { setGenerateForm({ bookingId: "", notes: "" }); setGenerateOpen(true); }} className="gap-2">
            <Zap className="h-4 w-4" />
            Generate dari Booking
          </Button>
          <Button onClick={() => { setCreateForm(EMPTY_FORM); setCreateOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Buat Invoice
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Invoice", value: summary.total, sub: "semua status" },
          { label: "Belum Bayar", value: summary.unpaid, sub: "perlu tindakan", accent: "orange" },
          { label: "Jatuh Tempo", value: summary.overdue, sub: "segera bayar", accent: "red" },
          { label: "Total Tunggakan", value: formatRupiah(summary.totalOutstanding), sub: "outstanding", accent: "red" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</p>
              <p className={`text-xl font-bold mt-1 ${item.accent === "red" ? "text-red-500" : item.accent === "orange" ? "text-orange-500" : ""}`}>
                {item.value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <CardTitle>Daftar Invoice</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 w-48 h-9"
                  placeholder="Cari invoice / tenant..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Semua Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="unpaid">Belum Bayar</SelectItem>
                  <SelectItem value="partial">Sebagian</SelectItem>
                  <SelectItem value="paid">Lunas</SelectItem>
                  <SelectItem value="overdue">Jatuh Tempo</SelectItem>
                  <SelectItem value="cancelled">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterTenant} onValueChange={setFilterTenant}>
                <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Semua Tenant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tenant</SelectItem>
                  {(tenants ?? []).map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.businessName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterDueDate} onValueChange={setFilterDueDate}>
                <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Semua Tanggal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tanggal</SelectItem>
                  <SelectItem value="overdue">⚠️ Sudah lewat jatuh tempo</SelectItem>
                  <SelectItem value="today">📅 Jatuh tempo hari ini</SelectItem>
                  <SelectItem value="7">⏰ Jatuh tempo ≤ 7 hari</SelectItem>
                  <SelectItem value="14">⏰ Jatuh tempo ≤ 14 hari</SelectItem>
                  <SelectItem value="30">📆 Jatuh tempo ≤ 30 hari</SelectItem>
                </SelectContent>
              </Select>
              {filterDueDate !== "all" && (
                <button
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground h-9 px-1"
                  onClick={() => setFilterDueDate("all")}
                >
                  Reset tanggal
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isError && (
            <p className="text-sm text-destructive py-4 text-center">Gagal memuat data invoice. Periksa koneksi server.</p>
          )}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">No. Invoice</TableHead>
                  <TableHead className="min-w-[140px]">Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="min-w-[120px]">Periode</TableHead>
                  <TableHead className="min-w-[100px]">Jatuh Tempo</TableHead>
                  <TableHead className="min-w-[110px]">Total</TableHead>
                  <TableHead className="min-w-[110px]">Terbayar</TableHead>
                  <TableHead className="min-w-[110px]">Sisa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[220px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                  : filteredInvoices.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        {filterDueDate !== "all"
                          ? <p>Tidak ada invoice untuk filter tanggal ini.</p>
                          : <><p>Belum ada invoice.</p><p className="text-xs mt-1">Klik "Generate dari Booking" untuk membuat invoice otomatis.</p></>
                        }
                      </TableCell>
                    </TableRow>
                  )
                  : filteredInvoices.map((inv) => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openDetail(inv)}>
                      <TableCell className="font-mono text-xs font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        <p className="font-medium">{inv.tenantName ?? "-"}</p>
                        <p className="text-xs text-muted-foreground">{inv.ownerName ?? ""}</p>
                      </TableCell>
                      <TableCell className="text-sm">{inv.unitCode ?? (inv.boothNumber ?? "-")}</TableCell>
                      <TableCell className="text-sm">{formatPeriod(inv.periodStart, inv.periodEnd)}</TableCell>
                      <TableCell className="text-sm">{formatDate(inv.dueDate)}</TableCell>
                      <TableCell className="text-sm font-medium">{formatRupiah(inv.totalAmount)}</TableCell>
                      <TableCell className="text-sm text-green-600">{formatRupiah(inv.paidAmount)}</TableCell>
                      <TableCell className={`text-sm font-semibold ${Number(inv.outstandingAmount) > 0 ? "text-orange-600" : "text-green-600"}`}>
                        {formatRupiah(inv.outstandingAmount)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[inv.status]}`}>
                          {STATUS_ICON[inv.status]}
                          {STATUS_LABEL[inv.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {inv.status !== "paid" && inv.status !== "cancelled" && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => openPayment(inv)}>
                              <CreditCard className="h-3 w-3" />
                              Bayar
                            </Button>
                          )}
                          {inv.status !== "paid" && inv.status !== "cancelled" && inv.phone && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                              title="Kirim link upload bukti bayar via WhatsApp"
                              disabled={sendingLinkId === inv.id}
                              onClick={() => sendLinkMutation.mutate(inv.id)}
                            >
                              {sendingLinkId === inv.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Link2 className="h-3 w-3" />
                              }
                              Kirim Link
                            </Button>
                          )}
                          {inv.status === "overdue" && inv.phone && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                              title="Kirim pengingat overdue via WA"
                              disabled={waSendMutation.isPending}
                              onClick={() => waSendMutation.mutate({ id: inv.id, type: "overdue-reminder" })}
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Print" onClick={() => printInvoice(inv)}>
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          {inv.status !== "paid" && inv.status !== "cancelled" && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Batalkan" onClick={() => setCancelTarget(inv)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ─── Dialog: Create Invoice ───────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Buat Invoice Baru</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-2">
            <form id="create-invoice-form" onSubmit={handleCreateSubmit} className="flex flex-col gap-4 py-1">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tenant" required>
                  <Select value={createForm.tenantId} onValueChange={(v) => setCreateForm(f => ({ ...f, tenantId: v, bookingId: "" }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih tenant..." /></SelectTrigger>
                    <SelectContent>
                      {(tenants ?? []).map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.businessName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Kontrak / Booking">
                  <Select
                    value={createForm.bookingId}
                    onValueChange={(v) => {
                      const bk = (bookings ?? []).find(b => String(b.id) === v);
                      setCreateForm(f => ({ ...f, bookingId: v, unitCode: bk?.unitCode ?? f.unitCode }));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Pilih booking (opsional)..." /></SelectTrigger>
                    <SelectContent>
                      {(bookings ?? [])
                        .filter(b => !createForm.tenantId || String(b.tenantId) === createForm.tenantId)
                        .map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.contractNumber ?? `#${b.id}`} — {b.tenantName ?? ""} {b.unitCode ? `(${b.unitCode})` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Field label="Unit / Kode">
                  <Input value={createForm.unitCode} onChange={e => setCreateForm(f => ({ ...f, unitCode: e.target.value }))} placeholder="A-01" />
                </Field>
                <Field label="Periode Mulai">
                  <Input type="date" value={createForm.periodStart} onChange={e => setCreateForm(f => ({ ...f, periodStart: e.target.value }))} />
                </Field>
                <Field label="Periode Selesai">
                  <Input type="date" value={createForm.periodEnd} onChange={e => setCreateForm(f => ({ ...f, periodEnd: e.target.value }))} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Jatuh Tempo">
                  <Input type="date" value={createForm.dueDate} onChange={e => setCreateForm(f => ({ ...f, dueDate: e.target.value }))} />
                </Field>
                <Field label="Status Awal">
                  <Select value={createForm.status} onValueChange={(v) => setCreateForm(f => ({ ...f, status: v as InvoiceStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="unpaid">Belum Bayar</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Komponen Tagihan</p>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Harga Sewa">
                  <Input type="number" min="0" value={createForm.rentAmount} onChange={e => setCreateForm(f => ({ ...f, rentAmount: e.target.value }))} placeholder="0" />
                </Field>
                <Field label="Service Charge">
                  <Input type="number" min="0" value={createForm.serviceChargeAmount} onChange={e => setCreateForm(f => ({ ...f, serviceChargeAmount: e.target.value }))} placeholder="0" />
                </Field>
                <Field label="Biaya Listrik">
                  <Input type="number" min="0" value={createForm.electricityChargeAmount} onChange={e => setCreateForm(f => ({ ...f, electricityChargeAmount: e.target.value }))} placeholder="0" />
                </Field>
                <Field label="Biaya Air">
                  <Input type="number" min="0" value={createForm.waterChargeAmount} onChange={e => setCreateForm(f => ({ ...f, waterChargeAmount: e.target.value }))} placeholder="0" />
                </Field>
                <Field label="Biaya Lain-lain">
                  <Input type="number" min="0" value={createForm.otherChargeAmount} onChange={e => setCreateForm(f => ({ ...f, otherChargeAmount: e.target.value }))} placeholder="0" />
                </Field>
                <Field label="Diskon">
                  <Input type="number" min="0" value={createForm.discountAmount} onChange={e => setCreateForm(f => ({ ...f, discountAmount: e.target.value }))} placeholder="0" />
                </Field>
                <Field label="Denda">
                  <Input type="number" min="0" value={createForm.penaltyAmount} onChange={e => setCreateForm(f => ({ ...f, penaltyAmount: e.target.value }))} placeholder="0" />
                </Field>
                <Field label="Pajak">
                  <Input type="number" min="0" value={createForm.taxAmount} onChange={e => setCreateForm(f => ({ ...f, taxAmount: e.target.value }))} placeholder="0" />
                </Field>
              </div>

              <Field label="Catatan">
                <Textarea value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Catatan tambahan (opsional)" />
              </Field>
            </form>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button type="submit" form="create-invoice-form" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Menyimpan..." : "Buat Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Generate from Booking ────────────────────────────────────── */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Generate Invoice dari Booking
            </DialogTitle>
          </DialogHeader>
          <form id="generate-form" onSubmit={handleGenerateSubmit} className="flex flex-col gap-4 py-1">
            <Field label="Pilih Kontrak / Booking" required>
              <Select value={generateForm.bookingId} onValueChange={(v) => setGenerateForm(f => ({ ...f, bookingId: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih booking aktif..." /></SelectTrigger>
                <SelectContent>
                  {(bookings ?? [])
                    .filter(b => b !== null)
                    .map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.contractNumber ?? `#${b.id}`} — {b.tenantName ?? ""} {b.unitCode ? `(${b.unitCode})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-md p-3">
              Invoice akan dibuat otomatis berdasarkan billing cycle dan tarif dari booking yang dipilih. Periode tagihan akan dihitung untuk bulan/kuartal/tahun berjalan.
            </p>
            <Field label="Catatan">
              <Textarea value={generateForm.notes} onChange={e => setGenerateForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Opsional..." />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>Batal</Button>
            <Button type="submit" form="generate-form" disabled={generateMutation.isPending} className="gap-2">
              <Zap className="h-4 w-4" />
              {generateMutation.isPending ? "Membuat..." : "Generate Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Input Pembayaran ─────────────────────────────────────────── */}
      <Dialog open={paymentOpen} onOpenChange={(o) => { if (!o) { setPaymentOpen(false); setPaymentTarget(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Input Pembayaran Invoice
            </DialogTitle>
          </DialogHeader>
          {paymentTarget && (
            <div className="bg-muted/40 rounded-lg p-3 text-sm mb-1">
              <p className="font-mono font-medium text-xs text-muted-foreground">{paymentTarget.invoiceNumber}</p>
              <p className="font-semibold">{paymentTarget.tenantName}</p>
              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                <span>Total: <strong className="text-foreground">{formatRupiah(paymentTarget.totalAmount)}</strong></span>
                <span>Sisa: <strong className="text-orange-600">{formatRupiah(paymentTarget.outstandingAmount)}</strong></span>
              </div>
            </div>
          )}
          <form id="payment-form" onSubmit={handlePaymentSubmit} className="flex flex-col gap-4 py-1">
            <Field label="Jumlah Bayar (Rp)" required>
              <Input
                type="number" min="1"
                value={paymentForm.amountPaid}
                onChange={e => setPaymentForm(f => ({ ...f, amountPaid: e.target.value }))}
                placeholder="0"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Metode Pembayaran">
                <Select value={paymentForm.paymentMethod} onValueChange={(v) => setPaymentForm(f => ({ ...f, paymentMethod: v as PaymentForm["paymentMethod"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tunai">Tunai</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="qris">QRIS</SelectItem>
                    <SelectItem value="edc">EDC</SelectItem>
                    <SelectItem value="other">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tanggal Bayar">
                <Input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(f => ({ ...f, paymentDate: e.target.value }))} />
              </Field>
            </div>
            <Field label="Catatan">
              <Textarea value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Opsional..." />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaymentOpen(false); setPaymentTarget(null); }}>Batal</Button>
            <Button type="submit" form="payment-form" disabled={paymentMutation.isPending}>
              {paymentMutation.isPending ? "Memproses..." : "Catat Pembayaran"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Detail Invoice ───────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Detail Invoice
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-2 py-4"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
          ) : detailData ? (
            <ScrollArea className="max-h-[70vh] pr-2">
              <div className="flex flex-col gap-4">
                {/* Top info */}
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-mono text-sm font-bold text-primary">{detailData.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Dibuat {formatDate(detailData.createdAt)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[detailData.status]}`}>
                    {STATUS_ICON[detailData.status]}
                    {STATUS_LABEL[detailData.status]}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Tenant</p><p className="font-medium">{detailData.tenantName}</p></div>
                  <div><p className="text-xs text-muted-foreground">Unit</p><p className="font-medium">{detailData.unitCode ?? detailData.boothNumber ?? "-"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Periode</p><p className="font-medium">{formatPeriod(detailData.periodStart, detailData.periodEnd)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Jatuh Tempo</p><p className="font-medium">{formatDate(detailData.dueDate)}</p></div>
                </div>

                <Separator />

                <div className="space-y-1.5 text-sm">
                  {[
                    ["Sewa Ruang", detailData.rentAmount],
                    ["Service Charge", detailData.serviceChargeAmount],
                    ["Biaya Listrik", detailData.electricityChargeAmount],
                    ["Biaya Air", detailData.waterChargeAmount],
                    ["Biaya Lain-lain", detailData.otherChargeAmount],
                  ].filter(([, v]) => Number(v) > 0).map(([label, v]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span>{formatRupiah(v)}</span>
                    </div>
                  ))}
                  {Number(detailData.discountAmount) > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Diskon</span><span>- {formatRupiah(detailData.discountAmount)}</span>
                    </div>
                  )}
                  {Number(detailData.penaltyAmount) > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Denda</span><span>+ {formatRupiah(detailData.penaltyAmount)}</span>
                    </div>
                  )}
                  {Number(detailData.taxAmount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pajak</span><span>{formatRupiah(detailData.taxAmount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span><span>{formatRupiah(detailData.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Terbayar</span><span>{formatRupiah(detailData.paidAmount)}</span>
                  </div>
                  {Number(detailData.outstandingAmount) > 0 && (
                    <div className="flex justify-between font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
                      <span>Sisa Tagihan</span><span>{formatRupiah(detailData.outstandingAmount)}</span>
                    </div>
                  )}
                </div>

                {detailData.notes && (
                  <div className="bg-muted/40 rounded-md p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">Catatan</p>
                    <p>{detailData.notes}</p>
                  </div>
                )}

                {/* Payment history */}
                {(detailData.payments ?? []).length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Riwayat Pembayaran</p>
                      <div className="space-y-2">
                        {detailData.payments!.map((p) => (
                          <div key={p.id} className="flex justify-between items-center text-sm bg-muted/30 rounded-md px-3 py-2">
                            <div>
                              <p className="font-medium">{formatRupiah(p.amount)}</p>
                              <p className="text-xs text-muted-foreground">{p.paymentMethod} · {formatDate(p.paidAt)}</p>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{p.receiptNumber ?? "-"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          ) : null}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => { if (detailData) printInvoice(detailData); }} className="gap-2">
              <Printer className="h-4 w-4" />
              Print Invoice
            </Button>
            {detailData && detailData.status !== "cancelled" && detailData.phone && (
              <Button
                variant="outline"
                className={`gap-2 ${detailData.status === "overdue" ? "border-red-300 text-red-600 hover:bg-red-50" : "border-green-300 text-green-700 hover:bg-green-50"}`}
                disabled={waSendMutation.isPending}
                onClick={() => waSendMutation.mutate({ id: detailData.id, type: detailData.status === "overdue" ? "overdue-reminder" : "send" })}
              >
                <MessageCircle className="h-4 w-4" />
                {waSendMutation.isPending ? "Mengirim..." : detailData.status === "overdue" ? "Kirim Pengingat WA" : "Kirim Notif WA"}
              </Button>
            )}
            {detailData && detailData.status !== "paid" && detailData.status !== "cancelled" && (
              <Button onClick={() => { setDetailOpen(false); openPayment(detailData); }} className="gap-2">
                <CreditCard className="h-4 w-4" />
                Input Pembayaran
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Konfirmasi Batalkan ──────────────────────────────────────── */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <X className="h-4 w-4" />
              Batalkan Invoice
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Apakah Anda yakin ingin membatalkan invoice <strong className="text-foreground font-mono">{cancelTarget?.invoiceNumber}</strong>? Tindakan ini tidak dapat dibatalkan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Tidak</Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
            >
              {cancelMutation.isPending ? "Membatalkan..." : "Ya, Batalkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Fallback Link Bayar (WA gagal) ───────────────────────────── */}
      <Dialog open={!!paymentLinkDialog} onOpenChange={(o) => { if (!o) { setPaymentLinkDialog(null); setLinkCopied(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WifiOff className="h-5 w-5 text-orange-500" />
              WhatsApp Tidak Terhubung
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              <p className="font-medium mb-1">Pengiriman WA gagal</p>
              <p className="text-orange-700">{paymentLinkDialog?.error}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Anda bisa kirim link bayar ini secara manual ke tenant (copy lalu kirim via WA, SMS, atau email):
              </p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-xs font-mono break-all select-all">
                  {paymentLinkDialog?.link}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPaymentLinkDialog(null); setLinkCopied(false); }}>
              Tutup
            </Button>
            <Button
              className={linkCopied ? "bg-green-600 hover:bg-green-700" : ""}
              onClick={() => {
                if (paymentLinkDialog?.link) {
                  void navigator.clipboard.writeText(paymentLinkDialog.link);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 3000);
                }
              }}
            >
              {linkCopied
                ? <><CheckCheck className="h-4 w-4 mr-1.5" />Tersalin!</>
                : <><Copy className="h-4 w-4 mr-1.5" />Salin Link</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
