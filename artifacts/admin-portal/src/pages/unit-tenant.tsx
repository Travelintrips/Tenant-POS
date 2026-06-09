import { apiFetch } from "@/lib/api";
import { useState, useMemo } from "react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Search, Store, Building2, Dumbbell,
  LayoutGrid, List, CircleCheck, CircleX, Clock, AlertTriangle, Wrench,
} from "lucide-react";
import { useSite, ALL_SITES_SENTINEL } from "@/contexts/site-context";

// ─── Types ────────────────────────────────────────────────────────────────────

type UnitStatus = "available" | "booked" | "occupied" | "overdue" | "expired" | "maintenance";

type MallUnit = {
  id: number;
  unitCode: string;
  floor: string;
  zone: string | null;
  sizeM2: string | null;
  storedStatus: string;
  status: UnitStatus;
  notes: string | null;
  siteId: number | null;
  // Tenant info (if occupied)
  businessName: string | null;
  ownerName: string | null;
  phone: string | null;
  category: string | null;
  bookingId: number | null;
  startDate: string | null;
  endDate: string | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: string | null;
  periodLabel: string | null;
  dueDate: string | null;
  latestInvoiceStatus: string | null;
  latestInvoiceOutstanding: number | null;
};

type Site = {
  id: number;
  name: string;
  code: string;
  type: string;
};

type UnitForm = {
  unitCode: string;
  zone: string;
  sizeM2: string;
  status: string;
  notes: string;
  siteId: string;
};

const EMPTY_FORM: UnitForm = {
  unitCode: "",
  zone: "",
  sizeM2: "",
  status: "available",
  notes: "",
  siteId: "",
};

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<UnitStatus, { label: string; color: string; icon: React.ReactNode }> = {
  available:   { label: "Kosong",       color: "bg-emerald-100 text-emerald-800 border-emerald-200",  icon: <CircleCheck className="h-3 w-3" /> },
  booked:      { label: "Dipesan",      color: "bg-blue-100 text-blue-800 border-blue-200",           icon: <Clock className="h-3 w-3" /> },
  occupied:    { label: "Terisi",       color: "bg-violet-100 text-violet-800 border-violet-200",     icon: <Store className="h-3 w-3" /> },
  overdue:     { label: "Nunggak",      color: "bg-red-100 text-red-800 border-red-200",              icon: <AlertTriangle className="h-3 w-3" /> },
  expired:     { label: "Berakhir",     color: "bg-gray-100 text-gray-600 border-gray-200",           icon: <CircleX className="h-3 w-3" /> },
  maintenance: { label: "Pemeliharaan", color: "bg-amber-100 text-amber-800 border-amber-200",        icon: <Wrench className="h-3 w-3" /> },
};

const STORED_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "available",   label: "Kosong" },
  { value: "maintenance", label: "Pemeliharaan" },
];

const SITE_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  mall_tenant: {
    label: "TOD M1",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: <Building2 className="h-4 w-4" />,
  },
  sport_center: {
    label: "Sport Center",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: <Dumbbell className="h-4 w-4" />,
  },
};

function formatRupiah(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
}

