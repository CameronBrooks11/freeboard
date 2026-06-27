<script setup lang="ts">
/**
 * @component AdminConsole
 * @description Admin-only surface for user lifecycle and policy management.
 */
defineOptions({ name: "AdminConsole" });

import { RouterLink } from "vue-router";
import { useAdminConsoleController } from "../admin/useAdminConsoleController.js";

const {
  BROKER_PROFILE_PROTOCOL_OPTIONS,
  CREDENTIAL_PROFILE_TYPE_OPTIONS,
  DASHBOARD_VISIBILITY_OPTIONS,
  EXECUTION_MODE_OPTIONS,
  INVITE_ROLE_OPTIONS,
  REGISTRATION_DEFAULT_ROLE_OPTIONS,
  REGISTRATION_MODE_OPTIONS,
  ROLE_OPTIONS,
  SERVICE_ACCOUNT_SCOPE_OPTIONS,
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
} = useAdminConsoleController();
</script>

<template>
  <div class="admin-console">
    <header class="admin-console__header">
      <div class="admin-console__header-copy">
        <h1 class="admin-console__title">{{ $t("admin.title") }}</h1>
        <p class="admin-console__subtitle">
          {{ $t("admin.currentRuntimeMode") }}:
          <strong>{{ policyDraft.executionMode }}</strong>
        </p>
      </div>
      <RouterLink class="admin-console__back" to="/">
        {{ $t("admin.backToDashboard") }}
      </RouterLink>
    </header>

    <div class="admin-console__alerts">
      <p v-if="statusMessage" class="admin-console__message admin-console__message--status">
        {{ statusMessage }}
      </p>
      <p v-if="actionError" class="admin-console__message admin-console__message--error">
        {{ actionError }}
      </p>
      <p v-if="hasLoadError" class="admin-console__message admin-console__message--error">
        {{ $t("admin.loadError") }}
      </p>
    </div>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.datasourceDiagnosticsTitle") }}</h2>
      </div>
      <div v-if="datasourceDiagnosticsLoading" class="admin-console__loading">
        {{ $t("admin.loadingDatasourceDiagnostics") }}
      </div>
      <template v-else-if="datasourceDiagnostics">
        <div class="admin-console__stats-grid">
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.totalDashboards") }}</span>
            <strong class="admin-console__stat-value">
              {{ datasourceDiagnostics.totalDashboards }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.totalDatasources") }}</span>
            <strong class="admin-console__stat-value">
              {{ datasourceDiagnostics.totalDatasources }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">
              {{ $t("admin.credentialBoundDatasources") }}
            </span>
            <strong class="admin-console__stat-value">
              {{ datasourceDiagnostics.credentialBoundDatasources }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">
              {{ $t("admin.externalDashboardDatasources") }}
            </span>
            <strong class="admin-console__stat-value">
              {{ datasourceDiagnostics.externalDashboardDatasources }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.invalidDatasources") }}</span>
            <strong class="admin-console__stat-value">
              {{ datasourceDiagnostics.invalidDatasources }}
            </strong>
          </article>
        </div>
        <div class="admin-console__table-wrap">
          <table class="admin-console__table">
            <thead>
              <tr>
                <th>{{ $t("form.labelType") }}</th>
                <th>{{ $t("admin.count") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in datasourceDiagnostics.typeCounts"
                :key="`datasource-type-count-${entry.type}`"
              >
                <td>{{ entry.type }}</td>
                <td>{{ entry.count }}</td>
              </tr>
              <tr v-if="datasourceDiagnostics.typeCounts.length === 0">
                <td colspan="2" class="admin-console__empty">
                  {{ $t("admin.noDatasourceDiagnostics") }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.policyTitle") }}</h2>
        <button
          type="button"
          class="admin-console__button admin-console__button--primary"
          :disabled="isPolicyLocked || isBusy"
          @click="savePolicy"
        >
          {{ $t("admin.savePolicy") }}
        </button>
      </div>
      <div class="admin-console__form-grid admin-console__form-grid--policy">
        <label class="admin-console__field">
          {{ $t("admin.registrationMode") }}
          <select
            v-model="policyDraft.registrationMode"
            class="admin-console__select"
            :disabled="isPolicyLocked || isBusy"
          >
            <option
              v-for="option in REGISTRATION_MODE_OPTIONS"
              :key="`mode-${option}`"
              :value="option"
            >
              {{ option }}
            </option>
          </select>
        </label>
        <label class="admin-console__field">
          {{ $t("admin.registrationDefaultRole") }}
          <select
            v-model="policyDraft.registrationDefaultRole"
            class="admin-console__select"
            :disabled="isPolicyLocked || isBusy"
          >
            <option
              v-for="role in REGISTRATION_DEFAULT_ROLE_OPTIONS"
              :key="`registration-default-role-${role}`"
              :value="role"
            >
              {{ role }}
            </option>
          </select>
        </label>
        <label class="admin-console__checkbox">
          <input
            class="admin-console__checkbox-input"
            type="checkbox"
            v-model="policyDraft.editorCanPublish"
            :disabled="isPolicyLocked || isBusy"
          />
          <span>{{ $t("admin.editorCanPublish") }}</span>
        </label>
        <label class="admin-console__field">
          {{ $t("admin.dashboardDefaultVisibility") }}
          <select
            v-model="policyDraft.dashboardDefaultVisibility"
            class="admin-console__select"
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
            class="admin-console__checkbox-input"
            type="checkbox"
            v-model="policyDraft.dashboardPublicListingEnabled"
            :disabled="isPolicyLocked || isBusy"
          />
          <span>{{ $t("admin.dashboardPublicListingEnabled") }}</span>
        </label>
        <label class="admin-console__field">
          {{ $t("admin.executionMode") }}
          <select
            v-model="policyDraft.executionMode"
            class="admin-console__select"
            :disabled="isPolicyLocked || isBusy"
          >
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
    </section>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.serviceAccountsTitle") }}</h2>
        <button
          type="button"
          class="admin-console__button admin-console__button--primary"
          :disabled="isBusy"
          @click="createServiceAccount"
        >
          {{ $t("admin.createServiceAccountButton") }}
        </button>
      </div>

      <div class="admin-console__form-grid">
        <label class="admin-console__field">
          {{ $t("form.labelName") }}
          <input
            v-model="createServiceAccountInput.name"
            class="admin-console__input"
            type="text"
            :disabled="isBusy"
          />
        </label>
        <label class="admin-console__field admin-console__field--full">
          {{ $t("admin.description") }}
          <input
            v-model="createServiceAccountInput.description"
            class="admin-console__input"
            type="text"
            :disabled="isBusy"
          />
        </label>
        <label class="admin-console__checkbox">
          <input
            class="admin-console__checkbox-input"
            type="checkbox"
            v-model="createServiceAccountInput.active"
            :disabled="isBusy"
          />
          <span>{{ $t("admin.active") }}</span>
        </label>
      </div>
      <div class="admin-console__form-grid">
        <label
          v-for="scope in SERVICE_ACCOUNT_SCOPE_OPTIONS"
          :key="`create-service-account-scope-${scope}`"
          class="admin-console__checkbox"
        >
          <input
            class="admin-console__checkbox-input"
            type="checkbox"
            :value="scope"
            v-model="createServiceAccountInput.scopes"
            :disabled="isBusy"
          />
          <span>{{ scope }}</span>
        </label>
      </div>

      <div v-if="serviceAccountsLoading" class="admin-console__loading">
        {{ $t("admin.loadingServiceAccounts") }}
      </div>
      <div v-else class="admin-console__table-wrap">
        <table class="admin-console__table">
          <thead>
            <tr>
              <th>{{ $t("form.labelName") }}</th>
              <th>{{ $t("admin.description") }}</th>
              <th>{{ $t("admin.scopes") }}</th>
              <th>{{ $t("admin.active") }}</th>
              <th>{{ $t("admin.tokens") }}</th>
              <th>{{ $t("admin.lastUsedAt") }}</th>
              <th>{{ $t("admin.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="serviceAccount in serviceAccounts" :key="serviceAccount._id">
              <td>
                <input
                  v-if="serviceAccountDrafts[serviceAccount._id]"
                  v-model="serviceAccountDrafts[serviceAccount._id]!.name"
                  class="admin-console__input"
                  type="text"
                  :disabled="isBusy"
                />
              </td>
              <td>
                <input
                  v-if="serviceAccountDrafts[serviceAccount._id]"
                  v-model="serviceAccountDrafts[serviceAccount._id]!.description"
                  class="admin-console__input"
                  type="text"
                  :disabled="isBusy"
                />
              </td>
              <td>
                <div v-if="serviceAccountDrafts[serviceAccount._id]" class="admin-console__actions">
                  <label
                    v-for="scope in SERVICE_ACCOUNT_SCOPE_OPTIONS"
                    :key="`${serviceAccount._id}-scope-${scope}`"
                    class="admin-console__checkbox"
                  >
                    <input
                      class="admin-console__checkbox-input"
                      type="checkbox"
                      :value="scope"
                      v-model="serviceAccountDrafts[serviceAccount._id]!.scopes"
                      :disabled="isBusy"
                    />
                    <span>{{ scope }}</span>
                  </label>
                </div>
              </td>
              <td>
                <input
                  v-if="serviceAccountDrafts[serviceAccount._id]"
                  class="admin-console__checkbox-input"
                  type="checkbox"
                  v-model="serviceAccountDrafts[serviceAccount._id]!.active"
                  :disabled="isBusy"
                  :aria-label="$t('admin.active')"
                />
              </td>
              <td>{{ serviceAccount.tokenCount }}</td>
              <td>{{ formatDateTime(serviceAccount.lastUsedAt) }}</td>
              <td class="admin-console__actions">
                <button
                  type="button"
                  class="admin-console__button admin-console__button--primary admin-console__button--small"
                  :disabled="isBusy || !serviceAccountDrafts[serviceAccount._id]"
                  @click="saveServiceAccount(serviceAccount._id)"
                >
                  {{ $t("admin.saveServiceAccount") }}
                </button>
                <button
                  type="button"
                  class="admin-console__button admin-console__button--danger admin-console__button--small"
                  :disabled="isBusy"
                  @click="deleteServiceAccount(serviceAccount)"
                >
                  {{ $t("admin.deleteServiceAccount") }}
                </button>
              </td>
            </tr>
            <tr v-if="serviceAccounts.length === 0">
              <td colspan="7" class="admin-console__empty">
                {{ $t("admin.noServiceAccounts") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.serviceAccountTokensTitle") }}</h2>
        <button
          type="button"
          class="admin-console__button admin-console__button--primary"
          :disabled="isBusy"
          @click="issueServiceAccountToken"
        >
          {{ $t("admin.issueServiceAccountTokenButton") }}
        </button>
      </div>

      <div class="admin-console__form-grid">
        <label class="admin-console__field">
          {{ $t("admin.serviceAccount") }}
          <select
            v-model="createServiceAccountTokenInput.serviceAccountId"
            class="admin-console__select"
            :disabled="isBusy"
          >
            <option value="">{{ $t("admin.selectServiceAccount") }}</option>
            <option
              v-for="serviceAccount in serviceAccounts"
              :key="`service-account-token-target-${serviceAccount._id}`"
              :value="serviceAccount._id"
            >
              {{ serviceAccount.name }}
            </option>
          </select>
        </label>
        <label class="admin-console__field">
          {{ $t("form.labelTitle") }}
          <input
            v-model="createServiceAccountTokenInput.label"
            class="admin-console__input"
            type="text"
            :disabled="isBusy"
          />
        </label>
        <label class="admin-console__field">
          {{ $t("admin.expiresHours") }}
          <input
            v-model.number="createServiceAccountTokenInput.expiresInHours"
            class="admin-console__input"
            type="number"
            min="1"
            max="8760"
            :disabled="isBusy"
          />
        </label>
      </div>
      <div class="admin-console__form-grid">
        <label
          v-for="scope in SERVICE_ACCOUNT_SCOPE_OPTIONS"
          :key="`service-account-token-scope-${scope}`"
          class="admin-console__checkbox"
        >
          <input
            class="admin-console__checkbox-input"
            type="checkbox"
            :value="scope"
            v-model="createServiceAccountTokenInput.scopes"
            :disabled="isBusy"
          />
          <span>{{ scope }}</span>
        </label>
      </div>

      <div
        v-if="issuedServiceAccountTokenByAccount[createServiceAccountTokenInput.serviceAccountId]"
        class="admin-console__token-card"
      >
        <div class="admin-console__token-row">
          <strong>{{ $t("admin.serviceAccountToken") }}:</strong>
          <code class="admin-console__mono">
            {{
              issuedServiceAccountTokenByAccount[createServiceAccountTokenInput.serviceAccountId]
                ?.token
            }}
          </code>
        </div>
        <div class="admin-console__hint">
          {{ $t("admin.serviceAccountTokenDisplayWarning") }}
        </div>
      </div>

      <div v-if="serviceAccountTokensLoading" class="admin-console__loading">
        {{ $t("admin.loadingServiceAccountTokens") }}
      </div>
      <div v-else class="admin-console__table-wrap">
        <table class="admin-console__table">
          <thead>
            <tr>
              <th>{{ $t("form.labelTitle") }}</th>
              <th>{{ $t("admin.scopes") }}</th>
              <th>{{ $t("admin.expiresAt") }}</th>
              <th>{{ $t("admin.revokedAt") }}</th>
              <th>{{ $t("admin.lastUsedAt") }}</th>
              <th>{{ $t("admin.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tokenRecord in serviceAccountTokens" :key="tokenRecord._id">
              <td>{{ tokenRecord.label || "-" }}</td>
              <td>{{ (tokenRecord.scopes || []).join(", ") }}</td>
              <td>{{ formatDateTime(tokenRecord.expiresAt) }}</td>
              <td>{{ formatDateTime(tokenRecord.revokedAt) }}</td>
              <td>{{ formatDateTime(tokenRecord.lastUsedAt) }}</td>
              <td class="admin-console__actions">
                <button
                  type="button"
                  class="admin-console__button admin-console__button--small"
                  :disabled="isBusy || Boolean(tokenRecord.revokedAt)"
                  @click="rotateServiceAccountToken(tokenRecord)"
                >
                  {{ $t("admin.rotateToken") }}
                </button>
                <button
                  type="button"
                  class="admin-console__button admin-console__button--danger admin-console__button--small"
                  :disabled="isBusy || Boolean(tokenRecord.revokedAt)"
                  @click="revokeServiceAccountToken(tokenRecord)"
                >
                  {{ $t("admin.revokeToken") }}
                </button>
              </td>
            </tr>
            <tr v-if="serviceAccountTokens.length === 0">
              <td colspan="6" class="admin-console__empty">
                {{ $t("admin.noServiceAccountTokens") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.runtimeMetricsTitle") }}</h2>
        <button
          type="button"
          class="admin-console__button"
          :disabled="isBusy"
          @click="refetchRuntimeMetrics"
        >
          {{ $t("admin.refreshMetrics") }}
        </button>
      </div>
      <div v-if="runtimeMetricsLoading" class="admin-console__loading">
        {{ $t("admin.loadingRuntimeMetrics") }}
      </div>
      <template v-else-if="runtimeMetrics">
        <div class="admin-console__stats-grid">
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.apiRequests") }}</span>
            <strong class="admin-console__stat-value">
              {{ runtimeMetrics.api?.requestCount ?? 0 }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.apiErrors") }}</span>
            <strong class="admin-console__stat-value">
              {{ runtimeMetrics.api?.errorCount ?? 0 }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.apiP95LatencyMs") }}</span>
            <strong class="admin-console__stat-value">
              {{ runtimeMetrics.api?.p95LatencyMs ?? 0 }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.authFailures") }}</span>
            <strong class="admin-console__stat-value">
              {{ runtimeMetrics.api?.authFailureCount ?? 0 }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.gatewayRequests") }}</span>
            <strong class="admin-console__stat-value">
              {{ runtimeMetrics.gateway?.httpRequestCount ?? 0 }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.gatewayErrors") }}</span>
            <strong class="admin-console__stat-value">
              {{ runtimeMetrics.gateway?.httpErrorCount ?? 0 }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.realtimeConnections") }}</span>
            <strong class="admin-console__stat-value">
              {{ runtimeMetrics.gateway?.realtimeActiveConnections ?? 0 }}
            </strong>
          </article>
          <article class="admin-console__stat-card">
            <span class="admin-console__stat-label">{{ $t("admin.realtimeErrors") }}</span>
            <strong class="admin-console__stat-value">
              {{ runtimeMetrics.gateway?.realtimeErrorCount ?? 0 }}
            </strong>
          </article>
        </div>
      </template>
    </section>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.auditEventsTitle") }}</h2>
        <button
          type="button"
          class="admin-console__button"
          :disabled="isBusy"
          @click="() => void refetchAuditEvents()"
        >
          {{ $t("admin.refreshAuditEvents") }}
        </button>
      </div>
      <div v-if="auditEventsLoading" class="admin-console__loading">
        {{ $t("admin.loadingAuditEvents") }}
      </div>
      <div v-else class="admin-console__table-wrap">
        <table class="admin-console__table">
          <thead>
            <tr>
              <th>{{ $t("admin.action") }}</th>
              <th>{{ $t("admin.target") }}</th>
              <th>{{ $t("admin.actor") }}</th>
              <th>{{ $t("admin.createdAt") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in auditEvents" :key="event._id">
              <td>{{ event.action }}</td>
              <td>{{ `${event.targetType || "-"}:${event.targetId || "-"}` }}</td>
              <td>{{ event.actorUserId || "-" }}</td>
              <td>{{ formatDateTime(event.createdAt) }}</td>
            </tr>
            <tr v-if="auditEvents.length === 0">
              <td colspan="4" class="admin-console__empty">
                {{ $t("admin.noAuditEvents") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.invitesTitle") }}</h2>
        <button
          type="button"
          class="admin-console__button admin-console__button--primary"
          :disabled="isBusy"
          @click="createInvite"
        >
          {{ $t("admin.createInviteButton") }}
        </button>
      </div>
      <div class="admin-console__form-grid">
        <label class="admin-console__field">
          {{ $t("form.labelEmail") }}
          <input
            v-model="createInviteInput.email"
            class="admin-console__input"
            type="email"
            :disabled="isBusy"
          />
        </label>
        <label class="admin-console__field">
          {{ $t("admin.role") }}
          <select v-model="createInviteInput.role" class="admin-console__select" :disabled="isBusy">
            <option v-for="role in INVITE_ROLE_OPTIONS" :key="`invite-role-${role}`" :value="role">
              {{ role }}
            </option>
          </select>
        </label>
        <label class="admin-console__field">
          {{ $t("admin.expiresHours") }}
          <input
            v-model.number="createInviteInput.expiresInHours"
            class="admin-console__input"
            type="number"
            min="1"
            max="336"
            :disabled="isBusy"
          />
        </label>
      </div>

      <div v-if="issuedInvite" class="admin-console__token-card">
        <div class="admin-console__token-row">
          <strong>{{ $t("admin.inviteToken") }}:</strong>
          <code class="admin-console__mono">{{ issuedInvite.token }}</code>
        </div>
        <div class="admin-console__token-row">
          <strong>{{ $t("admin.inviteLink") }}:</strong>
          <code class="admin-console__mono">{{ issuedInvite.acceptUrl }}</code>
        </div>
      </div>

      <div v-if="pendingInvitesLoading" class="admin-console__loading">
        {{ $t("admin.loadingInvites") }}
      </div>
      <div v-else class="admin-console__table-wrap">
        <table class="admin-console__table">
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
              <td>{{ formatDateTime(invite.expiresAt) }}</td>
              <td class="admin-console__actions">
                <button
                  type="button"
                  class="admin-console__button admin-console__button--small"
                  :disabled="isBusy"
                  @click="revokeInvite(invite)"
                >
                  {{ $t("admin.revokeInvite") }}
                </button>
              </td>
            </tr>
            <tr v-if="pendingInvites.length === 0">
              <td colspan="4" class="admin-console__empty">
                {{ $t("admin.noPendingInvites") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.credentialProfilesTitle") }}</h2>
        <button
          type="button"
          class="admin-console__button admin-console__button--primary"
          :disabled="isBusy"
          @click="createCredentialProfile"
        >
          {{ $t("admin.createCredentialProfileButton") }}
        </button>
      </div>
      <div class="admin-console__form-grid">
        <label class="admin-console__field">
          {{ $t("form.labelName") }}
          <input
            v-model="createCredentialProfileInput.name"
            class="admin-console__input"
            type="text"
            :disabled="isBusy"
          />
        </label>
        <label class="admin-console__field">
          {{ $t("form.labelType") }}
          <select
            v-model="createCredentialProfileInput.type"
            class="admin-console__select"
            :disabled="isBusy"
          >
            <option
              v-for="type in CREDENTIAL_PROFILE_TYPE_OPTIONS"
              :key="`create-credential-type-${type}`"
              :value="type"
            >
              {{ type }}
            </option>
          </select>
        </label>
        <label class="admin-console__checkbox">
          <input
            class="admin-console__checkbox-input"
            type="checkbox"
            v-model="createCredentialProfileInput.allowPublicUse"
            :disabled="isBusy"
          />
          <span>{{ $t("admin.allowPublicUse") }}</span>
        </label>
        <label class="admin-console__field admin-console__field--full">
          {{ $t("admin.description") }}
          <input
            v-model="createCredentialProfileInput.description"
            class="admin-console__input"
            type="text"
            :disabled="isBusy"
          />
        </label>
        <label v-if="createCredentialProfileInput.type === 'header'" class="admin-console__field">
          {{ $t("admin.headerName") }}
          <input
            v-model="createCredentialProfileInput.metadataHeaderName"
            class="admin-console__input"
            type="text"
            :disabled="isBusy"
          />
        </label>
        <label v-if="createCredentialProfileInput.type === 'header'" class="admin-console__field">
          {{ $t("admin.headerValue") }}
          <input
            v-model="createCredentialProfileInput.secretHeaderValue"
            class="admin-console__input"
            type="password"
            :disabled="isBusy"
          />
        </label>
        <label
          v-if="createCredentialProfileInput.type === 'bearer'"
          class="admin-console__field admin-console__field--full"
        >
          {{ $t("admin.tokenSecret") }}
          <input
            v-model="createCredentialProfileInput.secretToken"
            class="admin-console__input"
            type="password"
            :disabled="isBusy"
          />
        </label>
        <label v-if="createCredentialProfileInput.type === 'basic'" class="admin-console__field">
          {{ $t("admin.usernameSecret") }}
          <input
            v-model="createCredentialProfileInput.secretUsername"
            class="admin-console__input"
            type="text"
            :disabled="isBusy"
          />
        </label>
        <label v-if="createCredentialProfileInput.type === 'basic'" class="admin-console__field">
          {{ $t("admin.passwordSecret") }}
          <input
            v-model="createCredentialProfileInput.secretPassword"
            class="admin-console__input"
            type="password"
            :disabled="isBusy"
          />
        </label>
      </div>

      <div v-if="credentialProfilesLoading" class="admin-console__loading">
        {{ $t("admin.loadingCredentialProfiles") }}
      </div>
      <div v-else class="admin-console__table-wrap">
        <table class="admin-console__table">
          <thead>
            <tr>
              <th>{{ $t("form.labelName") }}</th>
              <th>{{ $t("form.labelType") }}</th>
              <th>{{ $t("admin.allowPublicUse") }}</th>
              <th>{{ $t("admin.secretShape") }}</th>
              <th>{{ $t("admin.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="profile in credentialProfiles" :key="profile._id">
              <td>
                <input
                  v-if="credentialProfileDrafts[profile._id]"
                  v-model="credentialProfileDrafts[profile._id]!.name"
                  class="admin-console__input"
                  type="text"
                  :disabled="isBusy"
                />
              </td>
              <td>
                <select
                  v-if="credentialProfileDrafts[profile._id]"
                  v-model="credentialProfileDrafts[profile._id]!.type"
                  class="admin-console__select"
                  :disabled="isBusy"
                  :aria-label="$t('form.labelType')"
                >
                  <option
                    v-for="type in CREDENTIAL_PROFILE_TYPE_OPTIONS"
                    :key="`${profile._id}-${type}`"
                    :value="type"
                  >
                    {{ type }}
                  </option>
                </select>
              </td>
              <td>
                <input
                  v-if="credentialProfileDrafts[profile._id]"
                  class="admin-console__checkbox-input"
                  type="checkbox"
                  v-model="credentialProfileDrafts[profile._id]!.allowPublicUse"
                  :disabled="isBusy"
                  :aria-label="$t('admin.allowPublicUse')"
                />
              </td>
              <td>
                <code class="admin-console__mono">{{
                  JSON.stringify(profile.secretShape || {})
                }}</code>
              </td>
              <td class="admin-console__actions">
                <button
                  type="button"
                  class="admin-console__button admin-console__button--primary admin-console__button--small"
                  :disabled="isBusy || !credentialProfileDrafts[profile._id]"
                  @click="saveCredentialProfile(profile._id)"
                >
                  {{ $t("admin.saveCredentialProfile") }}
                </button>
                <button
                  type="button"
                  class="admin-console__button admin-console__button--danger admin-console__button--small"
                  :disabled="isBusy"
                  @click="deleteCredentialProfile(profile)"
                >
                  {{ $t("admin.deleteCredentialProfile") }}
                </button>
              </td>
            </tr>
            <tr v-if="credentialProfiles.length === 0">
              <td colspan="5" class="admin-console__empty">
                {{ $t("admin.noCredentialProfiles") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.brokerProfilesTitle") }}</h2>
        <button
          type="button"
          class="admin-console__button admin-console__button--primary"
          :disabled="isBusy"
          @click="createBrokerProfile"
        >
          {{ $t("admin.createBrokerProfileButton") }}
        </button>
      </div>
      <div class="admin-console__form-grid">
        <label class="admin-console__field">
          {{ $t("form.labelName") }}
          <input
            v-model="createBrokerProfileInput.name"
            class="admin-console__input"
            type="text"
            :disabled="isBusy"
          />
        </label>
        <label class="admin-console__field">
          {{ $t("form.labelType") }}
          <select
            v-model="createBrokerProfileInput.protocol"
            class="admin-console__select"
            :disabled="isBusy"
          >
            <option
              v-for="protocol in BROKER_PROFILE_PROTOCOL_OPTIONS"
              :key="`broker-protocol-${protocol}`"
              :value="protocol"
            >
              {{ protocol }}
            </option>
          </select>
        </label>
        <label class="admin-console__field">
          {{ $t("form.labelBrokerUrl") }}
          <input
            v-model="createBrokerProfileInput.brokerUrl"
            class="admin-console__input"
            type="text"
            placeholder="mqtt://broker.example.com:1883"
            :disabled="isBusy"
          />
        </label>
        <label class="admin-console__field">
          {{ $t("form.labelCredentialProfile") }}
          <select
            v-model="createBrokerProfileInput.credentialProfileId"
            class="admin-console__select"
            :disabled="isBusy"
          >
            <option value="">{{ $t("form.optionCredentialProfileNone") }}</option>
            <option
              v-for="profile in credentialProfiles.filter((item) => item.type === 'basic')"
              :key="`broker-create-credential-${profile._id}`"
              :value="profile._id"
            >
              {{ profile.name }}
            </option>
          </select>
        </label>
        <label class="admin-console__checkbox">
          <input
            class="admin-console__checkbox-input"
            type="checkbox"
            v-model="createBrokerProfileInput.allowPublicUse"
            :disabled="isBusy"
          />
          <span>{{ $t("admin.allowPublicUse") }}</span>
        </label>
        <label class="admin-console__checkbox">
          <input
            class="admin-console__checkbox-input"
            type="checkbox"
            v-model="createBrokerProfileInput.tlsRejectUnauthorized"
            :disabled="isBusy"
          />
          <span>{{ $t("admin.tlsRejectUnauthorized") }}</span>
        </label>
        <label class="admin-console__field admin-console__field--full">
          {{ $t("admin.topicAllowlist") }}
          <input
            v-model="createBrokerProfileInput.topicAllowlist"
            class="admin-console__input"
            type="text"
            :disabled="isBusy"
            :placeholder="$t('admin.topicAllowlistPlaceholder')"
          />
        </label>
        <label class="admin-console__field admin-console__field--full">
          {{ $t("admin.description") }}
          <input
            v-model="createBrokerProfileInput.description"
            class="admin-console__input"
            type="text"
            :disabled="isBusy"
          />
        </label>
      </div>

      <div v-if="brokerProfilesLoading" class="admin-console__loading">
        {{ $t("admin.loadingBrokerProfiles") }}
      </div>
      <div v-else class="admin-console__table-wrap">
        <table class="admin-console__table">
          <thead>
            <tr>
              <th>{{ $t("form.labelName") }}</th>
              <th>{{ $t("form.labelBrokerUrl") }}</th>
              <th>{{ $t("form.labelCredentialProfile") }}</th>
              <th>{{ $t("admin.topicAllowlist") }}</th>
              <th>{{ $t("admin.tlsRejectUnauthorized") }}</th>
              <th>{{ $t("admin.allowPublicUse") }}</th>
              <th>{{ $t("admin.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="profile in brokerProfiles" :key="profile._id">
              <td>
                <input
                  v-if="brokerProfileDrafts[profile._id]"
                  v-model="brokerProfileDrafts[profile._id]!.name"
                  class="admin-console__input"
                  type="text"
                  :disabled="isBusy"
                />
              </td>
              <td>
                <input
                  v-if="brokerProfileDrafts[profile._id]"
                  v-model="brokerProfileDrafts[profile._id]!.brokerUrl"
                  class="admin-console__input"
                  type="text"
                  :disabled="isBusy"
                />
              </td>
              <td>
                <select
                  v-if="brokerProfileDrafts[profile._id]"
                  v-model="brokerProfileDrafts[profile._id]!.credentialProfileId"
                  class="admin-console__select"
                  :disabled="isBusy"
                  :aria-label="$t('form.labelCredentialProfile')"
                >
                  <option value="">{{ $t("form.optionCredentialProfileNone") }}</option>
                  <option
                    v-for="credential in credentialProfiles.filter((item) => item.type === 'basic')"
                    :key="`broker-credential-${profile._id}-${credential._id}`"
                    :value="credential._id"
                  >
                    {{ credential.name }}
                  </option>
                </select>
              </td>
              <td>
                <input
                  v-if="brokerProfileDrafts[profile._id]"
                  v-model="brokerProfileDrafts[profile._id]!.topicAllowlist"
                  class="admin-console__input"
                  type="text"
                  :disabled="isBusy"
                />
              </td>
              <td>
                <input
                  v-if="brokerProfileDrafts[profile._id]"
                  class="admin-console__checkbox-input"
                  type="checkbox"
                  v-model="brokerProfileDrafts[profile._id]!.tlsRejectUnauthorized"
                  :disabled="isBusy"
                />
              </td>
              <td>
                <input
                  v-if="brokerProfileDrafts[profile._id]"
                  class="admin-console__checkbox-input"
                  type="checkbox"
                  v-model="brokerProfileDrafts[profile._id]!.allowPublicUse"
                  :disabled="isBusy"
                />
              </td>
              <td class="admin-console__actions">
                <button
                  type="button"
                  class="admin-console__button admin-console__button--primary admin-console__button--small"
                  :disabled="isBusy || !brokerProfileDrafts[profile._id]"
                  @click="saveBrokerProfile(profile._id)"
                >
                  {{ $t("admin.saveBrokerProfile") }}
                </button>
                <button
                  type="button"
                  class="admin-console__button admin-console__button--danger admin-console__button--small"
                  :disabled="isBusy"
                  @click="deleteBrokerProfile(profile)"
                >
                  {{ $t("admin.deleteBrokerProfile") }}
                </button>
              </td>
            </tr>
            <tr v-if="brokerProfiles.length === 0">
              <td colspan="7" class="admin-console__empty">
                {{ $t("admin.noBrokerProfiles") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.createUserTitle") }}</h2>
        <button
          type="button"
          class="admin-console__button admin-console__button--primary"
          :disabled="isBusy"
          @click="createUser"
        >
          {{ $t("admin.createUserButton") }}
        </button>
      </div>
      <div class="admin-console__form-grid">
        <label class="admin-console__field">
          {{ $t("form.labelEmail") }}
          <input
            v-model="createUserInput.email"
            class="admin-console__input"
            type="email"
            :disabled="isBusy"
          />
        </label>
        <label class="admin-console__field">
          {{ $t("form.labelPassword") }}
          <input
            v-model="createUserInput.password"
            class="admin-console__input"
            type="password"
            :disabled="isBusy"
          />
        </label>
        <label class="admin-console__field">
          {{ $t("admin.role") }}
          <select v-model="createUserInput.role" class="admin-console__select" :disabled="isBusy">
            <option v-for="role in ROLE_OPTIONS" :key="`create-role-${role}`" :value="role">
              {{ role }}
            </option>
          </select>
        </label>
        <label class="admin-console__checkbox">
          <input
            class="admin-console__checkbox-input"
            type="checkbox"
            v-model="createUserInput.active"
            :disabled="isBusy"
          />
          <span>{{ $t("admin.active") }}</span>
        </label>
      </div>
    </section>

    <section class="admin-console__section">
      <div class="admin-console__section-header">
        <h2>{{ $t("admin.usersTitle") }}</h2>
      </div>
      <div v-if="usersLoading" class="admin-console__loading">{{ $t("admin.loadingUsers") }}</div>
      <div v-else class="admin-console__table-wrap">
        <table class="admin-console__table">
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
                <select
                  v-if="userDrafts[user._id]"
                  v-model="userDrafts[user._id]!.role"
                  class="admin-console__select"
                  :disabled="isBusy"
                  :aria-label="$t('admin.role')"
                >
                  <option v-for="role in ROLE_OPTIONS" :key="`${user._id}-${role}`" :value="role">
                    {{ role }}
                  </option>
                </select>
                <span v-else>{{ user.role }}</span>
              </td>
              <td>
                <input
                  v-if="userDrafts[user._id]"
                  class="admin-console__checkbox-input"
                  type="checkbox"
                  v-model="userDrafts[user._id]!.active"
                  :disabled="isBusy"
                  :aria-label="$t('admin.active')"
                />
                <span v-else>{{ user.active ? "yes" : "no" }}</span>
              </td>
              <td class="admin-console__actions">
                <button
                  type="button"
                  class="admin-console__button admin-console__button--primary admin-console__button--small"
                  :disabled="isBusy || !userDrafts[user._id]"
                  @click="saveUser(user._id)"
                >
                  {{ $t("admin.saveUser") }}
                </button>
                <button
                  type="button"
                  class="admin-console__button admin-console__button--small"
                  :disabled="isBusy"
                  @click="issueResetToken(user)"
                >
                  {{ $t("admin.issueResetToken") }}
                </button>
                <button
                  type="button"
                  class="admin-console__button admin-console__button--danger admin-console__button--small"
                  :disabled="isBusy || user.active"
                  :title="user.active ? $t('admin.deactivateBeforeDelete') : ''"
                  @click="deleteUser(user)"
                >
                  {{ $t("admin.deleteUser") }}
                </button>
              </td>
            </tr>
            <tr v-if="users.length === 0">
              <td colspan="4" class="admin-console__empty">
                {{ $t("admin.noUsers") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-for="entry in issuedResetEntries"
        :key="`reset-${entry.userId}`"
        class="admin-console__token-card"
      >
        <div class="admin-console__token-row">
          <strong>{{ entry.email }}</strong>
          <code class="admin-console__mono">{{ entry.payload?.token || "" }}</code>
        </div>
        <div class="admin-console__token-row">
          <code class="admin-console__mono">{{ entry.payload?.resetUrl || "" }}</code>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="css">
@import url("../assets/css/components/admin-console.css");
</style>
