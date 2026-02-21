import assert from "node:assert/strict";
import test from "node:test";

import {
  Dashboard,
  normalizeDashboardTheme,
  normalizeDashboardWidth,
} from "../src/models/Dashboard.js";

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

test("Dashboard width preset normalization accepts sm and falls back to md for unknown values", () => {
  assert.equal(normalizeDashboardWidth("sm"), "sm");
  assert.equal(normalizeDashboardWidth("LG"), "lg");
  assert.equal(normalizeDashboardWidth("unknown"), "md");

  const dashboard = new Dashboard();
  dashboard.deserialize({
    _id: "dashboard-2",
    title: "Mobile Board",
    columns: 3,
    width: "sm",
    settings: {},
    datasources: [],
    panes: [],
  });

  assert.equal(dashboard.width, "sm");
  assert.equal(dashboard.settings.allowMobileEdit, false);

  dashboard.deserialize({
    _id: "dashboard-3",
    title: "Mobile Board 2",
    columns: 3,
    width: "sm",
    settings: { allowMobileEdit: "true" },
    datasources: [],
    panes: [],
  });

  assert.equal(dashboard.settings.allowMobileEdit, true);
});

test("Dashboard increase/decrease width traverses sm -> md -> lg -> xl", () => {
  const dashboard = new Dashboard();

  assert.equal(dashboard.width, "md");
  dashboard.decreaseMaxWidth();
  assert.equal(dashboard.width, "sm");
  dashboard.decreaseMaxWidth();
  assert.equal(dashboard.width, "sm");

  dashboard.increaseMaxWidth();
  assert.equal(dashboard.width, "md");
  dashboard.increaseMaxWidth();
  assert.equal(dashboard.width, "lg");
  dashboard.increaseMaxWidth();
  assert.equal(dashboard.width, "xl");
  dashboard.increaseMaxWidth();
  assert.equal(dashboard.width, "xl");
});

test("Dashboard theme normalization accepts curated presets and falls back to auto", () => {
  assert.equal(normalizeDashboardTheme("SLATE"), "slate");
  assert.equal(normalizeDashboardTheme("PAPER"), "paper");
  assert.equal(normalizeDashboardTheme("AMBER-NIGHT"), "amber-night");
  assert.equal(normalizeDashboardTheme("HIGH-CONTRAST"), "high-contrast");
  assert.equal(normalizeDashboardTheme("unknown-theme"), "auto");

  const dashboard = new Dashboard();
  dashboard.deserialize({
    _id: "dashboard-theme-1",
    title: "Theme Board",
    columns: 3,
    width: "md",
    settings: { theme: "amber-night" },
    datasources: [],
    panes: [],
  });
  assert.equal(dashboard.settings.theme, "amber-night");

  dashboard.deserialize({
    _id: "dashboard-theme-2",
    title: "Theme Board 2",
    columns: 3,
    width: "md",
    settings: { theme: "not-real" },
    datasources: [],
    panes: [],
  });
  assert.equal(dashboard.settings.theme, "auto");
});
