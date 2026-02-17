import assert from "node:assert/strict";
import { test } from "node:test";

import { DatasourceRuntimeBase } from "../src/datasources/runtime/DatasourceRuntimeBase.js";

test("DatasourceRuntimeBase supports applySettings contract and emits connected data state", () => {
  const emittedData = [];
  const emittedStatus = [];
  const runtime = new DatasourceRuntimeBase(
    {},
    (payload) => emittedData.push(payload),
    (payload) => emittedStatus.push(payload),
  );

  runtime.applySettings({ refresh: 5 });
  assert.deepEqual(runtime.currentSettings, { refresh: 5 });

  runtime.start();
  assert.equal(runtime.status, "connecting");

  runtime.emitData({ value: 42 });
  assert.equal(runtime.status, "connected");
  assert.equal(runtime.metrics.messageCount, 1);
  assert.equal(runtime.metrics.errorCount, 0);
  assert.equal(runtime.error, null);
  assert.equal(runtime.errorCode, null);
  assert.deepEqual(emittedData[0], { value: 42 });
  assert.equal(emittedStatus.at(-1)?.status, "connected");

  runtime.dispose();
  assert.equal(runtime.status, "disabled");
});

test("DatasourceRuntimeBase emits error state and increments retry/error metrics", () => {
  const emittedStatus = [];
  const runtime = new DatasourceRuntimeBase(
    {},
    () => {},
    (payload) => emittedStatus.push(payload),
  );

  runtime.metrics.retryCount = 2;
  runtime.emitError(new Error("upstream failed"), "http_fetch_failed");

  assert.equal(runtime.status, "error");
  assert.equal(runtime.errorCode, "http_fetch_failed");
  assert.equal(runtime.error, "upstream failed");
  assert.equal(runtime.metrics.errorCount, 1);
  assert.equal(runtime.metrics.retryCount, 2);
  assert.equal(emittedStatus.at(-1)?.status, "error");
  assert.equal(emittedStatus.at(-1)?.errorCode, "http_fetch_failed");
});

test("DatasourceRuntimeBase stale monitor flips status to stale after threshold", async (t) => {
  const emittedStatus = [];
  const runtime = new DatasourceRuntimeBase(
    {},
    () => {},
    (payload) => emittedStatus.push(payload),
  );
  t.after(() => runtime.dispose());

  runtime.emitData({ healthy: true });
  runtime.lastUpdatedAt = new Date(Date.now() - 5_000);
  runtime.setStaleMonitor(200);

  await new Promise((resolve) => setTimeout(resolve, 350));

  assert.ok(
    emittedStatus.some((payload) => payload.status === "stale"),
    "expected at least one stale status emission",
  );
});
