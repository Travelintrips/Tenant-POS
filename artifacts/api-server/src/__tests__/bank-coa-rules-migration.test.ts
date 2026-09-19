import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool, runMigrations, BANK_COA_RULE_SEED_SQL } from "@workspace/db";

const DEFAULT_COA_CODES = [
  "1-1001",
  "1-1002",
  "2-1001",
  "2-1002",
  "4-1001",
  "4-1002",
  "4-1003",
  "4-1004",
  "5-1001",
  "5-1002",
  "5-1003",
  "5-1004",
];

describe("bank_coa_rules migration seed", () => {
  beforeAll(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE TABLE bank_coa_rules RESTART IDENTITY");
  });

  it("mengisi tepat 12 rule bawaan saat seed dijalankan dua kali pada tabel kosong", async () => {
    await pool.query(BANK_COA_RULE_SEED_SQL);
    await pool.query(BANK_COA_RULE_SEED_SQL);

    const result = await pool.query<{ coa_code: string }>(
      "SELECT coa_code FROM bank_coa_rules ORDER BY coa_code",
    );

    expect(result.rows).toHaveLength(DEFAULT_COA_CODES.length);
    expect(result.rows.map((row) => row.coa_code)).toEqual(DEFAULT_COA_CODES);
  });

  it("tidak menimpa rule manual dengan kode CoA yang sama", async () => {
    await pool.query(`
      INSERT INTO bank_coa_rules
        (coa_code, coa_name, account_type, direction, description, is_active)
      VALUES
        ('4-1001', 'Pendapatan Custom', 'custom', 'OUT', 'Rule manual', false)
    `);

    await pool.query(BANK_COA_RULE_SEED_SQL);

    const result = await pool.query<{
      coa_code: string;
      coa_name: string;
      account_type: string;
      direction: string;
      description: string;
      is_active: boolean;
    }>(
      `SELECT coa_code, coa_name, account_type, direction, description, is_active
       FROM bank_coa_rules
       WHERE coa_code = '4-1001'`,
    );

    expect(result.rows).toEqual([
      {
        coa_code: "4-1001",
        coa_name: "Pendapatan Custom",
        account_type: "custom",
        direction: "OUT",
        description: "Rule manual",
        is_active: false,
      },
    ]);
  });
});