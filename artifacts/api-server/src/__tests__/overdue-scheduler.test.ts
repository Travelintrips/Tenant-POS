import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@workspace/db";
import { tenantInvoicesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createTenant, createTestInvoice, cleanupTestData } from "./helpers/factory";

vi.mock("../lib/whatsapp", async () => {
  const actual = await vi.importActual<typeof import("../lib/whatsapp")>("../lib/whatsapp");
  return {
    ...actual,
    sendOverdueReminder: vi.fn().mockResolvedValue({ ok: true, skipped: false }),
    notifyAdminGroup: vi.fn().mockResolvedValue({ ok: true, skipped: true }),
  };
});

import { runOverdueCheck } from "../lib/overdue-scheduler";
import { sendOverdueReminder } from "../lib/whatsapp";

describe("overdue invoice scheduler", () => {
  let tenantIds: number[] = [];

  beforeEach(() => {
    tenantIds = [];
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestData(tenantIds);
  });

  it("hanya mengirim invoice jatuh tempo September 2026+ untuk tenant aktif, sekali per hari, dan berhenti setelah lunas", async () => {
    const activeTenant = await createTenant({
      phone: "6281200000001",
      status: "active",
    });
    const inactiveTenant = await createTenant({
      phone: "6281200000002",
      status: "inactive",
    });
    tenantIds.push(activeTenant.id, inactiveTenant.id);

    const eligible = await createTestInvoice(activeTenant.id, undefined, {
      invoiceNumber: `INV-OVERDUE-ELIGIBLE-${Date.now()}`,
      dueDate: "2026-09-01",
      status: "unpaid",
      outstandingAmount: "100000",
    });
    await createTestInvoice(inactiveTenant.id, undefined, {
      invoiceNumber: `INV-OVERDUE-INACTIVE-${Date.now()}`,
      dueDate: "2026-09-01",
      status: "unpaid",
      outstandingAmount: "100000",
    });
    await createTestInvoice(activeTenant.id, undefined, {
      invoiceNumber: `INV-OVERDUE-AUGUST-${Date.now()}`,
      dueDate: "2026-08-31",
      status: "unpaid",
      outstandingAmount: "100000",
    });
    await createTestInvoice(activeTenant.id, undefined, {
      invoiceNumber: `INV-OVERDUE-PAID-${Date.now()}`,
      dueDate: "2026-09-01",
      status: "paid",
      paidAmount: "100000",
      outstandingAmount: "0",
    });
    await createTestInvoice(activeTenant.id, undefined, {
      invoiceNumber: `INV-OVERDUE-ZERO-${Date.now()}`,
      dueDate: "2026-09-01",
      status: "overdue",
      outstandingAmount: "0",
    });

    const firstRun = await runOverdueCheck();
    const sendMock = vi.mocked(sendOverdueReminder);
    const eligibleCalls = () =>
      sendMock.mock.calls.filter(([params]) => params.invoiceNumber === eligible.invoiceNumber);

    expect(firstRun).toBeGreaterThanOrEqual(1);
    expect(eligibleCalls()).toHaveLength(1);
    expect(sendMock.mock.calls.some(([params]) => params.invoiceNumber?.includes("INACTIVE"))).toBe(false);
    expect(sendMock.mock.calls.some(([params]) => params.invoiceNumber?.includes("AUGUST"))).toBe(false);
    expect(sendMock.mock.calls.some(([params]) => params.invoiceNumber?.includes("PAID"))).toBe(false);
    expect(sendMock.mock.calls.some(([params]) => params.invoiceNumber?.includes("ZERO"))).toBe(false);

    // Menjalankan scheduler lagi pada hari yang sama tidak boleh mengirim invoice target dua kali.
    await runOverdueCheck();
    expect(eligibleCalls()).toHaveLength(1);

    // Setelah saldo menjadi lunas, invoice tidak boleh dikirim lagi meskipun claim hariannya dihapus.
    await db
      .update(tenantInvoicesTable)
      .set({
        status: "paid",
        paidAmount: "100000",
        outstandingAmount: "0",
        lastOverdueReminderAt: null,
      })
      .where(eq(tenantInvoicesTable.id, eligible.id));

    await runOverdueCheck();
    expect(eligibleCalls()).toHaveLength(1);
  });
});