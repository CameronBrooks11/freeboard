/**
 * @module datasources/MQTTDatasource
 * @description Gateway-backed MQTT datasource runtime.
 */

import { mintDatasourceSessionToken } from "./datasourceSessionToken.js";
import { DatasourceRuntimeBase } from "./runtime/DatasourceRuntimeBase.js";
import { getStreamingManager } from "./runtime/StreamingManager.js";
import { getAuthToken, getDashboardId, getRuntimeShareToken } from "../runtime/runtimeContext.js";
import type { DatasourceStatusPayload, UnknownRecord } from "../types/runtime.js";
import type { StreamingManager } from "./runtime/StreamingManager.js";
import { buildProfileSelectOptions } from "./profileOptions.js";
type DatasourceFieldModel = { settings?: UnknownRecord } | null | undefined;

const STREAM_PARSERS = ["json", "text"];

const normalizeParser = (value: unknown): string => {
  const normalized = String(value || "json")
    .trim()
    .toLowerCase();
  return STREAM_PARSERS.includes(normalized) ? normalized : "json";
};

export class MQTTDatasource extends DatasourceRuntimeBase {
  static typeName = "mqtt";

  static label = "MQTT";

  static fields = (
    datasource: DatasourceFieldModel,
    dashboard: unknown,
    general: UnknownRecord & { fields: UnknownRecord[]; settings: UnknownRecord },
    runtimeContext: Record<string, unknown> = {},
  ): UnknownRecord[] => {
    const settings = datasource?.settings ?? {};
    const brokerProfiles = Array.isArray(runtimeContext.brokerProfiles)
      ? runtimeContext.brokerProfiles
      : [];

    return [
      {
        ...general,
        settings: {
          ...general.settings,
          staleAfterSeconds: settings.staleAfterSeconds,
        },
        fields: [
          ...general.fields,
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
        label: "form.labelMQTT",
        icon: "hi-chip",
        name: "mqtt",
        settings: {
          brokerProfileId: settings.brokerProfileId,
          topic: settings.topic,
          qos: settings.qos,
          parser: normalizeParser(settings.parser),
          keepaliveSeconds: settings.keepaliveSeconds,
        },
        fields: [
          {
            name: "brokerProfileId",
            label: "form.labelBrokerProfile",
            type: "option",
            required: true,
            placeholder: "form.placeholderBrokerProfile",
            options: buildProfileSelectOptions(
              settings.brokerProfileId,
              brokerProfiles,
              "form.placeholderBrokerProfile",
            ),
          },
          {
            name: "topic",
            label: "form.labelTopic",
            type: "text",
            required: true,
          },
          {
            name: "qos",
            label: "form.labelQoS",
            type: "option",
            default: 0,
            options: [
              { value: 0, label: "0" },
              { value: 1, label: "1" },
            ],
          },
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
            name: "keepaliveSeconds",
            label: "form.labelKeepaliveSeconds",
            type: "number",
            default: 60,
          },
        ],
      },
    ];
  };

  static newInstance(
    settings: UnknownRecord,
    newInstanceCallback: (instance: MQTTDatasource) => void,
    updateCallback: (payload: unknown) => void,
    statusCallback: (payload: DatasourceStatusPayload & { metrics: UnknownRecord }) => void,
    runtimeContext?: Record<string, unknown>,
  ): void {
    newInstanceCallback(
      new MQTTDatasource(settings, updateCallback, statusCallback, runtimeContext),
    );
  }

  runtimeContext: Record<string, unknown> = {};

  manager: StreamingManager | null = null;

  sessionToken: string | null = null;

  streamGeneration = 0;

  constructor(
    settings: UnknownRecord,
    updateCallback: (payload: unknown) => void,
    statusCallback: (payload: DatasourceStatusPayload & { metrics: UnknownRecord }) => void,
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
              status: String(message.status || "connected"),
              errorCode: message.errorCode || null,
              error: message.message || null,
              ...(message.timestamp ? { lastMessageAt: message.timestamp } : {}),
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
