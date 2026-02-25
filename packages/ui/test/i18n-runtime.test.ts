import assert from "node:assert/strict";
import test from "node:test";
import { createSSRApp } from "vue";

import {
  UI_LOCALE_AUTO,
  getUiLocaleSelection,
  i18n,
  normalizeUiLocale,
  normalizeUiLocaleSelection,
  resolveUiLocaleFromSelection,
  setUiLocaleSelection,
  translateUiText,
} from "../src/i18n/index.js";

const installRuntimeStubs = ({
  language = "en-US",
}: {
  language?: string;
} = {}) => {
  const previousWindow = globalThis.window;
  const previousNavigator = globalThis.navigator;
  const storage = new Map<string, string>();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
        removeItem(key: string) {
          storage.delete(key);
        },
      },
    },
  });

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: {
      language,
      languages: [language],
    },
  });

  return {
    storage,
    restore() {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: previousWindow,
      });
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        writable: true,
        value: previousNavigator,
      });
    },
  };
};

const readCurrentLocale = (): string => {
  return String(i18n.global.locale.value || "");
};

test("i18n runtime is composition mode and keeps global $t injection", () => {
  setUiLocaleSelection("en");

  assert.equal(i18n.mode, "composition");

  const app = createSSRApp({ render: () => null });
  app.use(i18n);

  const translator = app.config.globalProperties.$t as ((key: string) => unknown) | undefined;
  assert.equal(typeof translator, "function");
  assert.equal(String(translator?.("login.titleLogin")), "Login");
});

test("locale normalization accepts supported locale variants and falls back to default", () => {
  assert.equal(normalizeUiLocale("fr"), "fr");
  assert.equal(normalizeUiLocale("FR_fr"), "fr");
  assert.equal(normalizeUiLocale("es-MX"), "es");
  assert.equal(normalizeUiLocale("de-DE"), "de");
  assert.equal(normalizeUiLocale("unknown"), "en");
});

test("locale selection normalization supports explicit locales and auto mode", () => {
  assert.equal(normalizeUiLocaleSelection("fr-FR"), "fr");
  assert.equal(normalizeUiLocaleSelection("auto"), UI_LOCALE_AUTO);
  assert.equal(normalizeUiLocaleSelection("AUTO"), UI_LOCALE_AUTO);
  assert.equal(normalizeUiLocaleSelection("not-supported"), "en");
});

test("resolveUiLocaleFromSelection uses navigator locale when selection is auto", () => {
  const runtime = installRuntimeStubs({ language: "de-DE" });
  try {
    assert.equal(resolveUiLocaleFromSelection(UI_LOCALE_AUTO), "de");
  } finally {
    runtime.restore();
  }
});

test("setUiLocaleSelection persists explicit override and supports reset to auto", () => {
  const runtime = installRuntimeStubs({ language: "es-MX" });
  try {
    const appliedFrench = setUiLocaleSelection("fr-FR");
    assert.equal(appliedFrench, "fr");
    assert.equal(runtime.storage.get("freeboard.ui.locale"), "fr");
    assert.equal(getUiLocaleSelection(), "fr");
    assert.equal(readCurrentLocale(), "fr");

    const appliedAuto = setUiLocaleSelection(UI_LOCALE_AUTO);
    assert.equal(appliedAuto, "es");
    assert.equal(runtime.storage.has("freeboard.ui.locale"), false);
    assert.equal(getUiLocaleSelection(), UI_LOCALE_AUTO);
    assert.equal(readCurrentLocale(), "es");
  } finally {
    setUiLocaleSelection("en");
    runtime.restore();
  }
});

test("supported locales translate representative login/dashboard/share strings", () => {
  const samples = {
    fr: {
      login: "Connexion",
      dashboard: "Parametres",
      share: "Partager le tableau de bord",
    },
    es: {
      login: "Iniciar sesion",
      dashboard: "Configuracion",
      share: "Compartir panel",
    },
    de: {
      login: "Anmelden",
      dashboard: "Einstellungen",
      share: "Dashboard teilen",
    },
  } as const;

  try {
    for (const [locale, expected] of Object.entries(samples)) {
      setUiLocaleSelection(locale);
      assert.equal(translateUiText("login.titleLogin"), expected.login);
      assert.equal(translateUiText("dashboardControl.labelSettings"), expected.dashboard);
      assert.equal(translateUiText("share.title"), expected.share);
    }
  } finally {
    setUiLocaleSelection("en");
  }
});
