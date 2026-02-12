import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCreateDashboardPayload } from "../src/auth/publishPolicy.js";

test("normalizeCreateDashboardPayload preserves published value for publishers", () => {
  const payload = normalizeCreateDashboardPayload({
    dashboard: { title: "Ops", published: true },
    canPublish: true,
  });
  assert.deepEqual(payload, { title: "Ops", published: true });
});

test("normalizeCreateDashboardPayload forces private create for non-publishers", () => {
  const payload = normalizeCreateDashboardPayload({
    dashboard: { title: "Ops", published: true },
    canPublish: false,
  });
  assert.deepEqual(payload, { title: "Ops", published: false });
});
