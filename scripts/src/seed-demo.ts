import { db } from "@workspace/db";
import {
  tenantsTable,
  mallUnitsTable,
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  mallSitesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const today = new Date();
function addDays(d: Date, days: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r.toISOString().slice(0, 10);
}
function subDays(d: Date, days: number) { return addDays(d, -days); }

async function main() {
  console.log("⏳ Mengecek data yang sudah ada...");

  const existing = await db.select().from(tenantsTable);

  if (existing.length > 0) {
    const count = existing.length;
    console.log(`✅ Data sudah ada (${count} tenant). Seed dilewati untuk menghindari duplikasi.`);
    console.log("   Untuk reset: hapus data manual lalu jalankan seed ulang.");
    process.exit(0);
  }

  // Ambil site pertama (default)
  const [site] = await db.select().from(mallSitesTable).limit(1);
  if (!site) {
    console.error("❌ Tidak ada mall site di database. Jalankan migrasi terlebih dahulu.");
    process.exit(1);
  }
  const siteId = site.id;
  console.log(`🏬 Menggunakan site: ${site.name} (id=${siteId})\n`);

  console.log("🌱 Memulai seed data demo...\n");

  // ── 1. TENANTS ──────────────────────────────────────────────────────────────
  console.log("📦 Membuat 10 tenant...");
  const tenantRows = await db
    .insert(tenantsTable)
    .values([
      { siteId, businessName: "Warung Nasi Bu Sari", ownerName: "Sari Dewi Kusuma", phone: "081234567890", email: "sari.dewi@email.com", category: "Kuliner", boothNumber: "F1-A01", areaName: "Lantai 1 - Zona A", status: "active", notes: "Spesialis nasi padang dan lauk pauk khas Sumatra." },
      { siteId, businessName: "Kopi Kenangan Nusantara", ownerName: "Budi Santoso", phone: "082345678901", email: "budi.kopi@email.com", category: "F&B", boothNumber: "F1-A02", areaName: "Lantai 1 - Zona A", status: "active", notes: "Kedai kopi susu kekinian dengan menu pilihan." },
      { siteId, businessName: "Batik Nusantara Heritage", ownerName: "Ibu Rahayu Putri", phone: "083456789012", email: "rahayu.batik@email.com", category: "Fashion", boothNumber: "F1-A03", areaName: "Lantai 1 - Zona A", status: "active", notes: "Koleksi batik tulis dan cap dari berbagai daerah." },
      { siteId, businessName: "Gadget Corner Teknologi", ownerName: "Ahmad Fauzi", phone: "084567890123", email: "ahmad.gadget@email.com", category: "Elektronik", boothNumber: "F2-B01", areaName: "Lantai 2 - Zona B", status: "active", notes: "Penjualan dan servis gadget, aksesoris resmi." },
      { siteId, businessName: "Apotek Sehat Mandiri", ownerName: "dr. Fitri Handayani", phone: "085678901234", email: "apotek.sehat@email.com", category: "Kesehatan", boothNumber: "F2-B02", areaName: "Lantai 2 - Zona B", status: "active", notes: "Apotek dengan konsultasi apoteker gratis." },
      { siteId, businessName: "Salon Cantik Permata", ownerName: "Dewi Anggraini", phone: "086789012345", email: "dewi.salon@email.com", category: "Kecantikan", boothNumber: "F2-B03", areaName: "Lantai 2 - Zona B", status: "active", notes: "Perawatan rambut, kuku, dan wajah." },
      { siteId, businessName: "Sportivo Olahraga", ownerName: "Rizky Pratama", phone: "087890123456", email: "rizky.sport@email.com", category: "Olahraga", boothNumber: "F2-B04", areaName: "Lantai 2 - Zona B", status: "active", notes: "Perlengkapan olahraga dan outdoor." },
      { siteId, businessName: "Bimbel Pintar Indonesia", ownerName: "Prof. Hendra Wijaya", phone: "088901234567", email: "bimbel.pintar@email.com", category: "Pendidikan", boothNumber: "F1-A04", areaName: "Lantai 1 - Zona A", status: "active", notes: "Bimbingan belajar TK, SD, SMP, SMA." },
      { siteId, businessName: "Sushi Yamamoto Jakarta", ownerName: "Kenji Tanaka", phone: "089012345678", email: "sushi.yamamoto@email.com", category: "Kuliner", boothNumber: "F1-A05", areaName: "Lantai 1 - Zona A", status: "active", notes: "Restoran Jepang dengan chef berpengalaman." },
      { siteId, businessName: "Hijab Elegan Syar'i", ownerName: "Aisyah Ramadhani", phone: "081123456789", email: "hijab.elegan@email.com", category: "Fashion", boothNumber: "F1-A06", areaName: "Lantai 1 - Zona A", status: "inactive", notes: "Penjual hijab premium dan busana muslim. Saat ini non-aktif." },
    ])
    .returning();

  console.log(`   ✓ ${tenantRows.length} tenant dibuat.`);

  // ── 2. MALL UNITS ────────────────────────────────────────────────────────────
  console.log("🏢 Membuat 20 unit mall...");
  const mallUnits = await db
    .insert(mallUnitsTable)
    .values([
      { siteId, unitCode: "F1-A01", floor: "1", zone: "Zona A", sizeM2: "24", status: "occupied",    positionX: 0,  positionY: 0, width: 3, height: 2 },
      { siteId, unitCode: "F1-A02", floor: "1", zone: "Zona A", sizeM2: "18", status: "occupied",    positionX: 3,  positionY: 0, width: 2, height: 2 },
      { siteId, unitCode: "F1-A03", floor: "1", zone: "Zona A", sizeM2: "32", status: "occupied",    positionX: 5,  positionY: 0, width: 3, height: 3 },
      { siteId, unitCode: "F1-A04", floor: "1", zone: "Zona A", sizeM2: "20", status: "occupied",    positionX: 8,  positionY: 0, width: 2, height: 2 },
      { siteId, unitCode: "F1-A05", floor: "1", zone: "Zona A", sizeM2: "28", status: "occupied",    positionX: 10, positionY: 0, width: 3, height: 2 },
      { siteId, unitCode: "F1-A06", floor: "1", zone: "Zona A", sizeM2: "16", status: "expired",     positionX: 0,  positionY: 3, width: 2, height: 2 },
      { siteId, unitCode: "F1-A07", floor: "1", zone: "Zona A", sizeM2: "20", status: "available",   positionX: 2,  positionY: 3, width: 2, height: 2 },
      { siteId, unitCode: "F1-A08", floor: "1", zone: "Zona A", sizeM2: "22", status: "available",   positionX: 4,  positionY: 3, width: 2, height: 2 },
      { siteId, unitCode: "F1-A09", floor: "1", zone: "Zona A", sizeM2: "24", status: "overdue",     positionX: 6,  positionY: 3, width: 3, height: 2 },
      { siteId, unitCode: "F1-A10", floor: "1", zone: "Zona A", sizeM2: "18", status: "maintenance", positionX: 9,  positionY: 3, width: 2, height: 2 },
      { siteId, unitCode: "F2-B01", floor: "2", zone: "Zona B", sizeM2: "30", status: "occupied",    positionX: 0,  positionY: 0, width: 3, height: 2 },
      { siteId, unitCode: "F2-B02", floor: "2", zone: "Zona B", sizeM2: "22", status: "occupied",    positionX: 3,  positionY: 0, width: 2, height: 2 },
      { siteId, unitCode: "F2-B03", floor: "2", zone: "Zona B", sizeM2: "18", status: "occupied",    positionX: 5,  positionY: 0, width: 2, height: 2 },
      { siteId, unitCode: "F2-B04", floor: "2", zone: "Zona B", sizeM2: "26", status: "occupied",    positionX: 7,  positionY: 0, width: 3, height: 2 },
      { siteId, unitCode: "F2-B05", floor: "2", zone: "Zona B", sizeM2: "20", status: "overdue",     positionX: 0,  positionY: 3, width: 2, height: 2 },
      { siteId, unitCode: "F2-B06", floor: "2", zone: "Zona B", sizeM2: "28", status: "overdue",     positionX: 2,  positionY: 3, width: 3, height: 2 },
      { siteId, unitCode: "F2-B07", floor: "2", zone: "Zona B", sizeM2: "16", status: "expired",     positionX: 5,  positionY: 3, width: 2, height: 2 },
      { siteId, unitCode: "F2-B08", floor: "2", zone: "Zona B", sizeM2: "20", status: "expired",     positionX: 7,  positionY: 3, width: 2, height: 2 },
      { siteId, unitCode: "F2-B09", floor: "2", zone: "Zona B", sizeM2: "24", status: "available",   positionX: 9,  positionY: 3, width: 3, height: 2 },
      { siteId, unitCode: "F2-B10", floor: "2", zone: "Zona B", sizeM2: "18", status: "maintenance", positionX: 0,  positionY: 6, width: 2, height: 2 },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`   ✓ ${mallUnits.length} unit mall dibuat.`);

  // ── 3. BOOKINGS ──────────────────────────────────────────────────────────────
  console.log("📋 Membuat 16 kontrak sewa...");

  const [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10] = tenantRows;

  const bookingData = [
    // 10 aktif
    { siteId, tenantId: t1.id, contractNumber: "KTR/2025/001", unitCode: "F1-A01", floor: "1", startDate: subDays(today, 365), endDate: addDays(today, 365), rentAmount: "5500000", depositAmount: "11000000", serviceChargeAmount: "750000", electricityChargeAmount: "450000", waterChargeAmount: "150000", totalAmount: "6850000", paidAmount: "6850000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/001", periodLabel: "Jan 2025 - Des 2026" },
    { siteId, tenantId: t2.id, contractNumber: "KTR/2025/002", unitCode: "F1-A02", floor: "1", startDate: subDays(today, 300), endDate: addDays(today, 400), rentAmount: "4500000", depositAmount: "9000000", serviceChargeAmount: "600000", electricityChargeAmount: "350000", waterChargeAmount: "120000", totalAmount: "5570000", paidAmount: "5570000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/002", periodLabel: "Mar 2025 - Jul 2026" },
    { siteId, tenantId: t3.id, contractNumber: "KTR/2025/003", unitCode: "F1-A03", floor: "1", startDate: subDays(today, 180), endDate: addDays(today, 540), rentAmount: "7000000", depositAmount: "14000000", serviceChargeAmount: "900000", electricityChargeAmount: "500000", waterChargeAmount: "180000", totalAmount: "8580000", paidAmount: "8580000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/003", periodLabel: "Jan 2026 - Jun 2027" },
    { siteId, tenantId: t4.id, contractNumber: "KTR/2025/004", unitCode: "F2-B01", floor: "2", startDate: subDays(today, 240), endDate: addDays(today, 480), rentAmount: "6500000", depositAmount: "13000000", serviceChargeAmount: "850000", electricityChargeAmount: "550000", waterChargeAmount: "200000", totalAmount: "8100000", paidAmount: "4050000", remainingAmount: "4050000", contractStatus: "active", paymentStatus: "partial", billingCycle: "monthly", orderNumber: "ORD/2025/004", periodLabel: "Okt 2025 - Jan 2027" },
    { siteId, tenantId: t5.id, contractNumber: "KTR/2025/005", unitCode: "F2-B02", floor: "2", startDate: subDays(today, 120), endDate: addDays(today, 600), rentAmount: "5000000", depositAmount: "10000000", serviceChargeAmount: "650000", electricityChargeAmount: "400000", waterChargeAmount: "150000", totalAmount: "6200000", paidAmount: "6200000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/005", periodLabel: "Feb 2026 - Mar 2027" },
    { siteId, tenantId: t6.id, contractNumber: "KTR/2025/006", unitCode: "F2-B03", floor: "2", startDate: subDays(today, 90), endDate: addDays(today, 275), rentAmount: "4200000", depositAmount: "8400000", serviceChargeAmount: "550000", electricityChargeAmount: "300000", waterChargeAmount: "120000", totalAmount: "5170000", paidAmount: "0", remainingAmount: "5170000", contractStatus: "active", paymentStatus: "unpaid", billingCycle: "monthly", orderNumber: "ORD/2025/006", periodLabel: "Mar 2026 - Mar 2027" },
    { siteId, tenantId: t7.id, contractNumber: "KTR/2025/007", unitCode: "F2-B04", floor: "2", startDate: subDays(today, 60), endDate: addDays(today, 700), rentAmount: "5800000", depositAmount: "11600000", serviceChargeAmount: "750000", electricityChargeAmount: "420000", waterChargeAmount: "160000", totalAmount: "7130000", paidAmount: "7130000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/007", periodLabel: "Apr 2026 - Apr 2028" },
    { siteId, tenantId: t8.id, contractNumber: "KTR/2025/008", unitCode: "F1-A04", floor: "1", startDate: subDays(today, 200), endDate: addDays(today, 20), rentAmount: "3800000", depositAmount: "7600000", serviceChargeAmount: "500000", electricityChargeAmount: "280000", waterChargeAmount: "100000", totalAmount: "4680000", paidAmount: "4680000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/008", periodLabel: "Nov 2025 - Jun 2026" },
    { siteId, tenantId: t9.id, contractNumber: "KTR/2025/009", unitCode: "F1-A05", floor: "1", startDate: subDays(today, 150), endDate: addDays(today, 580), rentAmount: "8500000", depositAmount: "17000000", serviceChargeAmount: "1100000", electricityChargeAmount: "700000", waterChargeAmount: "250000", totalAmount: "10550000", paidAmount: "5275000", remainingAmount: "5275000", contractStatus: "active", paymentStatus: "partial", billingCycle: "monthly", orderNumber: "ORD/2025/009", periodLabel: "Jan 2026 - Jan 2028" },
    { siteId, tenantId: t1.id, contractNumber: "KTR/2024/010", unitCode: "F1-A09", floor: "1", startDate: subDays(today, 30), endDate: addDays(today, 330), rentAmount: "3500000", depositAmount: "7000000", serviceChargeAmount: "450000", electricityChargeAmount: "250000", waterChargeAmount: "90000", totalAmount: "4290000", paidAmount: "0", remainingAmount: "4290000", contractStatus: "active", paymentStatus: "overdue", billingCycle: "monthly", orderNumber: "ORD/2024/010", periodLabel: "Mei 2026 - Apr 2027" },
    // 3 expired
    { siteId, tenantId: t10.id, contractNumber: "KTR/2023/011", unitCode: "F1-A06", floor: "1", startDate: subDays(today, 730), endDate: subDays(today, 90), rentAmount: "3200000", depositAmount: "6400000", serviceChargeAmount: "420000", electricityChargeAmount: "220000", waterChargeAmount: "80000", totalAmount: "3920000", paidAmount: "3920000", remainingAmount: "0", contractStatus: "expired", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2023/011", periodLabel: "Jun 2024 - Mar 2026" },
    { siteId, tenantId: t4.id, contractNumber: "KTR/2023/012", unitCode: "F2-B07", floor: "2", startDate: subDays(today, 800), endDate: subDays(today, 200), rentAmount: "5000000", depositAmount: "10000000", serviceChargeAmount: "650000", electricityChargeAmount: "380000", waterChargeAmount: "140000", totalAmount: "6170000", paidAmount: "6170000", remainingAmount: "0", contractStatus: "expired", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2023/012", periodLabel: "Mar 2024 - Des 2025" },
    { siteId, tenantId: t6.id, contractNumber: "KTR/2023/013", unitCode: "F2-B08", floor: "2", startDate: subDays(today, 900), endDate: subDays(today, 180), rentAmount: "4200000", depositAmount: "8400000", serviceChargeAmount: "550000", electricityChargeAmount: "320000", waterChargeAmount: "110000", totalAmount: "5180000", paidAmount: "4662000", remainingAmount: "518000", contractStatus: "expired", paymentStatus: "partial", billingCycle: "monthly", orderNumber: "ORD/2023/013", periodLabel: "Jan 2024 - Des 2025" },
    // 3 overdue
    { siteId, tenantId: t2.id, contractNumber: "KTR/2025/014", unitCode: "F2-B05", floor: "2", startDate: subDays(today, 90), endDate: addDays(today, 270), rentAmount: "4800000", depositAmount: "9600000", serviceChargeAmount: "620000", electricityChargeAmount: "380000", waterChargeAmount: "130000", totalAmount: "5930000", paidAmount: "0", remainingAmount: "5930000", contractStatus: "active", paymentStatus: "overdue", billingCycle: "monthly", orderNumber: "ORD/2025/014", dueDate: subDays(today, 30), periodLabel: "Mar 2026 - Agu 2026" },
    { siteId, tenantId: t5.id, contractNumber: "KTR/2025/015", unitCode: "F2-B06", floor: "2", startDate: subDays(today, 60), endDate: addDays(today, 300), rentAmount: "5200000", depositAmount: "10400000", serviceChargeAmount: "680000", electricityChargeAmount: "420000", waterChargeAmount: "150000", totalAmount: "6450000", paidAmount: "3225000", remainingAmount: "3225000", contractStatus: "active", paymentStatus: "overdue", billingCycle: "monthly", orderNumber: "ORD/2025/015", dueDate: subDays(today, 15), periodLabel: "Apr 2026 - Mar 2027" },
    { siteId, tenantId: t8.id, contractNumber: "KTR/2025/016", unitCode: "F2-B05", floor: "2", startDate: subDays(today, 45), endDate: addDays(today, 320), rentAmount: "4000000", depositAmount: "8000000", serviceChargeAmount: "520000", electricityChargeAmount: "300000", waterChargeAmount: "110000", totalAmount: "4930000", paidAmount: "0", remainingAmount: "4930000", contractStatus: "active", paymentStatus: "overdue", billingCycle: "monthly", orderNumber: "ORD/2025/016", dueDate: subDays(today, 10), periodLabel: "Apr 2026 - Apr 2027" },
  ] as const;

  const bookings = await db
    .insert(tenantBookingsTable)
    .values(bookingData.map(b => ({
      ...b,
      bookingType: "sewa",
      status: "aktif",
      bookingStatus: "aktif",
      price: b.totalAmount,
      totalPrice: b.totalAmount,
    })))
    .returning();

  console.log(`   ✓ ${bookings.length} kontrak dibuat.`);

  // ── 4. INVOICES ──────────────────────────────────────────────────────────────
  console.log("🧾 Membuat 20 invoice...");

  function inv(n: number) { return `INV/2026/${String(n).padStart(4, "0")}`; }
  function makeInvoice(
    n: number, tenantId: number, bookingId: number, unitCode: string,
    periodStart: string, periodEnd: string, dueDate: string,
    rent: number, svc: number, elec: number, water: number,
    status: string, paid: number,
  ) {
    const subtotal = rent + svc + elec + water;
    const tax = Math.round(subtotal * 0.11);
    const total = subtotal + tax;
    const outstanding = total - paid;
    return {
      siteId,
      invoiceNumber: inv(n), tenantId, bookingId, unitCode,
      periodStart, periodEnd, dueDate,
      rentAmount: String(rent),
      serviceChargeAmount: String(svc),
      electricityChargeAmount: String(elec),
      waterChargeAmount: String(water),
      otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
      subtotal: String(subtotal), taxAmount: String(tax),
      totalAmount: String(total), paidAmount: String(paid),
      outstandingAmount: String(outstanding),
      status,
    };
  }

  const invoiceValues = [
    makeInvoice(1,  t1.id, bookings[0].id, "F1-A01", subDays(today, 60), subDays(today, 31), subDays(today, 25), 5500000, 750000, 450000, 150000, "paid",    7369500),
    makeInvoice(2,  t1.id, bookings[0].id, "F1-A01", subDays(today, 30), today.toISOString().slice(0,10), addDays(today, 5),  5500000, 750000, 450000, 150000, "unpaid",  0),
    makeInvoice(3,  t2.id, bookings[1].id, "F1-A02", subDays(today, 60), subDays(today, 31), subDays(today, 25), 4500000, 600000, 350000, 120000, "paid",    6104000),
    makeInvoice(4,  t2.id, bookings[1].id, "F1-A02", subDays(today, 30), today.toISOString().slice(0,10), addDays(today, 5),  4500000, 600000, 350000, 120000, "paid",    6104000),
    makeInvoice(5,  t3.id, bookings[2].id, "F1-A03", subDays(today, 90), subDays(today, 61), subDays(today, 55), 7000000, 900000, 500000, 180000, "paid",    9525800),
    makeInvoice(6,  t3.id, bookings[2].id, "F1-A03", subDays(today, 60), subDays(today, 31), subDays(today, 5),  7000000, 900000, 500000, 180000, "paid",    9525800),
    makeInvoice(7,  t4.id, bookings[3].id, "F2-B01", subDays(today, 60), subDays(today, 31), subDays(today, 25), 6500000, 850000, 550000, 200000, "partial", 4050000),
    makeInvoice(8,  t4.id, bookings[3].id, "F2-B01", subDays(today, 30), today.toISOString().slice(0,10), addDays(today, 5),  6500000, 850000, 550000, 200000, "unpaid",  0),
    makeInvoice(9,  t5.id, bookings[4].id, "F2-B02", subDays(today, 60), subDays(today, 31), subDays(today, 25), 5000000, 650000, 400000, 150000, "paid",    6868500),
    makeInvoice(10, t5.id, bookings[4].id, "F2-B02", subDays(today, 30), today.toISOString().slice(0,10), addDays(today, 5),  5000000, 650000, 400000, 150000, "paid",    6868500),
    makeInvoice(11, t6.id, bookings[5].id, "F2-B03", subDays(today, 30), today.toISOString().slice(0,10), subDays(today, 10), 4200000, 550000, 300000, 120000, "overdue", 0),
    makeInvoice(12, t7.id, bookings[6].id, "F2-B04", subDays(today, 30), today.toISOString().slice(0,10), addDays(today, 5),  5800000, 750000, 420000, 160000, "paid",    7918800),
    makeInvoice(13, t8.id, bookings[7].id, "F1-A04", subDays(today, 60), subDays(today, 31), subDays(today, 5),  3800000, 500000, 280000, 100000, "paid",    5191800),
    makeInvoice(14, t8.id, bookings[7].id, "F1-A04", subDays(today, 30), today.toISOString().slice(0,10), addDays(today, 5),  3800000, 500000, 280000, 100000, "paid",    5191800),
    makeInvoice(15, t9.id, bookings[8].id, "F1-A05", subDays(today, 60), subDays(today, 31), subDays(today, 25), 8500000, 1100000, 700000, 250000, "partial", 5275000),
    makeInvoice(16, t9.id, bookings[8].id, "F1-A05", subDays(today, 30), today.toISOString().slice(0,10), addDays(today, 5),  8500000, 1100000, 700000, 250000, "unpaid",  0),
    makeInvoice(17, t2.id, bookings[13].id,"F2-B05", subDays(today, 30), today.toISOString().slice(0,10), subDays(today, 30), 4800000, 620000, 380000, 130000, "overdue", 0),
    makeInvoice(18, t5.id, bookings[14].id,"F2-B06", subDays(today, 30), today.toISOString().slice(0,10), subDays(today, 15), 5200000, 680000, 420000, 150000, "overdue", 3225000),
    makeInvoice(19, t8.id, bookings[15].id,"F2-B05", subDays(today, 30), today.toISOString().slice(0,10), subDays(today, 10), 4000000, 520000, 300000, 110000, "overdue", 0),
    makeInvoice(20, t1.id, bookings[9].id, "F1-A09", subDays(today, 30), today.toISOString().slice(0,10), subDays(today, 5),  3500000, 450000, 250000, 90000,  "overdue", 0),
  ];

  const invoices = await db
    .insert(tenantInvoicesTable)
    .values(invoiceValues)
    .onConflictDoNothing()
    .returning();

  console.log(`   ✓ ${invoices.length} invoice dibuat.`);

  // ── 5. PAYMENTS ──────────────────────────────────────────────────────────────
  console.log("💳 Membuat 30 pembayaran...");

  function pay(
    n: number, tenantId: number, bookingId: number, invoiceId: number,
    amount: number, method: string, paidAt: string, notes?: string,
  ) {
    return {
      siteId,
      paymentNumber: `PAY/2026/${String(n).padStart(4, "0")}`,
      receiptNumber: `RCP/2026/${String(n).padStart(4, "0")}`,
      tenantId, bookingId, tenantBookingId: bookingId,
      invoiceId, amount: String(amount),
      discountAmount: "0", penaltyAmount: "0",
      method, paymentMethod: method,
      status: "PAID", paymentStatus: "PAID",
      paidAt: new Date(paidAt),
      isVoided: false,
      notes: notes ?? null,
    };
  }

  const invoiceIds = invoices.map(i => i.id);

  const paymentValues = [
    pay(1,  t1.id,  bookings[0].id,  invoiceIds[0],  7369500, "transfer", subDays(today, 58), "Pembayaran bulan Apr 2026"),
    pay(2,  t2.id,  bookings[1].id,  invoiceIds[2],  6104000, "transfer", subDays(today, 58), "Pembayaran bulan Apr 2026"),
    pay(3,  t2.id,  bookings[1].id,  invoiceIds[3],  6104000, "transfer", subDays(today, 28), "Pembayaran bulan Mei 2026"),
    pay(4,  t3.id,  bookings[2].id,  invoiceIds[4],  9525800, "tunai",    subDays(today, 88), "Cash pembayaran"),
    pay(5,  t3.id,  bookings[2].id,  invoiceIds[5],  9525800, "transfer", subDays(today, 58), "Pembayaran bulan Apr 2026"),
    pay(6,  t4.id,  bookings[3].id,  invoiceIds[6],  4050000, "transfer", subDays(today, 55), "Pembayaran sebagian Apr 2026"),
    pay(7,  t5.id,  bookings[4].id,  invoiceIds[8],  6868500, "transfer", subDays(today, 58), "Pembayaran bulan Apr 2026"),
    pay(8,  t5.id,  bookings[4].id,  invoiceIds[9],  6868500, "qris",     subDays(today, 28), "Pembayaran QRIS Mei 2026"),
    pay(9,  t7.id,  bookings[6].id,  invoiceIds[11], 7918800, "transfer", subDays(today, 28), "Pembayaran bulan Mei 2026"),
    pay(10, t8.id,  bookings[7].id,  invoiceIds[12], 5191800, "tunai",    subDays(today, 58), "Cash pembayaran Apr 2026"),
    pay(11, t8.id,  bookings[7].id,  invoiceIds[13], 5191800, "transfer", subDays(today, 28), "Pembayaran Mei 2026"),
    pay(12, t9.id,  bookings[8].id,  invoiceIds[14], 5275000, "transfer", subDays(today, 55), "Pembayaran sebagian"),
    pay(13, t1.id,  bookings[0].id,  invoiceIds[0],  500000,  "tunai",    subDays(today, 40), "Denda keterlambatan"),
    pay(14, t2.id,  bookings[1].id,  invoiceIds[2],  250000,  "qris",     subDays(today, 50), "Biaya tambahan listrik"),
    pay(15, t3.id,  bookings[2].id,  invoiceIds[4],  300000,  "transfer", subDays(today, 80), "Biaya parkir"),
    pay(16, t4.id,  bookings[3].id,  invoiceIds[6],  1000000, "transfer", subDays(today, 45), "Cicilan kedua"),
    pay(17, t5.id,  bookings[4].id,  invoiceIds[8],  500000,  "tunai",    subDays(today, 70), "Biaya admin"),
    pay(18, t7.id,  bookings[6].id,  invoiceIds[11], 200000,  "qris",     subDays(today, 20), "Biaya kebersihan"),
    pay(19, t9.id,  bookings[8].id,  invoiceIds[14], 2000000, "transfer", subDays(today, 30), "Angsuran kedua"),
    pay(20, t1.id,  bookings[0].id,  invoiceIds[0],  100000,  "tunai",    subDays(today, 20), "Biaya ATM"),
    pay(21, t2.id,  bookings[1].id,  invoiceIds[3],  150000,  "qris",     subDays(today, 10), "Kelebihan bayar"),
    pay(22, t3.id,  bookings[2].id,  invoiceIds[5],  400000,  "transfer", subDays(today, 15), "Biaya tambahan"),
    pay(23, t5.id,  bookings[4].id,  invoiceIds[9],  800000,  "tunai",    subDays(today, 5),  "Biaya tambahan AC"),
    pay(24, t7.id,  bookings[6].id,  invoiceIds[11], 350000,  "transfer", subDays(today, 8),  "Biaya tambahan"),
    pay(25, t8.id,  bookings[7].id,  invoiceIds[12], 100000,  "qris",     subDays(today, 55), "Tip kebersihan"),
    pay(26, t9.id,  bookings[8].id,  invoiceIds[14], 500000,  "tunai",    subDays(today, 25), "Angsuran ketiga"),
    pay(27, t10.id, bookings[10].id, invoiceIds[0],  3920000, "transfer", subDays(today, 100), "Pelunasan kontrak lama"),
    pay(28, t4.id,  bookings[11].id, invoiceIds[0],  6170000, "transfer", subDays(today, 210), "Pelunasan kontrak lantai 2"),
    pay(29, t6.id,  bookings[12].id, invoiceIds[0],  4662000, "transfer", subDays(today, 190), "Pembayaran sebagian kontrak lama"),
    pay(30, t5.id,  bookings[14].id, invoiceIds[17], 3225000, "transfer", subDays(today, 20), "Cicilan overdue"),
  ];

  const payments = await db
    .insert(tenantPaymentsTable)
    .values(paymentValues)
    .returning();

  console.log(`   ✓ ${payments.length} pembayaran dibuat.`);

  console.log("\n✅ Seed data demo selesai!");
  console.log(`   📦 ${tenantRows.length} tenant`);
  console.log(`   🏢 ${mallUnits.length} unit mall`);
  console.log(`   📋 ${bookings.length} kontrak (10 aktif, 3 expired, 3 overdue)`);
  console.log(`   🧾 ${invoices.length} invoice`);
  console.log(`   💳 ${payments.length} pembayaran`);
  console.log("\n   Buka Portal Admin untuk melihat data.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed gagal:", err);
  process.exit(1);
});
