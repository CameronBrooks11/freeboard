import assert from "node:assert/strict";
import test from "node:test";

const installThemeRuntimeDomStubs = ({
  prefersDark = false,
  mediaQueryOverrides = {},
}: {
  prefersDark?: boolean;
  mediaQueryOverrides?: Record<string, unknown>;
} = {}) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  const attributes = new Map<string, string>();
  const documentElement = {
    style: {},
    setAttribute(name: string, value: string) {
      attributes.set(name, String(value));
    },
    getAttribute(name: string) {
      return attributes.get(name) || null;
    },
  };

  const matchMediaResult = {
    matches: prefersDark,
    ...mediaQueryOverrides,
  };

  globalThis.document = {
    documentElement,
  };

  globalThis.window = {
    matchMedia() {
      return matchMediaResult;
    },
  };

  return {
    documentElement,
    matchMediaResult,
    restore() {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    },
  };
};

test("applyDashboardThemeSelection applies canonical selection and resolved theme metadata", async () => {
  const { applyDashboardThemeSelection } = await import("../src/ui/themeRuntime.js");
  const { documentElement, restore } = installThemeRuntimeDomStubs();

  try {
    const selectionResult = applyDashboardThemeSelection("slate");
    assert.equal(selectionResult.selection, "slate");
    assert.equal(selectionResult.resolvedTheme, "slate");
    assert.equal(documentElement.getAttribute("data-theme-selection"), "slate");
    assert.equal(documentElement.getAttribute("data-theme"), "slate");
    assert.equal(documentElement.style.colorScheme, "dark");

    const paperResult = applyDashboardThemeSelection("paper");
    assert.equal(paperResult.selection, "paper");
    assert.equal(paperResult.resolvedTheme, "paper");
    assert.equal(documentElement.getAttribute("data-theme-selection"), "paper");
    assert.equal(documentElement.getAttribute("data-theme"), "paper");
    assert.equal(documentElement.style.colorScheme, "light");

    const autoResult = applyDashboardThemeSelection("not-real-theme");
    assert.equal(autoResult.selection, "auto");
    assert.equal(autoResult.resolvedTheme, "light");
    assert.equal(documentElement.getAttribute("data-theme-selection"), "auto");
    assert.equal(documentElement.getAttribute("data-theme"), "light");
    assert.equal(documentElement.style.colorScheme, "light");
  } finally {
    restore();
  }
});

test("subscribeToSystemThemeChanges wires/unwires media-query listeners", async () => {
  const { subscribeToSystemThemeChanges } = await import("../src/ui/themeRuntime.js");
  let subscribedListener: (() => void) | null = null;
  let removedListener: (() => void) | null = null;
  const { restore } = installThemeRuntimeDomStubs({
    mediaQueryOverrides: {
      addEventListener(_event: string, callback: () => void) {
        subscribedListener = callback;
      },
      removeEventListener(_event: string, callback: () => void) {
        removedListener = callback;
      },
    },
  });

  try {
    let callCount = 0;
    const unsubscribe = subscribeToSystemThemeChanges(() => {
      callCount += 1;
    });

    assert.ok(subscribedListener);
    subscribedListener?.();
    assert.equal(callCount, 1);

    unsubscribe();
    assert.equal(removedListener, subscribedListener);
  } finally {
    restore();
  }
});
