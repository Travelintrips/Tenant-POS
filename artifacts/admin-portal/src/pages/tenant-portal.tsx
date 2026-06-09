import { useQuery } from "@tanstack/react-query";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, FileText, CreditCard, Receipt, LogOut, MapPin, User,
} from "lucide-react";

function formatCurrency(val: string | number | null | undefined) {
  if (val === null || val === undefined) return "—";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Aktif", variant: "default" },
  draft: { label: "Draft", variant: "secondary" },
  expired: { label: "Kedaluwarsa", variant: "destructive" },
  terminated: { label: "Diakhiri", variant: "destructive" },
  paid: { label: "Lunas", variant: "default" },
  partial: { label: "Sebagian", variant: "secondary" },
  unpaid: { label: "Belum Bayar", variant: "destructive" },
  overdue: { label: "Jatuh Tempo", variant: "destructive" },
  PAID: { label: "Lunas", variant: "default" },
  UNPAID: { label: "Belum Bayar", variant: "destructive" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGES[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export default function TenantPortal() {
  const { data: user, isLoading: authLoading } = useAuth();
  const logout = useLogout();

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ["tenant-portal-me"],
    queryFn: () => apiFetch("/api/tenant-portal/me"),
    enabled: !!user && user.role === "tenant_user",
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["tenant-portal-bookings"],
    queryFn: () => apiFetch("/api/tenant-portal/bookings"),
    enabled: !!user && user.role === "tenant_user",
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["tenant-portal-invoices"],
    queryFn: () => apiFetch("/api/tenant-portal/invoices"),
    enabled: !!user && user.role === "tenant_user",
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["tenant-portal-payments"],
    queryFn: () => apiFetch("/api/tenant-portal/payments"),
    enabled: !!user && user.role === "tenant_user",
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user || user.role !== "tenant_user") {
    window.location.href = "/login";
    return null;
  }

  const tenantAccess: any[] = meData?.tenantAccess ?? [];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Portal Tenant</p>
            <p className="text-xs text-muted-foreground">{user.name}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => logout.mutate()} className="gap-1 text-muted-foreground">
          <LogOut className="h-4 w-4" />
          Keluar
        </Button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {meLoading ? (
          <LoadingSkeleton />
        ) : tenantAccess.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Belum ada tenant yang terhubung</p>
              <p className="text-sm text-muted-foreground mt-1">
                Hubungi admin untuk menghubungkan akun Anda ke tenant.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {tenantAccess.map((access: any) => (
                <Card key={`${access.tenantId}-${access.siteId}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      {access.tenantName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      {access.ownerName}
                    </div>
                    {access.boothNumber && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {access.boothNumber} — {access.areaName}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {access.siteName}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <StatusBadge status={access.tenantStatus} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="contracts">
              <TabsList>
                <TabsTrigger value="contracts" className="gap-1.5">
                  <FileText className="h-4 w-4" /> Kontrak
                </TabsTrigger>
                <TabsTrigger value="invoices" className="gap-1.5">
                  <Receipt className="h-4 w-4" /> Invoice
                </TabsTrigger>
                <TabsTrigger value="payments" className="gap-1.5">
                  <CreditCard className="h-4 w-4" /> Pembayaran
                </TabsTrigger>
              </TabsList>

              <TabsContent value="contracts">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Kontrak / Booking</CardTitle></CardHeader>
                  <CardContent>
                    {bookingsLoading ? <LoadingSkeleton /> : (bookings as any[]).length === 0 ? (
                      <p className="text-sm text-center text-muted-foreground py-6">Tidak ada data kontrak</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>No. Kontrak</TableHead>
                              <TableHead>Unit</TableHead>
                              <TableHead>Mulai</TableHead>
                              <TableHead>Selesai</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Dokumen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(bookings as any[]).map((b) => (
                              <TableRow key={b.id}>
                                <TableCell className="font-mono text-xs">{b.contractNumber ?? b.orderNumber ?? "—"}</TableCell>
                                <TableCell>{b.unitCode ?? "—"}</TableCell>
                                <TableCell>{formatDate(b.startDate)}</TableCell>
                                <TableCell>{formatDate(b.endDate)}</TableCell>
                                <TableCell><StatusBadge status={b.contractStatus} /></TableCell>
                                <TableCell>
                                  {b.documentUrl ? (
                                    <a href={b.documentUrl} target="_blank" rel="noreferrer" className="text-primary underline text-xs">Lihat</a>
                                  ) : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="invoices">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Invoice</CardTitle></CardHeader>
                  <CardContent>
                    {invoicesLoading ? <LoadingSkeleton /> : (invoices as any[]).length === 0 ? (
                      <p className="text-sm text-center text-muted-foreground py-6">Tidak ada invoice</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>No. Invoice</TableHead>
                              <TableHead>Periode</TableHead>
                              <TableHead>Jatuh Tempo</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-right">Terbayar</TableHead>
                              <TableHead className="text-right">Sisa</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(invoices as any[]).map((inv) => (
                              <TableRow key={inv.id}>
                                <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                                <TableCell className="text-xs">{formatDate(inv.periodStart)} — {formatDate(inv.periodEnd)}</TableCell>
                                <TableCell className="text-xs">{formatDate(inv.dueDate)}</TableCell>
                                <TableCell className="text-right text-xs">{formatCurrency(inv.totalAmount)}</TableCell>
                                <TableCell className="text-right text-xs">{formatCurrency(inv.paidAmount)}</TableCell>
                                <TableCell className="text-right text-xs">{formatCurrency(inv.outstandingAmount)}</TableCell>
                                <TableCell><StatusBadge status={inv.status} /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payments">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Riwayat Pembayaran</CardTitle></CardHeader>
                  <CardContent>
                    {paymentsLoading ? <LoadingSkeleton /> : (payments as any[]).length === 0 ? (
                      <p className="text-sm text-center text-muted-foreground py-6">Tidak ada riwayat pembayaran</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>No. Pembayaran</TableHead>
                              <TableHead>Tanggal</TableHead>
                              <TableHead>Metode</TableHead>
                              <TableHead className="text-right">Jumlah</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Struk</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(payments as any[]).map((p) => (
                              <TableRow key={p.id}>
                                <TableCell className="font-mono text-xs">{p.paymentNumber ?? p.receiptNumber ?? "—"}</TableCell>
                                <TableCell className="text-xs">{formatDate(p.paidAt ?? p.createdAt)}</TableCell>
                                <TableCell className="text-xs capitalize">{p.paymentMethod ?? p.method}</TableCell>
                                <TableCell className="text-right text-xs">{formatCurrency(p.amount)}</TableCell>
                                <TableCell><StatusBadge status={p.paymentStatus ?? p.status} /></TableCell>
                                <TableCell>
                                  {p.proofUrl || p.proofImageUrl ? (
                                    <a href={p.proofUrl ?? p.proofImageUrl} target="_blank" rel="noreferrer" className="text-primary underline text-xs">Lihat</a>
                                  ) : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
