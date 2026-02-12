<script setup lang="js">
/**
 * @component Login
 * @description Policy-aware login/registration/invite/reset flow.
 */
import { computed, ref, watch } from "vue";
import { useMutation, useQuery } from "@vue/apollo-composable";
import { useRoute } from "vue-router";
import DialogBox from "./DialogBox.vue";
import Form from "./Form.vue";
import { useFreeboardStore } from "../stores/freeboard";
import router from "../router";
import {
  canAcceptInviteForMode,
  canCreateAccountForMode,
  LOGIN_ACTION_MODES,
  resolveLoginActionMode,
} from "../auth/loginMode";
import {
  ACCEPT_INVITE_MUTATION,
  PUBLIC_AUTH_POLICY_QUERY,
  REQUEST_PASSWORD_RESET_MUTATION,
  RESET_PASSWORD_MUTATION,
  USER_AUTH_MUTATION,
  USER_REGISTER_MUTATION,
} from "../gql";

const MODES = LOGIN_ACTION_MODES;

const freeboardStore = useFreeboardStore();
const route = useRoute();

const form = ref(null);
const loginError = ref("");
const infoMessageKey = ref("");
const fields = ref([]);
const actionMode = ref(MODES.login);

const { mutate: authUser, loading: authLoading } = useMutation(USER_AUTH_MUTATION);
const { mutate: registerUser, loading: registerLoading } = useMutation(
  USER_REGISTER_MUTATION
);
const { mutate: acceptInvite, loading: inviteLoading } = useMutation(
  ACCEPT_INVITE_MUTATION
);
const { mutate: requestPasswordReset, loading: requestResetLoading } = useMutation(
  REQUEST_PASSWORD_RESET_MUTATION
);
const { mutate: resetPassword, loading: resetPasswordLoading } = useMutation(
  RESET_PASSWORD_MUTATION
);
const { result: authPolicyResult, loading: authPolicyLoading } = useQuery(
  PUBLIC_AUTH_POLICY_QUERY,
  {},
  { fetchPolicy: "network-only" }
);

const inviteTokenFromRoute = computed(() => String(route.query?.invite || "").trim());
const resetTokenFromRoute = computed(() => String(route.query?.reset || "").trim());

const registrationMode = computed(
  () => authPolicyResult.value?.publicAuthPolicy?.registrationMode || "disabled"
);
const isBusy = computed(
  () =>
    authLoading.value ||
    registerLoading.value ||
    inviteLoading.value ||
    requestResetLoading.value ||
    resetPasswordLoading.value ||
    authPolicyLoading.value
);

const canCreateAccount = computed(() =>
  canCreateAccountForMode(registrationMode.value)
);
const canAcceptInvite = computed(() =>
  canAcceptInviteForMode({
    registrationMode: registrationMode.value,
    inviteToken: inviteTokenFromRoute.value,
  })
);

const dialogHeaderKey = computed(() => {
  if (actionMode.value === MODES.register) {
    return "login.titleCreateAccount";
  }
  if (actionMode.value === MODES.invite) {
    return "login.titleAcceptInvite";
  }
  if (actionMode.value === MODES.requestReset) {
    return "login.titleRequestReset";
  }
  if (actionMode.value === MODES.completeReset) {
    return "login.titleCompleteReset";
  }
  return "login.titleLogin";
});

const submitLabelKey = computed(() => {
  if (actionMode.value === MODES.register) {
    return "login.buttonCreateAccount";
  }
  if (actionMode.value === MODES.invite) {
    return "login.buttonAcceptInvite";
  }
  if (actionMode.value === MODES.requestReset) {
    return "login.buttonRequestReset";
  }
  if (actionMode.value === MODES.completeReset) {
    return "login.buttonCompleteReset";
  }
  return "login.buttonOk";
});

const formSettings = computed(() => {
  if (actionMode.value === MODES.invite) {
    return {
      token: inviteTokenFromRoute.value,
    };
  }
  if (actionMode.value === MODES.completeReset) {
    return {
      token: resetTokenFromRoute.value,
    };
  }
  return {};
});

const updateFields = () => {
  const disabled = isBusy.value;

  if (actionMode.value === MODES.requestReset) {
    fields.value = [
      {
        name: "email",
        label: "form.labelEmail",
        type: "text",
        required: true,
        disabled,
      },
    ];
    return;
  }

  if (actionMode.value === MODES.invite || actionMode.value === MODES.completeReset) {
    fields.value = [
      {
        name: "token",
        label: "form.labelToken",
        type: "text",
        required: true,
        disabled: disabled || (actionMode.value === MODES.invite && Boolean(inviteTokenFromRoute.value)),
      },
      {
        name: "password",
        label: actionMode.value === MODES.completeReset ? "form.labelNewPassword" : "form.labelPassword",
        type: "password",
        required: true,
        disabled,
      },
      {
        name: "confirmPassword",
        label: "form.labelConfirmPassword",
        type: "password",
        required: true,
        disabled,
      },
    ];
    return;
  }

  fields.value = [
    {
      name: "email",
      label: "form.labelEmail",
      type: "text",
      required: true,
      disabled,
    },
    {
      name: "password",
      label: "form.labelPassword",
      type: "password",
      required: true,
      disabled,
    },
  ];

  if (actionMode.value === MODES.register) {
    fields.value.push({
      name: "confirmPassword",
      label: "form.labelConfirmPassword",
      type: "password",
      required: true,
      disabled,
    });
  }
};

