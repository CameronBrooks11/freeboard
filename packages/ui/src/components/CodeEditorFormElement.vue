<script setup lang="js">
/**
 * @component CodeEditorFormElement
 * @description Form element for editing code using the Monaco Editor.
 *
 * @prop {string} modelValue - The code content bound to the editor.
 * @prop {string|Function} language - Language identifier or function returning it for syntax highlighting.
 *
 * @emits update:modelValue - Emitted when the code content changes.
 */
defineOptions({ name: 'CodeEditorFormElement' });

import { VueMonacoEditor } from "@guolao/vue-monaco-editor";
import { reactive, ref, shallowRef } from "vue";

const props = defineProps(["modelValue", "language"]);
const emit = defineEmits(["update:modelValue"]);

// Validation errors for the form element
const errors = ref([]);

// Configuration options passed to Monaco Editor
const MONACO_EDITOR_OPTIONS = {
  automaticLayout: true,
  formatOnType: true,
  formatOnPaste: true,
};

// Reactive copy of props for initial value tracking
const p = reactive({ ...props });

// Reference to store the Monaco editor instance
const editor = shallowRef();

/**
 * Store the mounted editor instance for future use.
 *
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editorInstance
 */
const handleMount = (editorInstance) => {
  editor.value = editorInstance;
};

// Reactive code content bound to the editor
const code = ref(p.modelValue);

/**
 * Emit an update event when the code content changes.
 */
const onChange = () => {
  emit("update:modelValue", code.value);
};

defineExpose({
  errors,
});
</script>

<template>
  <vue-monaco-editor class="code-editor-form-element" v-model:value="code" theme="vs-dark"
    :options="MONACO_EDITOR_OPTIONS"
    :language="typeof props.language === 'function' ? props.language() : props.language" @change="onChange"
    @mount="handleMount" />
</template>

<style lang="css" scoped>
@import url("../assets/css/components/code-editor-form-element.css");
</style>
