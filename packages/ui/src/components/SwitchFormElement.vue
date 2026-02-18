<script setup lang="ts">
/**
 * @component SwitchFormElement
 * @description Toggle switch form element for boolean values.
 *
 * @prop {boolean} modelValue - Current boolean state of the switch.
 * @prop {boolean} disabled   - Disable interaction when true.
 *
 * @emits update:modelValue   - Emitted when the switch value changes.
 */
defineOptions({ name: "SwitchFormElement" });

import { ref } from "vue";

const props = defineProps(["modelValue", "disabled"]);
const emit = defineEmits(["update:modelValue"]);

// Validation errors placeholder
const errors = ref([]);

// Unique ID for the switch input and label association
const id = `switch-${new Date().getTime()}`;

/**
 * Handle change event by emitting the updated boolean value.
 *
 * @param {boolean} value - New checked state from the checkbox input.
 */
const onChangeValue = (value: boolean) => {
  emit("update:modelValue", value);
};

const onChange = (event: Event) => {
  onChangeValue((event.target as HTMLInputElement)?.checked ?? false);
};

defineExpose({
  errors,
});
</script>

<template>
  <div class="switch-form-element">
    <input
      :id="id"
      type="checkbox"
      name="switch"
      :checked="props.modelValue"
      class="switch-form-element__checkbox"
      :disabled="props.disabled"
      @change="onChange"
    />
    <label class="switch-form-element__label" :for="id">
      <div class="switch-form-element__label__inner">
        <span class="switch-form-element__label__inner__on">
          {{ $t("switchFormElement.labelOn") }}
        </span>
        <span class="switch-form-element__label__inner__off">
          {{ $t("switchFormElement.labelOff") }}
        </span>
      </div>
      <div class="switch-form-element__label__switch"></div>
    </label>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/switch-form-element.css");
</style>
