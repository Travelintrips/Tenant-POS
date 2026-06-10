import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Users, RefreshCw, UserCog, ShieldCheck, UserPlus, Trash2,
  LogOut, Pencil, Phone, Mail, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string | null;
  name: string;
  role: string;
  phoneNumber: string | null;
  status: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  { value: "owner",       label: "Pemilik",  color: "bg-purple-100 text-purple-800" },
  { value: "admin",       label: "Admin",    color: "bg-blue-100 text-blue-800" },
  { value: "finance",     label: "Keuangan", color: "bg-emerald-100 text-emerald-800" },
  { value: "cashier",     label: "Kasir",    color: "bg-orange-100 text-orange-800" },
  { value: "tenant_user", label: "Tenant",   color: "bg-gray-100 text-gray-700" },
];

const STATUSES = [
  { value: "active",   label: "Aktif",    icon: CheckCircle2, color: "text-emerald-600" },
  { value: "inactive", label: "Nonaktif", icon: XCircle,      color: "text-gray-400" },
  { value: "blocked",  label: "Diblokir", icon: AlertCircle,  color: "text-red-500" },
];

function getRoleInfo(role: string) {
  return ROLES.find((r) => r.value === role) ?? { label: role, color: "bg-gray-100 text-gray-700" };
}

function getStatusInfo(status: string) {
  return STATUSES.find((s) => s.value === status) ?? STATUSES[0];
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── User Form (shared by Add & Edit) ────────────────────────────────────────

interface UserFormState {
  name: string;
  email: string;
  phoneNumber: string;
  role: string;
  status: string;
}

const EMPTY_FORM: UserFormState = { name: "", email: "", phoneNumber: "", role: "admin", status: "active" };

function UserFormFields({
  form,
  onChange,
  isEdit,
}: {
  form: UserFormState;
  onChange: (f: Partial<UserFormState>) => void;
  isEdit?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs mb-1.5 block">Nama Lengkap <span className="text-red-500">*</span></Label>
        <Input
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="contoh: Budi Santoso"
          className="h-8 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1.5 block flex items-center gap-1"><Mail className="h-3 w-3" />Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="email@contoh.com"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs mb-1.5 block flex items-center gap-1"><Phone className="h-3 w-3" />No. HP</Label>
          <Input
            value={form.phoneNumber}
            onChange={(e) => onChange({ phoneNumber: e.target.value })}
            placeholder="6281234567890"
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1.5 block">Peran <span className="text-red-500">*</span></Label>
          <Select value={form.role} onValueChange={(v) => onChange({ role: v })}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.color}`}>{r.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isEdit && (
          <div>
            <Label className="text-xs mb-1.5 block">Status</Label>
            <Select value={form.status} onValueChange={(v) => onChange({ status: v })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="flex items-center gap-1.5 text-sm">
                      <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add User Dialog ──────────────────────────────────────────────────────────

function AddUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phoneNumber: form.phoneNumber.trim() || undefined,
          role: form.role,
          status: form.status,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal membuat user");
      return res.json();
    },
    onSuccess: (u) => {
      toast({ title: "User berhasil dibuat", description: u.name });
      qc.invalidateQueries({ queryKey: ["users"] });
      setForm(EMPTY_FORM);
      onClose();
    },
    onError: (err: Error) => toast({ title: "Gagal", description: err.message, variant: "destructive" }),
  });

  const handleClose = () => { setForm(EMPTY_FORM); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Tambah Pengguna Baru
          </DialogTitle>
          <DialogDescription className="text-xs">
            Isi data pengguna. Email atau nomor HP digunakan untuk login.
          </DialogDescription>
        </DialogHeader>
        <UserFormFields form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleClose}>Batal</Button>
          <Button
            size="sm"
            disabled={!form.name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Menyimpan..." : "Tambah User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit User Dialog ─────────────────────────────────────────────────────────

function EditUserDialog({ user, open, onClose }: { user: User | null; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: currentUser } = useAuth();

  React.useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        email: user.email ?? "",
        phoneNumber: user.phoneNumber ?? "",
        role: user.role,
        status: user.status,
      });
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phoneNumber: form.phoneNumber.trim() || null,
          role: form.role,
          status: form.status,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal memperbarui user");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User berhasil diperbarui", description: form.name });
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Gagal", description: err.message, variant: "destructive" }),
  });

  if (!user) return null;
  const isSelf = currentUser?.dbId === user.id;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" /> Edit Pengguna
          </DialogTitle>
        </DialogHeader>
        {isSelf && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ⚠️ Anda sedang mengedit akun Anda sendiri.
          </div>
        )}
        <UserFormFields form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} isEdit />
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Batal</Button>
          <Button
            size="sm"
            disabled={!form.name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteUserDialog({ user, open, onClose }: { user: User | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user!.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal menghapus");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User dihapus", description: `${user?.name} telah dihapus dari sistem` });
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Gagal", description: err.message, variant: "destructive" }),
  });

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-500" /> Hapus Pengguna?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Akun <strong>{user?.name}</strong> ({user?.email ?? user?.phoneNumber ?? "tanpa email"}) akan dihapus
            secara permanen termasuk semua akses tenant. Tindakan ini tidak dapat dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Menghapus..." : "Ya, Hapus"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Reset Session Confirm Dialog ─────────────────────────────────────────────

function ResetSessionDialog({ user, open, onClose }: { user: User | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user!.id}/reset-session`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal mereset sesi");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sesi direset", description: data.message });
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Gagal", description: err.message, variant: "destructive" }),
  });

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LogOut className="h-4 w-4 text-amber-500" /> Reset Sesi Aktif?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Sesi aktif <strong>{user?.name}</strong> akan segera diakhiri. Pengguna tersebut
            akan diminta login ulang pada request berikutnya. Tindakan ini tidak memengaruhi data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Mereset..." : "Ya, Reset Sesi"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = getStatusInfo(status);
  return (
    <span className={`flex items-center gap-1 text-xs ${s.color}`}>
      <s.icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ModalType = "add" | "edit" | "delete" | "reset-session" | null;

export default function UsersPage() {
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const { data: currentUser } = useAuth();
  const isOwner = currentUser?.role === "owner";

  const { data: users = [], isLoading, refetch } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Gagal memuat daftar user");
      return res.json();
    },
    staleTime: 30_000,
  });

  const roleCounts = ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r.value] = users.filter((u) => u.role === r.value).length;
    return acc;
  }, {});

  function openModal(type: ModalType, user?: User) {
    setSelectedUser(user ?? null);
    setModal(type);
  }

  function closeModal() {
    setModal(null);
    setSelectedUser(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Manajemen Pengguna
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Kelola akses, peran, dan sesi pengguna sistem
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          {isOwner && (
            <Button size="sm" className="gap-1.5" onClick={() => openModal("add")}>
              <UserPlus className="h-3.5 w-3.5" />
              Tambah User
            </Button>
          )}
        </div>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {ROLES.map((r) => (
          <Card key={r.value} className="py-3">
            <CardContent className="px-4 py-0 text-center">
              <p className="text-2xl font-bold">{roleCounts[r.value] ?? 0}</p>
              <Badge className={`text-[10px] border-0 mt-1 ${r.color}`}>{r.label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Daftar Pengguna</span>
            <span className="text-sm font-normal text-muted-foreground">{users.length} user</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Memuat data...
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Belum ada user terdaftar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs py-2">Pengguna</TableHead>
                    <TableHead className="text-xs py-2">Peran</TableHead>
                    <TableHead className="text-xs py-2">Status</TableHead>
                    <TableHead className="text-xs py-2">Login Terakhir</TableHead>
                    <TableHead className="text-xs py-2">Bergabung</TableHead>
                    {isOwner && <TableHead className="text-xs py-2 text-right pr-4">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const roleInfo = getRoleInfo(user.role);
                    const isSelf = currentUser?.dbId === user.id;
                    return (
                      <TableRow key={user.id} className="hover:bg-muted/30">
                        <TableCell className="py-2">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatarUrl ?? undefined} />
                              <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium flex items-center gap-1">
                                {user.name}
                                {isSelf && <span className="text-[10px] text-primary font-normal">(Anda)</span>}
                              </p>
                              <div className="flex items-center gap-2">
                                {user.email && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <Mail className="h-2.5 w-2.5" />{user.email}
                                  </span>
                                )}
                                {user.phoneNumber && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <Phone className="h-2.5 w-2.5" />{user.phoneNumber}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge className={`text-xs border-0 ${roleInfo.color}`}>{roleInfo.label}</Badge>
                        </TableCell>
                        <TableCell className="py-2">
                          <StatusBadge status={user.status} />
                        </TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground">
                          {formatDate(user.lastLoginAt)}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </TableCell>
                        {isOwner && (
                          <TableCell className="py-2">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1 px-2"
                                onClick={() => openModal("edit", user)}
                                title="Edit pengguna"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                              {!isSelf && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs gap-1 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                    onClick={() => openModal("reset-session", user)}
                                    title="Reset sesi aktif"
                                  >
                                    <LogOut className="h-3.5 w-3.5" />
                                    Reset Sesi
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs gap-1 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => openModal("delete", user)}
                                    title="Hapus pengguna"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
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

      {/* Info box */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="px-4 py-3 flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-medium">Tentang Peran & Aksi Pengguna</p>
            <ul className="space-y-0.5 text-blue-600">
              <li><strong>Pemilik</strong> — akses penuh termasuk tambah, edit, hapus user dan reset sesi</li>
              <li><strong>Admin</strong> — kelola tenant, booking, invoice, dan unit</li>
              <li><strong>Keuangan</strong> — lihat laporan dan kelola invoice</li>
              <li><strong>Kasir</strong> — operasional POS dan kasir shift</li>
              <li><strong>Tenant</strong> — akses portal tenant saja</li>
            </ul>
            <p className="text-blue-500 mt-1">
              <strong>Reset Sesi</strong>: memaksa pengguna logout dari semua perangkat pada request berikutnya.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddUserDialog open={modal === "add"} onClose={closeModal} />
      <EditUserDialog user={selectedUser} open={modal === "edit"} onClose={closeModal} />
      <DeleteUserDialog user={selectedUser} open={modal === "delete"} onClose={closeModal} />
      <ResetSessionDialog user={selectedUser} open={modal === "reset-session"} onClose={closeModal} />
    </div>
  );
}
