<script setup lang="js">
/**
 * @component ListFormElement
 * @description Autocomplete list dropdown with fuzzy search to select a value.
 *
 * @prop {string} modelValue                             - Current selected value.
 * @prop {boolean} secret                                 - Whether the input is secret (unused).
 * @prop {boolean} disabled                               - Disable user input when true.
 * @prop {Promise<Array<{value:string,label:string}>>} options - Promise resolving to available options.
 *
 * @emits update:modelValue - Emitted when the selection changes.
 */
defineOptions({ name: 'ListFormElement' });

import { ref, watch } from "vue";
import { levenshteinDistance } from "../fuzzy";
import { useI18n } from "vue-i18n";
import { asyncComputed } from "@vueuse/core";

const { t } = useI18n();

// Props and emit definition
const props = defineProps(["modelValue", "secret", "disabled", "options"]);
const emit = defineEmits(["update:modelValue"]);

// Dropdown visibility toggle
const show = ref(false);
// Internal search value and selected value
const value = ref(props.modelValue);

// Compute the display label from the selected value
const label = asyncComputed(async () => {
  const opt = (await props.options).find(o => o.value === value.value);
  return opt ? opt.label : t("form.placeholderList");
});

/**
 * Perform fuzzy filtering on options based on current input value.
 * Returns top 10 closest matches.
 */
const filter = async () => {
  const all = await props.options;
  return all
    .filter(opt => opt.value)
    .map(opt => ({
      value: opt.value,
      label: opt.label,
      prio: levenshteinDistance(value.value, opt.label)
    }))
    .sort((a, b) => a.prio - b.prio)
    .slice(0, 10);
};

// Filtered options to display in dropdown
const opts = ref([]);

/**
 * Refresh dropdown options when the user types.
 */
const onSearch = async () => {
  opts.value = await filter();
};

/**
 * Handle user selecting an option from the list.
 */
const onLinkClicked = (option) => {
  value.value = option.value;
  show.value = false;
};

// Emit update when dropdown visibility changes (selection final)
watch(show, () => {
  emit("update:modelValue", value.value);
});
</script>

<template>
  <div class="list-form-element">
    <!-- Dropdown toggle button showing current label -->
    <button @click="show = !show" class="list-form-element__drop-button" type="button" :disabled="props.disabled">
      {{ label }}
    </button>
    <Transition>
      <div class="list-form-element__dropdown-content" v-if="show">
        <!-- Search input -->
        <input class="list-form-element__dropdown-content__input" type="text" v-model="value"
          :placeholder="$t('form.placeholderList')" :disabled="props.disabled" @keyup.prevent="onSearch" />

        <!-- Filtered option list -->
        <ul>
          <li v-for="option in opts" :key="option.value">
            <a href="#" class="list-form-element__dropdown-content__link" @click.prevent="onLinkClicked(option)">
              {{ option.label }}
            </a>
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/list-form-element.css");
</style>