function StatusBadge({ status }: { status: UnitStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.available;
  return (
    <Badge variant="outline" className={`inline-flex items-center gap-1 text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UnitTenantPage() {
  const { activeSite, sites } = useSite();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editUnit, setEditUnit] = useState<MallUnit | null>(null);
  const [form, setForm] = useState<UnitForm>(EMPTY_FORM);
  const [detailUnit, setDetailUnit] = useState<MallUnit | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");

  // Determine which siteId to use for API calls
  const isAllSites = activeSite?.code === ALL_SITES_SENTINEL.code;
  const siteIdHeader = isAllSites ? undefined : activeSite?.id;

  // Load sites list for the form dropdown
  const { data: allSites = [] } = useQuery<Site[]>({
    queryKey: ["sites"],
    queryFn: () => apiFetch("/api/sites"),
  });

  const { data: units = [], isLoading } = useQuery<MallUnit[]>({
    queryKey: ["mall-units", siteIdHeader],
    queryFn: () =>
      apiFetch("/api/mall-units", {
        headers: siteIdHeader ? { "x-site-id": String(siteIdHeader) } : {},
      }),
  });

  // Group units by site
  const unitsBySite = useMemo(() => {
    const map = new Map<number | null, MallUnit[]>();
    for (const u of units) {
      const key = u.siteId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return map;
  }, [units]);

  // Build tabs from available sites
  const siteTabs = useMemo(() => {
    if (!isAllSites) {
      // Single site mode — show one tab
      return activeSite ? [activeSite] : [];
    }
    // All sites mode — show tab per site that has units
    const siteIds = new Set(units.map(u => u.siteId));
    return allSites.filter(s => siteIds.has(s.id));
  }, [isAllSites, activeSite, units, allSites]);

  // Set default active tab when tabs change
  const firstTabId = siteTabs[0]?.id?.toString() ?? "";
  const resolvedTab = activeTab && siteTabs.some(s => s.id.toString() === activeTab) ? activeTab : firstTabId;

  // Filter units for the current tab
  const currentTabSite = siteTabs.find(s => s.id.toString() === resolvedTab);
  const baseUnits = currentTabSite
    ? (unitsBySite.get(currentTabSite.id) ?? [])
    : units;

  const filtered = useMemo(() => {
    return baseUnits.filter((u) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        u.unitCode.toLowerCase().includes(q) ||
        (u.zone ?? "").toLowerCase().includes(q) ||
        (u.businessName ?? "").toLowerCase().includes(q) ||
        (u.category ?? "").toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || u.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [baseUnits, search, filterStatus]);

  // Stats for current tab
  const stats = useMemo(() => ({
    total:       baseUnits.length,
    available:   baseUnits.filter(u => u.status === "available").length,
    occupied:    baseUnits.filter(u => u.status === "occupied" || u.status === "booked").length,
    overdue:     baseUnits.filter(u => u.status === "overdue").length,
    maintenance: baseUnits.filter(u => u.status === "maintenance").length,
  }), [baseUnits]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (data: UnitForm) => {
      const payload = {
        unitCode: data.unitCode.trim().toUpperCase(),
        zone:     data.zone.trim() || null,
        sizeM2:   data.sizeM2 || null,
        status:   data.status,
        notes:    data.notes.trim() || null,
        floor:    "1",
        siteId:   data.siteId ? Number(data.siteId) : (siteIdHeader ?? undefined),
      };
      if (editUnit) {
        return apiFetch(`/api/mall-units/${editUnit.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(siteIdHeader ? { "x-site-id": String(siteIdHeader) } : {}),
          },
          body: JSON.stringify(payload),
        });
      }
      return apiFetch("/api/mall-units", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(siteIdHeader ? { "x-site-id": String(siteIdHeader) } : {}),
        },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mall-units"] });
      toast({ title: editUnit ? "Unit diperbarui" : "Unit ditambahkan" });
      setDialogOpen(false);
      setEditUnit(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast({ title: "Gagal menyimpan", description: err?.message ?? "Terjadi kesalahan", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/mall-units/${id}`, {
        method: "DELETE",
        headers: siteIdHeader ? { "x-site-id": String(siteIdHeader) } : {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mall-units"] });
      toast({ title: "Unit dihapus" });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "Gagal menghapus", description: err?.message, variant: "destructive" });
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function openAdd() {
    setEditUnit(null);
    setForm({
      ...EMPTY_FORM,
      siteId: currentTabSite ? String(currentTabSite.id) : (siteIdHeader ? String(siteIdHeader) : ""),
    });
    setDialogOpen(true);
  }

  function openEdit(u: MallUnit) {
    setEditUnit(u);
    setForm({
      unitCode: u.unitCode,
      zone:     u.zone ?? "",
      sizeM2:   u.sizeM2 ?? "",
      status:   u.storedStatus,
      notes:    u.notes ?? "",
      siteId:   u.siteId ? String(u.siteId) : "",
    });
    setDialogOpen(true);
  }

  const siteForUnit = (u: MallUnit) => allSites.find(s => s.id === u.siteId);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Unit Tenant</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kelola unit / kios per lokasi
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Unit
        </Button>
      </div>

      {/* Tabs per lokasi */}
      <Tabs
        value={resolvedTab}
        onValueChange={(v) => { setActiveTab(v); setSearch(""); setFilterStatus("all"); }}
      >
        {siteTabs.length > 1 && (
          <TabsList className="mb-2">
            {siteTabs.map(s => {
              const cfg = SITE_TYPE_CONFIG[s.type];
              return (
                <TabsTrigger key={s.id} value={String(s.id)} className="gap-1.5">
                  <span className={cfg?.color ?? ""}>{cfg?.icon}</span>
                  {s.name}
                </TabsTrigger>
              );
            })}
          </TabsList>
        )}

        {siteTabs.map(s => (
          <TabsContent key={s.id} value={String(s.id)} className="space-y-4 mt-0">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Unit" value={stats.total} color="text-foreground" />
              <StatCard label="Kosong" value={stats.available} color="text-emerald-600" />
              <StatCard label="Terisi / Dipesan" value={stats.occupied} color="text-violet-600" />
              <StatCard label="Nunggak" value={stats.overdue} color="text-red-600" />
            </div>

            {/* Filter bar */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cari kode unit, zona, tenant..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue placeholder="Semua status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1 border rounded-md p-0.5">
                    <Button
                      size="sm" variant={viewMode === "table" ? "secondary" : "ghost"}
                      className="h-8 px-2"
                      onClick={() => setViewMode("table")}
                    ><List className="h-4 w-4" /></Button>
                    <Button
                      size="sm" variant={viewMode === "grid" ? "secondary" : "ghost"}
                      className="h-8 px-2"
                      onClick={() => setViewMode("grid")}
                    ><LayoutGrid className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Content */}
            {isLoading ? (
              <LoadingSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyState onAdd={openAdd} />
            ) : viewMode === "table" ? (
              <TableView units={filtered} onEdit={openEdit} onDelete={id => setDeleteId(id)} onDetail={setDetailUnit} />
            ) : (
              <GridView units={filtered} onEdit={openEdit} onDelete={id => setDeleteId(id)} onDetail={setDetailUnit} />
            )}
          </TabsContent>
        ))}

        {siteTabs.length === 0 && !isLoading && (
          <EmptyState onAdd={openAdd} />
        )}
      </Tabs>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) { setEditUnit(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editUnit ? "Edit Unit" : "Tambah Unit Baru"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-4 py-1">
              {/* Lokasi */}
              <div className="space-y-1.5">
                <Label>Lokasi <span className="text-destructive">*</span></Label>
                <Select value={form.siteId} onValueChange={v => setForm(f => ({ ...f, siteId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih lokasi" />
                  </SelectTrigger>
                  <SelectContent>
                    {allSites.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Kode Unit */}
              <div className="space-y-1.5">
                <Label>Kode Unit <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Contoh: K-01, SC-A1"
                  value={form.unitCode}
                  onChange={e => setForm(f => ({ ...f, unitCode: e.target.value }))}
                  className="uppercase"
                />
              </div>

              {/* Zona / Area */}
              <div className="space-y-1.5">
                <Label>Zona / Area</Label>
                <Input
                  placeholder="Contoh: Food Court, Kantin"
                  value={form.zone}
                  onChange={e => setForm(f => ({ ...f, zone: e.target.value }))}
                />
              </div>

              {/* Luas */}
              <div className="space-y-1.5">
                <Label>Luas (m²)</Label>
                <Input
                  type="number"
                  placeholder="Contoh: 12"
                  value={form.sizeM2}
                  onChange={e => setForm(f => ({ ...f, sizeM2: e.target.value }))}
                />
              </div>

              {/* Status Manual */}
              <div className="space-y-1.5">
                <Label>Status Manual</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STORED_STATUS_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Status sesungguhnya dihitung otomatis dari data booking & pembayaran.
                </p>
              </div>

              {/* Catatan */}
              <div className="space-y-1.5">
                <Label>Catatan</Label>
                <Textarea
                  placeholder="Catatan tambahan (opsional)"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.unitCode.trim() || !form.siteId}
            >
              {saveMutation.isPending ? "Menyimpan..." : editUnit ? "Simpan Perubahan" : "Tambah Unit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      {detailUnit && (
        <Dialog open={!!detailUnit} onOpenChange={v => { if (!v) setDetailUnit(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono">{detailUnit.unitCode}</span>
                <StatusBadge status={detailUnit.status} />
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <Row label="Zona" value={detailUnit.zone ?? "-"} />
              <Row label="Luas" value={detailUnit.sizeM2 ? `${detailUnit.sizeM2} m²` : "-"} />
              {detailUnit.businessName && (
                <>
                  <hr />
                  <p className="font-semibold text-xs uppercase text-muted-foreground tracking-wide">Tenant</p>
                  <Row label="Nama Usaha" value={detailUnit.businessName} />
                  <Row label="Pemilik" value={detailUnit.ownerName ?? "-"} />
                  <Row label="Telp" value={detailUnit.phone ?? "-"} />
                  <Row label="Kategori" value={detailUnit.category ?? "-"} />
                  <hr />
                  <p className="font-semibold text-xs uppercase text-muted-foreground tracking-wide">Kontrak</p>
                  <Row label="Mulai" value={detailUnit.startDate ?? "-"} />
                  <Row label="Berakhir" value={detailUnit.endDate ?? "-"} />
                  <Row label="Jatuh Tempo" value={detailUnit.dueDate ?? "-"} />
                  <Row label="Total Tagihan" value={formatRupiah(detailUnit.totalAmount)} />
                  <Row label="Sudah Dibayar" value={formatRupiah(detailUnit.paidAmount)} />
                  <Row label="Sisa" value={formatRupiah(detailUnit.remainingAmount)} />
                </>
              )}
              {detailUnit.notes && (
                <>
                  <hr />
                  <Row label="Catatan" value={detailUnit.notes} />
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => openEdit(detailUnit)}>
                <Pencil className="h-4 w-4 mr-1" /> Edit Unit
              </Button>
              <Button onClick={() => setDetailUnit(null)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={v => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Unit?</AlertDialogTitle>
            <AlertDialogDescription>
              Unit yang sudah dihapus tidak bisa dikembalikan. Pastikan unit tidak sedang memiliki booking aktif.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function TableView({
  units, onEdit, onDelete, onDetail,
}: {
  units: MallUnit[];
  onEdit: (u: MallUnit) => void;
  onDelete: (id: number) => void;
  onDetail: (u: MallUnit) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Kode Unit</TableHead>
                <TableHead>Zona / Area</TableHead>
                <TableHead className="w-20 text-right">Luas (m²)</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead className="w-32 text-right">Sisa Tagihan</TableHead>
                <TableHead className="w-20 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map(u => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onDetail(u)}
                >
                  <TableCell className="font-mono font-semibold">{u.unitCode}</TableCell>
                  <TableCell className="text-muted-foreground">{u.zone ?? "-"}</TableCell>
                  <TableCell className="text-right">{u.sizeM2 ?? "-"}</TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <StatusBadge status={u.status} />
                  </TableCell>
                  <TableCell>
                    {u.businessName ? (
                      <div>
                        <p className="font-medium text-sm">{u.businessName}</p>
                        <p className="text-xs text-muted-foreground">{u.ownerName}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.remainingAmount > 0 ? (
                      <span className={`text-sm font-medium ${u.status === "overdue" ? "text-red-600" : "text-foreground"}`}>
                        {new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(u.remainingAmount)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => onDelete(u.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function GridView({
  units, onEdit, onDelete, onDetail,
}: {
  units: MallUnit[];
  onEdit: (u: MallUnit) => void;
  onDelete: (id: number) => void;
  onDetail: (u: MallUnit) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {units.map(u => {
        const cfg = STATUS_CONFIG[u.status] ?? STATUS_CONFIG.available;
        return (
          <div
            key={u.id}
            className={`relative rounded-xl border-2 p-3 cursor-pointer transition-all hover:shadow-md ${
              u.status === "available"
                ? "border-emerald-200 bg-emerald-50/60 hover:border-emerald-400"
                : u.status === "overdue"
                ? "border-red-200 bg-red-50/60 hover:border-red-400"
                : u.status === "occupied" || u.status === "booked"
                ? "border-violet-200 bg-violet-50/60 hover:border-violet-400"
                : u.status === "maintenance"
                ? "border-amber-200 bg-amber-50/60 hover:border-amber-400"
                : "border-gray-200 bg-gray-50/60 hover:border-gray-400"
            }`}
            onClick={() => onDetail(u)}
          >
            {/* Kode Unit */}
            <p className="font-mono font-bold text-base truncate">{u.unitCode}</p>
            {/* Zona */}
            {u.zone && <p className="text-xs text-muted-foreground truncate mt-0.5">{u.zone}</p>}
            {/* Luas */}
            {u.sizeM2 && <p className="text-xs text-muted-foreground">{u.sizeM2} m²</p>}
            {/* Status */}
            <div className="mt-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.color}`}>
                {cfg.icon}
                {cfg.label}
              </span>
            </div>
            {/* Tenant name */}
            {u.businessName && (
              <p className="text-xs font-medium mt-1.5 truncate">{u.businessName}</p>
            )}
            {/* Actions */}
            <div className="flex gap-1 mt-2" onClick={e => e.stopPropagation()}>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEdit(u)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => onDelete(u.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
        <Store className="h-12 w-12 text-muted-foreground/50" />
        <div className="text-center">
          <p className="font-medium text-muted-foreground">Belum ada unit terdaftar</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Tambahkan unit untuk lokasi ini</p>
        </div>
        <Button onClick={onAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Unit Pertama
        </Button>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
