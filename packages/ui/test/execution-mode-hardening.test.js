import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  clearRuntimeExecutionMode,
  setRuntimeExecutionMode,
} from "../src/executionPolicy.js";
import { BaseWidget } from "../src/widgets/BaseWidget.js";
import { HtmlWidget } from "../src/widgets/HtmlWidget.js";

const originalDocument = globalThis.document;

const createFakeElement = () => {
  const children = [];
  return {
    style: {},
    children,
    contentWindow: {
      postMessage() {},
    },
    appendChild(node) {
      children.push(node);
      return node;
    },
    append(...nodes) {
      children.push(...nodes);
    },
    remove() {
      this.removed = true;
    },
    set textContent(value) {
      this._textContent = value;
    },
    get textContent() {
      return this._textContent || "";
    },
    set innerHTML(value) {
      this._innerHTML = value;
    },
    get innerHTML() {
      return this._innerHTML || "";
    },
  };
};

beforeEach(() => {
  globalThis.document = {
    createElement() {
      return createFakeElement();
    },
  };
  clearRuntimeExecutionMode();
});

afterEach(() => {
  clearRuntimeExecutionMode();
  globalThis.document = originalDocument;
});

test("BaseWidget template suppresses script/resources while execution mode is safe", () => {
  setRuntimeExecutionMode("safe");

  const template = BaseWidget.template({
    style: "",
    html: "<div>safe</div>",
    script: "window.hacked = true;",
    resources: [{ asset: "https://cdn.example.com/widget.js" }],
  });

  assert.equal(template.includes("window.hacked = true;"), false);
  assert.equal(
    template.includes('src="https://cdn.example.com/widget.js"'),
    false
  );
});

test("BaseWidget template includes script/resources while execution mode is trusted", () => {
  setRuntimeExecutionMode("trusted");

  const template = BaseWidget.template({
    style: "",
    html: "<div>trusted</div>",
    script: "window.trusted = true;",
    resources: [{ asset: "https://cdn.example.com/widget.js" }],
  });

  assert.equal(template.includes("window.trusted = true;"), true);
  assert.equal(
    template.includes('src="https://cdn.example.com/widget.js"'),
    true
  );
});

test("BaseWidget applies strict iframe sandbox defaults in safe mode", () => {
  setRuntimeExecutionMode("safe");

  const widget = new BaseWidget({
    style: "",
    html: "<p>safe</p>",
    script: "window.hacked = true;",
    resources: [{ asset: "https://cdn.example.com/widget.js" }],
  });

  assert.equal(widget.iframeElement.sandbox, "allow-forms");
  assert.equal(widget.iframeElement.allow, undefined);
});

test("HtmlWidget treats trusted_html mode as plain text in safe mode", () => {
  setRuntimeExecutionMode("safe");

  const widget = new HtmlWidget({
    mode: "trusted_html",
  });

  widget.onInputsChanged({
    header: "",
    content: "<strong>unsafe</strong>",
  });

  assert.equal(widget.contentElement.textContent, "<strong>unsafe</strong>");
  assert.equal(widget.contentElement.innerHTML, "");
});

test("HtmlWidget allows trusted_html rendering when execution mode is trusted", () => {
  setRuntimeExecutionMode("trusted");

  const widget = new HtmlWidget({
    mode: "trusted_html",
  });

  widget.onInputsChanged({
    header: "",
    content: "<strong>trusted</strong>",
  });

  assert.equal(widget.contentElement.innerHTML, "<strong>trusted</strong>");
});
