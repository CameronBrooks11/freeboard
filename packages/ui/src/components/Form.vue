<script setup lang="ts">
/**
 * @component Form
 * @description Renders a dynamic form from a fields schema, manages value updates and validation.
 *
 * @prop {Array<Object>} fields - Definitions for each form field.
 * @prop {Object} settings - Initial values keyed by field name.
 * @prop {boolean} hideLabels - Hide labels when true.
 * @prop {boolean} skipTranslate - Skip translation of labels/descriptions when true.
 *
 * @emits change - Emitted with the form’s current values whenever any field changes.
 */
defineOptions({ name: "Form" });

import { defineAsyncComponent, markRaw, ref, toRef, watch } from "vue";
import InputFormElement from "./InputFormElement.vue";
import { validateInteger, validateNumber, validateRequired } from "../validators";
import SwitchFormElement from "./SwitchFormElement.vue";
import SelectFormElement from "./SelectFormElement.vue";
import ArrayFormElement from "./ArrayFormElement.vue";
import { useI18n } from "vue-i18n";
import ListFormElement from "./ListFormElement.vue";
import { resolveFieldModelValue } from "../formModel";

const { t } = useI18n();

const props = defineProps({
  fields: Array,
  settings: Object,
  hideLabels: Boolean,
  skipTranslate: Boolean,
});
const hideLabels = toRef(props, "hideLabels");
const skipTranslate = toRef(props, "skipTranslate");

// Emit change events when values update
const emit = defineEmits<{
  (event: "change", value: Record<string, unknown>): void;
}>();

/**
 * Called whenever any field value changes to emit the full form value.
 */
const onUpdate = () => {
  emit("change", getValue());
};

// Store child component refs for validation
type FieldValidatorResult = { error?: string };
type FieldValidator = (value: unknown) => FieldValidatorResult;
type FormComponentRef = { hasErrors?: () => unknown; getValue?: () => Record<string, unknown> };
type FormField = {
  name: string;
  id?: string;
  label?: string;
  description?: string;
  suffix?: string;
  placeholder?: string;
  translated?: boolean;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  options?: unknown;
  settings?: unknown;
  language?: string | (() => string);
  validators?: FieldValidator[];
  component?: unknown;
  model?: unknown;
};

const components = ref<Record<string, FormComponentRef | null>>({});
const isFormComponentRef = (value: unknown): value is FormComponentRef =>
  Boolean(value) && typeof value === "object";

/**
 * Build an object of current form values from field models.
 */
const getValue = () => {
  const value: Record<string, unknown> = {};
  formFields.value.forEach((field: FormField) => {
    if (!field.name) {
      return;
    }
    value[field.name] = field.model;
  });
  return value;
};

/**
 * Save a reference to a child form element by name.
 */
const storeComponentRef = (name: string, el: unknown) => {
  components.value[name] = isFormComponentRef(el) ? el : null;
};

/**
 * Programmatically set a field value by name.
 *
 * @param {string} name
 * @param {any} value
 */
const setFieldValue = (name: string, value: unknown) => {
  const field = formFields.value.find((entry: FormField) => entry.name === name);
  if (!field) {
    return;
  }
  field.model = value;
};

// Track validation errors keyed by field name
const errors = ref<Record<string, string[]>>({});

/**
 * Run all validators on each field and collect errors.
 * @returns {Object|null} Error map or null if none
 */
const hasErrors = () => {
  const e: Record<string, string[]> = {};
  Object.keys(components.value).forEach((key) => {
    const result = validateField(key);
    if (result) {
      e[key] = result;
    }
  });
  if (Object.keys(e).length) {
    errors.value = e;
    return e;
  } else {
    errors.value = {};
    return null;
  }
};

/**
 * Validate a single field by running its validators.
 * @param {string} key - Field name
 * @returns {Array<string>|null} List of error messages or null
 */
const validateField = (key: string): string[] | null => {
  const e: string[] = [];
  const field = formFields.value.find((f: FormField) => f.name === key);

  field?.validators?.forEach((validator: FieldValidator) => {
    const modelValue = field?.model;
    const result = validator(modelValue);

    if (result.error) {
      e.push(result.error);
    }
  });
  return e.length ? e : null;
};

// Mark form element components as raw to avoid proxy wrapping
const inputFormElementRef = markRaw(InputFormElement);
const switchFormElementRef = markRaw(SwitchFormElement);
const selectFormElementRef = markRaw(SelectFormElement);
const arrayFormElementRef = markRaw(ArrayFormElement);
const codeEditorFormElementRef = markRaw(
  defineAsyncComponent(() => import("./CodeEditorFormElement.vue")),
);
const listFormElementRef = markRaw(ListFormElement);

/**
 * Ensure any asynchronous field option definitions are resolved before rendering.
 * @param {Object} field - Field schema
 * @returns {Promise<Object>} Field with options resolved
 */
const resolveFieldOptions = async (field: FormField): Promise<FormField> => {
  const promises: Promise<unknown>[] = [];
  if (typeof field.options === "object") {
    promises.push(Promise.resolve(field.options));
  }

  await Promise.all(promises);
  return field;
};

