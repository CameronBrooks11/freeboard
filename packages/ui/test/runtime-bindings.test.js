import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeDatasourceValue,
  resolveBinding,
  resolveTemplate,
  toPathSegments,
} from "../src/widgets/runtime/bindings.js";

test("toPathSegments parses dot + bracket notation", () => {
  const parts = toPathSegments("datasources.weather.hourly[0]['temp_c']");
  assert.deepEqual(parts, ["datasources", "weather", "hourly", 0, "temp_c"]);
});

test("resolveBinding supports datasources.<id> paths", () => {
  const snapshot = {
    datasources: {
      weather: {
        current: { temp_c: 21.3 },
      },
    },
  };

  assert.equal(
    resolveBinding("datasources.weather.current.temp_c", snapshot),
    21.3
  );
});

test("resolveBinding supports datasource title aliases when unambiguous", () => {
  const snapshot = {
    datasources: {
      ds1: { current: { temp_c: 19.1 } },
    },
    datasourceTitles: {
      WeatherNow: "ds1",
    },
  };

  assert.equal(resolveBinding("WeatherNow.current.temp_c", snapshot), 19.1);
});

test("resolveTemplate substitutes bindings and blanks missing values", () => {
  const snapshot = {
    datasources: {
      cpu: { percent: 73 },
    },
  };

  const value = resolveTemplate(
    "CPU: {{ datasources.cpu.percent }}% / {{ datasources.cpu.missing }}",
    snapshot
  );
  assert.equal(value, "CPU: 73% / ");
});

test("normalizeDatasourceValue unwraps datasource envelopes", () => {
  assert.deepEqual(normalizeDatasourceValue({ data: { value: 42 } }), { value: 42 });
  assert.equal(normalizeDatasourceValue(5), 5);
});
