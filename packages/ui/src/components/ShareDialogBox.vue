<script setup lang="js">
/**
 * @component ShareDialogBox
 * @description Dashboard visibility/share/collaboration management dialog.
 */
defineOptions({ name: "ShareDialogBox" });

import { computed, ref, watch } from "vue";
import { useMutation, useQuery } from "@vue/apollo-composable";
import { storeToRefs } from "pinia";
import DialogBox from "./DialogBox.vue";
import { useFreeboardStore } from "../stores/freeboard";
import router from "../router";
import {
  buildFallbackSharePath,
  isDashboardShareable,
} from "../sharePolicy";
import {
  DASHBOARD_COLLABORATORS_QUERY,
  DASHBOARD_REVOKE_ACCESS_MUTATION,
  DASHBOARD_ROTATE_SHARE_TOKEN_MUTATION,
  DASHBOARD_SET_VISIBILITY_MUTATION,
  DASHBOARD_TRANSFER_OWNERSHIP_MUTATION,
  DASHBOARD_UPSERT_ACCESS_MUTATION,
} from "../gql";

const { onClose } = defineProps({
  onClose: Function,
});

const freeboardStore = useFreeboardStore();
const { dashboard, isSaved } = storeToRefs(freeboardStore);

const visibilityDraft = ref("private");
const collaboratorEmail = ref("");
const collaboratorAccessLevel = ref("viewer");
const transferTargetUserId = ref("");
const statusMessage = ref("");
const errorMessage = ref("");

const canManageSharing = computed(
  () => Boolean(dashboard.value?.canManageSharing) || !isSaved.value
);
const isShareableDashboard = computed(() =>
  isDashboardShareable({
    isSaved: isSaved.value,
    dashboardId: dashboard.value?._id,
  })
);

const {
  result: collaboratorsResult,
  loading: collaboratorsLoading,
  refetch: refetchCollaborators,
} = useQuery(
  DASHBOARD_COLLABORATORS_QUERY,
  () => ({ id: dashboard.value?._id || "" }),
  {
    enabled: computed(() => isShareableDashboard.value && canManageSharing.value),
    fetchPolicy: "network-only",
  }
);

const { mutate: setDashboardVisibility, loading: setVisibilityLoading } = useMutation(
  DASHBOARD_SET_VISIBILITY_MUTATION
);
const { mutate: rotateShareToken, loading: rotateShareTokenLoading } = useMutation(
  DASHBOARD_ROTATE_SHARE_TOKEN_MUTATION
);
const { mutate: upsertDashboardAccess, loading: upsertAccessLoading } = useMutation(
  DASHBOARD_UPSERT_ACCESS_MUTATION
);
const { mutate: revokeDashboardAccess, loading: revokeAccessLoading } = useMutation(
  DASHBOARD_REVOKE_ACCESS_MUTATION
);
const { mutate: transferDashboardOwnership, loading: transferOwnershipLoading } = useMutation(
  DASHBOARD_TRANSFER_OWNERSHIP_MUTATION
);

const collaborators = computed(() => collaboratorsResult.value?.dashboardCollaborators || []);
const ownershipTransferCandidates = computed(() =>
  collaborators.value.filter((entry) => !entry.isOwner)
);
const isBusy = computed(
  () =>
    collaboratorsLoading.value ||
    setVisibilityLoading.value ||
    rotateShareTokenLoading.value ||
    upsertAccessLoading.value ||
    revokeAccessLoading.value ||
    transferOwnershipLoading.value
);

watch(
  dashboard,
  () => {
    visibilityDraft.value = dashboard.value?.visibility || "private";
  },
  { immediate: true }
);

const clearMessages = () => {
  statusMessage.value = "";
  errorMessage.value = "";
};

const setGraphQLError = (error, fallback) => {
  errorMessage.value = error?.graphQLErrors?.[0]?.message || error?.message || fallback;
};

const visibilityToEnum = (visibility) => String(visibility || "private").toUpperCase();
const accessLevelToEnum = (accessLevel) => String(accessLevel || "viewer").toUpperCase();

const applyDashboardMutationPayload = (payload) => {
  if (!payload || !dashboard.value) {
    return;
  }
  dashboard.value.visibility = payload.visibility || dashboard.value.visibility;
  visibilityDraft.value = dashboard.value.visibility;
  dashboard.value.shareToken = payload.shareToken || null;
  if (payload.canEdit !== undefined) {
    dashboard.value.canEdit = Boolean(payload.canEdit);
  }
  if (payload.canManageSharing !== undefined) {
    dashboard.value.canManageSharing = Boolean(payload.canManageSharing);
  }
  if (payload.user !== undefined) {
    dashboard.value.user = payload.user;
  }
  if (Array.isArray(payload.acl)) {
    dashboard.value.acl = payload.acl;
  }
  freeboardStore.syncEditingPermissions();
};

