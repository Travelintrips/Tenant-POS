import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Users, RefreshCw, UserCog, ShieldCheck } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  { value: "owner", label: "Pemilik", color: "bg-purple-100 text-purple-800" },
  { value: "admin", label: "Admin", color: "bg-blue-100 text-blue-800" },
  { value: "finance", label: "Keuangan", color: "bg-emerald-100 text-emerald-800" },
  { value: "cashier", label: "Kasir", color: "bg-orange-100 text-orange-800" },
  { value: "tenant_user", label: "Tenant", color: "bg-gray-100 text-gray-700" },
];

function getRoleInfo(role: string) {
  return ROLES.find((r) => r.value === role) ?? { label: role, color: "bg-gray-100 text-gray-700" };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Change Role Dialog ───────────────────────────────────────────────────────

function ChangeRoleDialog({
  user,
  open,
  onClose,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState(user?.role ?? "");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: currentUser } = useAuth();

  React.useEffect(() => {
    if (user) setSelectedRole(user.role);
  }, [user]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user!.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal mengubah peran");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Peran berhasil diubah", description: `${user?.name} sekarang menjadi ${getRoleInfo(selectedRole).label}` });
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Gagal", description: err.message, variant: "destructive" });
    },
  });

  if (!user) return null;

  const isSelf = Number(currentUser?.dbId) === user.id;
  const unchanged = selectedRole === user.role;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-primary" />
            Ubah Peran User
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.avatarUrl ?? undefined} />
              <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-sm">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>

          {isSelf && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠️ Anda sedang mengubah peran akun Anda sendiri.
            </p>
          )}

          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Peran Baru</p>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    <span className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.color}`}>{r.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Batal</Button>
          <Button
            size="sm"
            disabled={unchanged || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [editUser, setEditUser] = useState<User | null>(null);
  const { data: currentUser } = useAuth();

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Manajemen User
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Kelola akses dan peran pengguna sistem
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs py-2">Pengguna</TableHead>
                  <TableHead className="text-xs py-2">Peran</TableHead>
                  <TableHead className="text-xs py-2">Bergabung</TableHead>
                  <TableHead className="text-xs py-2">Terakhir Diperbarui</TableHead>
                  <TableHead className="w-10 text-xs py-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const roleInfo = getRoleInfo(user.role);
                  const isSelf = Number(currentUser?.dbId) === user.id;
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
                              {isSelf && (
                                <span className="text-[10px] text-primary font-normal">(Anda)</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge className={`text-xs border-0 ${roleInfo.color}`}>{roleInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">
                        {formatDate(user.updatedAt)}
                      </TableCell>
                      <TableCell className="py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setEditUser(user)}
                        >
                          <UserCog className="h-3.5 w-3.5" />
                          Ubah Peran
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info box */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="px-4 py-3 flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-medium">Tentang Peran Pengguna</p>
            <ul className="space-y-0.5 text-blue-600">
              <li><strong>Pemilik</strong> — akses penuh termasuk ubah peran user</li>
              <li><strong>Admin</strong> — kelola tenant, booking, invoice, dan unit</li>
              <li><strong>Keuangan</strong> — lihat laporan dan kelola invoice</li>
              <li><strong>Kasir</strong> — operasional POS dan kasir shift</li>
              <li><strong>Tenant</strong> — akses portal tenant saja</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <ChangeRoleDialog user={editUser} open={!!editUser} onClose={() => setEditUser(null)} />
    </div>
  );
}
