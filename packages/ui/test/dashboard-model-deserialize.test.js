import assert from "node:assert/strict";
import test from "node:test";

import { Dashboard } from "../src/models/Dashboard.js";

test("Dashboard.deserialize normalizes duplicate widget ids within a pane", () => {
  const dashboard = new Dashboard();

  dashboard.deserialize({
    _id: "dashboard-1",
    title: "Main",
    columns: 3,
    width: "md",
    settings: { theme: "auto" },
    datasources: [],
    panes: [
      {
        title: "Pane 1",
        layout: { i: "pane-1", x: 0, y: 0, w: 1, h: 1 },
        widgets: [
          {
            id: "duplicate-widget-id",
            title: "Widget A",
            type: "text",
            settings: {},
            enabled: true,
          },
          {
            id: "duplicate-widget-id",
            title: "Widget B",
            type: "text",
            settings: {},
            enabled: true,
          },
        ],
      },
    ],
  });

  const widgetIds = dashboard.panes[0].widgets.map((widget) => widget.id);
  assert.equal(widgetIds.length, 2);
  assert.equal(new Set(widgetIds).size, 2);
  assert.ok(widgetIds.every((id) => typeof id === "string" && id.length > 0));
});
