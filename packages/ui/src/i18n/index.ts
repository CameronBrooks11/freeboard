/**
 * @module i18n/index
 * @description UI i18n runtime bootstrap and locale helper utilities.
 */

import { createI18n } from "vue-i18n";
import { DEFAULT_UI_LOCALE, UI_LOCALE_MESSAGES, type UiLocale } from "./catalog.js";

const UI_LOCALE_STORAGE_KEY = "freeboard.ui.locale";

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

const readStoredLocale = (): UiLocale | null => {
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

export const resolveInitialUiLocale = (): UiLocale => readStoredLocale() || readNavigatorLocale();

export const i18n = createI18n({
  locale: resolveInitialUiLocale(),
  fallbackLocale: DEFAULT_UI_LOCALE,
  messages: UI_LOCALE_MESSAGES,
});

export const setUiLocale = (nextLocale: unknown): UiLocale => {
  const normalized = normalizeUiLocale(nextLocale);
  const localeTarget = i18n.global.locale as unknown;
  if (localeTarget && typeof localeTarget === "object" && "value" in localeTarget) {
    (localeTarget as { value: string }).value = normalized;
  } else {
    (i18n.global as { locale: string }).locale = normalized;
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage write failures (private mode, policy restrictions, quota issues).
    }
  }

  return normalized;
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
