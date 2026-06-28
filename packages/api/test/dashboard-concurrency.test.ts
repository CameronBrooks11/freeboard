import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { dataStore } from "../src/data/index.js";
import { DashboardRevisionConflictError } from "../src/data/contracts.js";
import { applyPendingMigrations } from "../src/db/postgres/migrate.js";
import { closePostgresPool, getPostgresPool } from "../src/db/postgres/client.js";

/**
 * Real-Postgres coverage for the optimistic-concurrency revision guard. Gated on
 * RUN_POSTGRES_RELEASE_READINESS=1 (same as the readiness smoke); the schema is
 * provisioned by migrate.test.ts running first in the postgres-smoke job.
 */
const isPostgresTestRun = String(process.env.RUN_POSTGRES_RELEASE_READINESS || "").trim() === "1";

if (!isPostgresTestRun) {
  test("dashboard concurrency guard is skipped outside explicit postgres runs", { skip: true });
}

const resetPostgresState = async () => {
  // Self-provision so this file does not depend on a sibling test having created
  // the schema first (applyPendingMigrations is idempotent).
  await applyPendingMigrations();
  const pool = await getPostgresPool();
  await pool.query(`TRUNCATE TABLE dashboard_acl, dashboards, users RESTART IDENTITY CASCADE`);
};

const buildDocument = (title: string) => ({
  schemaVersion: 1,
  title,
  image: null,
  columns: 3,
  width: "md",
  settings: { theme: "auto" },
  datasources: [],
  panes: [],
});

if (isPostgresTestRun) {
  beforeEach(resetPostgresState);
  after(async () => {
    await resetPostgresState();
    await closePostgresPool();
  });

  test("document_revision starts at 1, bumps on document writes, and guards stale writes", async () => {
    const dashboards = dataStore.repositories.dashboards;
    const owner = await dataStore.repositories.users.create({
      email: `owner-${Date.now()}@example.com`,
      password: "StrongPass123!",
      role: "editor",
      active: true,
    });

    const created = await dashboards.create({
      user: owner._id,
      visibility: "private",
      document: buildDocument("v1"),
    });
    assert.equal(created.documentRevision, 1);

    // A guarded document write at the current revision succeeds and bumps it.
    const updated = await dashboards.updateById({
      dashboardId: created._id,
      patch: { document: buildDocument("v2") },
      expectedDocumentRevision: 1,
    });
    assert.equal(updated?.documentRevision, 2);

    // A stale guarded write (still expecting revision 1) is rejected.
    await assert.rejects(
      () =>
        dashboards.updateById({
          dashboardId: created._id,
          patch: { document: buildDocument("v2-conflict") },
          expectedDocumentRevision: 1,
        }),
      (error) => {
        assert.ok(error instanceof DashboardRevisionConflictError);
        assert.equal(error.currentRevision, 2);
        return true;
      },
    );
    // The rejected write left the stored document untouched.
    const afterConflict = await dashboards.findById({ dashboardId: created._id });
    assert.equal(afterConflict?.documentRevision, 2);
    assert.equal((afterConflict?.document as { title?: string }).title, "v2");

    // The correct revision succeeds again.
    const updatedAgain = await dashboards.updateById({
      dashboardId: created._id,
      patch: { document: buildDocument("v3") },
      expectedDocumentRevision: 2,
    });
    assert.equal(updatedAgain?.documentRevision, 3);

    // An envelope-only write (no document) does not bump the revision.
    const envelopeOnly = await dashboards.updateById({
      dashboardId: created._id,
      patch: { visibility: "public" },
    });
    assert.equal(envelopeOnly?.documentRevision, 3);
    assert.equal(envelopeOnly?.visibility, "public");
  });

  test("a document-only update preserves a concurrently changed visibility", async () => {
    const dashboards = dataStore.repositories.dashboards;
    const owner = await dataStore.repositories.users.create({
      email: `owner2-${Date.now()}@example.com`,
      password: "StrongPass123!",
      role: "editor",
      active: true,
    });
    const created = await dashboards.create({
      user: owner._id,
      visibility: "private",
      document: buildDocument("v1"),
    });
    assert.equal(created.documentRevision, 1);

    // A concurrent visibility change (its own mutation) does NOT bump the
    // document revision — the root of the original race.
    const published = await dashboards.updateById({
      dashboardId: created._id,
      patch: { visibility: "public" },
    });
    assert.equal(published?.visibility, "public");
    assert.equal(published?.documentRevision, 1);

    // A document-only save at the still-current revision succeeds and leaves the
    // (concurrently changed) visibility untouched — no silent revert.
    const saved = await dashboards.updateById({
      dashboardId: created._id,
      patch: { document: buildDocument("v2") },
      expectedDocumentRevision: 1,
    });
    assert.equal(saved?.documentRevision, 2);
    assert.equal(saved?.visibility, "public");
  });
}
