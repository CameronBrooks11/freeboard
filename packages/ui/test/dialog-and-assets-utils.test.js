import assert from "node:assert/strict";
import test from "node:test";

import { disposeDashboardAssets } from "../src/dashboardAssets.js";
import { bindEscapeKeyListener } from "../src/escapeKeyListener.js";

test("bindEscapeKeyListener binds and unbinds Escape handler", () => {
  const listeners = new Map();
  const target = {
    addEventListener: (event, handler) => listeners.set(event, handler),
    removeEventListener: (event, handler) => {
      if (listeners.get(event) === handler) {
        listeners.delete(event);
      }
    },
  };

  let escapeCalls = 0;
  const unbind = bindEscapeKeyListener(() => {
    escapeCalls += 1;
  }, target);

  listeners.get("keydown")?.({ code: "Enter" });
  listeners.get("keydown")?.({ code: "Escape" });
  assert.equal(escapeCalls, 1);

  unbind();
  assert.equal(listeners.has("keydown"), false);
});

test("disposeDashboardAssets removes every known asset node safely", () => {
  let removes = 0;
  const assets = {
    style: { node: { remove: () => removes++ } },
    script: { node: { remove: () => removes++ } },
    broken: {},
  };

  disposeDashboardAssets(assets);
  assert.equal(removes, 2);
});

