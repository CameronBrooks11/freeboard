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
  SERVICE_ACCOUNT_SCOPE_OPTIONS,
  toBrokerProfileDraft,
  toCredentialProfileDraft,
  toPolicyDraft,
  toServiceAccountDraft,
  toUserDraft,
} from "../admin/adminConsoleState.js";
import {
  buildBrokerProfileMutationInput,
  buildCredentialProfileMutationInput,
  dashboardVisibilityToEnum,
  executionModeToEnum,
  extractErrorMessage,
  formatDateTime,
  registrationModeToEnum,
  roleToEnum,
  serviceAccountScopeToEnum,
} from "./adminConsoleFormHelpers.js";
import {
  ADMIN_AUDIT_EVENTS_QUERY,
  ADMIN_CREATE_BROKER_PROFILE_MUTATION,
  ADMIN_CREATE_CREDENTIAL_PROFILE_MUTATION,
  ADMIN_CREATE_INVITE_MUTATION,
  ADMIN_CREATE_SERVICE_ACCOUNT_MUTATION,
  ADMIN_CREATE_USER_MUTATION,
  ADMIN_DELETE_BROKER_PROFILE_MUTATION,
  ADMIN_DELETE_CREDENTIAL_PROFILE_MUTATION,
  ADMIN_DELETE_SERVICE_ACCOUNT_MUTATION,
  ADMIN_DELETE_USER_MUTATION,
  ADMIN_ISSUE_PASSWORD_RESET_MUTATION,
  ADMIN_ISSUE_SERVICE_ACCOUNT_TOKEN_MUTATION,
  ADMIN_PENDING_INVITES_QUERY,
  ADMIN_REVOKE_SERVICE_ACCOUNT_TOKEN_MUTATION,
  ADMIN_REVOKE_INVITE_MUTATION,
  ADMIN_DATASOURCE_DIAGNOSTICS_QUERY,
  ADMIN_RUNTIME_METRICS_QUERY,
  ADMIN_ROTATE_SERVICE_ACCOUNT_TOKEN_MUTATION,
  ADMIN_SERVICE_ACCOUNTS_QUERY,
  ADMIN_SERVICE_ACCOUNT_TOKENS_QUERY,
  ADMIN_UPDATE_SERVICE_ACCOUNT_MUTATION,
  ADMIN_UPDATE_BROKER_PROFILE_MUTATION,
  ADMIN_UPDATE_CREDENTIAL_PROFILE_MUTATION,
  ADMIN_UPDATE_USER_MUTATION,
  BROKER_PROFILES_QUERY,
  ADMIN_USERS_QUERY,
  AUTH_POLICY_QUERY,
  CREDENTIAL_PROFILES_QUERY,
  SET_AUTH_POLICY_MUTATION,
} from "../gql.js";

type UserDraft = ReturnType<typeof toUserDraft>;
type PolicyDraft = ReturnType<typeof toPolicyDraft>;
type CredentialProfileDraft = ReturnType<typeof toCredentialProfileDraft>;
type BrokerProfileDraft = ReturnType<typeof toBrokerProfileDraft>;
type ServiceAccountDraft = ReturnType<typeof toServiceAccountDraft>;

