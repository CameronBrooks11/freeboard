import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { ReactiveWidget } from "../src/widgets/runtime/ReactiveWidget.js";

const createFakeElement = () => {
  const children = [];
  return {
    style: {},
    children,
    removed: false,
    appendChild(node) {
      children.push(node);
      return node;
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
  };
});

afterEach(() => {
  globalThis.document = originalDocument;
});

class TestReactiveWidget extends ReactiveWidget {
  resolveInputs() {
    return {
      value: this.getBinding("datasources.weather.current.temp"),
      text: this.getTemplate("Temp: {{ datasources.weather.current.temp }}"),
    };
  }

  onInputsChanged(inputs) {
    this.lastInputs = inputs;
  }

  onError(error) {
    this.capturedError = error;
  }
}

test("ReactiveWidget resolves bindings from snapshot update context", () => {
  const widget = new TestReactiveWidget({});
  const snapshot = {
    datasources: {
      weather: {
        current: {
          temp: 22,
        },
      },
    },
  };

  widget.processDatasourceUpdate({ id: "weather", title: "Weather" }, { snapshot });

  assert.equal(widget.lastInputs.value, 22);
  assert.equal(widget.lastInputs.text, "Temp: 22");
  assert.equal(widget.lastError, null);
  assert.equal(widget.context.changedDatasourceId, "weather");
});

test("ReactiveWidget captures runtime errors without throwing", () => {
  class ExplodingWidget extends ReactiveWidget {
    resolveInputs() {
      throw new Error("boom");
    }

    onError(error) {
      this.capturedError = error;
    }
  }

  const widget = new ExplodingWidget({});
  widget.refresh();

  assert.ok(widget.lastError);
  assert.equal(widget.capturedError.message, "boom");
});

test("ReactiveWidget onDispose removes the widget element", () => {
  const widget = new TestReactiveWidget({});
  const element = createFakeElement();
  widget.render(element);
  widget.onDispose();
  assert.equal(widget.widgetElement.removed, true);
});
