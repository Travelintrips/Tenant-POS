import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

type TenantStatus = "aktif" | "kosong" | "nonaktif";

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
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABEL: Record<TenantStatus, string> = {
  aktif: "Aktif",
  kosong: "Kosong",
  nonaktif: "Non-Aktif",
};

function statusVariant(status: TenantStatus): "default" | "secondary" | "outline" {
  if (status === "aktif") return "default";
  if (status === "kosong") return "outline";
  return "secondary";
}

async function fetchTenants(): Promise<Tenant[]> {
  const res = await fetch("/api/tenants");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Tenant[]>;
}

export default function DataTenant() {
  const { data: tenants, isLoading, isError } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
    queryFn: fetchTenants,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-data-tenant">
          Data Tenant
        </h1>
        <p className="text-muted-foreground mt-1">
          Daftar seluruh tenant yang terdaftar di mall.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>List Tenant</CardTitle>
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
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Nama Usaha</TableHead>
                  <TableHead>Pemilik</TableHead>
                  <TableHead>Area / Booth</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : !tenants || tenants.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Belum ada tenant terdaftar.
                      </TableCell>
                    </TableRow>
                  )
                  : tenants.map((tenant) => (
                      <TableRow key={tenant.id} data-testid={`row-tenant-${tenant.id}`}>
                        <TableCell className="font-mono text-sm">{tenant.id}</TableCell>
                        <TableCell className="font-medium">{tenant.businessName}</TableCell>
                        <TableCell>{tenant.ownerName}</TableCell>
                        <TableCell>
                          {tenant.areaName}
                          {tenant.boothNumber ? ` · ${tenant.boothNumber}` : ""}
                        </TableCell>
                        <TableCell>{tenant.category ?? "-"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(tenant.status)}>
                            {STATUS_LABEL[tenant.status] ?? tenant.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
