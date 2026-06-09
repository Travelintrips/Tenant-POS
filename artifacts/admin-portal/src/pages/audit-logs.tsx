import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Search, Eye, Shield, RefreshCw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: number;
  userId: number | null;
  userEmail: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogsResponse {
  data: AuditLog[];
  pagination: { total: number; limit: number; offset: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIONS = [
  { value: "all", label: "Semua Aksi" },
  { value: "create_tenant", label: "Buat Tenant" },
  { value: "update_tenant", label: "Ubah Tenant" },
  { value: "delete_tenant", label: "Hapus Tenant" },
  { value: "create_booking", label: "Buat Kontrak" },
  { value: "update_booking", label: "Ubah Kontrak" },
  { value: "terminate_booking", label: "Akhiri Kontrak" },
  { value: "create_invoice", label: "Buat Invoice" },
  { value: "cancel_invoice", label: "Batalkan Invoice" },
  { value: "create_payment", label: "Catat Pembayaran" },
  { value: "void_payment", label: "Void Pembayaran" },
  { value: "refund_payment", label: "Refund Pembayaran" },
  { value: "update_unit_status", label: "Ubah Status Unit" },
  { value: "change_user_role", label: "Ubah Peran User" },
];

const ENTITY_TYPES = [
  { value: "all", label: "Semua Entitas" },
  { value: "tenant", label: "Tenant" },
  { value: "booking", label: "Kontrak" },
  { value: "invoice", label: "Invoice" },
  { value: "payment", label: "Pembayaran" },
  { value: "mall_unit", label: "Unit Mall" },
  { value: "user", label: "User" },
];

const ACTION_COLORS: Record<string, string> = {
  create_tenant: "bg-green-100 text-green-800",
  update_tenant: "bg-blue-100 text-blue-800",
  delete_tenant: "bg-red-100 text-red-800",
  create_booking: "bg-green-100 text-green-800",
  update_booking: "bg-blue-100 text-blue-800",
  terminate_booking: "bg-orange-100 text-orange-800",
  create_invoice: "bg-green-100 text-green-800",
  cancel_invoice: "bg-red-100 text-red-800",
  create_payment: "bg-emerald-100 text-emerald-800",
  void_payment: "bg-red-100 text-red-800",
  refund_payment: "bg-yellow-100 text-yellow-800",
  update_unit_status: "bg-purple-100 text-purple-800",
  change_user_role: "bg-pink-100 text-pink-800",
};

const ACTION_LABELS: Record<string, string> = {
  create_tenant: "Buat Tenant",
  update_tenant: "Ubah Tenant",
  delete_tenant: "Hapus Tenant",
  create_booking: "Buat Kontrak",
  update_booking: "Ubah Kontrak",
  terminate_booking: "Akhiri Kontrak",
  create_invoice: "Buat Invoice",
  cancel_invoice: "Batalkan Invoice",
  create_payment: "Catat Pembayaran",
  void_payment: "Void Pembayaran",
  refund_payment: "Refund Pembayaran",
  update_unit_status: "Ubah Status Unit",
  change_user_role: "Ubah Peran User",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function JsonView({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return <span className="text-muted-foreground text-xs italic">—</span>;
  return (
    <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all font-mono">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

function AuditDetailDialog({ log, open, onClose }: { log: AuditLog | null; open: boolean; onClose: () => void }) {
  if (!log) return null;
  const actionLabel = ACTION_LABELS[log.action] ?? log.action;
  const actionColor = ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-800";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Detail Audit Log #{log.id}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Aksi</p>
                <Badge className={`text-xs border-0 ${actionColor}`}>{actionLabel}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Entitas</p>
                <p className="font-medium">{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Pengguna</p>
                <p className="font-medium">{log.userName ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{log.userEmail ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Waktu</p>
                <p className="font-medium text-xs">{formatDateTime(log.createdAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">IP Address</p>
                <p className="font-medium font-mono text-xs">{log.ipAddress ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">User Agent</p>
                <p className="text-xs text-muted-foreground truncate" title={log.userAgent ?? ""}>{log.userAgent ?? "—"}</p>
              </div>
            </div>

            {/* Before / After data */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold mb-1.5 text-muted-foreground">Data Sebelum</p>
                <JsonView data={log.beforeData} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-1.5 text-muted-foreground">Data Sesudah</p>
                <JsonView data={log.afterData} />
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditLogs() {
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const LIMIT = 50;

  const params = new URLSearchParams();
  if (dari) params.set("dari", dari);
  if (sampai) params.set("sampai", sampai);
  if (userEmail.trim()) params.set("user_email", userEmail.trim());
  if (action !== "all") params.set("action", action);
  if (entityType !== "all") params.set("entity_type", entityType);
  params.set("limit", String(LIMIT));
  params.set("offset", String(page * LIMIT));

  const { data, isLoading, refetch } = useQuery<AuditLogsResponse>({
    queryKey: ["audit-logs", dari, sampai, userEmail, action, entityType, page],
    queryFn: async () => {
      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error("Gagal memuat audit log");
      return res.json();
    },
    staleTime: 30_000,
  });

  const logs = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  function resetFilters() {
    setDari("");
    setSampai("");
    setUserEmail("");
    setAction("all");
    setEntityType("all");
    setPage(0);
  }

  function openDetail(log: AuditLog) {
    setSelectedLog(log);
    setDetailOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Rekam jejak semua perubahan penting di sistem
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Dari Tanggal</p>
              <Input type="date" value={dari} onChange={(e) => { setDari(e.target.value); setPage(0); }} className="h-8 text-xs" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Sampai Tanggal</p>
              <Input type="date" value={sampai} onChange={(e) => { setSampai(e.target.value); setPage(0); }} className="h-8 text-xs" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Email User</p>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Cari email..."
                  value={userEmail}
                  onChange={(e) => { setUserEmail(e.target.value); setPage(0); }}
                  className="h-8 text-xs pl-6"
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Aksi</p>
              <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Entitas</p>
              <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((e) => (
                    <SelectItem key={e.value} value={e.value} className="text-xs">{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs">
              Reset Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Riwayat Aktivitas</span>
            <span className="text-sm font-normal text-muted-foreground">
              {total.toLocaleString("id-ID")} total entri
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Memuat data...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Shield className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Belum ada audit log</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-12 text-xs py-2">ID</TableHead>
                    <TableHead className="text-xs py-2">Waktu</TableHead>
                    <TableHead className="text-xs py-2">Pengguna</TableHead>
                    <TableHead className="text-xs py-2">Aksi</TableHead>
                    <TableHead className="text-xs py-2">Entitas</TableHead>
                    <TableHead className="text-xs py-2">ID Entitas</TableHead>
                    <TableHead className="text-xs py-2">IP</TableHead>
                    <TableHead className="w-10 text-xs py-2"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const actionLabel = ACTION_LABELS[log.action] ?? log.action;
                    const actionColor = ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-800";
                    return (
                      <TableRow key={log.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(log)}>
                        <TableCell className="text-xs py-2 text-muted-foreground font-mono">{log.id}</TableCell>
                        <TableCell className="text-xs py-2 whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                        <TableCell className="text-xs py-2">
                          <p className="font-medium truncate max-w-28">{log.userName ?? "—"}</p>
                          <p className="text-muted-foreground truncate max-w-28">{log.userEmail ?? "—"}</p>
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <Badge className={`text-[10px] border-0 ${actionColor}`}>{actionLabel}</Badge>
                        </TableCell>
                        <TableCell className="text-xs py-2 capitalize">{log.entityType.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-xs py-2 font-mono text-muted-foreground">{log.entityId ?? "—"}</TableCell>
                        <TableCell className="text-xs py-2 font-mono text-muted-foreground">{log.ipAddress ?? "—"}</TableCell>
                        <TableCell className="py-2" onClick={(e) => { e.stopPropagation(); openDetail(log); }}>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <Eye className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Halaman {page + 1} dari {totalPages} ({total} total)
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AuditDetailDialog log={selectedLog} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  );
}