const saveVisibility = async () => {
  clearMessages();
  if (!isShareableDashboard.value) {
    errorMessage.value = "Save the dashboard before configuring sharing.";
    return;
  }
  if (!canManageSharing.value) {
    errorMessage.value = "You do not have permission to manage sharing.";
    return;
  }

  try {
    const result = await setDashboardVisibility({
      id: dashboard.value._id,
      visibility: visibilityToEnum(visibilityDraft.value),
    });
    applyDashboardMutationPayload(result.data?.setDashboardVisibility);
    statusMessage.value = "Visibility updated.";
  } catch (error) {
    setGraphQLError(error, "Could not update visibility.");
  }
};

const rotateLink = async () => {
  clearMessages();
  if (!isShareableDashboard.value || !canManageSharing.value) {
    return;
  }

  try {
    const result = await rotateShareToken({ id: dashboard.value._id });
    applyDashboardMutationPayload(result.data?.rotateDashboardShareToken);
    statusMessage.value = "Share link rotated.";
  } catch (error) {
    setGraphQLError(error, "Could not rotate share link.");
  }
};

const shareLink = computed(() => {
  if (!isShareableDashboard.value || !dashboard.value) {
    return "";
  }

  const fallbackPath = buildFallbackSharePath({
    visibility: dashboard.value.visibility,
    dashboardId: dashboard.value._id,
    shareToken: dashboard.value.shareToken,
  });
  if (!fallbackPath) {
    return "";
  }

  let resolvedPath = fallbackPath;

  if (dashboard.value.visibility === "public") {
    try {
      resolvedPath = router.resolve({
        name: "PublicDashboard",
        params: { id: dashboard.value._id },
      }).href;
    } catch {
      // Use fallback route path.
    }
  } else if (dashboard.value.visibility === "link" && dashboard.value.shareToken) {
    try {
      resolvedPath = router.resolve({
        name: "SharedDashboard",
        params: { shareToken: dashboard.value.shareToken },
      }).href;
    } catch {
      // Use fallback route path.
    }
  }

  return new URL(resolvedPath, window.location.origin).toString();
});

const copyShareLink = async () => {
  clearMessages();
  if (!shareLink.value) {
    errorMessage.value = "No share link is currently available.";
    return;
  }
  try {
    await navigator.clipboard.writeText(shareLink.value);
    statusMessage.value = "Share link copied.";
  } catch {
    errorMessage.value = "Could not copy share link.";
  }
};

const addCollaborator = async () => {
  clearMessages();
  if (!isShareableDashboard.value || !canManageSharing.value) {
    return;
  }
  if (!collaboratorEmail.value) {
    errorMessage.value = "Collaborator email is required.";
    return;
  }

  try {
    const result = await upsertDashboardAccess({
      id: dashboard.value._id,
      email: collaboratorEmail.value,
      accessLevel: accessLevelToEnum(collaboratorAccessLevel.value),
    });
    applyDashboardMutationPayload(result.data?.upsertDashboardAccess);
    collaboratorEmail.value = "";
    collaboratorAccessLevel.value = "viewer";
    await refetchCollaborators();
    statusMessage.value = "Collaborator access updated.";
  } catch (error) {
    setGraphQLError(error, "Could not update collaborator access.");
  }
};

const removeCollaborator = async (userId) => {
  clearMessages();
  if (!isShareableDashboard.value || !canManageSharing.value) {
    return;
  }

  try {
    const result = await revokeDashboardAccess({
      id: dashboard.value._id,
      userId,
    });
    applyDashboardMutationPayload(result.data?.revokeDashboardAccess);
    await refetchCollaborators();
    statusMessage.value = "Collaborator removed.";
  } catch (error) {
    setGraphQLError(error, "Could not remove collaborator.");
  }
};

const transferOwnership = async () => {
  clearMessages();
  if (!isShareableDashboard.value || !canManageSharing.value) {
    return;
  }
  if (!transferTargetUserId.value) {
    errorMessage.value = "Select a transfer target first.";
    return;
  }

  try {
    const result = await transferDashboardOwnership({
      id: dashboard.value._id,
      newOwnerUserId: transferTargetUserId.value,
    });
    applyDashboardMutationPayload(result.data?.transferDashboardOwnership);
    transferTargetUserId.value = "";
    await refetchCollaborators();
    statusMessage.value = "Ownership transferred.";
  } catch (error) {
    setGraphQLError(error, "Could not transfer ownership.");
  }
};
</script>

