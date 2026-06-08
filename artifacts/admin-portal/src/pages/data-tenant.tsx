import React from "react";
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

const MOCK_DATA = [
  {
    id: "TEN-001",
    nama: "Kopi Kenangan",
    lokasi: "Lantai 1 - A01",
    kategori: "F&B",
    status: "Aktif",
  },
  {
    id: "TEN-002",
    nama: "H&M",
    lokasi: "Lantai 2 - B12",
    kategori: "Fashion",
    status: "Aktif",
  },
  {
    id: "TEN-003",
    nama: "Erafone",
    lokasi: "Lantai 3 - C05",
    kategori: "Elektronik",
    status: "Non-Aktif",
  },
  {
    id: "TEN-004",
    nama: "Gramedia",
    lokasi: "Lantai 3 - C01",
    kategori: "Elektronik",
    status: "Aktif",
  },
  {
    id: "TEN-005",
    nama: "Chatime",
    lokasi: "Lantai 1 - A05",
    kategori: "F&B",
    status: "Aktif",
  },
];

export default function DataTenant() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data Tenant</h1>
        <p className="text-muted-foreground mt-1">
          Daftar seluruh tenant yang terdaftar di mall.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>List Tenant</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Nama Tenant</TableHead>
                  <TableHead>Lokasi</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_DATA.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.id}</TableCell>
                    <TableCell>{tenant.nama}</TableCell>
                    <TableCell>{tenant.lokasi}</TableCell>
                    <TableCell>{tenant.kategori}</TableCell>
                    <TableCell>
                      <Badge
                        variant={tenant.status === "Aktif" ? "default" : "secondary"}
                      >
                        {tenant.status}
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
