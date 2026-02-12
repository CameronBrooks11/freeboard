<script setup lang="js">
/**
 * @component AdminConsole
 * @description Admin-only surface for user lifecycle and policy management.
 */
defineOptions({ name: "AdminConsole" });

import { computed, ref, watch } from "vue";
import { useMutation, useQuery } from "@vue/apollo-composable";
import { RouterLink } from "vue-router";
import { useFreeboardStore } from "../stores/freeboard";
import {
  ADMIN_CREATE_INVITE_MUTATION,
  ADMIN_CREATE_USER_MUTATION,
  ADMIN_DELETE_USER_MUTATION,
  ADMIN_ISSUE_PASSWORD_RESET_MUTATION,
  ADMIN_PENDING_INVITES_QUERY,
  ADMIN_REVOKE_INVITE_MUTATION,
  ADMIN_UPDATE_USER_MUTATION,
  ADMIN_USERS_QUERY,
  AUTH_POLICY_QUERY,
  SET_AUTH_POLICY_MUTATION,
} from "../gql";

const ROLE_OPTIONS = Object.freeze(["viewer", "editor", "admin"]);
const INVITE_ROLE_OPTIONS = Object.freeze(["viewer", "editor"]);
const REGISTRATION_MODE_OPTIONS = Object.freeze(["disabled", "invite", "open"]);
const DASHBOARD_VISIBILITY_OPTIONS = Object.freeze(["private", "link", "public"]);
const EXECUTION_MODE_OPTIONS = Object.freeze(["safe", "trusted"]);

const roleToEnum = (role) => String(role || "viewer").toUpperCase();
const registrationModeToEnum = (mode) => String(mode || "disabled").toUpperCase();
const dashboardVisibilityToEnum = (visibility) =>
  String(visibility || "private").toUpperCase();
const executionModeToEnum = (mode) => String(mode || "safe").toUpperCase();

const freeboardStore = useFreeboardStore();
const appBaseUrl = `${window.location.origin}${window.location.pathname.replace(/\/admin\/?$/, "/")}`;

const statusMessage = ref("");
const actionError = ref("");
const userDrafts = ref({});
const issuedInvite = ref(null);
const issuedResetByUser = ref({});

const createUserInput = ref({
  email: "",
  password: "",
  role: "viewer",
  active: true,
});
const createInviteInput = ref({
  email: "",
  role: "viewer",
  expiresInHours: 72,
});
const policyDraft = ref({
  registrationMode: "disabled",
  registrationDefaultRole: "viewer",
  editorCanPublish: false,
  dashboardDefaultVisibility: "private",
  dashboardPublicListingEnabled: false,
  executionMode: "safe",
  policyEditLock: false,
});

const {
  result: usersResult,
  loading: usersLoading,
  error: usersError,
  refetch: refetchUsers,
} = useQuery(ADMIN_USERS_QUERY, {}, { fetchPolicy: "network-only" });
const {
  result: policyResult,
  loading: policyLoading,
  error: policyError,
  refetch: refetchPolicy,
} = useQuery(AUTH_POLICY_QUERY, {}, { fetchPolicy: "network-only" });
const {
  result: pendingInvitesResult,
  loading: pendingInvitesLoading,
  error: pendingInvitesError,
  refetch: refetchPendingInvites,
} = useQuery(ADMIN_PENDING_INVITES_QUERY, {}, { fetchPolicy: "network-only" });

