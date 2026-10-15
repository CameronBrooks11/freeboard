import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCreateDashboardPayload } from "../src/auth/publishPolicy.js";

// The create mutation takes the API's DashboardVisibility enum name
// (PRIVATE/LINK/PUBLIC); the model holds the lowercase value, which the API
// rejects with HTTP 400.

test("normalizeCreateDashboardPayload preserves visibility for publishers", () => {
  const payload = normalizeCreateDashboardPayload({
    dashboard: { title: "Ops", visibility: "public" },
    canPublish: true,
  });
  assert.deepEqual(payload, { title: "Ops", visibility: "PUBLIC" });
});

test("normalizeCreateDashboardPayload sends link visibility as the enum name", () => {
  const payload = normalizeCreateDashboardPayload({
    dashboard: { title: "Ops", visibility: "link" },
    canPublish: true,
  });
  assert.deepEqual(payload, { title: "Ops", visibility: "LINK" });
});

test("normalizeCreateDashboardPayload forces private create for non-publishers", () => {
  const payload = normalizeCreateDashboardPayload({
    dashboard: { title: "Ops", visibility: "public" },
    canPublish: false,
  });
  assert.deepEqual(payload, { title: "Ops", visibility: "PRIVATE" });
});

test("normalizeCreateDashboardPayload leaves an absent visibility absent for publishers", () => {
  const payload = normalizeCreateDashboardPayload({
    dashboard: { title: "Ops" },
    canPublish: true,
  });
  assert.deepEqual(payload, { title: "Ops" });
});
