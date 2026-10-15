type FormField = {
  name?: string;
  model?: unknown;
  default?: unknown;
};

/**
 * Resolve a field model value using nullish-aware precedence.
 *
 * Precedence:
 * 1) Existing field model value
 * 2) Explicit setting value (including false/0/"")
 * 3) Field default
 *
 * @param {Object} field - Form field definition.
 * @param {Object} [settings={}] - Current settings object.
 * @returns {*}
 */
export const resolveFieldModelValue = (
  field: FormField,
  settings: Record<string, unknown> = {},
): unknown => {
  const currentModelValue = field?.model;
  const fieldName = typeof field?.name === "string" ? field.name : "";
  const hasExplicitSetting = fieldName
    ? Object.prototype.hasOwnProperty.call(settings, fieldName)
    : false;
  const settingValue = hasExplicitSetting ? settings[fieldName] : undefined;
  return currentModelValue ?? settingValue ?? field?.default;
};

/**
 * Validate every form section and return the name of the first one with errors.
 *
 * Every section's `hasErrors()` runs, so each form renders its own errors even
 * when an earlier section has already failed.
 *
 * @param {Array<Object>} sections - Sections in tab order, each with a `name`.
 * @param {Object} forms - Form components keyed by section name.
 * @returns {string|null} Name of the first section with errors, or null.
 */
export const findFirstInvalidSection = (
  sections: Array<{ name: string }>,
  forms: Record<string, { hasErrors?: () => unknown } | null | undefined>,
): string | null => {
  let firstInvalid: string | null = null;
  sections.forEach(({ name }) => {
    if (forms[name]?.hasErrors?.() && firstInvalid === null) {
      firstInvalid = name;
    }
  });
  return firstInvalid;
};
