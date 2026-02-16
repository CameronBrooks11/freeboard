/**
 * @module admin/useAdminConsoleController
 * @description Admin console state and action orchestration extracted from AdminConsole component.
 */

import { computed, ref, watch } from "vue";
import { useMutation, useQuery } from "@vue/apollo-composable";
import { useAuthStore } from "../stores/auth.js";
import { useDashboardStore } from "../stores/dashboard.js";
import { useProfileCatalogStore } from "../stores/profileCatalog.js";
import {
  BROKER_PROFILE_PROTOCOL_OPTIONS,
  CREDENTIAL_PROFILE_TYPE_OPTIONS,
  DASHBOARD_VISIBILITY_OPTIONS,
  EXECUTION_MODE_OPTIONS,
  INVITE_ROLE_OPTIONS,
  normalizeCredentialProfileTypeValue,
  REGISTRATION_DEFAULT_ROLE_OPTIONS,
  REGISTRATION_MODE_OPTIONS,
  ROLE_OPTIONS,
  toBrokerProfileDraft,
  toCredentialProfileDraft,
  toPolicyDraft,
  toUserDraft,
} from "../admin/adminConsoleState.js";
import {
  ADMIN_CREATE_BROKER_PROFILE_MUTATION,
  ADMIN_CREATE_CREDENTIAL_PROFILE_MUTATION,
  ADMIN_CREATE_INVITE_MUTATION,
  ADMIN_CREATE_USER_MUTATION,
  ADMIN_DELETE_BROKER_PROFILE_MUTATION,
  ADMIN_DELETE_CREDENTIAL_PROFILE_MUTATION,
  ADMIN_DELETE_USER_MUTATION,
  ADMIN_ISSUE_PASSWORD_RESET_MUTATION,
  ADMIN_PENDING_INVITES_QUERY,
  ADMIN_REVOKE_INVITE_MUTATION,
  ADMIN_DATASOURCE_DIAGNOSTICS_QUERY,
  ADMIN_UPDATE_BROKER_PROFILE_MUTATION,
  ADMIN_UPDATE_CREDENTIAL_PROFILE_MUTATION,
  ADMIN_UPDATE_USER_MUTATION,
  BROKER_PROFILES_QUERY,
  ADMIN_USERS_QUERY,
  AUTH_POLICY_QUERY,
  CREDENTIAL_PROFILES_QUERY,
  SET_AUTH_POLICY_MUTATION,
} from "../gql.js";

const roleToEnum = (role) => String(role || "viewer").toUpperCase();
const registrationModeToEnum = (mode) => String(mode || "disabled").toUpperCase();
const dashboardVisibilityToEnum = (visibility) =>
  String(visibility || "private").toUpperCase();
const executionModeToEnum = (mode) => String(mode || "safe").toUpperCase();
const credentialProfileTypeToEnum = (type) =>
  String(type || "none").toUpperCase();
const brokerProfileProtocolToEnum = (protocol) =>
  String(protocol || "mqtt").toUpperCase();


