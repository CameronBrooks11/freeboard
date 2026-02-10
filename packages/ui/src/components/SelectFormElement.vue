<script setup lang="js">
/**
 * @component SelectFormElement
 * @description Dropdown select form element that initializes with a default option and emits updates.
 *
 * @prop {string} modelValue           - Currently selected value.
 * @prop {Array<{value:string,label:string}>} options - Array of option objects.
 * @prop {string} placeholder          - Placeholder text shown as the first disabled option.
 * @prop {boolean} disabled            - Disables the select when true.
 * @prop {boolean} placeholderDisabled - Disables the placeholder option when true.
 *
 * @emits update:modelValue            - Emitted when the selection changes.
 */
defineOptions({ name: 'SelectFormElement' });

import { onMounted, ref } from "vue";

const props = defineProps(["modelValue", "options", "placeholder", "disabled", "placeholderDisabled"]);
const emit = defineEmits(["update:modelValue"]);

// Validation errors for the select element
const errors = ref([]);

/**
 * Emit the new selected value.
 *
 * @param {string} value - Newly selected option value.
 */
const onInput = (value) => {
  emit("update:modelValue", value);
};

// Initialize to the first option if no value is set
onMounted(() => {
  if (!props.modelValue && props.options?.length) {
    onInput(props.options[0].value);
  }
});

defineExpose({
  errors,
});
</script>

<template>
  <div class="select-form-element">
    <select @change="onInput($event.target.value)" :disabled="props.disabled" class="select-form-element__select">
      <option value="" :selected="modelValue === ''" v-if="placeholder" :disabled="props.placeholderDisabled">
        {{ placeholder }}
      </option>
      <option :value="option.value" v-for="option in options" :key="option.value" :selected="modelValue === option.value">
        {{ option.label }}
      </option>
    </select>
    <i class="select-form-element__icon">
      <v-icon name="hi-solid-chevron-down"></v-icon>
    </i>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/select-form-element.css");
</style>
