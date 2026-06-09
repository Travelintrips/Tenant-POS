import { beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import { pool } from "@workspace/db";

beforeAll(async () => {
  await pool.query("SELECT 1");
});

afterAll(async () => {
  await pool.end();
});
