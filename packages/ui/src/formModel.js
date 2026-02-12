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
export const resolveFieldModelValue = (field, settings = {}) => {
  const currentModelValue = field?.model?.value;
  const hasExplicitSetting = Object.prototype.hasOwnProperty.call(
    settings,
    field?.name
  );
  const settingValue = hasExplicitSetting ? settings[field.name] : undefined;
  return currentModelValue ?? settingValue ?? field?.default;
};