/**
 * Translate labels, descriptions, suffixes, and placeholders if needed.
 * @param {Object} field - Field schema
 * @returns {Object} Translated field schema
 */
const translateField = (field: FormField): FormField => {
  if (skipTranslate.value || field.translated) {
    return field;
  }
  if (field.label) {
    field.label = t(field.label);
  }

  if (field.description) {
    field.description = t(field.description);
  }

  if (field.suffix) {
    field.suffix = t(field.suffix);
  }

  if (field.placeholder) {
    field.placeholder = t(field.placeholder);
  }

  if (Array.isArray(field.settings)) {
    field.settings.forEach((entry: unknown) => translateField(entry as FormField));
  }

  if (Array.isArray(field.options)) {
    field.options.forEach((entry: unknown) => translateField(entry as FormField));
  }

  field.translated = true;

  return field;
};

/**
 * Map a field schema to its component type and attach validators.
 * @param {Object} field - Raw field definition
 * @returns {Object} Extended field with component and validators
 */
const fieldToFormElement = (field: FormField): FormField => {
  const validators: FieldValidator[] = [];
  const customValidators = Array.isArray(field.validators)
    ? (field.validators as FieldValidator[])
    : [];
  let type = null;
  if (field.type === "number") {
    if (field.required) {
      validators.push(validateRequired as FieldValidator, validateNumber as FieldValidator);
    } else {
      validators.push(validateNumber as FieldValidator);
    }
    type = inputFormElementRef;
  } else if (field.type === "text") {
    if (field.required) {
      validators.push(validateRequired as FieldValidator);
    }
    type = inputFormElementRef;
  } else if (field.type === "integer") {
    if (field.required) {
      validators.push(validateRequired as FieldValidator, validateInteger as FieldValidator);
    } else {
      validators.push(validateInteger as FieldValidator);
    }
    type = inputFormElementRef;
  } else if (field.type === "boolean") {
    type = switchFormElementRef;
  } else if (field.type === "option") {
    type = selectFormElementRef;
  } else if (field.type === "calculated") {
    if (field.required) {
      validators.push(validateRequired as FieldValidator);
    }
    type = codeEditorFormElementRef;
  } else if (field.type === "array") {
    if (field.required) {
      validators.push(validateRequired as FieldValidator);
    }
    type = arrayFormElementRef;
  } else if (field.type === "password") {
    if (field.required) {
      validators.push(validateRequired as FieldValidator);
    }
    type = inputFormElementRef;
  } else if (field.type === "code") {
    if (field.required) {
      validators.push(validateRequired as FieldValidator);
    }
    type = codeEditorFormElementRef;
  } else if (field.type === "list") {
    if (field.required) {
      validators.push(validateRequired as FieldValidator);
    }
    type = listFormElementRef;
  }

  const normalizedField: FormField = {
    ...field,
    component: type,
    validators: [...customValidators, ...validators],
    model: field.model,
  };
  if (!normalizedField.id) {
    normalizedField.id = `form-field-${field.name}`;
  }
  return normalizedField;
};

// Expose methods for parent components (DialogBox) to call
defineExpose({
  getValue,
  hasErrors,
  setFieldValue,
});

// Reactive reference for processed fields
const formFields = ref<FormField[]>([]);

// Watch for prop changes to rebuild field components
const f = toRef(props, "fields");
const s = toRef(props, "settings");

watch(
  [f, s],
  async () => {
    // Build, translate, and resolve each field definition.
    const resolvedFields = await Promise.all(
      ((f.value as FormField[] | undefined) || [])
        .map(fieldToFormElement)
        .map(translateField)
        .map(resolveFieldOptions),
    );

    // Initialize each field’s model before publishing into reactive state.
    resolvedFields.forEach((field: FormField) => {
      const value = resolveFieldModelValue(field, (s.value as Record<string, unknown>) || {});
      field.model = value;
    });

    formFields.value = resolvedFields;
  },
  {
    immediate: true,
  },
);

watch(
  formFields,
  () => {
    onUpdate();
  },
  { deep: true },
);
</script>

<template>
  <div class="form">
    <div class="form__row" v-for="field in formFields" :key="field.name">
      <div class="form__row__label" v-if="!hideLabels">
        <label :for="field.id">{{ field.label }}</label>
      </div>
      <div class="form__row__value">
        <div class="form__row__value__container">
          <component
            :ref="(el: unknown) => storeComponentRef(field.name, el)"
            :is="field.component"
            :disabled="field.disabled"
            v-model="field.model"
            :id="field.id"
            :aria-label="field.label"
            :options="field.options || field.settings"
            :placeholder="field.placeholder"
            :secret="field.type === 'password'"
            :language="field.language"
          ></component>
        </div>
        <template v-if="errors[field.name]">
          <div
            class="form__row__value__error"
            v-for="error in errors[field.name]"
            :key="`${field.name}-${error}`"
          >
            {{ error }}
          </div>
        </template>
        <div class="form__row__value__description" v-if="field.description">
          {{ field.description }}
        </div>
      </div>
      <div class="form__row__suffix" v-if="field.suffix">
        {{ field.suffix }}
      </div>
    </div>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/form.css");
</style>