const { mutate: adminCreateUser, loading: createUserLoading } = useMutation(
  ADMIN_CREATE_USER_MUTATION
);
const { mutate: adminUpdateUser, loading: updateUserLoading } = useMutation(
  ADMIN_UPDATE_USER_MUTATION
);
const { mutate: adminDeleteUser, loading: deleteUserLoading } = useMutation(
  ADMIN_DELETE_USER_MUTATION
);
const { mutate: setAuthPolicy, loading: setPolicyLoading } = useMutation(
  SET_AUTH_POLICY_MUTATION
);
const { mutate: adminCreateInvite, loading: createInviteLoading } = useMutation(
  ADMIN_CREATE_INVITE_MUTATION
);
const { mutate: adminRevokeInvite, loading: revokeInviteLoading } = useMutation(
  ADMIN_REVOKE_INVITE_MUTATION
);
const { mutate: adminIssuePasswordReset, loading: issueResetLoading } = useMutation(
  ADMIN_ISSUE_PASSWORD_RESET_MUTATION
);

const users = computed(() => usersResult.value?.listAllUsers || []);
const pendingInvites = computed(() => pendingInvitesResult.value?.listPendingInvites || []);
const policy = computed(() => policyResult.value?.authPolicy || null);
const issuedResetEntries = computed(() =>
  users.value
    .filter((user) => Boolean(issuedResetByUser.value[user._id]))
    .map((user) => ({
      email: user.email,
      payload: issuedResetByUser.value[user._id],
      userId: user._id,
    }))
);
const isBusy = computed(
  () =>
    usersLoading.value ||
    policyLoading.value ||
    pendingInvitesLoading.value ||
    createUserLoading.value ||
    updateUserLoading.value ||
    deleteUserLoading.value ||
    setPolicyLoading.value ||
    createInviteLoading.value ||
    revokeInviteLoading.value ||
    issueResetLoading.value
);
const isPolicyLocked = computed(() => policyDraft.value.policyEditLock === true);
const hasLoadError = computed(
  () => usersError.value || policyError.value || pendingInvitesError.value
);

watch(usersResult, () => {
  const nextDrafts = {};
  users.value.forEach((user) => {
    nextDrafts[user._id] = {
      role: user.role,
      active: user.active,
    };
  });
  userDrafts.value = nextDrafts;
});

watch(policyResult, () => {
  if (!policy.value) {
    return;
  }
  policyDraft.value = {
    registrationMode: policy.value.registrationMode,
    registrationDefaultRole: policy.value.registrationDefaultRole,
    editorCanPublish: policy.value.editorCanPublish,
    dashboardDefaultVisibility: policy.value.dashboardDefaultVisibility,
    dashboardPublicListingEnabled: policy.value.dashboardPublicListingEnabled,
    executionMode: policy.value.executionMode,
    policyEditLock: policy.value.policyEditLock,
  };
  freeboardStore.setPublicAuthPolicy(policy.value);
});

const clearMessages = () => {
  statusMessage.value = "";
  actionError.value = "";
};

const setErrorMessage = (error, fallback) => {
  actionError.value =
    error?.graphQLErrors?.[0]?.message || error?.message || fallback;
};

const savePolicy = async () => {
  clearMessages();
  if (isPolicyLocked.value) {
    actionError.value = "Policy updates are locked by environment configuration.";
    return;
  }

  try {
    const result = await setAuthPolicy({
      registrationMode: registrationModeToEnum(policyDraft.value.registrationMode),
      registrationDefaultRole: roleToEnum(policyDraft.value.registrationDefaultRole),
      editorCanPublish: Boolean(policyDraft.value.editorCanPublish),
      dashboardDefaultVisibility: dashboardVisibilityToEnum(
        policyDraft.value.dashboardDefaultVisibility
      ),
      dashboardPublicListingEnabled: Boolean(
        policyDraft.value.dashboardPublicListingEnabled
      ),
      executionMode: executionModeToEnum(policyDraft.value.executionMode),
    });
    const updatedPolicy = result.data?.setAuthPolicy;
    if (updatedPolicy) {
      policyDraft.value = {
        ...updatedPolicy,
        policyEditLock: updatedPolicy.policyEditLock,
      };
      freeboardStore.setPublicAuthPolicy(updatedPolicy);
    } else {
      await refetchPolicy();
    }
    statusMessage.value = "Policy updated.";
  } catch (error) {
    setErrorMessage(error, "Could not update policy.");
  }
};