type User = { _id: string; email: string; role?: string; active?: boolean };
type Invite = { _id: string; email?: string; role?: string; token?: string; expiresAt?: string };
type CredentialProfile = { _id: string; name?: string; type?: string; secretShape?: string };
type BrokerProfile = { _id: string; name?: string };
type ServiceAccount = { _id: string; name?: string; tokenCount?: number; lastUsedAt?: string };
type ServiceAccountToken = {
  _id: string;
  serviceAccountId?: string | null;
  label?: string;
  scopes?: string[];
  expiresAt?: string;
  revokedAt?: string | null;
  lastUsedAt?: string;
};
type IssuedTokenPayload = { token: string; tokenPrefix?: string; expiresAt?: string };
type PasswordResetPayload = { token: string; expiresAt?: string; resetUrl: string };
type DatasourceDiagnostics = {
  totalDashboards: number;
  totalDatasources: number;
  credentialBoundDatasources: number;
  externalDashboardDatasources: number;
  invalidDatasources: number;
  typeCounts: Array<{ type: string; count: number }>;
};
type RuntimeMetric = {
  api?: {
    requestCount?: number;
    errorCount?: number;
    p95LatencyMs?: number;
    authFailureCount?: number;
  };
  gateway?: {
    httpRequestCount?: number;
    httpErrorCount?: number;
    realtimeActiveConnections?: number;
    realtimeErrorCount?: number;
  };
};
type AuditEvent = {
  _id: string | number;
  action?: string;
  actorUserId?: string;
  createdAt?: string;
  actorType?: string;
  actorId?: string;
  eventType?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export const useAdminConsoleController = () => {
  const authStore = useAuthStore();
  const dashboardStore = useDashboardStore();
  const profileCatalogStore = useProfileCatalogStore();
  const appBaseUrl = `${window.location.origin}${window.location.pathname.replace(/\/admin\/?$/, "/")}`;

  const statusMessage = ref("");
  const actionError = ref("");
  const userDrafts = ref<Record<string, UserDraft>>({});
  const credentialProfileDrafts = ref<Record<string, CredentialProfileDraft>>({});
  const brokerProfileDrafts = ref<Record<string, BrokerProfileDraft>>({});
  const serviceAccountDrafts = ref<Record<string, ServiceAccountDraft>>({});
  const issuedInvite = ref<(Invite & { acceptUrl: string }) | null>(null);
  const issuedServiceAccountTokenByAccount = ref<Record<string, IssuedTokenPayload>>({});
  const issuedResetByUser = ref<Record<string, PasswordResetPayload>>({});

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
  const createCredentialProfileInput = ref<CredentialProfileDraft>(toCredentialProfileDraft());
  const createBrokerProfileInput = ref<BrokerProfileDraft>(toBrokerProfileDraft());
  const createServiceAccountInput = ref<ServiceAccountDraft>(
    toServiceAccountDraft({ scopes: ["ops:read"] }),
  );
  const createServiceAccountTokenInput = ref({
    serviceAccountId: "",
    label: "",
    scopes: ["ops:read"],
    expiresInHours: 720,
  });
  const policyDraft = ref<PolicyDraft>(toPolicyDraft());

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
    result: serviceAccountsResult,
    loading: serviceAccountsLoading,
    error: serviceAccountsError,
    refetch: refetchServiceAccounts,
  } = useQuery(ADMIN_SERVICE_ACCOUNTS_QUERY, {}, { fetchPolicy: "network-only" });
  const serviceAccountTokensQueryEnabled = computed(
    () => String(createServiceAccountTokenInput.value.serviceAccountId || "").trim().length > 0,
  );
  const {
    result: serviceAccountTokensResult,
    loading: serviceAccountTokensLoading,
    error: serviceAccountTokensError,
    refetch: refetchServiceAccountTokens,
  } = useQuery(
    ADMIN_SERVICE_ACCOUNT_TOKENS_QUERY,
    () => ({ serviceAccountId: createServiceAccountTokenInput.value.serviceAccountId }),
    { fetchPolicy: "network-only", enabled: serviceAccountTokensQueryEnabled },
  );
  const {
    result: runtimeMetricsResult,
    loading: runtimeMetricsLoading,
    error: runtimeMetricsError,
    refetch: refetchRuntimeMetrics,
  } = useQuery(ADMIN_RUNTIME_METRICS_QUERY, {}, { fetchPolicy: "network-only" });
  const {
    result: auditEventsResult,
    loading: auditEventsLoading,
    error: auditEventsError,
    refetch: refetchAuditEvents,
  } = useQuery(ADMIN_AUDIT_EVENTS_QUERY, { limit: 100 }, { fetchPolicy: "network-only" });
  const {
    result: datasourceDiagnosticsResult,
    loading: datasourceDiagnosticsLoading,
    error: datasourceDiagnosticsError,
  } = useQuery(ADMIN_DATASOURCE_DIAGNOSTICS_QUERY, {}, { fetchPolicy: "network-only" });

  const { mutate: adminCreateUser, loading: createUserLoading } = useMutation(
    ADMIN_CREATE_USER_MUTATION,
  );
  const { mutate: adminUpdateUser, loading: updateUserLoading } = useMutation(
    ADMIN_UPDATE_USER_MUTATION,
  );
  const { mutate: adminDeleteUser, loading: deleteUserLoading } = useMutation(
    ADMIN_DELETE_USER_MUTATION,
  );
  const { mutate: setAuthPolicy, loading: setPolicyLoading } =
    useMutation(SET_AUTH_POLICY_MUTATION);
  const { mutate: adminCreateInvite, loading: createInviteLoading } = useMutation(
    ADMIN_CREATE_INVITE_MUTATION,
  );
  const { mutate: adminRevokeInvite, loading: revokeInviteLoading } = useMutation(
    ADMIN_REVOKE_INVITE_MUTATION,
  );
  const { mutate: adminIssuePasswordReset, loading: issueResetLoading } = useMutation(
    ADMIN_ISSUE_PASSWORD_RESET_MUTATION,
  );
  const { mutate: adminCreateCredentialProfile, loading: createCredentialProfileLoading } =
    useMutation(ADMIN_CREATE_CREDENTIAL_PROFILE_MUTATION);
  const { mutate: adminUpdateCredentialProfile, loading: updateCredentialProfileLoading } =
    useMutation(ADMIN_UPDATE_CREDENTIAL_PROFILE_MUTATION);
  const { mutate: adminDeleteCredentialProfile, loading: deleteCredentialProfileLoading } =
    useMutation(ADMIN_DELETE_CREDENTIAL_PROFILE_MUTATION);
  const { mutate: adminCreateBrokerProfile, loading: createBrokerProfileLoading } = useMutation(
    ADMIN_CREATE_BROKER_PROFILE_MUTATION,
  );
  const { mutate: adminUpdateBrokerProfile, loading: updateBrokerProfileLoading } = useMutation(
    ADMIN_UPDATE_BROKER_PROFILE_MUTATION,
  );
  const { mutate: adminDeleteBrokerProfile, loading: deleteBrokerProfileLoading } = useMutation(
    ADMIN_DELETE_BROKER_PROFILE_MUTATION,
  );
  const { mutate: adminCreateServiceAccount, loading: createServiceAccountLoading } = useMutation(
    ADMIN_CREATE_SERVICE_ACCOUNT_MUTATION,
  );
  const { mutate: adminUpdateServiceAccount, loading: updateServiceAccountLoading } = useMutation(
    ADMIN_UPDATE_SERVICE_ACCOUNT_MUTATION,
  );
  const { mutate: adminDeleteServiceAccount, loading: deleteServiceAccountLoading } = useMutation(
    ADMIN_DELETE_SERVICE_ACCOUNT_MUTATION,
  );
  const { mutate: adminIssueServiceAccountToken, loading: issueServiceAccountTokenLoading } =
    useMutation(ADMIN_ISSUE_SERVICE_ACCOUNT_TOKEN_MUTATION);
  const { mutate: adminRotateServiceAccountToken, loading: rotateServiceAccountTokenLoading } =
    useMutation(ADMIN_ROTATE_SERVICE_ACCOUNT_TOKEN_MUTATION);
  const { mutate: adminRevokeServiceAccountToken, loading: revokeServiceAccountTokenLoading } =
    useMutation(ADMIN_REVOKE_SERVICE_ACCOUNT_TOKEN_MUTATION);

  const users = computed<User[]>(() => (usersResult.value?.listAllUsers || []) as User[]);
  const pendingInvites = computed<Invite[]>(
    () => (pendingInvitesResult.value?.listPendingInvites || []) as Invite[],
  );
  const policy = computed<Record<string, unknown> | null>(
    () => (policyResult.value?.authPolicy as Record<string, unknown> | null) || null,
  );
  const credentialProfiles = computed<CredentialProfile[]>(
    () => (credentialProfilesResult.value?.credentialProfiles || []) as CredentialProfile[],
  );
  const brokerProfiles = computed<BrokerProfile[]>(
    () => (brokerProfilesResult.value?.brokerProfiles || []) as BrokerProfile[],
  );
  const datasourceDiagnostics = computed<DatasourceDiagnostics | null>(
    () =>
      (datasourceDiagnosticsResult.value?.adminDatasourceDiagnostics as DatasourceDiagnostics) ||
      null,
  );
  const serviceAccounts = computed<ServiceAccount[]>(
    () => (serviceAccountsResult.value?.adminServiceAccounts || []) as ServiceAccount[],
  );
  const serviceAccountTokens = computed<ServiceAccountToken[]>(
    () =>
      (serviceAccountTokensResult.value?.adminServiceAccountTokens || []) as ServiceAccountToken[],
  );
  const runtimeMetrics = computed<RuntimeMetric | null>(
    () => (runtimeMetricsResult.value?.adminRuntimeMetrics as RuntimeMetric) || null,
  );
  const auditEvents = computed<AuditEvent[]>(() =>
    ((auditEventsResult.value?.adminAuditEvents || []) as Array<Record<string, unknown>>).map(
      (event, index) => ({
        _id:
          typeof event._id === "string" || typeof event._id === "number"
            ? event._id
            : `event-${index}`,
        action: typeof event.action === "string" ? event.action : undefined,
        actorUserId: typeof event.actorUserId === "string" ? event.actorUserId : undefined,
        createdAt: typeof event.createdAt === "string" ? event.createdAt : undefined,
        actorType: typeof event.actorType === "string" ? event.actorType : undefined,
        actorId: typeof event.actorId === "string" ? event.actorId : undefined,
        eventType: typeof event.eventType === "string" ? event.eventType : undefined,
        targetType: typeof event.targetType === "string" ? event.targetType : undefined,
        targetId: typeof event.targetId === "string" ? event.targetId : undefined,
        metadata:
          event.metadata && typeof event.metadata === "object"
            ? (event.metadata as Record<string, unknown>)
            : undefined,
      }),
    ),
  );
  const issuedResetEntries = computed(() =>
    users.value
      .filter((user) => Boolean(issuedResetByUser.value[user._id]))
      .map((user) => ({
        email: user.email,
        payload: issuedResetByUser.value[user._id],
        userId: user._id,
      })),
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
      deleteBrokerProfileLoading.value ||
      createServiceAccountLoading.value ||
      updateServiceAccountLoading.value ||
      deleteServiceAccountLoading.value ||
      issueServiceAccountTokenLoading.value ||
      rotateServiceAccountTokenLoading.value ||
      revokeServiceAccountTokenLoading.value ||
      serviceAccountsLoading.value ||
      serviceAccountTokensLoading.value ||
      runtimeMetricsLoading.value ||
      auditEventsLoading.value,
  );
  const isPolicyLocked = computed(() => policyDraft.value.policyEditLock === true);
  const hasLoadError = computed(
    () =>
      usersError.value ||
      policyError.value ||
      pendingInvitesError.value ||
      credentialProfilesError.value ||
      brokerProfilesError.value ||
      datasourceDiagnosticsError.value ||
      serviceAccountsError.value ||
      serviceAccountTokensError.value ||
      runtimeMetricsError.value ||
      auditEventsError.value,
  );

  watch(usersResult, () => {
    const nextDrafts: Record<string, UserDraft> = {};
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
    const nextDrafts: Record<string, CredentialProfileDraft> = {};
    profiles.forEach((profile) => {
      nextDrafts[profile._id] = toCredentialProfileDraft(profile);
    });
    credentialProfileDrafts.value = nextDrafts;
    profileCatalogStore.setCredentialProfiles(profiles);
  });

  watch(brokerProfilesResult, () => {
    const profiles = brokerProfiles.value;
    const nextDrafts: Record<string, BrokerProfileDraft> = {};
    profiles.forEach((profile) => {
      nextDrafts[profile._id] = toBrokerProfileDraft(profile);
    });
    brokerProfileDrafts.value = nextDrafts;
    profileCatalogStore.setBrokerProfiles(profiles);
  });

  watch(serviceAccountsResult, () => {
    const nextDrafts: Record<string, ServiceAccountDraft> = {};
    serviceAccounts.value.forEach((account) => {
      nextDrafts[account._id] = toServiceAccountDraft(account);
    });
    serviceAccountDrafts.value = nextDrafts;

    if (
      !createServiceAccountTokenInput.value.serviceAccountId &&
      serviceAccounts.value.length > 0
    ) {
      const firstServiceAccount = serviceAccounts.value[0];
      if (firstServiceAccount?._id) {
        createServiceAccountTokenInput.value.serviceAccountId = firstServiceAccount._id;
      }
    }
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

  const clearMessages = () => {
    statusMessage.value = "";
    actionError.value = "";
  };

  const normalizeServiceAccountScopeInput = (scopes: readonly unknown[] = []): string[] => [
    ...new Set(
      scopes
        .map((scope) =>
          String(scope || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];

  const setErrorMessage = (error: unknown, fallback: string): void => {
    actionError.value = extractErrorMessage(error, fallback);
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
          policyDraft.value.dashboardDefaultVisibility,
        ),
        dashboardPublicListingEnabled: Boolean(policyDraft.value.dashboardPublicListingEnabled),
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

  const saveUser = async (userId: string) => {
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

  const deleteUser = async (user: User) => {
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

  const createServiceAccount = async () => {
    clearMessages();
    try {
      await adminCreateServiceAccount({
        input: {
          name: String(createServiceAccountInput.value.name || "").trim(),
          description: String(createServiceAccountInput.value.description || "").trim(),
          active: Boolean(createServiceAccountInput.value.active),
          scopes: normalizeServiceAccountScopeInput(createServiceAccountInput.value.scopes).map(
            serviceAccountScopeToEnum,
          ),
        },
      });
      createServiceAccountInput.value = toServiceAccountDraft({ scopes: ["ops:read"] });
      await refetchServiceAccounts();
      statusMessage.value = "Service account created.";
    } catch (error) {
      setErrorMessage(error, "Could not create service account.");
    }
  };

  const saveServiceAccount = async (serviceAccountId: string) => {
    clearMessages();
    const draft = serviceAccountDrafts.value[serviceAccountId];
    if (!draft) {
      return;
    }
    try {
      await adminUpdateServiceAccount({
        id: serviceAccountId,
        input: {
          name: String(draft.name || "").trim(),
          description: String(draft.description || "").trim(),
          active: Boolean(draft.active),
          scopes: normalizeServiceAccountScopeInput(draft.scopes).map(serviceAccountScopeToEnum),
        },
      });
      await refetchServiceAccounts();
      statusMessage.value = "Service account updated.";
    } catch (error) {
      setErrorMessage(error, "Could not update service account.");
    }
  };

  const deleteServiceAccount = async (serviceAccount: ServiceAccount) => {
    clearMessages();
    const accepted = window.confirm(`Delete service account '${serviceAccount.name}'?`);
    if (!accepted) {
      return;
    }
    try {
      await adminDeleteServiceAccount({ id: serviceAccount._id });
      await refetchServiceAccounts();
      statusMessage.value = "Service account deleted.";
    } catch (error) {
      setErrorMessage(error, "Could not delete service account.");
    }
  };

  const issueServiceAccountToken = async () => {
    clearMessages();
    const serviceAccountId = String(
      createServiceAccountTokenInput.value.serviceAccountId || "",
    ).trim();
    if (!serviceAccountId) {
      actionError.value = "Select a service account before issuing a token.";
      return;
    }
    try {
      const result = await adminIssueServiceAccountToken({
        serviceAccountId,
        label: String(createServiceAccountTokenInput.value.label || "").trim() || null,
        scopes: normalizeServiceAccountScopeInput(createServiceAccountTokenInput.value.scopes).map(
          serviceAccountScopeToEnum,
        ),
        expiresInHours: Number(createServiceAccountTokenInput.value.expiresInHours) || null,
      });
      const issued = result?.data?.adminIssueServiceAccountToken;
      if (issued) {
        issuedServiceAccountTokenByAccount.value = {
          ...issuedServiceAccountTokenByAccount.value,
          [serviceAccountId]: issued,
        };
      }
      await Promise.all([refetchServiceAccounts(), refetchServiceAccountTokens()]);
      statusMessage.value = "Service account token issued.";
    } catch (error) {
      setErrorMessage(error, "Could not issue service account token.");
    }
  };

  const rotateServiceAccountToken = async (tokenRecord: ServiceAccountToken) => {
    clearMessages();
    try {
      const result = await adminRotateServiceAccountToken({
        id: tokenRecord._id,
        expiresInHours: Number(createServiceAccountTokenInput.value.expiresInHours) || null,
      });
      const issued = result?.data?.adminRotateServiceAccountToken;
      const serviceAccountId = tokenRecord.serviceAccountId;
      if (issued && serviceAccountId) {
        issuedServiceAccountTokenByAccount.value = {
          ...issuedServiceAccountTokenByAccount.value,
          [serviceAccountId]: issued,
        };
      }
      await refetchServiceAccountTokens();
      statusMessage.value = "Service account token rotated.";
    } catch (error) {
      setErrorMessage(error, "Could not rotate service account token.");
    }
  };

  const revokeServiceAccountToken = async (tokenRecord: ServiceAccountToken) => {
    clearMessages();
    try {
      await adminRevokeServiceAccountToken({ id: tokenRecord._id });
      await refetchServiceAccountTokens();
      statusMessage.value = "Service account token revoked.";
    } catch (error) {
      setErrorMessage(error, "Could not revoke service account token.");
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
      const payload = result.data?.adminCreateInvite as Invite | null | undefined;
      issuedInvite.value = payload
        ? {
            ...payload,
            acceptUrl: `${appBaseUrl}login?invite=${encodeURIComponent(String(payload.token || ""))}`,
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

  const revokeInvite = async (invite: Invite) => {
    clearMessages();
    try {
      await adminRevokeInvite({ id: invite._id });
      await refetchPendingInvites();
      statusMessage.value = "Invite revoked.";
    } catch (error) {
      setErrorMessage(error, "Could not revoke invite.");
    }
  };

  const issueResetToken = async (user: User) => {
    clearMessages();
    try {
      const result = await adminIssuePasswordReset({
        id: user._id,
        expiresInHours: 24,
      });
      const payload = result.data?.adminIssuePasswordReset as
        | { token?: string; expiresAt?: string }
        | null
        | undefined;
      if (payload) {
        issuedResetByUser.value = {
          ...issuedResetByUser.value,
          [user._id]: {
            ...payload,
            token: String(payload.token || ""),
            resetUrl: `${appBaseUrl}login?reset=${encodeURIComponent(String(payload.token || ""))}`,
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

  const saveCredentialProfile = async (profileId: string) => {
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

  const deleteCredentialProfile = async (profile: CredentialProfile) => {
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

  const saveBrokerProfile = async (profileId: string) => {
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

  const deleteBrokerProfile = async (profile: BrokerProfile) => {
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
    SERVICE_ACCOUNT_SCOPE_OPTIONS,
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
    serviceAccountDrafts,
    issuedInvite,
    issuedServiceAccountTokenByAccount,
    createUserInput,
    createInviteInput,
    createCredentialProfileInput,
    createBrokerProfileInput,
    createServiceAccountInput,
    createServiceAccountTokenInput,
    policyDraft,
    usersLoading,
    pendingInvitesLoading,
    credentialProfilesLoading,
    brokerProfilesLoading,
    serviceAccountsLoading,
    serviceAccountTokensLoading,
    runtimeMetricsLoading,
    auditEventsLoading,
    datasourceDiagnosticsLoading,
    users,
    pendingInvites,
    policy,
    credentialProfiles,
    brokerProfiles,
    serviceAccounts,
    serviceAccountTokens,
    runtimeMetrics,
    auditEvents,
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
    createServiceAccount,
    saveServiceAccount,
    deleteServiceAccount,
    issueServiceAccountToken,
    rotateServiceAccountToken,
    revokeServiceAccountToken,
    refetchRuntimeMetrics,
    refetchAuditEvents,
  };
};
