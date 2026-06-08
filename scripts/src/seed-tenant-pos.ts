import { db, pool } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantPaymentsTable,
} from "@workspace/db/schema";

const TENANTS = [
  // ── Sport Centre ──────────────────────────────────────────
  {
    businessName: "Xtreme Gym",
    ownerName: "Budi Santoso",
    email: "xtremegym@email.com",
    phone: "0812-3456-7890",
    category: "Olahraga & Fitness",
    boothNumber: "SC-01",
    areaName: "Sport Centre",
    status: "aktif" as const,
  },
  {
    businessName: "Sport Station",
    ownerName: "Hendra Wijaya",
    email: "sportstation@email.com",
    phone: "0813-9988-1122",
    category: "Peralatan Olahraga",
    boothNumber: "SC-02",
    areaName: "Sport Centre",
    status: "aktif" as const,
  },
  {
    businessName: "Juice Bar Fresh",
    ownerName: "Sari Dewi",
    email: "juicefresh@email.com",
    phone: "0857-2211-3344",
    category: "F&B",
    boothNumber: "SC-03",
    areaName: "Sport Centre",
    status: "aktif" as const,
  },
  {
    businessName: "Unit Kosong SC-04",
    ownerName: "-",
    email: null,
    phone: null,
    category: null,
    boothNumber: "SC-04",
    areaName: "Sport Centre",
    status: "kosong" as const,
  },
  // ── TOD Booth ─────────────────────────────────────────────
  {
    businessName: "Batik Nusantara",
    ownerName: "Agus Prasetyo",
    email: "batiknusantara@email.com",
    phone: "0821-4455-6677",
    category: "Fashion",
    boothNumber: "TOD-B1",
    areaName: "TOD",
    status: "aktif" as const,
  },
  {
    businessName: "Gelang & Cincin",
    ownerName: "Rina Marlina",
    email: "gelangjaya@email.com",
    phone: "0877-1234-5678",
    category: "Aksesori",
    boothNumber: "TOD-B2",
    areaName: "TOD",
    status: "aktif" as const,
  },
  {
    businessName: "Martabak 99",
    ownerName: "Joko Susilo",
    email: "martabak99@email.com",
    phone: "0811-9988-7766",
    category: "Kuliner",
    boothNumber: "TOD-B3",
    areaName: "TOD",
    status: "aktif" as const,
  },
  {
    businessName: "Booth Kosong B4",
    ownerName: "-",
    email: null,
    phone: null,
    category: null,
    boothNumber: "TOD-B4",
    areaName: "TOD",
    status: "kosong" as const,
  },
  {
    businessName: "Cantik Alami",
    ownerName: "Dewi Putri",
    email: "cantikalami@email.com",
    phone: "0856-3344-2211",
    category: "Skincare",
    boothNumber: "TOD-B5",
    areaName: "TOD",
    status: "aktif" as const,
  },
  {
    businessName: "Toys Kingdom Mini",
    ownerName: "Faisal Ramdan",
    email: "toysmini@email.com",
    phone: "0819-6677-8899",
    category: "Mainan",
    boothNumber: "TOD-B6",
    areaName: "TOD",
    status: "aktif" as const,
  },
  // ── TOD Stand ─────────────────────────────────────────────
  {
    businessName: "Batagor Pak Haji",
    ownerName: "Haji Maman",
    email: "batagorpakhaji@email.com",
    phone: "0822-5544-3322",
    category: "Jajanan",
    boothNumber: "TOD-S1",
    areaName: "TOD",
    status: "aktif" as const,
  },
  {
    businessName: "Es Teh Manis",
    ownerName: "Tuti Handayani",
    email: "estehmanis@email.com",
    phone: "0833-1122-4455",
    category: "Minuman",
    boothNumber: "TOD-S2",
    areaName: "TOD",
    status: "aktif" as const,
  },
  {
    businessName: "Stand Kosong S3",
    ownerName: "-",
    email: null,
    phone: null,
    category: null,
    boothNumber: "TOD-S3",
    areaName: "TOD",
    status: "kosong" as const,
  },
  {
    businessName: "Harum Selalu",
    ownerName: "Lestari Wulandari",
    email: "harumselalu@email.com",
    phone: "0844-9900-1122",
    category: "Parfum",
    boothNumber: "TOD-S4",
    areaName: "TOD",
    status: "aktif" as const,
  },
  {
    businessName: "Stand Kosong S5",
    ownerName: "-",
    email: null,
    phone: null,
    category: null,
    boothNumber: "TOD-S5",
    areaName: "TOD",
    status: "kosong" as const,
  },
  {
    businessName: "Keripik Mak Encum",
    ownerName: "Encum Sukaesih",
    email: "keripikencum@email.com",
    phone: "0855-7788-9900",
    category: "Camilan",
    boothNumber: "TOD-S6",
    areaName: "TOD",
    status: "aktif" as const,
  },
];

