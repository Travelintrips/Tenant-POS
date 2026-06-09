import { db } from "@workspace/db";
import {
  tenantsTable,
  mallUnitsTable,
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
function subDays(d: Date, days: number) { return addDays(d, -days); }

async function main() {
  console.log("🗑️  Menghapus data lama...");
  await db.delete(tenantPaymentsTable);
  await db.delete(tenantInvoicesTable);
  await db.delete(tenantBookingsTable);
  await db.delete(mallUnitsTable);
  await db.delete(tenantsTable);
  console.log("✅ Data lama berhasil dihapus.\n");

  console.log("🌱 Memulai seed data demo...\n");

  console.log("📦 Membuat 10 tenant...");
  const tenantRows = await db
    .insert(tenantsTable)
    .values([
      { businessName: "Warung Nasi Bu Sari", ownerName: "Sari Dewi Kusuma", phone: "081234567890", email: "sari.dewi@email.com", category: "Kuliner", boothNumber: "F1-A01", areaName: "Lantai 1 - Zona A", status: "active", notes: "Spesialis nasi padang dan lauk pauk khas Sumatra." },
      { businessName: "Kopi Kenangan Nusantara", ownerName: "Budi Santoso", phone: "082345678901", email: "budi.kopi@email.com", category: "F&B", boothNumber: "F1-A02", areaName: "Lantai 1 - Zona A", status: "active", notes: "Kedai kopi susu kekinian dengan menu pilihan." },
      { businessName: "Batik Nusantara Heritage", ownerName: "Ibu Rahayu Putri", phone: "083456789012", email: "rahayu.batik@email.com", category: "Fashion", boothNumber: "F1-A03", areaName: "Lantai 1 - Zona A", status: "active", notes: "Koleksi batik tulis dan cap dari berbagai daerah." },
      { businessName: "Gadget Corner Teknologi", ownerName: "Ahmad Fauzi", phone: "084567890123", email: "ahmad.gadget@email.com", category: "Elektronik", boothNumber: "F2-B01", areaName: "Lantai 2 - Zona B", status: "active", notes: "Penjualan dan servis gadget, aksesoris resmi." },
      { businessName: "Apotek Sehat Mandiri", ownerName: "dr. Fitri Handayani", phone: "085678901234", email: "apotek.sehat@email.com", category: "Kesehatan", boothNumber: "F2-B02", areaName: "Lantai 2 - Zona B", status: "active", notes: "Apotek dengan konsultasi apoteker gratis." },
      { businessName: "Salon Cantik Permata", ownerName: "Dewi Anggraini", phone: "086789012345", email: "dewi.salon@email.com", category: "Kecantikan", boothNumber: "F2-B03", areaName: "Lantai 2 - Zona B", status: "active", notes: "Perawatan rambut, kuku, dan wajah." },
      { businessName: "Sportivo Olahraga", ownerName: "Rizky Pratama", phone: "087890123456", email: "rizky.sport@email.com", category: "Olahraga", boothNumber: "F2-B04", areaName: "Lantai 2 - Zona B", status: "active", notes: "Perlengkapan olahraga dan outdoor." },
      { businessName: "Bimbel Pintar Indonesia", ownerName: "Prof. Hendra Wijaya", phone: "088901234567", email: "bimbel.pintar@email.com", category: "Pendidikan", boothNumber: "F1-A04", areaName: "Lantai 1 - Zona A", status: "active", notes: "Bimbingan belajar TK, SD, SMP, SMA." },
      { businessName: "Sushi Yamamoto Jakarta", ownerName: "Kenji Tanaka", phone: "089012345678", email: "sushi.yamamoto@email.com", category: "Kuliner", boothNumber: "F1-A05", areaName: "Lantai 1 - Zona A", status: "active", notes: "Restoran Jepang dengan chef berpengalaman." },
      { businessName: "Hijab Elegan Syar'i", ownerName: "Aisyah Ramadhani", phone: "081123456789", email: "hijab.elegan@email.com", category: "Fashion", boothNumber: "F1-A06", areaName: "Lantai 1 - Zona A", status: "inactive", notes: "Penjual hijab premium dan busana muslim. Saat ini non-aktif." },
    ])
    .returning();
  console.log(`   ✓ ${tenantRows.length} tenant dibuat.`);

  console.log("🏢 Membuat 20 unit mall...");
  const mallUnits = await db
    .insert(mallUnitsTable)
    .values([
      { unitCode: "F1-A01", floor: "1", zone: "Zona A", sizeM2: "24", status: "occupied",    positionX: 0,  positionY: 0, width: 3, height: 2 },
      { unitCode: "F1-A02", floor: "1", zone: "Zona A", sizeM2: "18", status: "occupied",    positionX: 3,  positionY: 0, width: 2, height: 2 },
      { unitCode: "F1-A03", floor: "1", zone: "Zona A", sizeM2: "32", status: "occupied",    positionX: 5,  positionY: 0, width: 3, height: 3 },
      { unitCode: "F1-A04", floor: "1", zone: "Zona A", sizeM2: "20", status: "occupied",    positionX: 8,  positionY: 0, width: 2, height: 2 },
      { unitCode: "F1-A05", floor: "1", zone: "Zona A", sizeM2: "28", status: "occupied",    positionX: 10, positionY: 0, width: 3, height: 2 },
      { unitCode: "F1-A06", floor: "1", zone: "Zona A", sizeM2: "16", status: "expired",     positionX: 0,  positionY: 3, width: 2, height: 2 },
      { unitCode: "F1-A07", floor: "1", zone: "Zona A", sizeM2: "20", status: "available",   positionX: 2,  positionY: 3, width: 2, height: 2 },
      { unitCode: "F1-A08", floor: "1", zone: "Zona A", sizeM2: "22", status: "available",   positionX: 4,  positionY: 3, width: 2, height: 2 },
      { unitCode: "F1-A09", floor: "1", zone: "Zona A", sizeM2: "24", status: "overdue",     positionX: 6,  positionY: 3, width: 3, height: 2 },
      { unitCode: "F1-A10", floor: "1", zone: "Zona A", sizeM2: "18", status: "maintenance", positionX: 9,  positionY: 3, width: 2, height: 2 },
      { unitCode: "F2-B01", floor: "2", zone: "Zona B", sizeM2: "30", status: "occupied",    positionX: 0,  positionY: 0, width: 3, height: 2 },
      { unitCode: "F2-B02", floor: "2", zone: "Zona B", sizeM2: "22", status: "occupied",    positionX: 3,  positionY: 0, width: 2, height: 2 },
      { unitCode: "F2-B03", floor: "2", zone: "Zona B", sizeM2: "18", status: "occupied",    positionX: 5,  positionY: 0, width: 2, height: 2 },
      { unitCode: "F2-B04", floor: "2", zone: "Zona B", sizeM2: "26", status: "occupied",    positionX: 7,  positionY: 0, width: 3, height: 2 },
      { unitCode: "F2-B05", floor: "2", zone: "Zona B", sizeM2: "20", status: "overdue",     positionX: 0,  positionY: 3, width: 2, height: 2 },
      { unitCode: "F2-B06", floor: "2", zone: "Zona B", sizeM2: "28", status: "overdue",     positionX: 2,  positionY: 3, width: 3, height: 2 },
      { unitCode: "F2-B07", floor: "2", zone: "Zona B", sizeM2: "16", status: "expired",     positionX: 5,  positionY: 3, width: 2, height: 2 },
      { unitCode: "F2-B08", floor: "2", zone: "Zona B", sizeM2: "20", status: "expired",     positionX: 7,  positionY: 3, width: 2, height: 2 },
      { unitCode: "F2-B09", floor: "2", zone: "Zona B", sizeM2: "24", status: "available",   positionX: 9,  positionY: 3, width: 3, height: 2 },
      { unitCode: "F2-B10", floor: "2", zone: "Zona B", sizeM2: "18", status: "maintenance", positionX: 0,  positionY: 6, width: 2, height: 2 },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`   ✓ ${mallUnits.length} unit mall dibuat.`);

  console.log("📋 Membuat 16 kontrak sewa...");
  const [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10] = tenantRows;

  const bookings = await db
    .insert(tenantBookingsTable)
    .values([
      { tenantId: t1.id, contractNumber: "KTR/2025/001", unitCode: "F1-A01", floor: "1", startDate: subDays(today, 365), endDate: addDays(today, 365), rentAmount: "5500000", depositAmount: "11000000", serviceChargeAmount: "750000", electricityChargeAmount: "450000", waterChargeAmount: "150000", totalAmount: "6850000", paidAmount: "6850000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/001", bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "6850000", totalPrice: "6850000" },
      { tenantId: t2.id, contractNumber: "KTR/2025/002", unitCode: "F1-A02", floor: "1", startDate: subDays(today, 300), endDate: addDays(today, 400), rentAmount: "4500000", depositAmount: "9000000", serviceChargeAmount: "600000", electricityChargeAmount: "350000", waterChargeAmount: "120000", totalAmount: "5570000", paidAmount: "5570000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/002", bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "5570000", totalPrice: "5570000" },
      { tenantId: t3.id, contractNumber: "KTR/2025/003", unitCode: "F1-A03", floor: "1", startDate: subDays(today, 180), endDate: addDays(today, 540), rentAmount: "7000000", depositAmount: "14000000", serviceChargeAmount: "900000", electricityChargeAmount: "500000", waterChargeAmount: "180000", totalAmount: "8580000", paidAmount: "8580000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/003", bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "8580000", totalPrice: "8580000" },
      { tenantId: t4.id, contractNumber: "KTR/2025/004", unitCode: "F2-B01", floor: "2", startDate: subDays(today, 240), endDate: addDays(today, 480), rentAmount: "6500000", depositAmount: "13000000", serviceChargeAmount: "850000", electricityChargeAmount: "550000", waterChargeAmount: "200000", totalAmount: "8100000", paidAmount: "4050000", remainingAmount: "4050000", contractStatus: "active", paymentStatus: "partial", billingCycle: "monthly", orderNumber: "ORD/2025/004", bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "8100000", totalPrice: "8100000" },
      { tenantId: t5.id, contractNumber: "KTR/2025/005", unitCode: "F2-B02", floor: "2", startDate: subDays(today, 120), endDate: addDays(today, 600), rentAmount: "5000000", depositAmount: "10000000", serviceChargeAmount: "650000", electricityChargeAmount: "400000", waterChargeAmount: "150000", totalAmount: "6200000", paidAmount: "6200000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/005", bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "6200000", totalPrice: "6200000" },
      { tenantId: t6.id, contractNumber: "KTR/2025/006", unitCode: "F2-B03", floor: "2", startDate: subDays(today, 90), endDate: addDays(today, 275), rentAmount: "4200000", depositAmount: "8400000", serviceChargeAmount: "550000", electricityChargeAmount: "300000", waterChargeAmount: "120000", totalAmount: "5170000", paidAmount: "0", remainingAmount: "5170000", contractStatus: "active", paymentStatus: "unpaid", billingCycle: "monthly", orderNumber: "ORD/2025/006", bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "5170000", totalPrice: "5170000" },
      { tenantId: t7.id, contractNumber: "KTR/2025/007", unitCode: "F2-B04", floor: "2", startDate: subDays(today, 60), endDate: addDays(today, 700), rentAmount: "5800000", depositAmount: "11600000", serviceChargeAmount: "750000", electricityChargeAmount: "420000", waterChargeAmount: "160000", totalAmount: "7130000", paidAmount: "7130000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/007", bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "7130000", totalPrice: "7130000" },
      { tenantId: t8.id, contractNumber: "KTR/2025/008", unitCode: "F1-A04", floor: "1", startDate: subDays(today, 200), endDate: addDays(today, 20), rentAmount: "3800000", depositAmount: "7600000", serviceChargeAmount: "500000", electricityChargeAmount: "280000", waterChargeAmount: "100000", totalAmount: "4680000", paidAmount: "4680000", remainingAmount: "0", contractStatus: "active", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2025/008", bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "4680000", totalPrice: "4680000" },
      { tenantId: t9.id, contractNumber: "KTR/2025/009", unitCode: "F1-A05", floor: "1", startDate: subDays(today, 150), endDate: addDays(today, 580), rentAmount: "8500000", depositAmount: "17000000", serviceChargeAmount: "1100000", electricityChargeAmount: "700000", waterChargeAmount: "250000", totalAmount: "10550000", paidAmount: "5275000", remainingAmount: "5275000", contractStatus: "active", paymentStatus: "partial", billingCycle: "monthly", orderNumber: "ORD/2025/009", bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "10550000", totalPrice: "10550000" },
      { tenantId: t1.id, contractNumber: "KTR/2024/010", unitCode: "F1-A09", floor: "1", startDate: subDays(today, 30), endDate: addDays(today, 330), rentAmount: "3500000", depositAmount: "7000000", serviceChargeAmount: "450000", electricityChargeAmount: "250000", waterChargeAmount: "90000", totalAmount: "4290000", paidAmount: "0", remainingAmount: "4290000", contractStatus: "active", paymentStatus: "overdue", billingCycle: "monthly", orderNumber: "ORD/2024/010", bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "4290000", totalPrice: "4290000" },
      { tenantId: t10.id, contractNumber: "KTR/2023/011", unitCode: "F1-A06", floor: "1", startDate: subDays(today, 730), endDate: subDays(today, 90), rentAmount: "3200000", depositAmount: "6400000", serviceChargeAmount: "420000", electricityChargeAmount: "220000", waterChargeAmount: "80000", totalAmount: "3920000", paidAmount: "3920000", remainingAmount: "0", contractStatus: "expired", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2023/011", bookingType: "sewa", status: "selesai", bookingStatus: "selesai", price: "3920000", totalPrice: "3920000" },
      { tenantId: t4.id, contractNumber: "KTR/2023/012", unitCode: "F2-B07", floor: "2", startDate: subDays(today, 800), endDate: subDays(today, 200), rentAmount: "5000000", depositAmount: "10000000", serviceChargeAmount: "650000", electricityChargeAmount: "380000", waterChargeAmount: "140000", totalAmount: "6170000", paidAmount: "6170000", remainingAmount: "0", contractStatus: "expired", paymentStatus: "paid", billingCycle: "monthly", orderNumber: "ORD/2023/012", bookingType: "sewa", status: "selesai", bookingStatus: "selesai", price: "6170000", totalPrice: "6170000" },
      { tenantId: t6.id, contractNumber: "KTR/2023/013", unitCode: "F2-B08", floor: "2", startDate: subDays(today, 900), endDate: subDays(today, 180), rentAmount: "4200000", depositAmount: "8400000", serviceChargeAmount: "550000", electricityChargeAmount: "320000", waterChargeAmount: "110000", totalAmount: "5180000", paidAmount: "4662000", remainingAmount: "518000", contractStatus: "expired", paymentStatus: "partial", billingCycle: "monthly", orderNumber: "ORD/2023/013", bookingType: "sewa", status: "selesai", bookingStatus: "selesai", price: "5180000", totalPrice: "5180000" },
      { tenantId: t2.id, contractNumber: "KTR/2025/014", unitCode: "F2-B05", floor: "2", startDate: subDays(today, 90), endDate: addDays(today, 270), rentAmount: "4800000", depositAmount: "9600000", serviceChargeAmount: "620000", electricityChargeAmount: "380000", waterChargeAmount: "130000", totalAmount: "5930000", paidAmount: "0", remainingAmount: "5930000", contractStatus: "active", paymentStatus: "overdue", billingCycle: "monthly", orderNumber: "ORD/2025/014", dueDate: subDays(today, 30), bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "5930000", totalPrice: "5930000" },
      { tenantId: t5.id, contractNumber: "KTR/2025/015", unitCode: "F2-B06", floor: "2", startDate: subDays(today, 60), endDate: addDays(today, 300), rentAmount: "5200000", depositAmount: "10400000", serviceChargeAmount: "680000", electricityChargeAmount: "420000", waterChargeAmount: "150000", totalAmount: "6450000", paidAmount: "3225000", remainingAmount: "3225000", contractStatus: "active", paymentStatus: "overdue", billingCycle: "monthly", orderNumber: "ORD/2025/015", dueDate: subDays(today, 15), bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "6450000", totalPrice: "6450000" },
      { tenantId: t8.id, contractNumber: "KTR/2025/016", unitCode: "F2-B05", floor: "2", startDate: subDays(today, 45), endDate: addDays(today, 320), rentAmount: "4000000", depositAmount: "8000000", serviceChargeAmount: "520000", electricityChargeAmount: "300000", waterChargeAmount: "110000", totalAmount: "4930000", paidAmount: "0", remainingAmount: "4930000", contractStatus: "active", paymentStatus: "overdue", billingCycle: "monthly", orderNumber: "ORD/2025/016", dueDate: subDays(today, 10), bookingType: "sewa", status: "aktif", bookingStatus: "aktif", price: "4930000", totalPrice: "4930000" },
    ])
    .returning();
  console.log(`   ✓ ${bookings.length} kontrak dibuat.`);

  console.log("🧾 Membuat 20 invoice...");
  function inv(n: number) { return `INV/2026/${String(n).padStart(4, "0")}`; }
  function makeInv(
    n: number, tenantId: number, bookingId: number, unitCode: string,
    periodStart: string, periodEnd: string, dueDate: string,
    rent: number, svc: number, elec: number, water: number,
    status: string, paid: number,
  ) {
    const subtotal = rent + svc + elec + water;
    const tax = Math.round(subtotal * 0.11);
    const total = subtotal + tax;
    return {
      invoiceNumber: inv(n), tenantId, bookingId, unitCode,
      periodStart, periodEnd, dueDate,
      rentAmount: String(rent), serviceChargeAmount: String(svc),
      electricityChargeAmount: String(elec), waterChargeAmount: String(water),
      otherChargeAmount: "0", discountAmount: "0", penaltyAmount: "0",
      subtotal: String(subtotal), taxAmount: String(tax),
      totalAmount: String(total), paidAmount: String(paid),
      outstandingAmount: String(total - paid),
      status,
    };
  }

  const invoices = await db
    .insert(tenantInvoicesTable)
    .values([
      makeInv(1,  t1.id, bookings[0].id, "F1-A01", subDays(today,60), subDays(today,31), subDays(today,25), 5500000,750000,450000,150000, "paid",    7369500),
      makeInv(2,  t1.id, bookings[0].id, "F1-A01", subDays(today,30), today.toISOString().slice(0,10), addDays(today,5), 5500000,750000,450000,150000, "unpaid",  0),
      makeInv(3,  t2.id, bookings[1].id, "F1-A02", subDays(today,60), subDays(today,31), subDays(today,25), 4500000,600000,350000,120000, "paid",    6104000),
      makeInv(4,  t2.id, bookings[1].id, "F1-A02", subDays(today,30), today.toISOString().slice(0,10), addDays(today,5), 4500000,600000,350000,120000, "paid",    6104000),
      makeInv(5,  t3.id, bookings[2].id, "F1-A03", subDays(today,90), subDays(today,61), subDays(today,55), 7000000,900000,500000,180000, "paid",    9525800),
      makeInv(6,  t3.id, bookings[2].id, "F1-A03", subDays(today,60), subDays(today,31), subDays(today,5),  7000000,900000,500000,180000, "paid",    9525800),
      makeInv(7,  t4.id, bookings[3].id, "F2-B01", subDays(today,60), subDays(today,31), subDays(today,25), 6500000,850000,550000,200000, "partial", 4050000),
      makeInv(8,  t4.id, bookings[3].id, "F2-B01", subDays(today,30), today.toISOString().slice(0,10), addDays(today,5), 6500000,850000,550000,200000, "unpaid",  0),
      makeInv(9,  t5.id, bookings[4].id, "F2-B02", subDays(today,60), subDays(today,31), subDays(today,25), 5000000,650000,400000,150000, "paid",    6868500),
      makeInv(10, t5.id, bookings[4].id, "F2-B02", subDays(today,30), today.toISOString().slice(0,10), addDays(today,5), 5000000,650000,400000,150000, "paid",    6868500),
      makeInv(11, t6.id, bookings[5].id, "F2-B03", subDays(today,30), today.toISOString().slice(0,10), subDays(today,10), 4200000,550000,300000,120000, "overdue", 0),
      makeInv(12, t7.id, bookings[6].id, "F2-B04", subDays(today,30), today.toISOString().slice(0,10), addDays(today,5), 5800000,750000,420000,160000, "paid",    7918800),
      makeInv(13, t8.id, bookings[7].id, "F1-A04", subDays(today,60), subDays(today,31), subDays(today,5),  3800000,500000,280000,100000, "paid",    5191800),
      makeInv(14, t8.id, bookings[7].id, "F1-A04", subDays(today,30), today.toISOString().slice(0,10), addDays(today,5), 3800000,500000,280000,100000, "paid",    5191800),
      makeInv(15, t9.id, bookings[8].id, "F1-A05", subDays(today,60), subDays(today,31), subDays(today,25), 8500000,1100000,700000,250000, "partial", 5275000),
      makeInv(16, t9.id, bookings[8].id, "F1-A05", subDays(today,30), today.toISOString().slice(0,10), addDays(today,5), 8500000,1100000,700000,250000, "unpaid",  0),
      makeInv(17, t2.id, bookings[13].id, "F2-B05", subDays(today,30), today.toISOString().slice(0,10), subDays(today,30), 4800000,620000,380000,130000, "overdue", 0),
      makeInv(18, t5.id, bookings[14].id, "F2-B06", subDays(today,30), today.toISOString().slice(0,10), subDays(today,15), 5200000,680000,420000,150000, "overdue", 3225000),
      makeInv(19, t8.id, bookings[15].id, "F2-B05", subDays(today,30), today.toISOString().slice(0,10), subDays(today,10), 4000000,520000,300000,110000, "overdue", 0),
      makeInv(20, t1.id, bookings[9].id,  "F1-A09", subDays(today,30), today.toISOString().slice(0,10), subDays(today,5),  3500000,450000,250000,90000,  "overdue", 0),
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`   ✓ ${invoices.length} invoice dibuat.`);

  console.log("💳 Membuat pembayaran...");
  function pay(n: number, tenantId: number, bookingId: number, invoiceId: number, amount: number, method: string, paidAt: string, notes?: string) {
    return {
      paymentNumber: `PAY/2026/${String(n).padStart(4,"0")}`,
      receiptNumber: `RCP/2026/${String(n).padStart(4,"0")}`,
      tenantId, bookingId, tenantBookingId: bookingId, invoiceId,
      amount: String(amount), discountAmount: "0", penaltyAmount: "0",
      method, paymentMethod: method, status: "PAID", paymentStatus: "PAID",
      paidAt: new Date(paidAt), isVoided: false, notes: notes ?? null,
    };
  }
  const iid = invoices.map(i => i.id);
  const payments = await db
    .insert(tenantPaymentsTable)
    .values([
      pay(1,  t1.id, bookings[0].id,  iid[0],  7369500, "transfer", subDays(today,58), "Pembayaran Apr 2026"),
      pay(2,  t2.id, bookings[1].id,  iid[2],  6104000, "transfer", subDays(today,58), "Pembayaran Apr 2026"),
      pay(3,  t2.id, bookings[1].id,  iid[3],  6104000, "transfer", subDays(today,28), "Pembayaran Mei 2026"),
      pay(4,  t3.id, bookings[2].id,  iid[4],  9525800, "tunai",    subDays(today,88), "Cash pembayaran"),
      pay(5,  t3.id, bookings[2].id,  iid[5],  9525800, "transfer", subDays(today,58), "Pembayaran Apr 2026"),
      pay(6,  t4.id, bookings[3].id,  iid[6],  4050000, "transfer", subDays(today,55), "Sebagian Apr 2026"),
      pay(7,  t5.id, bookings[4].id,  iid[8],  6868500, "transfer", subDays(today,58), "Pembayaran Apr 2026"),
      pay(8,  t5.id, bookings[4].id,  iid[9],  6868500, "qris",     subDays(today,28), "QRIS Mei 2026"),
      pay(9,  t7.id, bookings[6].id,  iid[11], 7918800, "transfer", subDays(today,28), "Pembayaran Mei 2026"),
      pay(10, t8.id, bookings[7].id,  iid[12], 5191800, "tunai",    subDays(today,58), "Cash Apr 2026"),
      pay(11, t8.id, bookings[7].id,  iid[13], 5191800, "transfer", subDays(today,28), "Pembayaran Mei 2026"),
      pay(12, t9.id, bookings[8].id,  iid[14], 5275000, "transfer", subDays(today,55), "Pembayaran sebagian"),
      pay(13, t5.id, bookings[14].id, iid[17], 3225000, "transfer", subDays(today,20), "Cicilan overdue"),
    ])
    .returning();
  console.log(`   ✓ ${payments.length} pembayaran dibuat.`);

  console.log("\n✅ Seed data demo selesai!");
  console.log(`   📦 ${tenantRows.length} tenant`);
  console.log(`   🏢 ${mallUnits.length} unit mall`);
  console.log(`   📋 ${bookings.length} kontrak`);
  console.log(`   🧾 ${invoices.length} invoice`);
  console.log(`   💳 ${payments.length} pembayaran`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
