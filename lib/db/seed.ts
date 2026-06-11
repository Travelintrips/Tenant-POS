import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { tenantsTable, tenantBookingsTable, tenantPaymentsTable } from "./src/schema/index.js";

const { Pool } = pg;

const url =
  process.env["SUPABASE_PG_URL"] ??
  process.env["SUPABASE_DATABASE_URL"] ??
  process.env["DATABASE_URL"];
if (!url) throw new Error("SUPABASE_DATABASE_URL atau DATABASE_URL harus diset");

const isSupabase = url.includes("supabase") || url.includes("pooler");
const pool = new Pool({
  connectionString: url,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
});
const db = drizzle(pool);

async function seed() {
  console.log("🌱 Memulai seed data...");

  // Hapus data lama
  await db.delete(tenantPaymentsTable);
  await db.delete(tenantBookingsTable);
  await db.delete(tenantsTable);

  // Insert tenants
  const tenants = await db.insert(tenantsTable).values([
    // Area A - Food & Beverage
    { businessName: "Warung Nasi Bu Sari", ownerName: "Sari Dewi", phone: "081234567801", category: "Kuliner", boothNumber: "A-01", areaName: "Area A", status: "aktif" },
    { businessName: "Bakso Pak Budi", ownerName: "Budi Santoso", phone: "081234567802", category: "Kuliner", boothNumber: "A-02", areaName: "Area A", status: "aktif" },
    { businessName: "Es Teh Manis Rina", ownerName: "Rina Lestari", phone: "081234567803", category: "Minuman", boothNumber: "A-03", areaName: "Area A", status: "aktif" },
    { businessName: "Martabak Mas Joko", ownerName: "Joko Widodo", phone: "081234567804", category: "Kuliner", boothNumber: "A-04", areaName: "Area A", status: "aktif" },
    { businessName: "Soto Ayam Mbak Yuni", ownerName: "Yuni Astuti", phone: "081234567805", category: "Kuliner", boothNumber: "A-05", areaName: "Area A", status: "aktif" },

    // Area B - Fashion
    { businessName: "Butik Zahra", ownerName: "Zahra Putri", phone: "081234567806", category: "Fashion", boothNumber: "B-01", areaName: "Area B", status: "aktif" },
    { businessName: "Toko Batik Nusantara", ownerName: "Hendra Kurnia", phone: "081234567807", category: "Fashion", boothNumber: "B-02", areaName: "Area B", status: "aktif" },
    { businessName: "Distro Keren", ownerName: "Agus Prasetyo", phone: "081234567808", category: "Fashion", boothNumber: "B-03", areaName: "Area B", status: "aktif" },
    { businessName: "Sepatu & Tas Bu Ani", ownerName: "Ani Rahayu", phone: "081234567809", category: "Aksesoris", boothNumber: "B-04", areaName: "Area B", status: "aktif" },
    { businessName: "Toko Celana Jeans", ownerName: "Dedi Permana", phone: "081234567810", category: "Fashion", boothNumber: "B-05", areaName: "Area B", status: "nonaktif" },

    // Area C - Electronics & Gadget
    { businessName: "Counter HP Pak Roni", ownerName: "Roni Saputra", phone: "081234567811", category: "Elektronik", boothNumber: "C-01", areaName: "Area C", status: "aktif" },
    { businessName: "Aksesoris Gadget Murah", ownerName: "Tono Wibowo", phone: "081234567812", category: "Elektronik", boothNumber: "C-02", areaName: "Area C", status: "aktif" },
    { businessName: "Service HP Pak Andi", ownerName: "Andi Firmansyah", phone: "081234567813", category: "Jasa", boothNumber: "C-03", areaName: "Area C", status: "aktif" },
    { businessName: "Toko Kamera Digital", ownerName: "Wahyu Nugroho", phone: "081234567814", category: "Elektronik", boothNumber: "C-04", areaName: "Area C", status: "aktif" },

    // Area D - Kosong / Available
    { businessName: "Kosong", ownerName: "-", phone: null, category: null, boothNumber: "D-01", areaName: "Area D", status: "kosong" },
    { businessName: "Toko Obat & Herbal", ownerName: "Lina Marlina", phone: "081234567816", category: "Kesehatan", boothNumber: "D-02", areaName: "Area D", status: "aktif" },
    { businessName: "Toko Mainan Anak", ownerName: "Susi Susanti", phone: "081234567817", category: "Mainan", boothNumber: "D-03", areaName: "Area D", status: "aktif" },
    { businessName: "Kosong", ownerName: "-", phone: null, category: null, boothNumber: "D-04", areaName: "Area D", status: "kosong" },
  ]).returning();

  console.log(`✅ ${tenants.length} tenant berhasil ditambahkan`);

  // Insert bookings untuk tenant aktif
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const endDate = new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString().slice(0, 10);
  const dueDate = new Date(today.getFullYear(), today.getMonth(), 10).toISOString().slice(0, 10);

  const activeTenants = tenants.filter(t => t.status === "aktif");

  const bookingData = activeTenants.map((tenant, i) => {
    const totalAmount = [1500000, 2000000, 1800000, 2500000, 1200000][i % 5];
    const statuses: Array<"PAID" | "PARTIAL" | "UNPAID" | "OVERDUE"> = ["PAID", "PARTIAL", "UNPAID", "OVERDUE", "PAID", "UNPAID", "PARTIAL", "PAID", "OVERDUE", "UNPAID", "PAID", "PARTIAL", "PAID", "UNPAID", "PARTIAL", "PAID"];
    const paymentStatus = statuses[i % statuses.length];
    const paidAmount = paymentStatus === "PAID" ? totalAmount
      : paymentStatus === "PARTIAL" ? Math.floor(totalAmount * 0.5)
      : 0;

    return {
      tenantId: tenant.id,
      startDate,
      endDate,
      totalAmount,
      paidAmount,
      paymentStatus,
      bookingStatus: "aktif" as const,
      dueDate,
      periodLabel: `${today.toLocaleString("id-ID", { month: "long" })} - ${new Date(today.getFullYear(), today.getMonth() + 2, 1).toLocaleString("id-ID", { month: "long" })} ${today.getFullYear()}`,
    };
  });

  const bookings = await db.insert(tenantBookingsTable).values(bookingData).returning();
  console.log(`✅ ${bookings.length} booking berhasil ditambahkan`);

  // Insert beberapa pembayaran untuk tenant PAID dan PARTIAL
  const paidBookings = bookings.filter(b => b.paymentStatus === "PAID" || b.paymentStatus === "PARTIAL");
  const paymentData = paidBookings.map(booking => ({
    bookingId: booking.id,
    amount: booking.paidAmount,
    paymentMethod: (["tunai", "transfer", "qris"] as const)[booking.id % 3],
    notes: "Pembayaran sewa booth",
    paidAt: new Date(),
  }));

  if (paymentData.length > 0) {
    const payments = await db.insert(tenantPaymentsTable).values(paymentData).returning();
    console.log(`✅ ${payments.length} pembayaran berhasil ditambahkan`);
  }

  console.log("🎉 Seed selesai!");
  await pool.end();
}

seed().catch(err => {
  console.error("❌ Seed gagal:", err);
  process.exit(1);
});
