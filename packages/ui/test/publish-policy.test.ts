import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCreateDashboardPayload } from "../src/auth/publishPolicy.js";

test("normalizeCreateDashboardPayload preserves visibility for publishers", () => {
  const payload = normalizeCreateDashboardPayload({
    dashboard: { title: "Ops", visibility: "public" },
    canPublish: true,
  });
  assert.deepEqual(payload, { title: "Ops", visibility: "public" });
});

test("normalizeCreateDashboardPayload forces private create for non-publishers", () => {
  const payload = normalizeCreateDashboardPayload({
    dashboard: { title: "Ops", visibility: "public" },
    canPublish: false,
  });
  assert.deepEqual(payload, { title: "Ops", visibility: "private" });
});
