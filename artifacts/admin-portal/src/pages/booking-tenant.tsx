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

const MOCK_BOOKINGS = [
  {
    id: "BKG-001",
    nama: "Kopi Kenangan",
    mulai: "2023-01-01",
    selesai: "2025-12-31",
    status: "Aktif",
  },
  {
    id: "BKG-002",
    nama: "H&M",
    mulai: "2022-06-01",
    selesai: "2024-05-31",
    status: "Selesai",
  },
  {
    id: "BKG-003",
    nama: "Erafone",
    mulai: "2024-02-01",
    selesai: "2026-01-31",
    status: "Menunggu Pembayaran",
  },
  {
    id: "BKG-004",
    nama: "Gramedia",
    mulai: "2020-01-01",
    selesai: "2030-12-31",
    status: "Aktif",
  },
];

export default function BookingTenant() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Booking Tenant</h1>
        <p className="text-muted-foreground mt-1">
          Daftar penyewaan dan masa sewa tenant.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Booking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">ID Booking</TableHead>
                  <TableHead>Nama Tenant</TableHead>
                  <TableHead>Tanggal Mulai</TableHead>
                  <TableHead>Tanggal Selesai</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_BOOKINGS.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell className="font-medium">{booking.id}</TableCell>
                    <TableCell>{booking.nama}</TableCell>
                    <TableCell>{booking.mulai}</TableCell>
                    <TableCell>{booking.selesai}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          booking.status === "Aktif"
                            ? "default"
                            : booking.status === "Selesai"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {booking.status}
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
