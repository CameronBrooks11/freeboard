import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { applyPendingMigrations } from "../src/db/postgres/migrate.js";
import { closePostgresPool, getPostgresPool } from "../src/db/postgres/client.js";

// Shares the postgres opt-in flag with the readiness smoke so it runs in the
// same CI job. Verifies #184: a fresh database is provisioned on startup.
const isPostgresTestRun = String(process.env.RUN_POSTGRES_RELEASE_READINESS || "").trim() === "1";

if (!isPostgresTestRun) {
  test("startup migration test is skipped outside explicit postgres runs", { skip: true });
}

const regclass = async (qualifiedName: string): Promise<unknown> => {
  const pool = await getPostgresPool();
  const result = await pool.query("SELECT to_regclass($1) AS t", [qualifiedName]);
  return result.rows[0]?.t ?? null;
};

if (isPostgresTestRun) {
  beforeEach(async () => {
    // Clean slate — no schema at all — so the test proves startup migration
    // provisions it from nothing (the #184 scenario).
    const pool = await getPostgresPool();
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  });

  after(async () => {
    // Wipe any verification-test pollution (tampered checksums, ghost rows) then
    // leave a clean, fully-applied schema so sibling postgres tests (which
    // TRUNCATE) work regardless of file order, then release the pool.
    const pool = await getPostgresPool();
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await applyPendingMigrations();
    await closePostgresPool();
  });

  test("applyPendingMigrations provisions the schema on a fresh database", async () => {
    assert.equal(
      await regclass("public.users"),
      null,
      "users should not exist on a fresh database",
    );

    await applyPendingMigrations();

    assert.notEqual(await regclass("public.users"), null, "users should exist after migration");
    const pool = await getPostgresPool();
    const recorded = await pool.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    const versions = recorded.rows.map((row) => row.version);
    // Don't hard-code the full set (it grows with every migration); just prove
    // the baseline schema and the document_revision migration both applied.
    assert.ok(versions.includes("0001"), "0001 should be applied");
    assert.ok(versions.includes("0002"), "0002 should be applied");
  });

  test("applyPendingMigrations is idempotent", async () => {
    await applyPendingMigrations();
    const pool = await getPostgresPool();
    const countOf = async () =>
      (await pool.query<{ c: number }>("SELECT count(*)::int AS c FROM schema_migrations")).rows[0]
        ?.c;

    const firstCount = await countOf();
    await applyPendingMigrations();
    const secondCount = await countOf();

    assert.ok((firstCount ?? 0) >= 1, "at least one migration is recorded");
    assert.equal(secondCount, firstCount, "re-applying records no new migrations");
  });

  test("applyPendingMigrations refuses to start when an applied migration's checksum drifted", async () => {
    await applyPendingMigrations();
    const pool = await getPostgresPool();
    // Simulate a migration file that was edited after being applied.
    await pool.query("UPDATE schema_migrations SET checksum = $1 WHERE version = '0001'", [
      "tampered-checksum",
    ]);

    await assert.rejects(() => applyPendingMigrations(), /Checksum mismatch/);
  });

  test("applyPendingMigrations refuses to start when an applied migration file is missing", async () => {
    await applyPendingMigrations();
    const pool = await getPostgresPool();
    // Simulate a row recorded by a newer deployment that this image doesn't ship.
    await pool.query(
      "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES ('9999', 'ghost', 'x', NOW())",
    );

    await assert.rejects(
      () => applyPendingMigrations(),
      /missing from the packaged migration files/,
    );
  });
}
