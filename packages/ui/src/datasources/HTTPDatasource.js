/**
 * @module datasources/HTTPDatasource
 * @description HTTP datasource runtime with gateway-backed fetch and parser modes.
 */

import {
  getDatasourceSessionTokenExpiry,
  mintDatasourceSessionToken,
} from "./datasourceSessionToken.js";
import { DatasourceRuntimeBase } from "./runtime/DatasourceRuntimeBase.js";
import {
  getAuthToken,
  getDashboardId,
  getRuntimeShareToken,
} from "../runtime/runtimeContext.js";

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const ALLOWED_PARSERS = ["json", "text", "csv"];
const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const importMetaEnv =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : {};
const DIRECT_HTTP_ENABLED =
  Boolean(importMetaEnv.DEV) ||
  TRUTHY_ENV_VALUES.has(
    String(importMetaEnv.VITE_ALLOW_DIRECT_HTTP_DATASOURCE || "")
      .trim()
      .toLowerCase()
  );

const normalizeMethod = (value) => {
  const method = String(value || "GET").trim().toUpperCase();
  return ALLOWED_METHODS.includes(method) ? method : "GET";
};

const normalizeParser = (value) => {
  const parser = String(value || "json").trim().toLowerCase();
  return ALLOWED_PARSERS.includes(parser) ? parser : "json";
};

const normalizeHeaders = (rawValue) => {
  if (!rawValue) {
    return {};
  }

  let parsed = rawValue;
  if (typeof rawValue === "string") {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      return {};
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed)
      .map(([key, value]) => [String(key || "").trim(), String(value ?? "")])
      .filter(([key]) => Boolean(key))
  );
};

const parseCsv = (csvText) => {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const headers = lines[0].split(",").map((part) => part.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((part) => part.trim());
    const item = {};
    headers.forEach((header, index) => {
      if (!header) {
        return;
      }
      item[header] = values[index] ?? "";
    });
    return item;
  });
};

const parseByMode = (text, parser) => {
  if (parser === "text") {
    return text;
  }
  if (parser === "csv") {
    return parseCsv(text);
  }
  return JSON.parse(text);
};

export class HTTPDatasource extends DatasourceRuntimeBase {
  static typeName = "http";

  static label = "HTTP";

