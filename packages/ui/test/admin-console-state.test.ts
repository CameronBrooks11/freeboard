import assert from "node:assert/strict";
import test from "node:test";

import {
  toBrokerProfileDraft,
  toPolicyDraft,
  toUserDraft,
} from "../src/admin/adminConsoleState.js";

test("toPolicyDraft normalizes uppercase enum payloads for UI select models", () => {
  const draft = toPolicyDraft({
    registrationMode: "OPEN",
    registrationDefaultRole: "EDITOR",
    nonAdminCanPublish: true,
    dashboardDefaultVisibility: "PUBLIC",
    dashboardPublicListingEnabled: true,
    executionMode: "SAFE",
    policyEditLock: false,
  });

  assert.deepEqual(draft, {
    registrationMode: "open",
    registrationDefaultRole: "editor",
    nonAdminCanPublish: true,
    dashboardDefaultVisibility: "public",
    dashboardPublicListingEnabled: true,
    executionMode: "safe",
    policyEditLock: false,
  });
});

test("toPolicyDraft falls back when backend returns unsupported enum values", () => {
  const draft = toPolicyDraft({
    registrationMode: "UNKNOWN",
    registrationDefaultRole: "ADMIN",
    dashboardDefaultVisibility: "SECRET",
    executionMode: "DANGEROUS",
  });

  assert.equal(draft.registrationMode, "disabled");
  assert.equal(draft.registrationDefaultRole, "viewer");
  assert.equal(draft.dashboardDefaultVisibility, "private");
  assert.equal(draft.executionMode, "safe");
});

test("toUserDraft normalizes user role values and preserves activation state", () => {
  assert.deepEqual(toUserDraft({ role: "ADMIN", active: true }), {
    role: "admin",
    active: true,
  });

  assert.deepEqual(toUserDraft({ role: "INVALID_ROLE", active: 0 }), {
    role: "viewer",
    active: false,
  });
});

test("toBrokerProfileDraft normalizes protocol and topic allowlist", () => {
  const draft = toBrokerProfileDraft({
    protocol: "MQTT",
    topicAllowlist: ["factory/#", "line/+/status"],
    tls: {
      rejectUnauthorized: false,
    },
  });

  assert.equal(draft.protocol, "mqtt");
  assert.equal(draft.topicAllowlist, "factory/#, line/+/status");
  assert.equal(draft.tlsRejectUnauthorized, false);
});
