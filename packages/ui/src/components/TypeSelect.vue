<script setup lang="js">
/**
 * @component TypeSelect
 * @description Dropdown select for choosing a type, with label and placeholder support.
 *
 * @prop {string} modelValue               - Currently selected type value.
 * @prop {Array<{value:string,label:string}>} options - Available type options.
 *
 * @emits update:modelValue               - Emitted when the selection changes.
 */
defineOptions({ name: 'TypeSelect' });

import { ref, watch } from 'vue';
import SelectFormElement from './SelectFormElement.vue';

const props = defineProps(["modelValue", "options"]);
const emit = defineEmits(["update:modelValue"]);

const select = ref(props.modelValue);

// Emit only when local change differs from prop (avoid feedback loops)
watch(select, (v) => {
  if (v !== props.modelValue) emit("update:modelValue", v);
});

// Keep local ref in sync when parent updates v-model
watch(() => props.modelValue, (v) => {
  if (v !== select.value) select.value = v;
});
</script>

<template>
  <div class="type-select">
    <div class="type-select__form__row">
      <div class="type-select__form__row__label">
        <label>{{ $t("typeSelect.labelType") }}</label>
      </div>
      <div class="type-select__form__row__value">
        <SelectFormElement v-model="select" :options="props.options" :placeholder="$t('typeSelect.placeholderType')"
          :placeholderDisabled="true" />
      </div>
    </div>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/type-select.css");
</style>
