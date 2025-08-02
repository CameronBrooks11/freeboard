<script setup lang="js">
import { ref, watch } from "vue";
import DialogBox from "./DialogBox.vue";
import Form from "./Form.vue";
import { USER_AUTH_MUTATION } from "../gql";
import { useMutation } from "@vue/apollo-composable";
import { useFreeboardStore } from "../stores/freeboard";
import router from "../router";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const freeboardStore = useFreeboardStore();

const form = ref(null);
const dialog = ref(null);

// mutation + loading state
const { mutate: authUser, loading } = useMutation(USER_AUTH_MUTATION);

// hold any login error message
const loginError = ref("");

// Use a reactive fields that updates based on loading state
// This ensures fields are properly disabled during loading
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

const onDialogBoxOk = async () => {
  // clear previous error
  loginError.value = "";

  // form validation
  if (form.value.hasErrors()) {
    return;
  }

  // grab inputs
  const creds = form.value.getValue();

  try {
    const result = await authUser(creds);
    const token = result.data?.authUser?.token;

    if (token) {
      // 1) log in the store
      freeboardStore.login(token);

      // 2) navigate with proper fallback handling
      const lastPath = router.options.history?.state?.back;
      const targetPath = lastPath && lastPath !== "/login" ? lastPath : "/";
      await router.push(targetPath);
    } else {
      loginError.value = "Invalid login response.";
    }
  } catch (err) {
    // show the actual GraphQL error or a generic fallback
    loginError.value =
      err?.graphQLErrors?.[0]?.message || err.message || "Login failed.";

    // make sure fields aren’t locked
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
      <Form ref="form" :fields="fields" :settings="{}" />
      <!-- error feedback -->
      <p v-if="loginError" style="color: red; margin-top: 0.5rem">
        {{ loginError }}
      </p>
    </DialogBox>
  </div>
</template>

<style scoped lang="css">
@import url("../assets/css/components/login.css");
</style>