const createUser = async () => {
  clearMessages();
  if (!createUserInput.value.email || !createUserInput.value.password) {
    actionError.value = "Email and password are required.";
    return;
  }

  try {
    await adminCreateUser({
      email: createUserInput.value.email,
      password: createUserInput.value.password,
      role: roleToEnum(createUserInput.value.role),
      active: Boolean(createUserInput.value.active),
    });
    createUserInput.value = {
      email: "",
      password: "",
      role: "viewer",
      active: true,
    };
    await refetchUsers();
    statusMessage.value = "User created.";
  } catch (error) {
    setErrorMessage(error, "Could not create user.");
  }
};

const saveUser = async (userId) => {
  clearMessages();
  const draft = userDrafts.value[userId];
  if (!draft) {
    return;
  }

  try {
    await adminUpdateUser({
      id: userId,
      role: roleToEnum(draft.role),
      active: Boolean(draft.active),
    });
    await refetchUsers();
    statusMessage.value = "User updated.";
  } catch (error) {
    setErrorMessage(error, "Could not update user.");
  }
};

const deleteUser = async (user) => {
  clearMessages();
  const accepted = window.confirm(`Delete user '${user.email}'?`);
  if (!accepted) {
    return;
  }

  try {
    await adminDeleteUser({ id: user._id });
    await refetchUsers();
    statusMessage.value = "User deleted.";
  } catch (error) {
    setErrorMessage(error, "Could not delete user.");
  }
};

const createInvite = async () => {
  clearMessages();
  if (!createInviteInput.value.email) {
    actionError.value = "Invite email is required.";
    return;
  }

  try {
    const result = await adminCreateInvite({
      email: createInviteInput.value.email,
      role: roleToEnum(createInviteInput.value.role),
      expiresInHours: Number(createInviteInput.value.expiresInHours) || 72,
    });
    const payload = result.data?.adminCreateInvite;
    issuedInvite.value = payload
      ? {
          ...payload,
          acceptUrl: `${appBaseUrl}login?invite=${encodeURIComponent(payload.token)}`,
        }
      : null;
    createInviteInput.value = {
      email: "",
      role: "viewer",
      expiresInHours: 72,
    };
    await refetchPendingInvites();
    statusMessage.value = "Invite created.";
  } catch (error) {
    setErrorMessage(error, "Could not create invite.");
  }
};

const revokeInvite = async (invite) => {
  clearMessages();
  try {
    await adminRevokeInvite({ id: invite._id });
    await refetchPendingInvites();
    statusMessage.value = "Invite revoked.";
  } catch (error) {
    setErrorMessage(error, "Could not revoke invite.");
  }
};

const issueResetToken = async (user) => {
  clearMessages();
  try {
    const result = await adminIssuePasswordReset({
      id: user._id,
      expiresInHours: 24,
    });
    const payload = result.data?.adminIssuePasswordReset;
    if (payload) {
      issuedResetByUser.value = {
        ...issuedResetByUser.value,
        [user._id]: {
          ...payload,
          resetUrl: `${appBaseUrl}login?reset=${encodeURIComponent(payload.token)}`,
        },
      };
      statusMessage.value = "Password reset token issued.";
    }
  } catch (error) {
    setErrorMessage(error, "Could not issue password reset token.");
  }
};
</script>

