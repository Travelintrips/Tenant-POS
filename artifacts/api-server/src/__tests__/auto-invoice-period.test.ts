import { describe, expect, it } from "vitest";
import { addMonths, calcPeriodEnd } from "../lib/auto-invoice";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("auto-invoice contract anniversary periods", () => {
  it("keeps a 24 September start anchored to the 24th", () => {
    const start = new Date("2026-09-24T00:00:00Z");
    expect(iso(addMonths(start, 0))).toBe("2026-09-24");
    expect(iso(calcPeriodEnd(start))).toBe("2026-10-23");
    const second = addMonths(start, 1);
    expect(iso(second)).toBe("2026-10-24");
    expect(iso(calcPeriodEnd(second))).toBe("2026-11-23");
  });

  it("clamps month-end anniversaries safely", () => {
    const start = new Date("2026-01-31T00:00:00Z");
    expect(iso(addMonths(start, 1))).toBe("2026-02-28");
  });
});
