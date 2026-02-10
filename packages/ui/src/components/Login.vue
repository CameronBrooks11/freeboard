<script setup lang="js">
/**
 * @component Login
 * @description Modal dialog with email/password form for user authentication using GraphQL.
 * Handles error display, disables form during loading, and redirects after successful login.
 */
import { ref, watch } from "vue";
import DialogBox from "./DialogBox.vue";
import Form from "./Form.vue";
import { USER_AUTH_MUTATION } from "../gql";
import { useMutation } from "@vue/apollo-composable";
import { useFreeboardStore } from "../stores/freeboard";
import router from "../router";
const freeboardStore = useFreeboardStore();

// Reference to the Form component for validation and value retrieval
const form = ref(null);

// Reference to the DialogBox for controlling modal visibility
const dialog = ref(null);

// Apollo mutation for user authentication with loading state
const { mutate: authUser, loading } = useMutation(USER_AUTH_MUTATION);

// Holds any login error message for display
const loginError = ref("");

// Dynamic form field definitions based on loading state
// This ensures fields are properly disabled during mutation
const fields = ref(null);

watch(
  loading,
  (isLoading) => {
    fields.value = [
      {
        name: "email",
        label: "form.labelEmail",
        type: "text",
        required: true,
        disabled: isLoading,
      },
      {
        name: "password",
        label: "form.labelPassword",
        type: "password",
        required: true,
        disabled: isLoading,
      },
    ];
  },
  { immediate: true }
);

/**
 * Handle OK button: validate form, perform auth mutation, store token, and navigate.
 * Displays error messages if authentication fails.
 */
const onDialogBoxOk = async () => {
  // Clear previous error
  loginError.value = "";

  // Prevent submission if validation errors exist
  if (form.value.hasErrors()) {
    return;
  }

  // Retrieve form values and execute authentication mutation
  const creds = form.value.getValue();

  try {
    const result = await authUser(creds);
    const token = result.data?.authUser?.token;

    if (token) {
      // Store JWT token in the store
      freeboardStore.login(token);

      // Navigate to last visited path or home page
      const lastPath = router.options.history?.state?.back;
      const targetPath = lastPath && lastPath !== "/login" ? lastPath : "/";
      await router.push(targetPath);
    } else {
      loginError.value = "Invalid login response.";
    }
  } catch (err) {
    // Show GraphQL error message or fallback
    loginError.value =
      err?.graphQLErrors?.[0]?.message || err.message || "Login failed.";

    // Ensure fields are re-enabled for retry
    fields.value = fields.value.map((f) => ({
      ...f,
      disabled: false,
    }));

    console.warn("Login error:", err);
  }
};
</script>

<template>
  <div class="login">
    <DialogBox class="login__dialog-box" ref="dialog" header="Login" :ok="$t('login.buttonOk')" @ok="onDialogBoxOk"
      :ok-disabled="loading">
      <!-- Render login form inside dialog -->
      <Form ref="form" :fields="fields" :settings="{}" />
      <!-- Error feedback -->
      <p v-if="loginError" style="color: red; margin-top: 0.5rem">
        {{ loginError }}
      </p>
    </DialogBox>
  </div>
</template>

<style scoped lang="css">
@import url("../assets/css/components/login.css");
</style>
