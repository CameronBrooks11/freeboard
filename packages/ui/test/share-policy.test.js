import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFallbackSharePath,
  isDashboardShareable,
} from "../src/sharePolicy.js";

test("isDashboardShareable requires a saved dashboard id", () => {
  assert.equal(
    isDashboardShareable({ isSaved: false, dashboardId: "dash-1" }),
    false
  );
  assert.equal(
    isDashboardShareable({ isSaved: true, dashboardId: "" }),
    false
  );
  assert.equal(
    isDashboardShareable({ isSaved: true, dashboardId: "dash-1" }),
    true
  );
});

test("buildFallbackSharePath maps public dashboards to /p/:id", () => {
  const path = buildFallbackSharePath({
    visibility: "public",
    dashboardId: "dash-1",
    shareToken: "ignored",
  });
  assert.equal(path, "/p/dash-1");
});

test("buildFallbackSharePath maps link dashboards to /s/:token", () => {
  const path = buildFallbackSharePath({
    visibility: "link",
    dashboardId: "dash-1",
    shareToken: "token-1",
  });
  assert.equal(path, "/s/token-1");
});

test("buildFallbackSharePath returns empty for private or missing identifiers", () => {
  assert.equal(
    buildFallbackSharePath({
      visibility: "private",
      dashboardId: "dash-1",
      shareToken: "token-1",
    }),
    ""
  );
  assert.equal(
    buildFallbackSharePath({
      visibility: "public",
      dashboardId: "",
      shareToken: "token-1",
    }),
    ""
  );
  assert.equal(
    buildFallbackSharePath({
      visibility: "link",
      dashboardId: "dash-1",
      shareToken: "",
    }),
    ""
  );
});
