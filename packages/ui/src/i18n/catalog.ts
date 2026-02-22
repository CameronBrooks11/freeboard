/**
 * @module i18n/catalog
 * @description Canonical locale message catalog and locale type metadata.
 */

import { en } from "./locales/en.js";

export const UI_LOCALE_MESSAGES = Object.freeze({
  en,
});

export type UiLocale = keyof typeof UI_LOCALE_MESSAGES;

export const DEFAULT_UI_LOCALE: UiLocale = "en";