<template>
  <div class="admin-console">
    <div class="admin-console__header">
      <h1>{{ $t("admin.title") }}</h1>
      <RouterLink class="admin-console__back" to="/">
        {{ $t("admin.backToDashboard") }}
      </RouterLink>
    </div>

    <p v-if="statusMessage" class="admin-console__status">{{ statusMessage }}</p>
    <p v-if="actionError" class="admin-console__error">{{ actionError }}</p>
    <p v-if="hasLoadError" class="admin-console__error">
      {{ $t("admin.loadError") }}
    </p>

    <section class="admin-console__section">
      <h2>{{ $t("admin.policyTitle") }}</h2>
      <div class="admin-console__form-grid">
        <label>
          {{ $t("admin.registrationMode") }}
          <select v-model="policyDraft.registrationMode" :disabled="isPolicyLocked || isBusy">
            <option
              v-for="option in REGISTRATION_MODE_OPTIONS"
              :key="`mode-${option}`"
              :value="option"
            >
              {{ option }}
            </option>
          </select>
        </label>
        <label>
          {{ $t("admin.registrationDefaultRole") }}
          <select
            v-model="policyDraft.registrationDefaultRole"
            :disabled="isPolicyLocked || isBusy"
          >
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
          </select>
        </label>
        <label class="admin-console__checkbox">
          <input
            type="checkbox"
            v-model="policyDraft.editorCanPublish"
            :disabled="isPolicyLocked || isBusy"
          />
          {{ $t("admin.editorCanPublish") }}
        </label>
        <label>
          {{ $t("admin.dashboardDefaultVisibility") }}
          <select
            v-model="policyDraft.dashboardDefaultVisibility"
            :disabled="isPolicyLocked || isBusy"
          >
            <option
              v-for="option in DASHBOARD_VISIBILITY_OPTIONS"
              :key="`dashboard-visibility-${option}`"
              :value="option"
            >
              {{ option }}
            </option>
          </select>
        </label>
        <label class="admin-console__checkbox">
          <input
            type="checkbox"
            v-model="policyDraft.dashboardPublicListingEnabled"
            :disabled="isPolicyLocked || isBusy"
          />
          {{ $t("admin.dashboardPublicListingEnabled") }}
        </label>
        <label>
          {{ $t("admin.executionMode") }}
          <select v-model="policyDraft.executionMode" :disabled="isPolicyLocked || isBusy">
            <option
              v-for="option in EXECUTION_MODE_OPTIONS"
              :key="`execution-${option}`"
              :value="option"
            >
              {{ option }}
            </option>
          </select>
        </label>
      </div>
      <p v-if="isPolicyLocked" class="admin-console__hint">
        {{ $t("admin.policyLockedHint") }}
      </p>
      <p class="admin-console__hint">
        {{ $t("admin.currentRuntimeMode") }}: <strong>{{ policyDraft.executionMode }}</strong>
      </p>
      <button type="button" :disabled="isPolicyLocked || isBusy" @click="savePolicy">
        {{ $t("admin.savePolicy") }}
      </button>
    </section>

    <section class="admin-console__section">
      <h2>{{ $t("admin.invitesTitle") }}</h2>
      <div class="admin-console__form-grid">
        <label>
          {{ $t("form.labelEmail") }}
          <input v-model="createInviteInput.email" type="email" :disabled="isBusy" />
        </label>
        <label>
          {{ $t("admin.role") }}
          <select v-model="createInviteInput.role" :disabled="isBusy">
            <option v-for="role in INVITE_ROLE_OPTIONS" :key="`invite-role-${role}`" :value="role">
              {{ role }}
            </option>
          </select>
        </label>
        <label>
          {{ $t("admin.expiresHours") }}
          <input
            v-model.number="createInviteInput.expiresInHours"
            type="number"
            min="1"
            max="336"
            :disabled="isBusy"
          />
        </label>
      </div>
      <button type="button" :disabled="isBusy" @click="createInvite">
        {{ $t("admin.createInviteButton") }}
      </button>

      <div v-if="issuedInvite" class="admin-console__token-card">
        <div><strong>{{ $t("admin.inviteToken") }}:</strong> {{ issuedInvite.token }}</div>
        <div><strong>{{ $t("admin.inviteLink") }}:</strong> {{ issuedInvite.acceptUrl }}</div>
      </div>

      <div v-if="pendingInvitesLoading">{{ $t("admin.loadingInvites") }}</div>
      <table v-else class="admin-console__table">
        <thead>
          <tr>
            <th>{{ $t("form.labelEmail") }}</th>
            <th>{{ $t("admin.role") }}</th>
            <th>{{ $t("admin.expiresAt") }}</th>
            <th>{{ $t("admin.actions") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="invite in pendingInvites" :key="invite._id">
            <td>{{ invite.email }}</td>
            <td>{{ invite.role }}</td>
            <td>{{ invite.expiresAt }}</td>
            <td class="admin-console__actions">
              <button type="button" :disabled="isBusy" @click="revokeInvite(invite)">
                {{ $t("admin.revokeInvite") }}
              </button>
            </td>
          </tr>
          <tr v-if="pendingInvites.length === 0">
            <td colspan="4">{{ $t("admin.noPendingInvites") }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="admin-console__section">
      <h2>{{ $t("admin.createUserTitle") }}</h2>
      <div class="admin-console__form-grid">
        <label>
          {{ $t("form.labelEmail") }}
          <input v-model="createUserInput.email" type="email" :disabled="isBusy" />
        </label>
        <label>
          {{ $t("form.labelPassword") }}
          <input v-model="createUserInput.password" type="password" :disabled="isBusy" />
        </label>
        <label>
          {{ $t("admin.role") }}
          <select v-model="createUserInput.role" :disabled="isBusy">
            <option v-for="role in ROLE_OPTIONS" :key="`create-role-${role}`" :value="role">
              {{ role }}
            </option>
          </select>
        </label>
        <label class="admin-console__checkbox">
          <input type="checkbox" v-model="createUserInput.active" :disabled="isBusy" />
          {{ $t("admin.active") }}
        </label>
      </div>
      <button type="button" :disabled="isBusy" @click="createUser">
        {{ $t("admin.createUserButton") }}
      </button>
    </section>

    <section class="admin-console__section">
      <h2>{{ $t("admin.usersTitle") }}</h2>
      <div v-if="usersLoading">{{ $t("admin.loadingUsers") }}</div>
      <table v-else class="admin-console__table">
        <thead>
          <tr>
            <th>{{ $t("form.labelEmail") }}</th>
            <th>{{ $t("admin.role") }}</th>
            <th>{{ $t("admin.active") }}</th>
            <th>{{ $t("admin.actions") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user._id">
            <td>{{ user.email }}</td>
            <td>
              <select v-if="userDrafts[user._id]" v-model="userDrafts[user._id].role" :disabled="isBusy">
                <option v-for="role in ROLE_OPTIONS" :key="`${user._id}-${role}`" :value="role">
                  {{ role }}
                </option>
              </select>
              <span v-else>{{ user.role }}</span>
            </td>
            <td>
              <input
                v-if="userDrafts[user._id]"
                type="checkbox"
                v-model="userDrafts[user._id].active"
                :disabled="isBusy"
              />
              <span v-else>{{ user.active ? "yes" : "no" }}</span>
            </td>
            <td class="admin-console__actions">
              <button
                type="button"
                :disabled="isBusy || !userDrafts[user._id]"
                @click="saveUser(user._id)"
              >
                {{ $t("admin.saveUser") }}
              </button>
              <button type="button" :disabled="isBusy" @click="issueResetToken(user)">
                {{ $t("admin.issueResetToken") }}
              </button>
              <button type="button" :disabled="isBusy" @click="deleteUser(user)">
                {{ $t("admin.deleteUser") }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div
        v-for="entry in issuedResetEntries"
        :key="`reset-${entry.userId}`"
        class="admin-console__token-card"
      >
        <div>
          <strong>{{ entry.email }}</strong>: {{ entry.payload.token }}
        </div>
        <div>{{ entry.payload.resetUrl }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="css">
@import url("../assets/css/components/admin-console.css");
</style>