export const useAdminConsoleController = () => {
  const authStore = useAuthStore();
  const dashboardStore = useDashboardStore();
  const profileCatalogStore = useProfileCatalogStore();
  const appBaseUrl = `${window.location.origin}${window.location.pathname.replace(/\/admin\/?$/, "/")}`;
  
  const statusMessage = ref("");
  const actionError = ref("");
  const userDrafts = ref({});
  const credentialProfileDrafts = ref({});
  const brokerProfileDrafts = ref({});
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
  const createCredentialProfileInput = ref(toCredentialProfileDraft());
  const createBrokerProfileInput = ref(toBrokerProfileDraft());
  const policyDraft = ref(toPolicyDraft());
  
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
  const {
    result: credentialProfilesResult,
    loading: credentialProfilesLoading,
    error: credentialProfilesError,
    refetch: refetchCredentialProfiles,
  } = useQuery(CREDENTIAL_PROFILES_QUERY, {}, { fetchPolicy: "network-only" });
  const {
    result: brokerProfilesResult,
    loading: brokerProfilesLoading,
    error: brokerProfilesError,
    refetch: refetchBrokerProfiles,
  } = useQuery(BROKER_PROFILES_QUERY, {}, { fetchPolicy: "network-only" });
  const {
    result: datasourceDiagnosticsResult,
    loading: datasourceDiagnosticsLoading,
    error: datasourceDiagnosticsError,
  } = useQuery(ADMIN_DATASOURCE_DIAGNOSTICS_QUERY, {}, { fetchPolicy: "network-only" });
  
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
  const {
    mutate: adminCreateCredentialProfile,
    loading: createCredentialProfileLoading,
  } = useMutation(ADMIN_CREATE_CREDENTIAL_PROFILE_MUTATION);
  const {
    mutate: adminUpdateCredentialProfile,
    loading: updateCredentialProfileLoading,
  } = useMutation(ADMIN_UPDATE_CREDENTIAL_PROFILE_MUTATION);
  const {
    mutate: adminDeleteCredentialProfile,
    loading: deleteCredentialProfileLoading,
  } = useMutation(ADMIN_DELETE_CREDENTIAL_PROFILE_MUTATION);
  const {
    mutate: adminCreateBrokerProfile,
    loading: createBrokerProfileLoading,
  } = useMutation(ADMIN_CREATE_BROKER_PROFILE_MUTATION);
  const {
    mutate: adminUpdateBrokerProfile,
    loading: updateBrokerProfileLoading,
  } = useMutation(ADMIN_UPDATE_BROKER_PROFILE_MUTATION);
  const {
    mutate: adminDeleteBrokerProfile,
    loading: deleteBrokerProfileLoading,
  } = useMutation(ADMIN_DELETE_BROKER_PROFILE_MUTATION);
  
  const users = computed(() => usersResult.value?.listAllUsers || []);
  const pendingInvites = computed(() => pendingInvitesResult.value?.listPendingInvites || []);
  const policy = computed(() => policyResult.value?.authPolicy || null);
  const credentialProfiles = computed(
    () => credentialProfilesResult.value?.credentialProfiles || []
  );
  const brokerProfiles = computed(() => brokerProfilesResult.value?.brokerProfiles || []);
  const datasourceDiagnostics = computed(
    () => datasourceDiagnosticsResult.value?.adminDatasourceDiagnostics || null
  );
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
      issueResetLoading.value ||
      credentialProfilesLoading.value ||
      brokerProfilesLoading.value ||
      createCredentialProfileLoading.value ||
      updateCredentialProfileLoading.value ||
      deleteCredentialProfileLoading.value ||
      createBrokerProfileLoading.value ||
      updateBrokerProfileLoading.value ||
      deleteBrokerProfileLoading.value
  );
  const isPolicyLocked = computed(() => policyDraft.value.policyEditLock === true);
  const hasLoadError = computed(
    () =>
      usersError.value ||
      policyError.value ||
      pendingInvitesError.value ||
      credentialProfilesError.value ||
      brokerProfilesError.value ||
      datasourceDiagnosticsError.value
  );
  
  watch(usersResult, () => {
    const nextDrafts = {};
    users.value.forEach((user) => {
      nextDrafts[user._id] = toUserDraft(user);
    });
    userDrafts.value = nextDrafts;
  });
  
  watch(policyResult, () => {
    if (!policy.value) {
      return;
    }
    policyDraft.value = toPolicyDraft(policy.value);
    const executionModeChanged = authStore.setPublicAuthPolicy(policy.value);
    if (executionModeChanged) {
      dashboardStore.loadDashboardAssets();
    }
  });
  
  watch(credentialProfilesResult, () => {
    const profiles = credentialProfiles.value;
    const nextDrafts = {};
    profiles.forEach((profile) => {
      nextDrafts[profile._id] = toCredentialProfileDraft(profile);
    });
    credentialProfileDrafts.value = nextDrafts;
    profileCatalogStore.setCredentialProfiles(profiles);
  });
  
  watch(brokerProfilesResult, () => {
    const profiles = brokerProfiles.value;
    const nextDrafts = {};
    profiles.forEach((profile) => {
      nextDrafts[profile._id] = toBrokerProfileDraft(profile);
    });
    brokerProfileDrafts.value = nextDrafts;
    profileCatalogStore.setBrokerProfiles(profiles);
  });
  
  watch(brokerProfilesError, () => {
    if (brokerProfilesError.value) {
      profileCatalogStore.clearBrokerProfiles();
    }
  });
  
  watch(credentialProfilesError, () => {
    if (credentialProfilesError.value) {
      profileCatalogStore.clearCredentialProfiles();
    }
  });
  
  const buildCredentialProfileMutationInput = (draft, { includeSecrets = true } = {}) => {
    const type = normalizeCredentialProfileTypeValue(draft.type);
    const input = {
      name: String(draft.name || "").trim(),
      description: String(draft.description || "").trim(),
      type: credentialProfileTypeToEnum(type),
      allowPublicUse: Boolean(draft.allowPublicUse),
      metadata: {},
    };
  
    if (type === "header") {
      input.metadata = {
        headerName: String(draft.metadataHeaderName || "").trim(),
      };
    }
  
    if (!includeSecrets) {
      return input;
    }
  
    const secret = {};
    if (type === "bearer") {
      if (draft.secretToken) {
        secret.token = String(draft.secretToken);
      }
    } else if (type === "basic") {
      if (draft.secretUsername) {
        secret.username = String(draft.secretUsername);
      }
      if (draft.secretPassword) {
        secret.password = String(draft.secretPassword);
      }
    } else if (type === "header") {
      if (draft.secretHeaderValue) {
        secret.headerValue = String(draft.secretHeaderValue);
      }
    }
  
    if (Object.keys(secret).length > 0 || type === "none") {
      input.secret = secret;
    }
  
    return input;
  };
  
  const buildBrokerProfileMutationInput = (draft) => {
    const protocol = String(draft.protocol || "mqtt").toLowerCase();
    const allowlist = String(draft.topicAllowlist || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  
    return {
      name: String(draft.name || "").trim(),
      description: String(draft.description || "").trim(),
      protocol: brokerProfileProtocolToEnum(protocol),
      brokerUrl: String(draft.brokerUrl || "").trim(),
      credentialProfileId: String(draft.credentialProfileId || "").trim() || null,
      allowPublicUse: Boolean(draft.allowPublicUse),
      topicAllowlist: allowlist,
      tls: {
        rejectUnauthorized: Boolean(draft.tlsRejectUnauthorized),
      },
    };
  };
  
  const clearMessages = () => {
    statusMessage.value = "";
    actionError.value = "";
  };
  
  const setErrorMessage = (error, fallback) => {
    actionError.value =
      error?.graphQLErrors?.[0]?.message || error?.message || fallback;
  };
  
  const formatDateTime = (value) => {
    if (!value) {
      return "—";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }
    return parsed.toLocaleString();
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
        policyDraft.value = toPolicyDraft(updatedPolicy);
        const executionModeChanged = authStore.setPublicAuthPolicy(updatedPolicy);
        if (executionModeChanged) {
          dashboardStore.loadDashboardAssets();
        }
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
  
  const createCredentialProfile = async () => {
    clearMessages();
    try {
      const input = buildCredentialProfileMutationInput(createCredentialProfileInput.value);
      await adminCreateCredentialProfile({
        input,
      });
      createCredentialProfileInput.value = toCredentialProfileDraft();
      await refetchCredentialProfiles();
      statusMessage.value = "Credential profile created.";
    } catch (error) {
      setErrorMessage(error, "Could not create credential profile.");
    }
  };
  
  const saveCredentialProfile = async (profileId) => {
    clearMessages();
    const draft = credentialProfileDrafts.value[profileId];
    if (!draft) {
      return;
    }
  
    try {
      const input = buildCredentialProfileMutationInput(draft);
      const type = normalizeCredentialProfileTypeValue(draft.type);
      const shouldSendSecret =
        (type === "bearer" && draft.secretToken) ||
        (type === "basic" && (draft.secretUsername || draft.secretPassword)) ||
        (type === "header" && draft.secretHeaderValue) ||
        type === "none";
      if (!shouldSendSecret) {
        delete input.secret;
      }
      await adminUpdateCredentialProfile({
        id: profileId,
        input,
      });
      await refetchCredentialProfiles();
      statusMessage.value = "Credential profile updated.";
    } catch (error) {
      setErrorMessage(error, "Could not update credential profile.");
    }
  };
  
  const deleteCredentialProfile = async (profile) => {
    clearMessages();
    const accepted = window.confirm(`Delete credential profile '${profile.name}'?`);
    if (!accepted) {
      return;
    }
  
    try {
      await adminDeleteCredentialProfile({
        id: profile._id,
      });
      await refetchCredentialProfiles();
      statusMessage.value = "Credential profile deleted.";
    } catch (error) {
      setErrorMessage(error, "Could not delete credential profile.");
    }
  };
  
  const createBrokerProfile = async () => {
    clearMessages();
    try {
      const input = buildBrokerProfileMutationInput(createBrokerProfileInput.value);
      await adminCreateBrokerProfile({
        input,
      });
      createBrokerProfileInput.value = toBrokerProfileDraft();
      await refetchBrokerProfiles();
      profileCatalogStore.setBrokerProfiles(brokerProfiles.value);
      statusMessage.value = "Broker profile created.";
    } catch (error) {
      setErrorMessage(error, "Could not create broker profile.");
    }
  };
  
  const saveBrokerProfile = async (profileId) => {
    clearMessages();
    const draft = brokerProfileDrafts.value[profileId];
    if (!draft) {
      return;
    }
  
    try {
      const input = buildBrokerProfileMutationInput(draft);
      await adminUpdateBrokerProfile({
        id: profileId,
        input,
      });
      await refetchBrokerProfiles();
      profileCatalogStore.setBrokerProfiles(brokerProfiles.value);
      statusMessage.value = "Broker profile updated.";
    } catch (error) {
      setErrorMessage(error, "Could not update broker profile.");
    }
  };
  
  const deleteBrokerProfile = async (profile) => {
    clearMessages();
    const accepted = window.confirm(`Delete broker profile '${profile.name}'?`);
    if (!accepted) {
      return;
    }
  
    try {
      await adminDeleteBrokerProfile({
        id: profile._id,
      });
      await refetchBrokerProfiles();
      profileCatalogStore.setBrokerProfiles(brokerProfiles.value);
      statusMessage.value = "Broker profile deleted.";
    } catch (error) {
      setErrorMessage(error, "Could not delete broker profile.");
    }
  };

  return {
    BROKER_PROFILE_PROTOCOL_OPTIONS,
    CREDENTIAL_PROFILE_TYPE_OPTIONS,
    DASHBOARD_VISIBILITY_OPTIONS,
    EXECUTION_MODE_OPTIONS,
    INVITE_ROLE_OPTIONS,
    REGISTRATION_DEFAULT_ROLE_OPTIONS,
    REGISTRATION_MODE_OPTIONS,
    ROLE_OPTIONS,
    statusMessage,
    actionError,
    userDrafts,
    credentialProfileDrafts,
    brokerProfileDrafts,
    issuedInvite,
    createUserInput,
    createInviteInput,
    createCredentialProfileInput,
    createBrokerProfileInput,
    policyDraft,
    usersLoading,
    pendingInvitesLoading,
    credentialProfilesLoading,
    brokerProfilesLoading,
    datasourceDiagnosticsLoading,
    users,
    pendingInvites,
    policy,
    credentialProfiles,
    brokerProfiles,
    datasourceDiagnostics,
    issuedResetEntries,
    isBusy,
    isPolicyLocked,
    hasLoadError,
    formatDateTime,
    savePolicy,
    createUser,
    saveUser,
    deleteUser,
    createInvite,
    revokeInvite,
    issueResetToken,
    createCredentialProfile,
    saveCredentialProfile,
    deleteCredentialProfile,
    createBrokerProfile,
    saveBrokerProfile,
    deleteBrokerProfile,
  };
};
