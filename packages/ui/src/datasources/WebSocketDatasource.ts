/**
 * @module datasources/WebSocketDatasource
 * @description Gateway-backed WebSocket datasource runtime.
 */

import { mintDatasourceSessionToken } from "./datasourceSessionToken.js";
import { DatasourceRuntimeBase } from "./runtime/DatasourceRuntimeBase.js";
import { getStreamingManager } from "./runtime/StreamingManager.js";
import { getAuthToken, getDashboardId, getRuntimeShareToken } from "../runtime/runtimeContext.js";

const STREAM_PARSERS = ["json", "text"];
const AUTH_PLACEMENT_OPTIONS = ["header", "query"];

const normalizeParser = (value) => {
  const normalized = String(value || "json")
    .trim()
    .toLowerCase();
  return STREAM_PARSERS.includes(normalized) ? normalized : "json";
};

const normalizeAuthPlacement = (value) => {
  const normalized = String(value || "header")
    .trim()
    .toLowerCase();
  return AUTH_PLACEMENT_OPTIONS.includes(normalized) ? normalized : "header";
};

export class WebSocketDatasource extends DatasourceRuntimeBase {
  static typeName = "websocket";

  static label = "WebSocket";

  static fields = (
    datasource,
    dashboard,
    general,
    runtimeContext: Record<string, unknown> = {},
  ) => {
    const credentialProfiles = Array.isArray(runtimeContext.credentialProfiles)
      ? runtimeContext.credentialProfiles
      : [];

    const authPlacement = normalizeAuthPlacement(datasource?.settings?.authPlacement);

    return [
      {
        ...general,
        settings: {
          ...general.settings,
          url: datasource?.settings.url,
          staleAfterSeconds: datasource?.settings.staleAfterSeconds,
        },
        fields: [
          ...general.fields,
          {
            name: "url",
            label: "form.labelUrl",
            type: "text",
            required: true,
          },
          {
            name: "staleAfterSeconds",
            label: "form.labelDatasourceStaleAfterSeconds",
            type: "number",
            suffix: "form.suffixRefresh",
            default: 180,
          },
        ],
      },
      {
        label: "form.labelWebSocket",
        icon: "hi-wifi",
        name: "websocket",
        settings: {
          parser: normalizeParser(datasource?.settings?.parser),
          idleTimeoutMs: datasource?.settings?.idleTimeoutMs,
          protocols: datasource?.settings?.protocols,
          headers: datasource?.settings?.headers,
        },
        fields: [
          {
            name: "parser",
            label: "form.labelParser",
            type: "option",
            required: true,
            default: "json",
            options: STREAM_PARSERS.map((parser) => ({
              value: parser,
              label: parser,
            })),
          },
          {
            name: "idleTimeoutMs",
            label: "form.labelIdleTimeoutMs",
            type: "number",
            default: 300000,
          },
          {
            name: "protocols",
            label: "form.labelWebSocketProtocols",
            type: "text",
            placeholder: "form.placeholderWebSocketProtocols",
          },
          {
            name: "headers",
            label: "form.labelHeadersJson",
            type: "code",
            language: "json",
          },
        ],
      },
      {
        label: "form.labelCredentials",
        icon: "hi-key",
        name: "credentials",
        settings: {
          credentialProfileId: datasource?.settings?.credentialProfileId,
          authPlacement,
          queryParamName: datasource?.settings?.queryParamName,
        },
        fields: [
          {
            name: "credentialProfileId",
            label: "form.labelCredentialProfile",
            type: "option",
            placeholder: "form.placeholderCredentialProfile",
            options: [
              {
                value: "",
                label: "form.optionCredentialProfileNone",
              },
              ...credentialProfiles.map((profile) => ({
                value: profile._id,
                label: profile.name,
              })),
            ],
          },
          {
            name: "authPlacement",
            label: "form.labelAuthPlacement",
            type: "option",
            default: "header",
            options: AUTH_PLACEMENT_OPTIONS.map((option) => ({
              value: option,
              label: option,
            })),
          },
          {
            name: "queryParamName",
            label: "form.labelQueryParamName",
            type: "text",
            placeholder: "form.placeholderQueryParamName",
          },
        ],
      },
    ];
  };