type BookingInput = {
  tenantBusinessName: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";
  bookingStatus: "aktif" | "selesai" | "pending" | "batal";
  dueDate: string;
  periodLabel: string;
};

const BOOKINGS: BookingInput[] = [
  {
    tenantBusinessName: "Xtreme Gym",
    startDate: "2023-03-01",
    endDate: "2025-02-28",
    totalAmount: 8500000,
    paidAmount: 8500000,
    paymentStatus: "PAID",
    bookingStatus: "aktif",
    dueDate: "2026-06-15",
    periodLabel: "Juni 2026",
  },
  {
    tenantBusinessName: "Sport Station",
    startDate: "2022-11-01",
    endDate: "2024-10-31",
    totalAmount: 18000000,
    paidAmount: 0,
    paymentStatus: "OVERDUE",
    bookingStatus: "aktif",
    dueDate: "2026-04-15",
    periodLabel: "April–Juni 2026",
  },
  {
    tenantBusinessName: "Juice Bar Fresh",
    startDate: "2024-01-01",
    endDate: "2026-12-31",
    totalAmount: 4500000,
    paidAmount: 4500000,
    paymentStatus: "PAID",
    bookingStatus: "aktif",
    dueDate: "2026-06-15",
    periodLabel: "Juni 2026",
  },
  {
    tenantBusinessName: "Batik Nusantara",
    startDate: "2025-01-01",
    endDate: "2026-12-31",
    totalAmount: 2500000,
    paidAmount: 2500000,
    paymentStatus: "PAID",
    bookingStatus: "aktif",
    dueDate: "2026-06-15",
    periodLabel: "Juni 2026",
  },
  {
    tenantBusinessName: "Gelang & Cincin",
    startDate: "2024-06-01",
    endDate: "2026-05-31",
    totalAmount: 5000000,
    paidAmount: 0,
    paymentStatus: "OVERDUE",
    bookingStatus: "aktif",
    dueDate: "2026-05-15",
    periodLabel: "Mei–Juni 2026",
  },
  {
    tenantBusinessName: "Martabak 99",
    startDate: "2025-03-01",
    endDate: "2027-02-28",
    totalAmount: 2500000,
    paidAmount: 2500000,
    paymentStatus: "PAID",
    bookingStatus: "aktif",
    dueDate: "2026-06-15",
    periodLabel: "Juni 2026",
  },
  {
    tenantBusinessName: "Cantik Alami",
    startDate: "2025-07-01",
    endDate: "2027-06-30",
    totalAmount: 2500000,
    paidAmount: 2500000,
    paymentStatus: "PAID",
    bookingStatus: "aktif",
    dueDate: "2026-06-15",
    periodLabel: "Juni 2026",
  },
  {
    tenantBusinessName: "Toys Kingdom Mini",
    startDate: "2024-09-01",
    endDate: "2026-08-31",
    totalAmount: 2500000,
    paidAmount: 2500000,
    paymentStatus: "PAID",
    bookingStatus: "aktif",
    dueDate: "2026-06-15",
    periodLabel: "Juni 2026",
  },
  {
    tenantBusinessName: "Batagor Pak Haji",
    startDate: "2025-02-01",
    endDate: "2027-01-31",
    totalAmount: 1200000,
    paidAmount: 1200000,
    paymentStatus: "PAID",
    bookingStatus: "aktif",
    dueDate: "2026-06-15",
    periodLabel: "Juni 2026",
  },
  {
    tenantBusinessName: "Es Teh Manis",
    startDate: "2024-10-01",
    endDate: "2026-09-30",
    totalAmount: 1200000,
    paidAmount: 0,
    paymentStatus: "UNPAID",
    bookingStatus: "aktif",
    dueDate: "2026-06-10",
    periodLabel: "Juni 2026",
  },
  {
    tenantBusinessName: "Harum Selalu",
    startDate: "2025-05-01",
    endDate: "2027-04-30",
    totalAmount: 1200000,
    paidAmount: 1200000,
    paymentStatus: "PAID",
    bookingStatus: "aktif",
    dueDate: "2026-06-15",
    periodLabel: "Juni 2026",
  },
  {
    tenantBusinessName: "Keripik Mak Encum",
    startDate: "2025-04-01",
    endDate: "2027-03-31",
    totalAmount: 1200000,
    paidAmount: 1200000,
    paymentStatus: "PAID",
    bookingStatus: "aktif",
    dueDate: "2026-06-15",
    periodLabel: "Juni 2026",
  },
];

