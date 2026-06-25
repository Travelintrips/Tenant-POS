import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Plus, TrendingUp, Filter, Trash2, Loader2, AlertCircle, ChevronLeft, ChevronRight, Banknote, Hash, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type OtherIncome = {
  id: number; siteId: number | null; tenantId: number | null; category: string;
  coaCode: string | null; coaName: string | null; description: string;
  amount: string; date: string; createdAt: string; tenantName: string | null; siteName: string | null;
};
type ApiResponse = { success: boolean; data: OtherIncome[]; summary: { totalRecords: number; totalAmount: string }; pagination: { total: number; limit: number; offset: number; hasMore: boolean } };
type CoaAccount = { id: number; code: string; name: string; accountType: string };
type Tenant = { id: number; businessName: string };

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  penalty: { label: "Denda", color: "bg-red-100 text-red-800" },
  refund:  { label: "Refund", color: "bg-blue-100 text-blue-800" },
  service: { label: "Jasa", color: "bg-purple-100 text-purple-800" },
  other:   { label: "Lain-lain", color: "bg-gray-100 text-gray-800" },
};

const LIMIT = 20;
const fmt = (n: number | string) => Number(n).toLocaleString("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

type FormState = { category: string; description: string; amount: string; date: string; tenantId: string; coaCode: string; coaName: string };
const emptyForm = (): FormState => ({ category: "other", description: "", amount: "", date: new Date().toISOString().slice(0, 10), tenantId: "", coaCode: "", coaName: "" });

export default function PemasukanLain() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [tenantSearch, setTenantSearch] = useState("");

  const params = new URLSearchParams();
  if (filterCategory !== "all") params.set("category", filterCategory);
  if (filterDateFrom) params.set("dateFrom", filterDateFrom);
  if (filterDateTo) params.set("dateTo", filterDateTo);
  params.set("limit", String(LIMIT));
  params.set("offset", String(offset));

  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ["other-income", filterCategory, filterDateFrom, filterDateTo, offset],
    queryFn: async () => { const res = await apiFetch(`${BASE}/api/other-income?${params}`); if (!res.ok) throw new Error("Gagal memuat data"); return res.json(); },
  });

  const { data: summaryData } = useQuery<{ success: boolean; data: { totalAmount: number; totalCount: number; byCategory: { category: string; total: number; count: number }[] } }>({
    queryKey: ["other-income-summary", filterDateFrom, filterDateTo],
    queryFn: async () => { const p = new URLSearchParams(); if (filterDateFrom) p.set("dateFrom", filterDateFrom); if (filterDateTo) p.set("dateTo", filterDateTo); const res = await apiFetch(`${BASE}/api/other-income/summary?${p}`); if (!res.ok) throw new Error(); return res.json(); },
  });

  const { data: coaData } = useQuery<{ success: boolean; data: CoaAccount[] }>({
    queryKey: ["other-income-coa"],
    queryFn: async () => { const res = await apiFetch(`${BASE}/api/other-income/coa-accounts`); if (!res.ok) throw new Error(); return res.json(); },
    enabled: showForm,
  });

  const { data: tenantsData } = useQuery<{ success: boolean; data: Tenant[] }>({
    queryKey: ["tenants-list"],
    queryFn: async () => { const res = await apiFetch(`${BASE}/api/tenants`); if (!res.ok) throw new Error(); return res.json(); },
    enabled: showForm,
  });

  const createMutation = useMutation({
    mutationFn: async (body: object) => {
      const res = await apiFetch(`${BASE}/api/other-income`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? "Gagal menyimpan"); }
      return res.json();
    },
    onSuccess: () => { toast({ title: "Berhasil", description: "Pemasukan berhasil dicatat" }); qc.invalidateQueries({ queryKey: ["other-income"] }); qc.invalidateQueries({ queryKey: ["other-income-summary"] }); setShowForm(false); setForm(emptyForm()); },
    onError: (e: Error) => { toast({ title: "Gagal", description: e.message, variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { const res = await apiFetch(`${BASE}/api/other-income/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Gagal menghapus"); return res.json(); },
    onSuccess: () => { toast({ title: "Berhasil", description: "Pemasukan berhasil dihapus" }); qc.invalidateQueries({ queryKey: ["other-income"] }); qc.invalidateQueries({ queryKey: ["other-income-summary"] }); setDeleteId(null); },
    onError: () => { toast({ title: "Gagal", description: "Gagal menghapus", variant: "destructive" }); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) { toast({ title: "Validasi", description: "Deskripsi wajib diisi", variant: "destructive" }); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast({ title: "Validasi", description: "Nominal harus lebih dari 0", variant: "destructive" }); return; }
    if (!form.date) { toast({ title: "Validasi", description: "Tanggal wajib diisi", variant: "destructive" }); return; }
    createMutation.mutate({ category: form.category, description: form.description, amount, date: new Date(form.date).toISOString(), tenantId: form.tenantId ? parseInt(form.tenantId, 10) : null, coaCode: form.coaCode || null, coaName: form.coaName || null });
  }

  const total = data?.pagination.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-green-600" />
            Pemasukan Lain-lain
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Catat pemasukan non-sewa: denda, refund, jasa, dan lainnya</p>
        </div>
        <Button onClick={() => { setForm(emptyForm()); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Tambah Pemasukan
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Banknote className="h-4 w-4 text-green-600" />Total Pemasukan</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{fmt(summaryData?.data.totalAmount ?? 0)}</div><p className="text-xs text-muted-foreground mt-1">semua periode</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Hash className="h-4 w-4 text-blue-600" />Jumlah Transaksi</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{summaryData?.data.totalCount ?? 0}</div><p className="text-xs text-muted-foreground mt-1">total entri</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Per Kategori</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {summaryData?.data.byCategory.slice(0, 3).map(cat => (
              <div key={cat.category} className="flex items-center justify-between text-sm">
                <Badge className={`text-[10px] px-1.5 py-0 ${CATEGORY_LABELS[cat.category]?.color ?? "bg-gray-100"}`}>{CATEGORY_LABELS[cat.category]?.label ?? cat.category}</Badge>
                <span className="font-medium text-xs">{fmt(cat.total)}</span>
              </div>
            )) ?? <p className="text-xs text-muted-foreground">Belum ada data</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <Filter className="h-4 w-4 text-muted-foreground self-center" />
            <div className="space-y-1"><Label className="text-xs">Dari Tanggal</Label><Input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setOffset(0); }} className="h-8 w-36 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Sampai Tanggal</Label><Input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setOffset(0); }} className="h-8 w-36 text-sm" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Kategori</Label>
              <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setOffset(0); }}>
                <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="Semua" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(filterDateFrom || filterDateTo || filterCategory !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setFilterCategory("all"); setOffset(0); }}>Reset Filter</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : isError ? (
            <div className="flex items-center gap-2 p-6 text-destructive"><AlertCircle className="h-4 w-4" /><span className="text-sm">Gagal memuat data pemasukan</span></div>
          ) : !data?.data.length ? (
            <div className="py-16 text-center text-muted-foreground text-sm"><TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />Belum ada data pemasukan</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead><TableHead>Deskripsi</TableHead><TableHead>Kategori</TableHead>
                    <TableHead>Tenant</TableHead><TableHead>COA</TableHead><TableHead className="text-right">Nominal</TableHead><TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm whitespace-nowrap">{fmtDate(row.date)}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{row.description}</TableCell>
                      <TableCell><Badge className={`text-[10px] px-1.5 ${CATEGORY_LABELS[row.category]?.color ?? "bg-gray-100"}`}>{CATEGORY_LABELS[row.category]?.label ?? row.category}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.tenantName ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.coaName ?? row.coaCode ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium text-green-700 text-sm">{fmt(row.amount)}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(row.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                  <span>Halaman {currentPage} dari {totalPages} ({total} entri)</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={!data.pagination.hasMore} onClick={() => setOffset(offset + LIMIT)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={open => { if (!open) setShowForm(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-green-600" />Tambah Pemasukan Lain-lain</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tanggal <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi <span className="text-destructive">*</span></Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Contoh: Denda keterlambatan pembayaran tenant A" rows={2} required />
            </div>
            <div className="space-y-1.5">
              <Label>Nominal <span className="text-destructive">*</span></Label>
              <Input type="number" min={1} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="500000" required />
            </div>
            <div className="space-y-1.5">
              <Label>Tenant (opsional)</Label>
              <Popover open={tenantOpen} onOpenChange={o => { setTenantOpen(o); if (!o) setTenantSearch(""); }}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={tenantOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {form.tenantId
                        ? (tenantsData?.data?.find(t => String(t.id) === form.tenantId)?.businessName ?? "Pilih tenant...")
                        : "— Tidak terkait tenant —"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Cari nama tenant..."
                      value={tenantSearch}
                      onValueChange={setTenantSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Tenant tidak ditemukan.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => { setForm(f => ({ ...f, tenantId: "" })); setTenantOpen(false); setTenantSearch(""); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", !form.tenantId ? "opacity-100" : "opacity-0")} />
                          — Tidak terkait tenant —
                        </CommandItem>
                        {tenantsData?.data
                          ?.filter(t => t.businessName.toLowerCase().includes(tenantSearch.toLowerCase()))
                          .map(t => (
                            <CommandItem
                              key={t.id}
                              value={String(t.id)}
                              onSelect={() => { setForm(f => ({ ...f, tenantId: String(t.id) })); setTenantOpen(false); setTenantSearch(""); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", form.tenantId === String(t.id) ? "opacity-100" : "opacity-0")} />
                              {t.businessName}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Akun COA (opsional)</Label>
              <Select value={form.coaCode || "__none__"} onValueChange={code => { if (code === '__none__') { setForm(f => ({ ...f, coaCode: '', coaName: '' })); return; } const coa = coaData?.data.find(c => c.code === code); setForm(f => ({ ...f, coaCode: code, coaName: coa?.name ?? '' })); }}>
                <SelectTrigger><SelectValue placeholder="Pilih akun pendapatan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tanpa COA —</SelectItem>
                  {coaData?.data.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus Pemasukan?</AlertDialogTitle><AlertDialogDescription>Data pemasukan ini akan dihapus permanen. Jurnal yang sudah terposting tidak akan dibalik secara otomatis.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