watch(authPolicyResult, () => {
  const policy = authPolicyResult.value?.publicAuthPolicy;
  if (policy) {
    freeboardStore.setPublicAuthPolicy(policy);
  }
});

watch(
  [registrationMode, inviteTokenFromRoute, resetTokenFromRoute],
  ([mode, inviteToken, resetToken]) => {
    actionMode.value = resolveLoginActionMode({
      registrationMode: mode,
      inviteToken,
      resetToken,
      currentMode: actionMode.value,
    });
  },
  { immediate: true }
);

watch([isBusy, actionMode], updateFields, { immediate: true });

const resetMessages = () => {
  loginError.value = "";
  infoMessageKey.value = "";
};

const switchMode = (nextMode) => {
  resetMessages();
  actionMode.value = nextMode;
};

const ensureMatchingPasswords = (value) => {
  if (value.password !== value.confirmPassword) {
    throw new Error("Passwords do not match.");
  }
};

const onDialogBoxOk = async () => {
  resetMessages();
  if (form.value.hasErrors()) {
    return;
  }

  const value = form.value.getValue();

  try {
    if (actionMode.value === MODES.login) {
      const result = await authUser({
        email: value.email,
        password: value.password,
      });
      const token = result.data?.authUser?.token;
      if (!token) {
        loginError.value = "Invalid authentication response.";
        return;
      }
      freeboardStore.login(token);
      const lastPath = router.options.history?.state?.back;
      const targetPath = lastPath && lastPath !== "/login" ? lastPath : "/";
      await router.push(targetPath);
      return;
    }

    if (actionMode.value === MODES.register) {
      ensureMatchingPasswords(value);
      const result = await registerUser({
        email: value.email,
        password: value.password,
      });
      const token = result.data?.registerUser?.token;
      if (!token) {
        loginError.value = "Invalid authentication response.";
        return;
      }
      freeboardStore.login(token);
      await router.push("/");
      return;
    }

    if (actionMode.value === MODES.invite) {
      ensureMatchingPasswords(value);
      const tokenResult = await acceptInvite({
        token: value.token,
        password: value.password,
      });
      const token = tokenResult.data?.acceptInvite?.token;
      if (!token) {
        loginError.value = "Invalid authentication response.";
        return;
      }
      freeboardStore.login(token);
      await router.push("/");
      return;
    }

    if (actionMode.value === MODES.requestReset) {
      await requestPasswordReset({
        email: value.email,
      });
      infoMessageKey.value = "login.resetRequested";
      actionMode.value = MODES.login;
      return;
    }

    if (actionMode.value === MODES.completeReset) {
      ensureMatchingPasswords(value);
      await resetPassword({
        token: value.token,
        password: value.password,
      });
      infoMessageKey.value = "login.resetCompleted";
      actionMode.value = MODES.login;
      return;
    }
  } catch (error) {
    loginError.value =
      error?.graphQLErrors?.[0]?.message || error.message || "Authentication failed.";
  }
};

const helperTextKey = computed(() => {
  if (actionMode.value === MODES.invite) {
    return "login.inviteTokenHelp";
  }
  if (actionMode.value === MODES.completeReset) {
    return "login.resetTokenHelp";
  }
  if (registrationMode.value === "invite") {
    return "login.inviteRequired";
  }
  if (registrationMode.value === "disabled") {
    return "login.registrationDisabled";
  }
  return "";
});
</script>

<template>
  <div class="login">
    <DialogBox
      class="login__dialog-box"
      :header="$t(dialogHeaderKey)"
      :ok="$t(submitLabelKey)"
      :ok-disabled="isBusy"
      @ok="onDialogBoxOk"
    >
      <Form ref="form" :fields="fields" :settings="formSettings" />
      <p v-if="helperTextKey" class="login__hint">{{ $t(helperTextKey) }}</p>
      <p v-if="infoMessageKey" class="login__info">{{ $t(infoMessageKey) }}</p>
      <p v-if="loginError" class="login__error">{{ loginError }}</p>

      <div class="login__actions">
        <button
          v-if="actionMode === MODES.login && canCreateAccount"
          class="login__switch-mode"
          type="button"
          @click="switchMode(MODES.register)"
        >
          {{ $t("login.buttonCreateAccount") }}
        </button>
        <button
          v-if="actionMode === MODES.login && canAcceptInvite"
          class="login__switch-mode"
          type="button"
          @click="switchMode(MODES.invite)"
        >
          {{ $t("login.buttonAcceptInvite") }}
        </button>
        <button
          v-if="actionMode === MODES.login"
          class="login__switch-mode"
          type="button"
          @click="switchMode(MODES.requestReset)"
        >
          {{ $t("login.buttonForgotPassword") }}
        </button>
        <button
          v-if="actionMode === MODES.requestReset"
          class="login__switch-mode"
          type="button"
          @click="switchMode(MODES.completeReset)"
        >
          {{ $t("login.buttonUseResetToken") }}
        </button>
        <button
          v-if="actionMode !== MODES.login"
          class="login__switch-mode"
          type="button"
          @click="switchMode(MODES.login)"
        >
          {{ $t("login.buttonBackToLogin") }}
        </button>
      </div>
    </DialogBox>
  </div>
</template>

<style scoped lang="css">
@import url("../assets/css/components/login.css");
</style>
