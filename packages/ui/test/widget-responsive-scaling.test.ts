import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { GaugeWidget } from "../src/widgets/GaugeWidget.js";
import { IndicatorWidget } from "../src/widgets/IndicatorWidget.js";
import { TextWidget } from "../src/widgets/TextWidget.js";

const createFakeElement = () => {
  const children = [];
  return {
    style: {},
    children,
    textContent: "",
    append(...nodes) {
      children.push(...nodes);
    },
    appendChild(node) {
      children.push(node);
      return node;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
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

test("TextWidget scales typography down for narrow panes", () => {
  const widget = new TextWidget({
    size: "big",
    valuePath: "datasources.metrics.value",
  });

  assert.equal(widget.valueElement.style.fontSize, "56px");
  widget.onResize({ width: 220, height: 120 });
  assert.equal(widget.valueElement.style.fontSize, "40px");
  assert.equal(widget.headerElement.style.fontSize, "11px");
});

test("IndicatorWidget reduces indicator and label sizing in narrow panes", () => {
  const widget = new IndicatorWidget({
    valuePath: "datasources.metrics.online",
  });

  assert.equal(widget.lightElement.style.width, "18px");
  widget.onResize({ width: 200, height: 120 });
  assert.equal(widget.lightElement.style.width, "14px");
  assert.equal(widget.labelElement.style.fontSize, "13px");
});

test("GaugeWidget adapts gauge diameter and typography on resize", () => {
  const widget = new GaugeWidget({
    valuePath: "datasources.metrics.value",
  });

  widget.onResize({ width: 220, height: 160 });
  assert.equal(widget.gaugeWrap.style.width, "170px");
  assert.equal(widget.valueElement.style.fontSize, "22px");
});
