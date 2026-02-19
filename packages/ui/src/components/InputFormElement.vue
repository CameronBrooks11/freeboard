<script setup lang="ts">
/**
 * @component InputFormElement
 * @description Basic text or password input form element that syncs with v-model.
 *
 * @prop {string} modelValue - The current input value.
 * @prop {boolean} secret     - When true, renders as password type.
 * @prop {boolean} disabled   - When true, disables the input.
 *
 * @emits update:modelValue   - Emitted on input or focusout with the new value.
 */
defineOptions({ name: "InputFormElement" });

const props = defineProps(["modelValue", "secret", "disabled"]);
const emit = defineEmits(["update:modelValue"]);

/**
 * Handle input and focusout events by emitting the updated value.
 *
 * @param {string} value - New input value from the event.
 */
const onInput = (value: string) => {
  emit("update:modelValue", value);
};

const readInputValue = (event: Event) => {
  onInput((event.target as HTMLInputElement)?.value ?? "");
};
</script>

<template>
  <input
    class="input-form-element"
    :type="props.secret ? 'password' : 'text'"
    :value="props.modelValue"
    :disabled="props.disabled"
    @input="readInputValue"
    @focusout="readInputValue"
  />
</template>

<style lang="css" scoped>
@import url("../assets/css/components/input-form-element.css");
</style>
