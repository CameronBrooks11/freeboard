/**
 * @module i18n/catalog
 * @description Canonical locale message catalog and locale type metadata.
 */

import { de } from "./locales/de.js";
import { en } from "./locales/en.js";
import { es } from "./locales/es.js";
import { fr } from "./locales/fr.js";

export const UI_LOCALE_MESSAGES = Object.freeze({
  en,
  fr,
  es,
  de,
});

export type UiLocale = keyof typeof UI_LOCALE_MESSAGES;

export const DEFAULT_UI_LOCALE: UiLocale = "en";

export const UI_LOCALE_OPTIONS = Object.freeze(
  Object.keys(UI_LOCALE_MESSAGES) as UiLocale[],
) as readonly UiLocale[];
