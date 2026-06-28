/**
 * @module i18n/index
 * @description UI i18n runtime bootstrap and locale helper utilities.
 */

import { createI18n } from "vue-i18n";
import { DEFAULT_UI_LOCALE, UI_LOCALE_MESSAGES, type UiLocale } from "./catalog.js";

const UI_LOCALE_STORAGE_KEY = "freeboard.ui.locale";
export const UI_LOCALE_AUTO = "auto";
export type UiLocaleSelection = UiLocale | typeof UI_LOCALE_AUTO;

export const normalizeUiLocale = (value: unknown): UiLocale => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace("_", "-");
  if (normalized in UI_LOCALE_MESSAGES) {
    return normalized as UiLocale;
  }

  const languageCode = normalized.split("-")[0];
  if (languageCode && languageCode in UI_LOCALE_MESSAGES) {
    return languageCode as UiLocale;
  }

  return DEFAULT_UI_LOCALE;
};

export const normalizeUiLocaleSelection = (value: unknown): UiLocaleSelection => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace("_", "-");
  if (normalized === UI_LOCALE_AUTO) {
    return UI_LOCALE_AUTO;
  }
  return normalizeUiLocale(normalized);
};

const readStoredLocaleOverride = (): UiLocale | null => {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    return normalizeUiLocale(stored);
  } catch {
    return null;
  }
};

const readNavigatorLocale = (): UiLocale => {
  if (typeof navigator === "undefined") {
    return DEFAULT_UI_LOCALE;
  }

  return normalizeUiLocale(navigator.language || navigator.languages?.[0] || DEFAULT_UI_LOCALE);
};

const applyResolvedUiLocale = (nextLocale: UiLocale): UiLocale => {
  i18n.global.locale.value = nextLocale;
  return nextLocale;
};

export const resolveInitialUiLocale = (): UiLocale =>
  readStoredLocaleOverride() || readNavigatorLocale();

export const getUiLocaleSelection = (): UiLocaleSelection =>
  readStoredLocaleOverride() || UI_LOCALE_AUTO;

export const resolveUiLocaleFromSelection = (selection: unknown): UiLocale => {
  const normalizedSelection = normalizeUiLocaleSelection(selection);
  if (normalizedSelection === UI_LOCALE_AUTO) {
    return readNavigatorLocale();
  }
  return normalizedSelection;
};

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: resolveInitialUiLocale(),
  fallbackLocale: DEFAULT_UI_LOCALE,
  messages: UI_LOCALE_MESSAGES,
});

export const setUiLocaleSelection = (nextSelection: unknown): UiLocale => {
  const selection = normalizeUiLocaleSelection(nextSelection);

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      if (selection === UI_LOCALE_AUTO) {
        window.localStorage.removeItem(UI_LOCALE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, selection);
      }
    } catch {
      // Ignore storage write failures (private mode, policy restrictions, quota issues).
    }
  }

  return applyResolvedUiLocale(resolveUiLocaleFromSelection(selection));
};

export const translateUiText = (
  key: string,
  values?: Record<string, unknown>,
  fallback?: string,
): string => {
  const translated = String(i18n.global.t(key, values || {}));
  if (fallback && translated === key) {
    return fallback;
  }
  return translated;
};
