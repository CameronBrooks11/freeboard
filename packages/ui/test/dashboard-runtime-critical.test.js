import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDatasourceSnapshot,
  clampPaneLayoutHeights,
  replaceDatasourceReferences,
  serializeDashboardState,
} from "../src/models/dashboardRuntime.js";

test("buildDatasourceSnapshot normalizes datasource payloads and removes ambiguous title aliases", () => {
  const snapshot = buildDatasourceSnapshot([
    {
      id: "ds1",
      title: "Weather",
      latestData: { data: { current: { temp: 21 } } },
    },
    {
      id: "ds2",
      title: "Weather",
      latestData: { data: { current: { temp: 25 } } },
    },
    {
      id: "ds3",
      title: "datasources",
      latestData: { data: { ignoredAlias: true } },
    },
    {
      id: "ds4",
      title: "DatasourceTitles",
      latestData: { data: { alsoIgnoredAlias: true } },
    },
  ]);

  assert.deepEqual(snapshot.datasources.ds1, { current: { temp: 21 } });
  assert.deepEqual(snapshot.datasources.ds2, { current: { temp: 25 } });
  assert.equal(snapshot.datasourceTitles.Weather, undefined);
  assert.equal(snapshot.Weather, undefined);
  assert.equal(snapshot.DatasourceTitles, undefined);
  assert.deepEqual(snapshot.ds1, { current: { temp: 21 } });
  assert.deepEqual(snapshot.ds2, { current: { temp: 25 } });
});

test("clampPaneLayoutHeights enforces pane minimum rows from widget preferred rows", () => {
  const panes = [
    {
      layout: { h: 1 },
      widgets: [{ getPreferredRows: () => 2 }, { getPreferredRows: () => 3 }],
    },
    {
      layout: {},
      widgets: [{ getPreferredRows: () => 0 }],
    },
  ];

  clampPaneLayoutHeights(panes);

  assert.equal(panes[0].layout.h, 5);
  assert.equal(panes[1].layout.h, 1);
});

test("serializeDashboardState includes versioned payload and serialized child models", () => {
  const serialized = serializeDashboardState(
    {
      _id: "dashboard-1",
      title: "Main",
      published: false,
      image: null,
      columns: 6,
      width: "lg",
      settings: { theme: "dark" },
      datasources: [
        { serialize: () => ({ id: "ds1", title: "Weather", type: "json" }) },
      ],
      authProviders: [{ serialize: () => ({ id: "ap1", type: "header" }) }],
      panes: [
        {
          serialize: () => ({
            title: "Pane 1",
            layout: { i: "pane-1", x: 0, y: 0, w: 1, h: 1 },
            widgets: [{ id: "w1", type: "text" }],
          }),
        },
      ],
    },
    "test-version"
  );

  assert.equal(serialized.version, "test-version");
  assert.equal(serialized._id, "dashboard-1");
  assert.equal(serialized.title, "Main");
  assert.equal(serialized.published, false);
  assert.equal(serialized.columns, 6);
  assert.equal(serialized.width, "lg");
  assert.deepEqual(serialized.settings, { theme: "dark" });
  assert.deepEqual(serialized.datasources, [
    { id: "ds1", title: "Weather", type: "json" },
  ]);
  assert.deepEqual(serialized.authProviders, [{ id: "ap1", type: "header" }]);
  assert.deepEqual(serialized.panes, [
    {
      title: "Pane 1",
      layout: { i: "pane-1", x: 0, y: 0, w: 1, h: 1 },
      widgets: [{ id: "w1", type: "text" }],
    },
  ]);
});

test("replaceDatasourceReferences rewrites only binding/path/template fields", () => {
  const settings = {
    valuePath: "Weather.current.temp",
    headerTemplate: "Now: {{ Weather.current.label }}",
    untouchedField: "Weather.current.temp",
  };

  const next = replaceDatasourceReferences(settings, "Weather", "WeatherStation");

  assert.equal(next.valuePath, "WeatherStation.current.temp");
  assert.equal(next.headerTemplate, "Now: {{ WeatherStation.current.label }}");
  assert.equal(next.untouchedField, "Weather.current.temp");
});