async function seed() {
  console.log("🌱 Mulai seeding data tenant POS...");

  await db.delete(tenantPaymentsTable);
  await db.delete(tenantBookingsTable);
  await db.delete(tenantsTable);
  console.log("  ✓ Data lama dihapus");

  const insertedTenants = await db.insert(tenantsTable).values(TENANTS).returning();
  console.log(`  ✓ ${insertedTenants.length} tenant diinsert`);

  const tenantMap = new Map(insertedTenants.map((t) => [t.businessName, t.id]));

  const bookingValues = BOOKINGS.map((b) => {
    const tenantId = tenantMap.get(b.tenantBusinessName);
    if (!tenantId) throw new Error(`Tenant tidak ditemukan: ${b.tenantBusinessName}`);
    return {
      tenantId,
      startDate: b.startDate,
      endDate: b.endDate,
      totalAmount: b.totalAmount,
      paidAmount: b.paidAmount,
      remainingAmount: b.totalAmount - b.paidAmount,
      paymentStatus: b.paymentStatus,
      bookingStatus: b.bookingStatus,
      dueDate: b.dueDate,
      periodLabel: b.periodLabel,
    };
  });

  const insertedBookings = await db.insert(tenantBookingsTable).values(bookingValues).returning();
  console.log(`  ✓ ${insertedBookings.length} booking diinsert`);

  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const paidBookings = insertedBookings.filter((b) => b.paymentStatus === "PAID");
  const paymentValues = paidBookings.map((b, i) => ({
    bookingId: b.id,
    tenantId: b.tenantId,
    amount: b.paidAmount,
    discountAmount: 0,
    penaltyAmount: 0,
    paymentMethod: "transfer" as const,
    paymentStatus: "PAID" as const,
    receiptNumber: `SEED-${datePart}-${String(i + 1).padStart(4, "0")}`,
    notes: "Pembayaran awal (seed)",
    paidAt: new Date(),
  }));

  if (paymentValues.length > 0) {
    const insertedPayments = await db.insert(tenantPaymentsTable).values(paymentValues).returning();
    console.log(`  ✓ ${insertedPayments.length} payment diinsert`);
  }

  console.log("✅ Seeding selesai!");
  await pool.end();
}

seed().catch((err) => {
  console.error("❌ Seeding gagal:", err);
  process.exit(1);
});
