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
import { useListBookings } from "@workspace/api-client-react";
import type { BookingWithTenantPaymentStatus, BookingWithTenantBookingStatus } from "@workspace/api-client-react";

const PAYMENT_LABEL: Record<string, string> = {
  UNPAID: "Belum Bayar",
  PARTIAL: "Sebagian",
  PAID: "Lunas",
  OVERDUE: "Jatuh Tempo",
};

const BOOKING_LABEL: Record<string, string> = {
  aktif: "Aktif",
  selesai: "Selesai",
  pending: "Pending",
  batal: "Batal",
};

function paymentVariant(
  status: BookingWithTenantPaymentStatus
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "PAID") return "default";
  if (status === "PARTIAL") return "outline";
  if (status === "OVERDUE") return "destructive";
  return "secondary";
}

function bookingVariant(
  status: BookingWithTenantBookingStatus
): "default" | "secondary" | "outline" {
  if (status === "aktif") return "default";
  if (status === "selesai") return "secondary";
  return "outline";
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function BookingTenant() {
  const { data: bookings, isLoading, isError } = useListBookings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-booking-tenant">
          Booking Tenant
        </h1>
        <p className="text-muted-foreground mt-1">
          Daftar penyewaan dan masa sewa tenant.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>List Booking</CardTitle>
        </CardHeader>
        <CardContent>
          {isError && (
            <p className="text-sm text-destructive py-4 text-center">
              Gagal memuat data booking. Periksa koneksi server.
            </p>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">ID</TableHead>
                  <TableHead>Nama Tenant</TableHead>
                  <TableHead>Area / Booth</TableHead>
                  <TableHead>Tanggal Mulai</TableHead>
                  <TableHead>Tanggal Selesai</TableHead>
                  <TableHead>Total Sewa</TableHead>
                  <TableHead>Pembayaran</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i} data-testid={`row-booking-skeleton-${i}`}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : bookings && bookings.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Belum ada data booking.
                      </TableCell>
                    </TableRow>
                  )
                  : bookings?.map((booking) => (
                      <TableRow key={booking.id} data-testid={`row-booking-${booking.id}`}>
                        <TableCell className="font-mono text-sm">{booking.id}</TableCell>
                        <TableCell className="font-medium">{booking.tenantName}</TableCell>
                        <TableCell>
                          {booking.areaName}
                          {booking.boothNumber ? ` · ${booking.boothNumber}` : ""}
                        </TableCell>
                        <TableCell>{booking.startDate}</TableCell>
                        <TableCell>{booking.endDate}</TableCell>
                        <TableCell>{formatRupiah(booking.totalAmount)}</TableCell>
                        <TableCell>
                          <Badge variant={paymentVariant(booking.paymentStatus)}>
                            {PAYMENT_LABEL[booking.paymentStatus] ?? booking.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={bookingVariant(booking.bookingStatus)}>
                            {BOOKING_LABEL[booking.bookingStatus] ?? booking.bookingStatus}
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
