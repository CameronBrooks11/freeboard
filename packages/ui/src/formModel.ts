type FieldModel = { value?: unknown };
type FormField = {
  name?: string;
  model?: FieldModel;
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
  const currentModelValue = field?.model?.value;
  const fieldName = typeof field?.name === "string" ? field.name : "";
  const hasExplicitSetting = fieldName
    ? Object.prototype.hasOwnProperty.call(settings, fieldName)
    : false;
  const settingValue = hasExplicitSetting ? settings[fieldName] : undefined;
  return currentModelValue ?? settingValue ?? field?.default;
};
