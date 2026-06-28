import assert from "node:assert/strict";
import test from "node:test";

import { collectUntrustedCredentialAuthorIssues } from "../src/resolvers/dashboardHelpers.js";

// Issue #213: credential/broker *use* is a trusted-author privilege. An ACL-only
// editor (a global viewer holding a per-dashboard edit grant) is untrusted: the
// authenticated datasource gateway flow injects a referenced credential's secret
// into the author-controlled URL with NO `allowPublicUse` check, so an untrusted
// author who can add/redirect a datasource could exfiltrate a stored secret.
// These tests pin the pure predicate that blocks that while preserving the
// legitimate "edit a shared dashboard that already uses the owner's key" case.

const httpDatasource = (overrides = {}) => ({
  id: "ds-1",
  type: "http",
  settings: {
    url: "https://api.internal.example/status",
    method: "GET",
    parser: "json",
    credentialProfileId: "cred-secret-1",
    ...overrides,
  },
});

// `isNonPublicProfileId` is resolved from the store by the caller; here we drive
// it directly. "cred-secret-1" / "broker-secret-1" are non-public; anything else
// (e.g. a public profile) is treated as public.
const isNonPublic = (id) => id === "cred-secret-1" || id === "broker-secret-1";

test("REPRO: an untrusted author ADDING a non-public credential reference is blocked", () => {
  const issues = collectUntrustedCredentialAuthorIssues({
    nextDatasources: [httpDatasource()],
    priorDatasources: [],
    isNonPublicProfileId: isNonPublic,
  });
  assert.equal(issues.length, 1, "the newly-added non-public credential ref must be rejected");
});

test("an untrusted author may add a datasource that references a public (allowPublicUse) profile", () => {
  const issues = collectUntrustedCredentialAuthorIssues({
    nextDatasources: [httpDatasource({ credentialProfileId: "cred-public-1" })],
    priorDatasources: [],
    isNonPublicProfileId: isNonPublic,
  });
  assert.deepEqual(issues, []);
});

test("a datasource with no credential/broker reference is never blocked", () => {
  const issues = collectUntrustedCredentialAuthorIssues({
    nextDatasources: [{ id: "ds-2", type: "http", settings: { url: "https://x.example" } }],
    priorDatasources: [],
    isNonPublicProfileId: isNonPublic,
  });
  assert.deepEqual(issues, []);
});

test("a pre-existing non-public datasource left byte-identical is allowed (collaboration)", () => {
  const existing = httpDatasource();
  const issues = collectUntrustedCredentialAuthorIssues({
    nextDatasources: [existing],
    priorDatasources: [existing],
    isNonPublicProfileId: isNonPublic,
  });
  assert.deepEqual(
    issues,
    [],
    "an untrusted editor may edit a board that already uses a secret key",
  );
});

test("re-ordered settings keys on an otherwise-unchanged datasource are NOT treated as a change", () => {
  const prior = httpDatasource();
  // Same data, different key insertion order (mirrors store vs sanitized-input serialization).
  const next = {
    type: "http",
    id: "ds-1",
    settings: {
      credentialProfileId: "cred-secret-1",
      parser: "json",
      method: "GET",
      url: "https://api.internal.example/status",
    },
  };
  const issues = collectUntrustedCredentialAuthorIssues({
    nextDatasources: [next],
    priorDatasources: [prior],
    isNonPublicProfileId: isNonPublic,
  });
  assert.deepEqual(issues, [], "canonical comparison must ignore key ordering");
});

test("REDIRECT: changing the URL of a pre-existing non-public datasource is blocked", () => {
  const issues = collectUntrustedCredentialAuthorIssues({
    nextDatasources: [httpDatasource({ url: "https://attacker.example/collect" })],
    priorDatasources: [httpDatasource()],
    isNonPublicProfileId: isNonPublic,
  });
  assert.equal(issues.length, 1, "redirecting a stored secret to a new URL must be rejected");
});

test("attaching a non-public broker profile to a new datasource is blocked", () => {
  const issues = collectUntrustedCredentialAuthorIssues({
    nextDatasources: [
      { id: "ds-mqtt", type: "mqtt", settings: { brokerProfileId: "broker-secret-1", topic: "t" } },
    ],
    priorDatasources: [],
    isNonPublicProfileId: isNonPublic,
  });
  assert.equal(issues.length, 1);
});

test("undefined / non-array next datasources produce no issues (nothing being authored)", () => {
  assert.deepEqual(
    collectUntrustedCredentialAuthorIssues({
      nextDatasources: undefined,
      priorDatasources: [],
      isNonPublicProfileId: isNonPublic,
    }),
    [],
  );
});
