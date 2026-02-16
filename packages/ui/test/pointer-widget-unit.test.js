import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { PointerWidget } from "../src/widgets/PointerWidget.js";

const createFakeElement = () => {
  const children = [];
  return {
    style: {},
    children,
    textContent: "",
    removed: false,
    append(...nodes) {
      children.push(...nodes);
    },
    appendChild(node) {
      children.push(node);
      return node;
    },
    setAttribute() {},
    remove() {
      this.removed = true;
    },
  };
};

const originalDocument = globalThis.document;

beforeEach(() => {
  globalThis.document = {
    createElement() {
      return createFakeElement();
    },
    createElementNS() {
      return createFakeElement();
    },
  };
});

afterEach(() => {
  globalThis.document = originalDocument;
});

const runPointerUpdate = (settings, snapshot) => {
  const widget = new PointerWidget(settings);
  widget.processDatasourceUpdate({ id: "wind", title: "Wind" }, { snapshot });
  return widget;
};

test("PointerWidget uses default angle unit fallback when unit is not configured", () => {
  const widget = runPointerUpdate(
    {
      anglePath: "datasources.wind.angle",
    },
    {
      datasources: {
        wind: {
          angle: 182.4,
        },
      },
    },
  );

  assert.equal(widget.valueElement.textContent, "182°");
});

test("PointerWidget uses configured angle unit fallback when no bound unit is provided", () => {
  const widget = runPointerUpdate(
    {
      anglePath: "datasources.wind.angle",
      angleUnitText: " deg",
    },
    {
      datasources: {
        wind: {
          angle: 90.1,
        },
      },
    },
  );

  assert.equal(widget.valueElement.textContent, "90 deg");
});

test("PointerWidget bound angle unit overrides configured fallback unit", () => {
  const widget = runPointerUpdate(
    {
      anglePath: "datasources.wind.angle",
      angleUnitText: " deg",
      angleUnitPath: "datasources.wind.angleUnit",
    },
    {
      datasources: {
        wind: {
          angle: 45.9,
          angleUnit: " rad",
        },
      },
    },
  );

  assert.equal(widget.valueElement.textContent, "46 rad");
});

test("PointerWidget value text still overrides numeric angle fallback rendering", () => {
  const widget = runPointerUpdate(
    {
      anglePath: "datasources.wind.angle",
      angleUnitText: " deg",
      valueText: "NNE",
    },
    {
      datasources: {
        wind: {
          angle: 22.6,
        },
      },
    },
  );

  assert.equal(widget.valueElement.textContent, "NNE");
});