  static fields = (datasource, dashboard, general, runtimeContext = {}) => {
    const credentialProfiles = Array.isArray(runtimeContext.credentialProfiles)
      ? runtimeContext.credentialProfiles
      : [];

    const generalFields = [
      ...general.fields,
      {
        name: "url",
        label: "form.labelUrl",
        type: "text",
        required: true,
      },
      ...(DIRECT_HTTP_ENABLED
        ? [
            {
              name: "useGateway",
              label: "form.labelUseGateway",
              type: "boolean",
              default: true,
            },
          ]
        : []),
      {
        name: "refresh",
        label: "form.labelRefresh",
        type: "number",
        suffix: "form.suffixRefresh",
        default: 5,
        required: true,
      },
      {
        name: "staleAfterSeconds",
        label: "form.labelDatasourceStaleAfterSeconds",
        type: "number",
        suffix: "form.suffixRefresh",
        default: 30,
      },
    ];

    return [
      {
        ...general,
        settings: {
          ...general.settings,
          url: datasource?.settings.url,
          refresh: datasource?.settings.refresh,
          useGateway:
            datasource?.settings.useGateway === undefined
              ? true
              : datasource?.settings.useGateway,
          staleAfterSeconds: datasource?.settings.staleAfterSeconds,
        },
        fields: generalFields,
      },
      {
        label: "form.labelHTTP",
        icon: "hi-briefcase",
        name: "http",
        settings: {
          method: datasource?.settings.method,
          parser: datasource?.settings.parser,
          timeoutMs: datasource?.settings.timeoutMs,
          headers: datasource?.settings.headers,
          body: datasource?.settings.body,
        },
        fields: [
          {
            name: "method",
            label: "form.labelMethod",
            type: "option",
            default: "GET",
            required: true,
            options: ALLOWED_METHODS.map((method) => ({
              label: method,
              value: method,
            })),
          },
          {
            name: "parser",
            label: "form.labelParser",
            type: "option",
            default: "json",
            required: true,
            options: ALLOWED_PARSERS.map((parser) => ({
              label: parser,
              value: parser,
            })),
          },
          {
            name: "timeoutMs",
            label: "form.labelTimeoutMs",
            type: "number",
            default: 15000,
          },
          {
            name: "headers",
            label: "form.labelHeadersJson",
            type: "code",
            language: "json",
          },
          {
            name: "body",
            label: "form.labelBody",
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
          credentialProfileId: datasource?.settings.credentialProfileId,
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
        ],
      },
    ];
  };

  static newInstance(
    settings,
    newInstanceCallback,
    updateCallback,
    statusCallback,
    runtimeContext
  ) {
    newInstanceCallback(
      new HTTPDatasource(settings, updateCallback, statusCallback, runtimeContext)
    );
  }

  retryStage = 0;

  sessionToken = null;

  retryTimer = null;

  requestInFlight = false;

  constructor(settings, updateCallback, statusCallback, runtimeContext = {}) {
    super(settings, updateCallback, statusCallback);
    this.runtimeContext = runtimeContext;
    this.onSettingsChanged(settings);
  }

  onSettingsChanged(nextSettings = {}) {
    super.onSettingsChanged(nextSettings);
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryStage = 0;
    if (!DIRECT_HTTP_ENABLED) {
      this.currentSettings.useGateway = true;
    }

    const refreshSeconds = Math.max(1, Number(nextSettings.refresh) || 5);
    const staleAfterSeconds = Math.max(
      refreshSeconds * 2,
      Number(nextSettings.staleAfterSeconds) || refreshSeconds * 3
    );

    this.setPollingInterval(() => {
      this.updateNow();
    }, refreshSeconds * 1000);
    this.setStaleMonitor(staleAfterSeconds * 1000);

    this.updateNow();
  }

  stop() {
    this.sessionToken = null;
    this.requestInFlight = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    super.stop();
  }

  async ensureSessionToken() {
    const expiresAtMs = getDatasourceSessionTokenExpiry(this.sessionToken);
    const now = Date.now();
    if (this.sessionToken && expiresAtMs && expiresAtMs - now > 60_000) {
      return this.sessionToken;
    }

    const dashboardId = this.runtimeContext.dashboardId || getDashboardId();
    const datasourceId = this.runtimeContext.datasourceId;
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
    return this.sessionToken;
  }

  async fetchViaGateway() {
    const token = await this.ensureSessionToken();
    const dashboardId = this.runtimeContext.dashboardId || getDashboardId();

    const response = await fetch("/gateway/http/fetch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        dashboardId,
        datasourceId: this.runtimeContext.datasourceId,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "Gateway fetch failed");
    }

    return payload?.data;
  }

  async fetchDirect() {
    if (!DIRECT_HTTP_ENABLED) {
      throw new Error(
        "Direct mode is disabled for this deployment. Use gateway mode for HTTP datasources."
      );
    }

    if (this.currentSettings.credentialProfileId) {
      throw new Error(
        "Direct mode cannot use credential profiles. Enable gateway mode for this datasource."
      );
    }

    const url = String(this.currentSettings.url || "").trim();
    if (!url) {
      throw new Error("Datasource URL is required");
    }

    const method = normalizeMethod(this.currentSettings.method);
    const parser = normalizeParser(this.currentSettings.parser);
    const headers = normalizeHeaders(this.currentSettings.headers);
    const timeoutMs = Math.max(100, Number(this.currentSettings.timeoutMs) || 15000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method,
      headers,
      body:
        method === "GET" || method === "DELETE"
          ? undefined
          : this.currentSettings.body || undefined,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Upstream request failed (${response.status})`);
    }

    return parseByMode(text, parser);
  }

  async updateNow() {
    if (this.requestInFlight) {
      return;
    }

    this.requestInFlight = true;
    const parser = normalizeParser(this.currentSettings.parser);
    const useGateway = !DIRECT_HTTP_ENABLED || this.currentSettings.useGateway !== false;

    this.setStatus(this.lastUpdatedAt ? "updating" : "connecting");

    try {
      const data = useGateway
        ? await this.fetchViaGateway()
        : await this.fetchDirect();
      this.retryStage = 0;
      this.emitData({
        data,
        parser,
      });
    } catch (error) {
      this.metrics.retryCount += 1;
      this.retryStage += 1;
      this.emitError(error, "http_fetch_failed");

      if (this.retryStage <= 2) {
        const delayMs = Math.min(30_000, 500 * 2 ** (this.retryStage - 1));
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.updateNow();
        }, delayMs);
      }
    } finally {
      this.requestInFlight = false;
    }
  }
}