  static newInstance(
    settings,
    newInstanceCallback,
    updateCallback,
    statusCallback,
    runtimeContext,
  ) {
    newInstanceCallback(
      new WebSocketDatasource(settings, updateCallback, statusCallback, runtimeContext),
    );
  }

  runtimeContext: Record<string, unknown> = {};

  manager = null;

  sessionToken = null;

  streamGeneration = 0;

  constructor(
    settings,
    updateCallback,
    statusCallback,
    runtimeContext: Record<string, unknown> = {},
  ) {
    super(settings, updateCallback, statusCallback);
    this.runtimeContext = runtimeContext;
    this.onSettingsChanged(settings);
  }

  async mintSessionToken() {
    const dashboardId = String(this.runtimeContext.dashboardId || getDashboardId() || "").trim();
    const datasourceId = String(this.runtimeContext.datasourceId || "").trim();

    if (!dashboardId || !datasourceId) {
      throw new Error("Datasource runtime context is incomplete");
    }

    const minted = await mintDatasourceSessionToken({
      dashboardId,
      datasourceId,
      shareToken: getRuntimeShareToken(),
      authToken: getAuthToken(),
    });

    this.sessionToken = minted.token;
    return minted.token;
  }

  async refreshSessionToken() {
    if (!this.manager) {
      return;
    }

    const datasourceId = String(this.runtimeContext.datasourceId || "").trim();
    if (!datasourceId) {
      return;
    }

    try {
      const nextToken = await this.mintSessionToken();
      await this.manager.refreshToken(datasourceId, nextToken);
    } catch (error) {
      this.emitError(error, "STREAM_AUTH_FAILED");
    }
  }

  async stopStream() {
    const datasourceId = String(this.runtimeContext.datasourceId || "").trim();
    if (!this.manager || !datasourceId) {
      return;
    }

    try {
      await this.manager.unsubscribe(datasourceId);
    } catch {
      // Ignore unsubscribe failures during teardown.
    }
  }

  async connectStream() {
    const currentGeneration = ++this.streamGeneration;

    await this.stopStream();
    if (!this.enabled || currentGeneration !== this.streamGeneration) {
      return;
    }

    const dashboardId = String(this.runtimeContext.dashboardId || getDashboardId() || "").trim();
    const datasourceId = String(this.runtimeContext.datasourceId || "").trim();
    if (!dashboardId || !datasourceId) {
      this.emitError("Datasource runtime context is incomplete", "STREAM_CONNECT_FAILED");
      return;
    }

    try {
      const token = await this.mintSessionToken();
      if (currentGeneration !== this.streamGeneration) {
        return;
      }

      this.manager = getStreamingManager(dashboardId);
      this.manager.setDashboardId(dashboardId);
      this.setStatus("connecting");
      await this.manager.subscribe({
        datasourceId,
        dashboardId,
        sessionToken: token,
        callbacks: {
          onData: (message) => {
            this.emitData({
              data: message.payload,
            });
          },
          onStatus: (message) => {
            this.emitStatus({
              status: message.status,
              errorCode: message.errorCode || null,
              error: message.message || null,
              lastMessageAt: message.timestamp || null,
            });
          },
          onError: (message) => {
            this.emitError(
              message.message || "Realtime stream failed",
              message.errorCode || "STREAM_CONNECT_FAILED",
            );
          },
          onTokenExpiring: () => {
            void this.refreshSessionToken();
          },
        },
      });
    } catch (error) {
      this.emitError(error, "STREAM_CONNECT_FAILED");
    }
  }

  onSettingsChanged(nextSettings: Record<string, unknown> = {}) {
    super.onSettingsChanged(nextSettings);

    const staleAfterSeconds = Math.max(5, Number(nextSettings.staleAfterSeconds) || 180);
    this.setStaleMonitor(staleAfterSeconds * 1000);

    void this.connectStream();
  }

  stop() {
    void this.stopStream();
    this.sessionToken = null;
    super.stop();
  }

  onDispose() {
    void this.stopStream();
    super.onDispose();
  }
}
