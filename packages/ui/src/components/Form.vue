<script setup lang="js">
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
defineOptions({ name: 'Form' });

import {
  markRaw,
  onMounted,
  reactive,
  ref,
  toRef,
  watch,
} from "vue";
import InputFormElement from "./InputFormElement.vue";
import {
  validateInteger,
  validateNumber,
  validateRequired,
} from "../validators";
import SwitchFormElement from "./SwitchFormElement.vue";
import SelectFormElement from "./SelectFormElement.vue";
import ArrayFormElement from "./ArrayFormElement.vue";
import CodeEditorFormElement from "./CodeEditorFormElement.vue";
import { useI18n } from "vue-i18n";
import ListFormElement from "./ListFormElement.vue";

const { t } = useI18n();

// Destructure props, isolating hideLabels and skipTranslate flags
const { hideLabels, skipTranslate, ...props } = defineProps({
  fields: Array,
  settings: Object,
  hideLabels: Boolean,
  skipTranslate: Boolean,
});

// Emit change events when values update
const emit = defineEmits(["change"]);

/**
 * Called whenever any field value changes to emit the full form value.
 */
const onUpdate = () => {
  emit("change", getValue());
};

// Store child component refs for validation
const components = ref({});

/**
 * Build an object of current form values from field models.
 */
const getValue = () => {
  const value = {};
  fields.value.forEach((field) => {
    value[field.name] = field.model;
  });
  return value;
};

/**
 * Save a reference to a child form element by name.
 */
const storeComponentRef = (name, el) => {
  components.value[name] = el;
};

// Track validation errors keyed by field name
const errors = ref({});

/**
 * Run all validators on each field and collect errors.
 * @returns {Object|null} Error map or null if none
 */
const hasErrors = () => {
  const e = {};
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
const validateField = (key) => {
  const e = [];
  const field = fields.value.find((f) => f.name === key);

  field?.validators.forEach((validator) => {
    const result = validator(field.model);

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
const codeEditorFormElementRef = markRaw(CodeEditorFormElement);
const listFormElementRef = markRaw(ListFormElement);

/**
 * Ensure any asynchronous field option definitions are resolved before rendering.
 * @param {Object} field - Field schema
 * @returns {Promise<Object>} Field with options resolved
 */
const resolveFieldOptions = async (field) => {
  const promises = [];
  if (typeof field.options === 'object') {
    promises.push(field.options);
  }

  await Promise.all(promises);
  return field;
};

/**
 * Translate labels, descriptions, suffixes, and placeholders if needed.
 * @param {Object} field - Field schema
 * @returns {Object} Translated field schema
 */
const translateField = (field) => {
  if (skipTranslate || field.translated) {
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
    field.settings.forEach(translateField);
  }

  if (Array.isArray(field.options)) {
    field.options.forEach(translateField);
  }

  field.translated = true;

  return field;
};

/**
 * Map a field schema to its component type and attach validators.
 * @param {Object} field - Raw field definition
 * @returns {Object} Extended field with component and validators
 */
const fieldToFormElement = (field) => {
  const validators = [];
  let type = null;
  if (field.type === "number") {
    if (field.required) {
      validators.push(validateRequired, validateNumber);
    } else {
      validators.push(validateNumber);
    }
    type = inputFormElementRef;
  } else if (field.type === "text") {
    if (field.required) {
      validators.push(validateRequired);
    }
    type = inputFormElementRef;
  } else if (field.type === "integer") {
    if (field.required) {
      validators.push(validateRequired, validateInteger);
    } else {
      validators.push(validateInteger);
    }
    type = inputFormElementRef;
  } else if (field.type === "boolean") {
    type = switchFormElementRef;
  } else if (field.type === "option") {
    type = selectFormElementRef;
  } else if (field.type === "calculated") {
    if (field.required) {
      validators.push(validateRequired);
    }
    type = codeEditorFormElementRef;
  } else if (field.type === "array") {
    if (field.required) {
      validators.push(validateRequired);
    }
    type = arrayFormElementRef;
  } else if (field.type === "password") {
    if (field.required) {
      validators.push(validateRequired);
    }
    type = inputFormElementRef;
  } else if (field.type === "code") {
    if (field.required) {
      validators.push(validateRequired);
    }
    type = codeEditorFormElementRef;
  } else if (field.type === "list") {
    if (field.required) {
      validators.push(validateRequired);
    }
    type = listFormElementRef;
  }

  return { ...field, component: type, validators };
};

// Expose methods for parent components (DialogBox) to call
defineExpose({
  getValue,
  hasErrors,
});

// Reactive reference for processed fields
const fields = ref(null);

// Watch for prop changes to rebuild field components
const f = toRef(props, "fields");
const s = toRef(props, "settings");

watch([f, s], async () => {
  // Build, translate, and resolve each field definition
  fields.value = await Promise.all(
    f.value
      .map(fieldToFormElement)
      .map(translateField)
      .map(resolveFieldOptions)
  );
  // Initialize each field’s model and watch for changes
  fields.value.forEach((field) => {
    const value = field.model?.value || s.value[field.name] || field.default;
    const r = ref(value);
    field.model = r;
    watch(r, onUpdate);
  });
}, {
  immediate: true
});
</script>

<template>
  <div class="form">
    <div class="form__row" v-for="field in fields">
      <div class="form__row__label" v-if="!hideLabels">
        <label>{{ field.label }}</label>
      </div>
      <div class="form__row__value">
        <div class="form__row__value__container">
          <component :ref="(el) => storeComponentRef(field.name, el)" :is="field.component" :disabled="field.disabled"
            v-model="field.model" :options="field.options || field.settings" :placeholder="field.placeholder"
            :secret="field.type === 'password'" :language="field.language"></component>
        </div>
        <div class="form__row__value__error" v-for="error in errors[field.name]" v-if="errors[field.name]">
          {{ error }}
        </div>
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
