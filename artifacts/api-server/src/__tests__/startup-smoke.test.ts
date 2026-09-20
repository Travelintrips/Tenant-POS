import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runUsersIdTextMigration: vi.fn(),
  runMigrations: vi.fn(),
  startOverdueScheduler: vi.fn(),
  startSheetSyncScheduler: vi.fn(),
  listen: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  runUsersIdTextMigration: mocks.runUsersIdTextMigration,
  runMigrations: mocks.runMigrations,
}));

vi.mock("../app", () => ({
  default: {
    listen: mocks.listen,
  },
}));

vi.mock("../lib/config", () => ({
  config: { port: 0 },
}));

vi.mock("../lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

vi.mock("../lib/overdue-scheduler", () => ({
  startOverdueScheduler: mocks.startOverdueScheduler,
}));

vi.mock("../lib/sheet-sync-scheduler", () => ({
  startSheetSyncScheduler: mocks.startSheetSyncScheduler,
}));

import { runMigrationsAndScheduler } from "../index";

describe("startup migration failure smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runUsersIdTextMigration.mockResolvedValue(undefined);
    mocks.runMigrations.mockResolvedValue(undefined);
  });

  it("tetap menyalakan scheduler overdue dan sheet sync saat users-id migration gagal", async () => {
    mocks.runUsersIdTextMigration.mockRejectedValueOnce(new Error("forced users-id migration failure"));

    await runMigrationsAndScheduler();

    expect(mocks.runUsersIdTextMigration).toHaveBeenCalledTimes(1);
    expect(mocks.runMigrations).not.toHaveBeenCalled();
    expect(mocks.startOverdueScheduler).toHaveBeenCalledTimes(1);
    expect(mocks.startSheetSyncScheduler).toHaveBeenCalledTimes(1);
  });

  it("tetap menyalakan scheduler overdue dan sheet sync saat migrasi utama gagal", async () => {
    mocks.runMigrations.mockRejectedValueOnce(new Error("forced migration failure"));

    await runMigrationsAndScheduler();

    expect(mocks.runUsersIdTextMigration).toHaveBeenCalledTimes(1);
    expect(mocks.runMigrations).toHaveBeenCalledTimes(1);
    expect(mocks.startOverdueScheduler).toHaveBeenCalledTimes(1);
    expect(mocks.startSheetSyncScheduler).toHaveBeenCalledTimes(1);
  });
});
