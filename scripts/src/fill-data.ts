/**
 * fill-data.ts — Mengisi data demo untuk semua site
 * Menambahkan: mall units, tenant Sport Center, bookings, invoices, payments
 * Aman dijalankan berkali-kali (idempotent via onConflictDoNothing)
 */
import { db } from "@workspace/db";
import {
  mallSitesTable,
  mallUnitsTable,
  tenantsTable,
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
} from "@workspace/db/schema";

const today = new Date();
function addDays(d: Date, days: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r.toISOString().slice(0, 10);
}
function subDays(d: Date, days: number) {
  return addDays(d, -days);
}

async function main() {
  console.log("⏳ Mengambil data site...");

  const sites = await db.select().from(mallSitesTable);
  const todSite = sites.find((s) => s.code === "TOD_M1_BANDARA");
  const sportSite = sites.find((s) => s.code === "SPORT_CENTER_BANDARA");

  if (!todSite || !sportSite) {
    throw new Error("Site TOD_M1_BANDARA atau SPORT_CENTER_BANDARA tidak ditemukan. Jalankan seed awal dulu.");
  }

  console.log(`✅ Site ditemukan: TOD id=${todSite.id}, Sport Center id=${sportSite.id}`);

  // ── 1. MALL UNITS ── TOD ──────────────────────────────────────────────────
  console.log("\n🏢 Membuat unit mall untuk TOD...");
  const todUnits = await db
    .insert(mallUnitsTable)
    .values([
      { siteId: todSite.id, unitCode: "TOD-F1-A01", floor: "Lantai 1", zone: "Zona A", sizeM2: "24", status: "occupied",    positionX: 0, positionY: 0, width: 3, height: 2, notes: "Unit sudut dekat pintu masuk" },
      { siteId: todSite.id, unitCode: "TOD-F1-A02", floor: "Lantai 1", zone: "Zona A", sizeM2: "18", status: "occupied",    positionX: 3, positionY: 0, width: 2, height: 2, notes: "Unit standar zona A" },
      { siteId: todSite.id, unitCode: "TOD-F1-A03", floor: "Lantai 1", zone: "Zona A", sizeM2: "32", status: "occupied",    positionX: 5, positionY: 0, width: 3, height: 3, notes: "Unit besar dengan etalase" },
      { siteId: todSite.id, unitCode: "TOD-F1-A04", floor: "Lantai 1", zone: "Zona A", sizeM2: "20", status: "occupied",    positionX: 8, positionY: 0, width: 2, height: 2, notes: "Unit pojok" },
      { siteId: todSite.id, unitCode: "TOD-F1-A05", floor: "Lantai 1", zone: "Zona A", sizeM2: "22", status: "available",   positionX: 0, positionY: 3, width: 2, height: 2, notes: "Unit tersedia" },
      { siteId: todSite.id, unitCode: "TOD-F1-A06", floor: "Lantai 1", zone: "Zona A", sizeM2: "20", status: "available",   positionX: 2, positionY: 3, width: 2, height: 2, notes: "Unit tersedia" },
      { siteId: todSite.id, unitCode: "TOD-F1-A07", floor: "Lantai 1", zone: "Zona A", sizeM2: "16", status: "maintenance", positionX: 4, positionY: 3, width: 2, height: 2, notes: "Sedang renovasi" },
      { siteId: todSite.id, unitCode: "TOD-F2-B01", floor: "Lantai 2", zone: "Zona B", sizeM2: "30", status: "occupied",    positionX: 0, positionY: 0, width: 3, height: 2, notes: "Unit utama lantai 2" },
      { siteId: todSite.id, unitCode: "TOD-F2-B02", floor: "Lantai 2", zone: "Zona B", sizeM2: "22", status: "overdue",     positionX: 3, positionY: 0, width: 2, height: 2, notes: "Tunggakan pembayaran" },
      { siteId: todSite.id, unitCode: "TOD-F2-B03", floor: "Lantai 2", zone: "Zona B", sizeM2: "18", status: "available",   positionX: 5, positionY: 0, width: 2, height: 2, notes: "Unit tersedia lantai 2" },
      { siteId: todSite.id, unitCode: "TOD-F2-B04", floor: "Lantai 2", zone: "Zona B", sizeM2: "26", status: "expired",     positionX: 7, positionY: 0, width: 3, height: 2, notes: "Kontrak berakhir" },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`   ✓ ${todUnits.length} unit TOD dibuat`);

  // ── 2. MALL UNITS ── Sport Center ─────────────────────────────────────────
  console.log("🏋️  Membuat unit mall untuk Sport Center...");
  const sportUnits = await db
    .insert(mallUnitsTable)
    .values([
      { siteId: sportSite.id, unitCode: "SC-GF-01", floor: "Ground", zone: "Zona Olahraga", sizeM2: "120", status: "occupied",    positionX: 0, positionY: 0, width: 4, height: 3, notes: "Gym utama" },
      { siteId: sportSite.id, unitCode: "SC-GF-02", floor: "Ground", zone: "Zona Olahraga", sizeM2: "80",  status: "occupied",    positionX: 4, positionY: 0, width: 3, height: 3, notes: "Lapangan badminton" },
      { siteId: sportSite.id, unitCode: "SC-GF-03", floor: "Ground", zone: "Zona F&B",      sizeM2: "40",  status: "occupied",    positionX: 7, positionY: 0, width: 2, height: 2, notes: "Juice bar" },
      { siteId: sportSite.id, unitCode: "SC-GF-04", floor: "Ground", zone: "Zona F&B",      sizeM2: "35",  status: "available",   positionX: 9, positionY: 0, width: 2, height: 2, notes: "Unit tersedia" },
      { siteId: sportSite.id, unitCode: "SC-GF-05", floor: "Ground", zone: "Zona Retail",   sizeM2: "50",  status: "occupied",    positionX: 0, positionY: 4, width: 3, height: 2, notes: "Toko perlengkapan olahraga" },
      { siteId: sportSite.id, unitCode: "SC-GF-06", floor: "Ground", zone: "Zona Retail",   sizeM2: "45",  status: "occupied",    positionX: 3, positionY: 4, width: 3, height: 2, notes: "Toko sepatu dan baju" },
      { siteId: sportSite.id, unitCode: "SC-1F-01", floor: "Lantai 1", zone: "Zona Premium", sizeM2: "100", status: "available",   positionX: 0, positionY: 0, width: 4, height: 3, notes: "Studio yoga/pilates" },
      { siteId: sportSite.id, unitCode: "SC-1F-02", floor: "Lantai 1", zone: "Zona Premium", sizeM2: "60",  status: "occupied",    positionX: 4, positionY: 0, width: 3, height: 2, notes: "Kolam renang mini" },
      { siteId: sportSite.id, unitCode: "SC-1F-03", floor: "Lantai 1", zone: "Zona Premium", sizeM2: "30",  status: "maintenance", positionX: 7, positionY: 0, width: 2, height: 2, notes: "Ruang medis" },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`   ✓ ${sportUnits.length} unit Sport Center dibuat`);

  // ── 3. TENANTS ── Sport Center ────────────────────────────────────────────
  console.log("\n👥 Membuat tenant untuk Sport Center...");
  const sportTenants = await db
    .insert(tenantsTable)
    .values([
      { siteId: sportSite.id, businessName: "Xtreme Fitness Gym",   ownerName: "Budi Santoso",    phone: "0812-3456-7890", email: "xtremegym@email.com",    category: "Olahraga & Fitness", boothNumber: "SC-GF-01", areaName: "Ground - Zona Olahraga", status: "active", notes: "Gym 24 jam lengkap dengan instruktur bersertifikat." },
      { siteId: sportSite.id, businessName: "Sport Station Bandara", ownerName: "Hendra Wijaya",   phone: "0813-9988-1122", email: "sportstation@email.com",  category: "Perlengkapan Olahraga", boothNumber: "SC-GF-05", areaName: "Ground - Zona Retail", status: "active", notes: "Distributor resmi Nike dan Adidas." },
      { siteId: sportSite.id, businessName: "Juice Bar Fresh",       ownerName: "Sari Dewi Putri", phone: "0857-2211-3344", email: "juicefresh@email.com",    category: "F&B", boothNumber: "SC-GF-03", areaName: "Ground - Zona F&B", status: "active", notes: "Minuman sehat, protein shake, dan salad buah." },
      { siteId: sportSite.id, businessName: "Kolam Renang Aqua Pro", ownerName: "Kevin Surya",     phone: "0878-5566-7788", email: "aquapro@email.com",       category: "Olahraga Air", boothNumber: "SC-1F-02", areaName: "Lantai 1 - Zona Premium", status: "active", notes: "Kolam renang semi-olimpik dengan pelatih renang." },
      { siteId: sportSite.id, businessName: "Kicks & Threads",       ownerName: "Rina Marlina",    phone: "0877-1234-5678", email: "kicksthreads@email.com",  category: "Fashion Olahraga", boothNumber: "SC-GF-06", areaName: "Ground - Zona Retail", status: "active", notes: "Pakaian olahraga premium merek lokal dan impor." },
      { siteId: sportSite.id, businessName: "Badminton Pro Center",  ownerName: "Agus Prabowo",    phone: "0821-4455-6677", email: "badmintonpro@email.com",  category: "Olahraga", boothNumber: "SC-GF-02", areaName: "Ground - Zona Olahraga", status: "active", notes: "4 lapangan badminton standar nasional." },
      { siteId: sportSite.id, businessName: "Warung Sehat Protein",  ownerName: "Fitri Handayani", phone: "0856-3344-2211", email: "warungprotein@email.com", category: "F&B", boothNumber: "SC-GF-04", areaName: "Ground - Zona F&B", status: "inactive", notes: "Sedang proses renovasi menu." },
    ])
    .returning();
  console.log(`   ✓ ${sportTenants.length} tenant Sport Center dibuat`);

  const [sc1, sc2, sc3, sc4, sc5, sc6] = sportTenants; // skip sc7 (inactive)

  // ── 4. BOOKINGS ── Sport Center ───────────────────────────────────────────
  console.log("📋 Membuat kontrak sewa untuk Sport Center...");
  const sportBookings = await db
    .insert(tenantBookingsTable)
    .values([
      {
        siteId: sportSite.id, tenantId: sc1.id,
        contractNumber: "KTR/SC/2025/001", unitCode: "SC-GF-01", floor: "Ground",
        startDate: subDays(today, 300), endDate: addDays(today, 400),
        rentAmount: "12000000", depositAmount: "24000000",
        serviceChargeAmount: "1500000", electricityChargeAmount: "2000000", waterChargeAmount: "500000",
        totalAmount: "16000000", paidAmount: "16000000", remainingAmount: "0",
        contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly",
        orderNumber: "ORD/SC/2025/001", periodLabel: "Sep 2025 - Jul 2026",
        bookingType: "sewa", status: "aktif", bookingStatus: "aktif",
        price: "16000000", totalPrice: "16000000",
      },
      {
        siteId: sportSite.id, tenantId: sc2.id,
        contractNumber: "KTR/SC/2025/002", unitCode: "SC-GF-05", floor: "Ground",
        startDate: subDays(today, 200), endDate: addDays(today, 500),
        rentAmount: "7500000", depositAmount: "15000000",
        serviceChargeAmount: "900000", electricityChargeAmount: "800000", waterChargeAmount: "200000",
        totalAmount: "9400000", paidAmount: "9400000", remainingAmount: "0",
        contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly",
        orderNumber: "ORD/SC/2025/002", periodLabel: "Des 2025 - Agu 2026",
        bookingType: "sewa", status: "aktif", bookingStatus: "aktif",
        price: "9400000", totalPrice: "9400000",
      },
      {
        siteId: sportSite.id, tenantId: sc3.id,
        contractNumber: "KTR/SC/2025/003", unitCode: "SC-GF-03", floor: "Ground",
        startDate: subDays(today, 150), endDate: addDays(today, 550),
        rentAmount: "5500000", depositAmount: "11000000",
        serviceChargeAmount: "700000", electricityChargeAmount: "500000", waterChargeAmount: "150000",
        totalAmount: "6850000", paidAmount: "3425000", remainingAmount: "3425000",
        contractStatus: "active", paymentStatus: "partial", billingCycle: "monthly",
        orderNumber: "ORD/SC/2025/003", periodLabel: "Jan 2026 - Feb 2027",
        bookingType: "sewa", status: "aktif", bookingStatus: "aktif",
        price: "6850000", totalPrice: "6850000",
      },
      {
        siteId: sportSite.id, tenantId: sc4.id,
        contractNumber: "KTR/SC/2025/004", unitCode: "SC-1F-02", floor: "Lantai 1",
        startDate: subDays(today, 80), endDate: addDays(today, 640),
        rentAmount: "9000000", depositAmount: "18000000",
        serviceChargeAmount: "1200000", electricityChargeAmount: "1500000", waterChargeAmount: "800000",
        totalAmount: "12500000", paidAmount: "12500000", remainingAmount: "0",
        contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly",
        orderNumber: "ORD/SC/2025/004", periodLabel: "Mar 2026 - Jan 2028",
        bookingType: "sewa", status: "aktif", bookingStatus: "aktif",
        price: "12500000", totalPrice: "12500000",
      },
      {
        siteId: sportSite.id, tenantId: sc5.id,
        contractNumber: "KTR/SC/2025/005", unitCode: "SC-GF-06", floor: "Ground",
        startDate: subDays(today, 45), endDate: addDays(today, 680),
        rentAmount: "6000000", depositAmount: "12000000",
        serviceChargeAmount: "800000", electricityChargeAmount: "600000", waterChargeAmount: "150000",
        totalAmount: "7550000", paidAmount: "0", remainingAmount: "7550000",
        contractStatus: "active", paymentStatus: "unpaid", billingCycle: "monthly",
        orderNumber: "ORD/SC/2025/005", periodLabel: "Apr 2026 - Mar 2028",
        bookingType: "sewa", status: "aktif", bookingStatus: "aktif",
        price: "7550000", totalPrice: "7550000",
      },
      {
        siteId: sportSite.id, tenantId: sc6.id,
        contractNumber: "KTR/SC/2025/006", unitCode: "SC-GF-02", floor: "Ground",
        startDate: subDays(today, 120), endDate: addDays(today, 600),
        rentAmount: "8500000", depositAmount: "17000000",
        serviceChargeAmount: "1000000", electricityChargeAmount: "800000", waterChargeAmount: "200000",
        totalAmount: "10500000", paidAmount: "0", remainingAmount: "10500000",
        contractStatus: "active", paymentStatus: "overdue",
        dueDate: subDays(today, 20),
        billingCycle: "monthly",
        orderNumber: "ORD/SC/2025/006", periodLabel: "Feb 2026 - Jan 2028",
        bookingType: "sewa", status: "aktif", bookingStatus: "aktif",
        price: "10500000", totalPrice: "10500000",
      },
    ])
    .returning();
  console.log(`   ✓ ${sportBookings.length} kontrak Sport Center dibuat`);

  const [sb1, sb2, sb3, sb4, sb5, sb6] = sportBookings;

  // ── 5. INVOICES ── Sport Center ───────────────────────────────────────────
  console.log("🧾 Membuat invoice untuk Sport Center...");

  function inv(prefix: string, n: number) {
    return `INV-SC/${new Date().getFullYear()}/${String(n).padStart(4, "0")}`;
  }

  const sportInvoices = await db
    .insert(tenantInvoicesTable)
    .values([
      // sc1 - Xtreme Gym - paid
      {
        siteId: sportSite.id, tenantId: sc1.id, bookingId: sb1.id, unitCode: "SC-GF-01",
        invoiceNumber: inv("SC", 1),
        periodStart: subDays(today, 60), periodEnd: subDays(today, 31), dueDate: subDays(today, 25),
        rentAmount: "12000000", serviceChargeAmount: "1500000", electricityChargeAmount: "2000000", waterChargeAmount: "500000",
        otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
        subtotal: "16000000", taxAmount: "1760000", totalAmount: "17760000",
        paidAmount: "17760000", outstandingAmount: "0", status: "paid",
      },
      {
        siteId: sportSite.id, tenantId: sc1.id, bookingId: sb1.id, unitCode: "SC-GF-01",
        invoiceNumber: inv("SC", 2),
        periodStart: subDays(today, 30), periodEnd: today.toISOString().slice(0, 10), dueDate: addDays(today, 5),
        rentAmount: "12000000", serviceChargeAmount: "1500000", electricityChargeAmount: "2000000", waterChargeAmount: "500000",
        otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
        subtotal: "16000000", taxAmount: "1760000", totalAmount: "17760000",
        paidAmount: "17760000", outstandingAmount: "0", status: "paid",
      },
      // sc2 - Sport Station - paid
      {
        siteId: sportSite.id, tenantId: sc2.id, bookingId: sb2.id, unitCode: "SC-GF-05",
        invoiceNumber: inv("SC", 3),
        periodStart: subDays(today, 60), periodEnd: subDays(today, 31), dueDate: subDays(today, 25),
        rentAmount: "7500000", serviceChargeAmount: "900000", electricityChargeAmount: "800000", waterChargeAmount: "200000",
        otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
        subtotal: "9400000", taxAmount: "1034000", totalAmount: "10434000",
        paidAmount: "10434000", outstandingAmount: "0", status: "paid",
      },
      {
        siteId: sportSite.id, tenantId: sc2.id, bookingId: sb2.id, unitCode: "SC-GF-05",
        invoiceNumber: inv("SC", 4),
        periodStart: subDays(today, 30), periodEnd: today.toISOString().slice(0, 10), dueDate: addDays(today, 5),
        rentAmount: "7500000", serviceChargeAmount: "900000", electricityChargeAmount: "800000", waterChargeAmount: "200000",
        otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
        subtotal: "9400000", taxAmount: "1034000", totalAmount: "10434000",
        paidAmount: "10434000", outstandingAmount: "0", status: "paid",
      },
      // sc3 - Juice Bar - partial
      {
        siteId: sportSite.id, tenantId: sc3.id, bookingId: sb3.id, unitCode: "SC-GF-03",
        invoiceNumber: inv("SC", 5),
        periodStart: subDays(today, 30), periodEnd: today.toISOString().slice(0, 10), dueDate: subDays(today, 10),
        rentAmount: "5500000", serviceChargeAmount: "700000", electricityChargeAmount: "500000", waterChargeAmount: "150000",
        otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
        subtotal: "6850000", taxAmount: "753500", totalAmount: "7603500",
        paidAmount: "3801750", outstandingAmount: "3801750", status: "partial",
      },
      // sc4 - Aqua Pro - paid
      {
        siteId: sportSite.id, tenantId: sc4.id, bookingId: sb4.id, unitCode: "SC-1F-02",
        invoiceNumber: inv("SC", 6),
        periodStart: subDays(today, 30), periodEnd: today.toISOString().slice(0, 10), dueDate: addDays(today, 5),
        rentAmount: "9000000", serviceChargeAmount: "1200000", electricityChargeAmount: "1500000", waterChargeAmount: "800000",
        otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
        subtotal: "12500000", taxAmount: "1375000", totalAmount: "13875000",
        paidAmount: "13875000", outstandingAmount: "0", status: "paid",
      },
      // sc5 - Kicks & Threads - unpaid
      {
        siteId: sportSite.id, tenantId: sc5.id, bookingId: sb5.id, unitCode: "SC-GF-06",
        invoiceNumber: inv("SC", 7),
        periodStart: subDays(today, 30), periodEnd: today.toISOString().slice(0, 10), dueDate: addDays(today, 5),
        rentAmount: "6000000", serviceChargeAmount: "800000", electricityChargeAmount: "600000", waterChargeAmount: "150000",
        otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
        subtotal: "7550000", taxAmount: "830500", totalAmount: "8380500",
        paidAmount: "0", outstandingAmount: "8380500", status: "unpaid",
      },
      // sc6 - Badminton Pro - overdue
      {
        siteId: sportSite.id, tenantId: sc6.id, bookingId: sb6.id, unitCode: "SC-GF-02",
        invoiceNumber: inv("SC", 8),
        periodStart: subDays(today, 30), periodEnd: today.toISOString().slice(0, 10), dueDate: subDays(today, 20),
        rentAmount: "8500000", serviceChargeAmount: "1000000", electricityChargeAmount: "800000", waterChargeAmount: "200000",
        otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
        subtotal: "10500000", taxAmount: "1155000", totalAmount: "11655000",
        paidAmount: "0", outstandingAmount: "11655000", status: "overdue",
      },
    ])
    .returning();
  console.log(`   ✓ ${sportInvoices.length} invoice Sport Center dibuat`);

  const [si1, si2, si3, si4, si5, si6] = sportInvoices;

  // ── 6. INVOICES ── TOD (untuk existing tenants) ───────────────────────────
  console.log("🧾 Membuat invoice tambahan untuk TOD...");

  // Ambil tenant dan booking TOD yang sudah ada
  const allTenants = await db.select().from(tenantsTable);
  const allBookings = await db.select().from(tenantBookingsTable);
  const todTenants = allTenants.filter((t) => t.siteId === todSite.id);
  const todBookings = allBookings.filter((b) => b.siteId === todSite.id);

  console.log(`   Ada ${todTenants.length} tenant TOD, ${todBookings.length} booking TOD`);

  // Tambah invoice baru untuk bulan sebelumnya
  const todInvoiceExtra: typeof tenantInvoicesTable.$inferInsert[] = [];
  const t1 = todTenants.find((t) => t.businessName === "Warung Nasi Bu Sari");
  const t2 = todTenants.find((t) => t.businessName === "Toko Fashion Keren");
  const t3 = todTenants.find((t) => t.businessName === "Kafe Kopi Nusantara");
  const b1 = todBookings.find((b) => b.tenantId === t1?.id);
  const b2 = todBookings.find((b) => b.tenantId === t2?.id);
  const b3 = todBookings.find((b) => b.tenantId === t3?.id);

  if (t1 && b1) {
    todInvoiceExtra.push({
      siteId: todSite.id, tenantId: t1.id, bookingId: b1.id, unitCode: b1.unitCode ?? "TOD-F1-A01",
      invoiceNumber: `INV-TOD/${new Date().getFullYear()}/0010`,
      periodStart: subDays(today, 90), periodEnd: subDays(today, 61), dueDate: subDays(today, 55),
      rentAmount: "3500000", serviceChargeAmount: "450000", electricityChargeAmount: "350000", waterChargeAmount: "100000",
      otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
      subtotal: "4400000", taxAmount: "484000", totalAmount: "4884000",
      paidAmount: "4884000", outstandingAmount: "0", status: "paid",
    });
    todInvoiceExtra.push({
      siteId: todSite.id, tenantId: t1.id, bookingId: b1.id, unitCode: b1.unitCode ?? "TOD-F1-A01",
      invoiceNumber: `INV-TOD/${new Date().getFullYear()}/0011`,
      periodStart: subDays(today, 60), periodEnd: subDays(today, 31), dueDate: subDays(today, 25),
      rentAmount: "3500000", serviceChargeAmount: "450000", electricityChargeAmount: "350000", waterChargeAmount: "100000",
      otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
      subtotal: "4400000", taxAmount: "484000", totalAmount: "4884000",
      paidAmount: "4884000", outstandingAmount: "0", status: "paid",
    });
  }
  if (t2 && b2) {
    todInvoiceExtra.push({
      siteId: todSite.id, tenantId: t2.id, bookingId: b2.id, unitCode: b2.unitCode ?? "TOD-F1-A02",
      invoiceNumber: `INV-TOD/${new Date().getFullYear()}/0012`,
      periodStart: subDays(today, 90), periodEnd: subDays(today, 61), dueDate: subDays(today, 55),
      rentAmount: "5500000", serviceChargeAmount: "700000", electricityChargeAmount: "500000", waterChargeAmount: "150000",
      otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
      subtotal: "6850000", taxAmount: "753500", totalAmount: "7603500",
      paidAmount: "7603500", outstandingAmount: "0", status: "paid",
    });
  }
  if (t3 && b3) {
    todInvoiceExtra.push({
      siteId: todSite.id, tenantId: t3.id, bookingId: b3.id, unitCode: b3.unitCode ?? "TOD-F1-A03",
      invoiceNumber: `INV-TOD/${new Date().getFullYear()}/0013`,
      periodStart: subDays(today, 90), periodEnd: subDays(today, 61), dueDate: subDays(today, 55),
      rentAmount: "4500000", serviceChargeAmount: "600000", electricityChargeAmount: "400000", waterChargeAmount: "125000",
      otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
      subtotal: "5625000", taxAmount: "618750", totalAmount: "6243750",
      paidAmount: "0", outstandingAmount: "6243750", status: "unpaid",
    });
  }

  const todExtraInvoices = todInvoiceExtra.length > 0
    ? await db.insert(tenantInvoicesTable).values(todInvoiceExtra).onConflictDoNothing().returning()
    : [];
  console.log(`   ✓ ${todExtraInvoices.length} invoice tambahan TOD dibuat`);

  // ── 7. PAYMENTS ── semua ──────────────────────────────────────────────────
  console.log("\n💳 Membuat pembayaran...");

  // Ambil invoice TOD yang sudah ada
  const allInvoices = await db.select().from(tenantInvoicesTable);
  const todInvoices = allInvoices.filter((i) => i.siteId === todSite.id);

  const payVals: typeof tenantPaymentsTable.$inferInsert[] = [];

  function mkPay(
    n: number, prefix: string, siteId: number, tenantId: number, bookingId: number, invoiceId: number,
    amount: number, method: string, paidAt: string, notes?: string,
  ): typeof tenantPaymentsTable.$inferInsert {
    return {
      siteId,
      paymentNumber: `PAY-${prefix}/${new Date().getFullYear()}/${String(n).padStart(4, "0")}`,
      receiptNumber: `RCP-${prefix}/${new Date().getFullYear()}/${String(n).padStart(4, "0")}`,
      tenantId, bookingId, tenantBookingId: bookingId,
      invoiceId,
      amount: String(amount),
      discountAmount: "0", penaltyAmount: "0",
      method, paymentMethod: method,
      status: "PAID", paymentStatus: "PAID",
      paidAt: new Date(paidAt),
      isVoided: false,
      refundAmount: "0",
      notes: notes ?? null,
    };
  }

  // Payments untuk TOD existing invoices
  const existingTodPaidInvoices = todInvoices.filter((i) => i.status === "paid" && i.siteId === todSite.id);
  existingTodPaidInvoices.forEach((inv, idx) => {
    if (inv.tenantId && inv.bookingId) {
      const booking = todBookings.find((b) => b.id === inv.bookingId);
      if (booking) {
        const methods = ["transfer", "tunai", "qris", "transfer"];
        payVals.push(mkPay(
          idx + 1, "TOD", todSite.id, inv.tenantId, inv.bookingId, inv.id,
          Number(inv.paidAmount),
          methods[idx % methods.length],
          subDays(today, 70 - idx * 15),
          `Pembayaran invoice ${inv.invoiceNumber}`,
        ));
      }
    }
  });

  // Payments untuk Sport Center
  if (sc1 && sb1 && si1) {
    payVals.push(mkPay(101, "SC", sportSite.id, sc1.id, sb1.id, si1.id, 17760000, "transfer", subDays(today, 58), "Pembayaran Gym Apr"));
    payVals.push(mkPay(102, "SC", sportSite.id, sc1.id, sb1.id, si2.id, 17760000, "transfer", subDays(today, 28), "Pembayaran Gym Mei"));
  }
  if (sc2 && sb2 && si3) {
    payVals.push(mkPay(103, "SC", sportSite.id, sc2.id, sb2.id, si3.id, 10434000, "transfer", subDays(today, 55), "Pembayaran Sport Station Apr"));
    payVals.push(mkPay(104, "SC", sportSite.id, sc2.id, sb2.id, si4.id, 10434000, "qris",     subDays(today, 25), "Pembayaran Sport Station Mei"));
  }
  if (sc3 && sb3 && si5) {
    payVals.push(mkPay(105, "SC", sportSite.id, sc3.id, sb3.id, si5.id, 3801750, "tunai",    subDays(today, 15), "Cicilan pertama Juice Bar"));
  }
  if (sc4 && sb4 && si6) {
    payVals.push(mkPay(106, "SC", sportSite.id, sc4.id, sb4.id, si6.id, 13875000, "transfer", subDays(today, 20), "Pelunasan Aqua Pro Mei"));
  }

  // Extra historical payments for TOD (untuk grafik bulan sebelumnya)
  const t1p = todTenants.find((t) => t.businessName === "Warung Nasi Bu Sari");
  const t2p = todTenants.find((t) => t.businessName === "Toko Fashion Keren");
  const b1p = todBookings.find((b) => b.tenantId === t1p?.id);
  const b2p = todBookings.find((b) => b.tenantId === t2p?.id);
  const todExtra0 = todExtraInvoices.find((i) => i.invoiceNumber?.includes("0010"));
  const todExtra1 = todExtraInvoices.find((i) => i.invoiceNumber?.includes("0011"));
  const todExtra2 = todExtraInvoices.find((i) => i.invoiceNumber?.includes("0012"));

  if (t1p && b1p && todExtra0) {
    payVals.push(mkPay(201, "TOD", todSite.id, t1p.id, b1p.id, todExtra0.id, 4884000, "transfer", subDays(today, 88), "Pembayaran TOD Mar"));
    payVals.push(mkPay(202, "TOD", todSite.id, t1p.id, b1p.id, todExtra1?.id ?? todExtra0.id, 4884000, "transfer", subDays(today, 58), "Pembayaran TOD Apr"));
  }
  if (t2p && b2p && todExtra2) {
    payVals.push(mkPay(203, "TOD", todSite.id, t2p.id, b2p.id, todExtra2.id, 7603500, "qris", subDays(today, 55), "Pembayaran TOD Apr"));
  }

  if (payVals.length > 0) {
    const payments = await db.insert(tenantPaymentsTable).values(payVals).onConflictDoNothing().returning();
    console.log(`   ✓ ${payments.length} pembayaran dibuat`);
  } else {
    console.log("   ℹ️  Tidak ada pembayaran baru");
  }

  console.log("\n✅ Pengisian data selesai!");
  console.log(`   🏢 Mall Units: ${todUnits.length} TOD + ${sportUnits.length} Sport Center`);
  console.log(`   👥 Tenant baru: ${sportTenants.length} Sport Center`);
  console.log(`   📋 Kontrak baru: ${sportBookings.length} Sport Center`);
  console.log(`   🧾 Invoice baru: ${sportInvoices.length} Sport Center + ${todExtraInvoices.length} TOD tambahan`);
  console.log(`   💳 Pembayaran: ${payVals.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Gagal:", err);
  process.exit(1);
});