<template>
  <DialogBox
    :header="$t('share.title')"
    :cancel="$t('dialogBox.buttonCancel')"
    :ok-disabled="isBusy"
    @close="onClose"
  >
    <p v-if="statusMessage" class="share-dialog__status">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="share-dialog__error">{{ errorMessage }}</p>

    <p v-if="!isShareableDashboard" class="share-dialog__hint">
      {{ $t("share.unsavedHint") }}
    </p>
    <p v-else-if="!canManageSharing" class="share-dialog__hint">
      {{ $t("share.noPermission") }}
    </p>

    <template v-else>
      <section class="share-dialog__section">
        <h3>{{ $t("share.visibility") }}</h3>
        <p class="share-dialog__hint">{{ $t("share.visibilityDescription") }}</p>
        <div class="share-dialog__row">
          <select v-model="visibilityDraft" :disabled="isBusy">
            <option value="private">{{ $t("form.labelVisibilityPrivate") }}</option>
            <option value="link">{{ $t("form.labelVisibilityLink") }}</option>
            <option value="public">{{ $t("form.labelVisibilityPublic") }}</option>
          </select>
          <button type="button" :disabled="isBusy" @click="saveVisibility">
            {{ $t("share.saveVisibility") }}
          </button>
        </div>
      </section>

      <section class="share-dialog__section">
        <h3>{{ $t("share.shareLink") }}</h3>
        <div class="share-dialog__row">
          <input :value="shareLink" readonly type="text" />
          <button type="button" :disabled="isBusy || !shareLink" @click="copyShareLink">
            {{ $t("share.copyLink") }}
          </button>
          <button
            type="button"
            :disabled="isBusy || visibilityDraft === 'private'"
            @click="rotateLink"
          >
            {{ $t("share.revokeLink") }}
          </button>
        </div>
      </section>

      <section class="share-dialog__section">
        <h3>{{ $t("share.collaboratorsTitle") }}</h3>
        <div class="share-dialog__row">
          <input
            v-model="collaboratorEmail"
            :disabled="isBusy"
            :placeholder="$t('form.labelEmail')"
            type="email"
          />
          <select v-model="collaboratorAccessLevel" :disabled="isBusy">
            <option value="viewer">{{ $t("form.labelAccessViewer") }}</option>
            <option value="editor">{{ $t("form.labelAccessEditor") }}</option>
          </select>
          <button type="button" :disabled="isBusy" @click="addCollaborator">
            {{ $t("share.addCollaborator") }}
          </button>
        </div>

        <div v-if="collaboratorsLoading">{{ $t("share.loadingCollaborators") }}</div>
        <table v-else class="share-dialog__table">
          <thead>
            <tr>
              <th>{{ $t("form.labelEmail") }}</th>
              <th>{{ $t("form.labelAccessLevel") }}</th>
              <th>{{ $t("admin.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in collaborators" :key="entry.userId">
              <td>{{ entry.email || entry.userId }}</td>
              <td>
                {{
                  entry.isOwner
                    ? $t("form.labelOwner")
                    : entry.accessLevel === "editor"
                      ? $t("form.labelAccessEditor")
                      : $t("form.labelAccessViewer")
                }}
              </td>
              <td>
                <button
                  v-if="!entry.isOwner"
                  type="button"
                  :disabled="isBusy"
                  @click="removeCollaborator(entry.userId)"
                >
                  {{ $t("share.removeCollaborator") }}
                </button>
              </td>
            </tr>
            <tr v-if="collaborators.length === 0">
              <td colspan="3">{{ $t("share.noCollaborators") }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="share-dialog__section">
        <h3>{{ $t("share.ownerTransferTitle") }}</h3>
        <div class="share-dialog__row">
          <select v-model="transferTargetUserId" :disabled="isBusy">
            <option value="" disabled>{{ $t("share.transferButton") }}</option>
            <option
              v-for="entry in ownershipTransferCandidates"
              :key="`owner-target-${entry.userId}`"
              :value="entry.userId"
            >
              {{ entry.email || entry.userId }}
            </option>
          </select>
          <button type="button" :disabled="isBusy" @click="transferOwnership">
            {{ $t("share.transferButton") }}
          </button>
        </div>
      </section>
    </template>
  </DialogBox>
</template>

<style scoped>
.share-dialog__status {
  color: var(--color-primary);
}

.share-dialog__error {
  color: #d35f5f;
}

.share-dialog__hint {
  opacity: 0.8;
}

.share-dialog__section {
  margin-top: 12px;
}

.share-dialog__row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.share-dialog__row > input,
.share-dialog__row > select {
  min-width: 220px;
}

.share-dialog__table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

.share-dialog__table th,
.share-dialog__table td {
  border: 1px solid var(--color-shade-3);
  padding: 6px;
}
</style>
