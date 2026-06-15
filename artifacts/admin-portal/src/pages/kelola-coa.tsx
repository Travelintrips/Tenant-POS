import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type CoaRule = {
  id: number;
  coaCode: string;
  coaName: string;
  accountType: string | null;
  direction: string;
  providerName: string | null;
  descriptionPattern: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
};

type CoaFormState = {
  coaCode: string;
  coaName: string;
  accountType: string;
  direction: string;
  providerName: string;
  descriptionPattern: string;
  description: string;
  isActive: boolean;
};

const EMPTY_FORM: CoaFormState = {
  coaCode: "",
  coaName: "",
  accountType: "pendapatan",
  direction: "ALL",
  providerName: "",
  descriptionPattern: "",
  description: "",
  isActive: true,
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  kas: "Kas & Bank",
  piutang: "Piutang",
  ppn: "PPN",
  pph: "PPh",
  pendapatan: "Pendapatan",
  biaya: "Biaya",
  lainnya: "Lainnya",
};

const ACCOUNT_TYPE_COLOR: Record<string, string> = {
  kas: "bg-blue-100 text-blue-700 border-blue-200",
  piutang: "bg-purple-100 text-purple-700 border-purple-200",
  ppn: "bg-orange-100 text-orange-700 border-orange-200",
  pph: "bg-yellow-100 text-yellow-700 border-yellow-200",
  pendapatan: "bg-green-100 text-green-700 border-green-200",
  biaya: "bg-red-100 text-red-700 border-red-200",
  lainnya: "bg-gray-100 text-gray-700 border-gray-200",
};

const DIRECTION_LABELS: Record<string, string> = {
  IN: "Masuk",
  OUT: "Keluar",
  ALL: "Semua",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KelolaCoa() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CoaFormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: coaList = [], isLoading } = useQuery<CoaRule[]>({
    queryKey: ["coa-rules"],
    queryFn: async () => {
      const r = await apiFetch("/api/bank-reconciliation/coa-rules");
      if (!r.ok) throw new Error("Gagal memuat CoA");
      return r.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: CoaFormState & { id?: number }) => {
      const body = {
        coaCode: payload.coaCode.trim(),
        coaName: payload.coaName.trim(),
        accountType: payload.accountType,
        direction: payload.direction,
        providerName: payload.providerName.trim() || null,
        descriptionPattern: payload.descriptionPattern.trim() || null,
        description: payload.description.trim() || null,
        isActive: payload.isActive,
      };
      if (payload.id) {
        const r = await apiFetch(`/api/bank-reconciliation/coa-rules/${payload.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error("Gagal memperbarui akun");
        return r.json();
      } else {
        const r = await apiFetch("/api/bank-reconciliation/coa-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error("Gagal menambah akun");
        return r.json();
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coa-rules"] });
      setDialogOpen(false);
      toast({ title: editingId ? "Akun diperbarui" : "Akun ditambahkan", description: "Perubahan CoA berhasil disimpan." });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal menyimpan", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/api/bank-reconciliation/coa-rules/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Gagal menghapus akun");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coa-rules"] });
      setDeleteId(null);
      toast({ title: "Akun dihapus" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal menghapus", description: err.message, variant: "destructive" });
    },
  });

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(row: CoaRule) {
    setEditingId(row.id);
    setForm({
      coaCode: row.coaCode,
      coaName: row.coaName,
      accountType: row.accountType ?? "lainnya",
      direction: row.direction,
      providerName: row.providerName ?? "",
      descriptionPattern: row.descriptionPattern ?? "",
      description: row.description ?? "",
      isActive: row.isActive,
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.coaCode.trim() || !form.coaName.trim()) {
      toast({ title: "Kode dan nama akun wajib diisi", variant: "destructive" });
      return;
    }
    saveMutation.mutate(editingId ? { ...form, id: editingId } : form);
  }

  function setField<K extends keyof CoaFormState>(key: K, val: CoaFormState[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600" />
            Kelola Chart of Accounts (CoA)
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Daftar akun dan aturan pemetaan untuk jurnal akuntansi
          </p>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Tambah Akun
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-28">Kode CoA</TableHead>
                <TableHead>Nama Akun</TableHead>
                <TableHead className="w-32">Tipe</TableHead>
                <TableHead className="w-24">Arah</TableHead>
                <TableHead className="w-36">Provider</TableHead>
                <TableHead>Pola Deskripsi</TableHead>
                <TableHead className="w-20 text-center">Aktif</TableHead>
                <TableHead className="w-20 text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : coaList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10 text-sm">
                    Belum ada akun CoA terdaftar
                  </TableCell>
                </TableRow>
              ) : (
                coaList.map((row) => (
                  <TableRow key={row.id} className="text-sm">
                    <TableCell className="font-mono font-semibold text-blue-700">{row.coaCode}</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{row.coaName}</span>
                        {row.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-48">{row.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.accountType ? (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${ACCOUNT_TYPE_COLOR[row.accountType] ?? "bg-gray-100 text-gray-600"}`}>
                          {ACCOUNT_TYPE_LABELS[row.accountType] ?? row.accountType}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {DIRECTION_LABELS[row.direction] ?? row.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.providerName ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-40 truncate" title={row.descriptionPattern ?? ""}>
                      {row.descriptionPattern ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-block h-2 w-2 rounded-full ${row.isActive ? "bg-green-500" : "bg-gray-300"}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setDeleteId(row.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Tambah/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Akun CoA" : "Tambah Akun CoA"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Kode CoA <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="mis. 4-1001"
                  value={form.coaCode}
                  onChange={e => setField("coaCode", e.target.value)}
                  className="h-8 font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipe Akun</Label>
                <Select value={form.accountType} onValueChange={v => setField("accountType", v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nama Akun <span className="text-red-500">*</span></Label>
              <Input
                placeholder="mis. Pendapatan Sewa"
                value={form.coaName}
                onChange={e => setField("coaName", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Arah Transaksi</Label>
                <Select value={form.direction} onValueChange={v => setField("direction", v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Arah</SelectItem>
                    <SelectItem value="IN">Masuk (IN)</SelectItem>
                    <SelectItem value="OUT">Keluar (OUT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Provider Bank</Label>
                <Input
                  placeholder="mis. BCA, Mandiri"
                  value={form.providerName}
                  onChange={e => setField("providerName", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pola Deskripsi (Regex opsional)</Label>
              <Input
                placeholder="mis. TRANSFER|SEWA"
                value={form.descriptionPattern}
                onChange={e => setField("descriptionPattern", e.target.value)}
                className="h-8 font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Jika diisi, akun ini akan dipilih otomatis saat deskripsi transaksi cocok</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Catatan</Label>
              <Input
                placeholder="Keterangan tambahan (opsional)"
                value={form.description}
                onChange={e => setField("description", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch
                id="isActive"
                checked={form.isActive}
                onCheckedChange={v => setField("isActive", v)}
              />
              <Label htmlFor="isActive" className="text-sm cursor-pointer">Akun aktif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Tambah Akun"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Konfirmasi Hapus */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Akun CoA?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun ini akan dihapus permanen. Entri jurnal yang sudah ada tidak akan terpengaruh, namun aturan pemetaan otomatis akan hilang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
