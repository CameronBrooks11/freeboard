import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { dataStore } from "../src/data/index.js";
import { closePostgresPool, getPostgresPool } from "../src/db/postgres/client.js";

const isPostgresTestRun = String(process.env.RUN_POSTGRES_RELEASE_READINESS || "").trim() === "1";

if (!isPostgresTestRun) {
  test("postgres release readiness smoke is skipped outside explicit readiness runs", {
    skip: true,
  });
}

const resetPostgresState = async () => {
  const pool = await getPostgresPool();
  await pool.query(`
    TRUNCATE TABLE
      share_token_revocation_events,
      security_limiter_state,
      audit_events,
      policy_kv,
      password_reset_tokens,
      invite_tokens,
      service_account_tokens,
      service_accounts,
      dashboard_acl,
      dashboards,
      broker_profiles,
      credential_profiles,
      users
    RESTART IDENTITY CASCADE
  `);
};

if (isPostgresTestRun) {
  beforeEach(async () => {
    await resetPostgresState();
  });

  after(async () => {
    await resetPostgresState();
    await closePostgresPool();
  });

  test("postgres release readiness smoke resolves postgres datastore backend", () => {
    assert.equal(dataStore.backend, "postgres");
  });

  test("postgres release readiness smoke verifies policy, dashboard, revocation, and limiter flows", async () => {
    const now = Date.now();
    const policyKey = `release.readiness.${now}`;
    const policyValue = {
      mode: "trusted",
      dashboardPublicListingEnabled: true,
    };

    await dataStore.repositories.policy.writeValue({
      key: policyKey,
      value: policyValue,
      updatedBy: null,
    });

    const persistedPolicyValue = await dataStore.repositories.policy.readValue({ key: policyKey });
    assert.deepEqual(persistedPolicyValue, policyValue);

    const user = await dataStore.repositories.users.create({
      email: `owner-${now}@example.com`,
      password: "StrongPass123!",
      role: "editor",
      active: true,
    });

    const dashboard = await dataStore.repositories.dashboards.create({
      user: user._id,
      visibility: "private",
      document: {
        schemaVersion: 1,
        title: "Postgres readiness dashboard",
        image: null,
        columns: 3,
        width: "md",
        settings: { theme: "auto" },
        datasources: [],
        panes: [],
      },
    });

    const hydratedDashboard = await dataStore.repositories.dashboards.findById({
      dashboardId: dashboard._id,
    });
    assert.ok(hydratedDashboard);
    assert.equal(hydratedDashboard?._id, dashboard._id);
    assert.equal(hydratedDashboard?.user, user._id);

    const revokedAt = new Date();
    await dataStore.repositories.shareTokenRevocationFeed.insertEvent({
      dashboardId: dashboard._id,
      shareTokenVersion: dashboard.shareTokenVersion + 1,
      revokedAt,
    });

    const revocationEvents = await dataStore.repositories.shareTokenRevocationFeed.queryEvents({
      retentionCutoff: new Date(0),
      cursor: null,
      limit: 10,
    });
    assert.equal(revocationEvents.length, 1);
    assert.equal(revocationEvents[0]?.dashboardId, dashboard._id);

    const limiterCounterId = `release:counter:${now}`;
    const limiterLockId = `release:lock:${now}`;
    const limiterExpiresAt = new Date(Date.now() + 60_000);
    const firstCount = await dataStore.repositories.securityLimiter.incrementCounter({
      documentId: limiterCounterId,
      expiresAt: limiterExpiresAt,
    });
    const secondCount = await dataStore.repositories.securityLimiter.incrementCounter({
      documentId: limiterCounterId,
      expiresAt: limiterExpiresAt,
    });
    assert.equal(firstCount, 1);
    assert.equal(secondCount, 2);

    const lockUntil = new Date(Date.now() + 120_000);
    await dataStore.repositories.securityLimiter.upsertLock({
      documentId: limiterLockId,
      lockUntil,
      expiresAt: limiterExpiresAt,
    });
    const persistedLockUntil = await dataStore.repositories.securityLimiter.getLockUntil({
      documentId: limiterLockId,
    });
    assert.ok(persistedLockUntil instanceof Date);

    await dataStore.repositories.securityLimiter.deleteById({ documentId: limiterLockId });
    const removedLockUntil = await dataStore.repositories.securityLimiter.getLockUntil({
      documentId: limiterLockId,
    });
    assert.equal(removedLockUntil, null);
  });
}
