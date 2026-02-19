<script setup lang="ts">
/**
 * @component ArrayFormElement
 * @description Renders and manages an array of objects in a table, with add/remove controls.
 *
 * @prop {Array<Object>} modelValue - Current array value.
 * @prop {Array<Object>} options    - Field definitions for each array item.
 *
 * @emits update:modelValue - Emitted when the array value is updated.
 */
defineOptions({ name: "ArrayFormElement" });

import { ref, watch } from "vue";
import Form from "./Form.vue";
import ActionButton from "./ActionButton.vue";

type ArrayField = { name: string; label?: string };
type ArrayItem = Record<string, unknown>;

const props = defineProps<{
  modelValue: ArrayItem[];
  options: ArrayField[];
}>();
const emit = defineEmits(["update:modelValue"]);

const errors = ref<string[]>([]);
const value = ref<ArrayItem[]>([]);

// Sync internal value when prop changes
watch(
  () => props.modelValue,
  (v: ArrayItem[] | undefined) => {
    if (!v) {
      return;
    }
    value.value = [...v];
  },
  { immediate: true },
);

const onSettingChange = (index: number, v: ArrayItem) => {
  // Update one item and emit change
  value.value[index] = v;
  onChange(value.value);
};

const onSettingRemove = (index: number) => {
  // Remove item and emit change
  value.value.splice(index, 1);
  onChange(value.value);
};

const onSettingAdd = () => {
  // Create a new empty object based on options and emit change
  const val: ArrayItem = {};

  props.options.forEach((o: ArrayField) => {
    val[o.name] = "";
  });
  value.value.push(val);
  onChange(value.value);
};

const onChange = (nextValue: ArrayItem[]) => {
  emit("update:modelValue", nextValue);
};

defineExpose({
  errors,
});
</script>

<template>
  <div class="array-form-element">
    <table class="array-form-element__table">
      <thead class="array-form-element__table__head">
        <tr v-if="value.length" class="array-form-element__table__head__row">
          <th class="array-form-element__table__head__row__cell">
            <span v-for="setting in options" :key="setting.name || setting.label">{{
              setting.label
            }}</span>
          </th>
          <th>&nbsp;</th>
        </tr>
      </thead>
      <tbody class="array-form-element__table__body">
        <tr v-for="(val, index) in value" :key="index" class="array-form-element__table__body__row">
          <td class="array-form-element__table__body__row__cell">
            <Form
              :settings="val"
              :fields="options"
              :hideLabels="true"
              :skipTranslate="true"
              @change="(v) => onSettingChange(index, v)"
            />
          </td>
          <td class="array-form-element__table__body__row__cell">
            <ul class="array-form-element__table__body__row__cell__board-toolbar">
              <li class="array-form-element__table__body__row__cell__board-toolbar__item">
                <i
                  class="array-form-element__table__body__row__cell__board-toolbar__item__icon"
                  @click="onSettingRemove(index)"
                >
                  <v-icon name="hi-trash"></v-icon>
                </i>
              </li>
            </ul>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="array-form-element__operations">
      <ActionButton @click="onSettingAdd()">
        {{ $t("arrayFormElement.buttonAdd") }}
      </ActionButton>
    </div>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/array-form-element.css");
</style>
