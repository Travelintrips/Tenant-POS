import { useState } from "react";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

type TenantStatus = "active" | "inactive" | "blacklisted" | "aktif" | "kosong" | "nonaktif";

type Tenant = {
  id: number;
  businessName: string;
  ownerName: string;
  email: string | null;
  phone: string | null;
  category: string | null;
  boothNumber: string | null;
  areaName: string;
  status: TenantStatus;
  notes: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type TenantForm = {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  category: string;
  boothNumber: string;
  areaName: string;
  status: TenantStatus;
  notes: string;
};

const EMPTY_FORM: TenantForm = {
  businessName: "",
  ownerName: "",
  email: "",
  phone: "",
  category: "",
  boothNumber: "",
  areaName: "",
  status: "active",
  notes: "",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  inactive: "Non-Aktif",
  blacklisted: "Blacklist",
  aktif: "Aktif",
  kosong: "Kosong",
  nonaktif: "Non-Aktif",
};

function statusClass(status: string): string {
  switch (status) {
    case "active":
    case "aktif":
      return "bg-green-100 text-green-800 border-green-200";
    case "inactive":
    case "kosong":
    case "nonaktif":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "blacklisted":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

const CATEGORIES = ["Kuliner", "Fashion", "F&B", "Elektronik", "Kesehatan", "Kecantikan", "Olahraga", "Pendidikan", "Lainnya"];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchTenants(): Promise<Tenant[]> {
  const res = await fetch(`${BASE}/api/tenants`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Tenant[]>;
}

async function createTenant(data: TenantForm): Promise<Tenant> {
  const res = await fetch(`${BASE}/api/tenants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal menyimpan tenant");
  }
  return res.json() as Promise<Tenant>;
}

async function updateTenant(id: number, data: TenantForm): Promise<Tenant> {
  const res = await fetch(`${BASE}/api/tenants/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal memperbarui tenant");
  }
  return res.json() as Promise<Tenant>;
}

async function deleteTenant(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/tenants/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Gagal menghapus tenant");
  }
}

export default function DataTenant() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Tenant | null>(null);
  const [form, setForm] = useState<TenantForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: tenants, isLoading, isError } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
    queryFn: fetchTenants,
  });

  const createMutation = useMutation({
    mutationFn: createTenant,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Berhasil", description: "Tenant baru berhasil ditambahkan." });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: TenantForm }) => updateTenant(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Berhasil", description: "Data tenant berhasil diperbarui." });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTenant,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Berhasil", description: "Tenant berhasil dihapus." });
      setDeleteTarget(null);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal", description: e.message, variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(tenant: Tenant) {
    setEditTarget(tenant);
    setForm({
      businessName: tenant.businessName,
      ownerName: tenant.ownerName,
      email: tenant.email ?? "",
      phone: tenant.phone ?? "",
      category: tenant.category ?? "",
      boothNumber: tenant.boothNumber ?? "",
      areaName: tenant.areaName,
      status: tenant.status,
      notes: tenant.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form, notes: form.notes || null } as TenantForm;
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const filtered = (tenants ?? []).filter((t) => {
    const matchSearch =
      search === "" ||
      t.businessName.toLowerCase().includes(search.toLowerCase()) ||
      t.ownerName.toLowerCase().includes(search.toLowerCase()) ||
      (t.boothNumber ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const countActive = tenants?.filter((t) => t.status === "active" || t.status === "aktif").length ?? 0;
  const countInactive = tenants?.filter((t) => t.status === "inactive" || t.status === "kosong" || t.status === "nonaktif").length ?? 0;
  const countBlacklisted = tenants?.filter((t) => t.status === "blacklisted").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Tenant</h1>
          <p className="text-muted-foreground mt-1">Daftar seluruh tenant yang terdaftar di mall.</p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Tenant
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Tenant Aktif", value: countActive, color: "text-green-600" },
          { label: "Non-Aktif", value: countInactive, color: "text-gray-500" },
          { label: "Blacklist", value: countBlacklisted, color: "text-red-600" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</p>
              <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Daftar Tenant</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 w-48 h-9"
                  placeholder="Cari tenant..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Semua status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Non-Aktif</SelectItem>
                  <SelectItem value="blacklisted">Blacklist</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isError && (
            <p className="text-sm text-destructive py-4 text-center">
              Gagal memuat data tenant. Periksa koneksi server.
            </p>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">ID</TableHead>
                  <TableHead>Nama Usaha</TableHead>
                  <TableHead>Pemilik</TableHead>
                  <TableHead>No. HP</TableHead>
                  <TableHead>Unit / Lantai</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : filtered.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {tenants?.length === 0 ? "Belum ada tenant terdaftar." : "Tidak ada hasil pencarian."}
                      </TableCell>
                    </TableRow>
                  )
                  : filtered.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell className="font-mono text-sm">{tenant.id}</TableCell>
                        <TableCell className="font-medium">{tenant.businessName}</TableCell>
                        <TableCell>{tenant.ownerName}</TableCell>
                        <TableCell>{tenant.phone ?? "-"}</TableCell>
                        <TableCell>
                          {tenant.boothNumber ?? "-"}
                          {tenant.areaName ? <span className="text-muted-foreground"> · {tenant.areaName}</span> : ""}
                        </TableCell>
                        <TableCell>{tenant.category ?? "-"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClass(tenant.status)}`}>
                            {STATUS_LABEL[tenant.status] ?? tenant.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(tenant)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(tenant)}
                            >
                              <Trash2 className="h-4 w-4" />
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

      {/* Dialog Tambah / Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Tenant" : "Tambah Tenant Baru"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <form id="tenant-form" onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="businessName">Nama Usaha *</Label>
                  <Input
                    id="businessName" value={form.businessName} required
                    onChange={(e) => setForm(f => ({ ...f, businessName: e.target.value }))}
                    placeholder="cth. Warung Nasi Bu Sari"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ownerName">Nama Pemilik *</Label>
                  <Input
                    id="ownerName" value={form.ownerName} required
                    onChange={(e) => setForm(f => ({ ...f, ownerName: e.target.value }))}
                    placeholder="cth. Sari Dewi"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">No. HP</Label>
                  <Input
                    id="phone" value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="cth. 08123456789"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email" type="email" value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="cth. sari@email.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="areaName">Area / Lantai</Label>
                  <Input
                    id="areaName" value={form.areaName}
                    onChange={(e) => setForm(f => ({ ...f, areaName: e.target.value }))}
                    placeholder="cth. Lantai 1"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="boothNumber">Kode Unit</Label>
                  <Input
                    id="boothNumber" value={form.boothNumber}
                    onChange={(e) => setForm(f => ({ ...f, boothNumber: e.target.value }))}
                    placeholder="cth. A-01"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="category">Kategori</Label>
                  <Select value={form.category || ""} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger id="category"><SelectValue placeholder="Pilih kategori..." /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="status">Status *</Label>
                  <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as TenantStatus }))}>
                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktif</SelectItem>
                      <SelectItem value="inactive">Non-Aktif</SelectItem>
                      <SelectItem value="blacklisted">Blacklist</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Catatan</Label>
                <Textarea
                  id="notes" value={form.notes} rows={3}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Catatan tambahan tentang tenant..."
                />
              </div>
            </form>
          </ScrollArea>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button type="submit" form="tenant-form" disabled={isSaving}>
              {isSaving ? "Menyimpan..." : editTarget ? "Simpan Perubahan" : "Tambah Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Konfirmasi Hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              Tenant <strong>{deleteTarget?.businessName}</strong> akan dihapus secara permanen.
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
