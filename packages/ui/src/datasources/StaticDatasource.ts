/**
 * @module datasources/StaticDatasource
 * @description Datasource that emits static JSON/text payload.
 */

import { DatasourceRuntimeBase } from "./runtime/DatasourceRuntimeBase.js";

const parseStaticValue = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

export class StaticDatasource extends DatasourceRuntimeBase {
  static typeName = "static";

  static label = "Static";

  static fields = (datasource, dashboard, general) => [
    {
      ...general,
      settings: {
        ...general.settings,
        refresh: datasource?.settings.refresh,
      },
      fields: [
        ...general.fields,
        {
          name: "refresh",
          label: "form.labelRefresh",
          type: "number",
          suffix: "form.suffixRefresh",
          default: 0,
        },
      ],
    },
    {
      label: "form.labelStatic",
      icon: "hi-document",
      name: "static",
      settings: {
        value: datasource?.settings.value,
      },
      fields: [
        {
          name: "value",
          label: "form.labelStaticValue",
          type: "code",
          language: "json",
          required: true,
        },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback, updateCallback, statusCallback) {
    newInstanceCallback(new StaticDatasource(settings, updateCallback, statusCallback));
  }

  constructor(settings, updateCallback, statusCallback) {
    super(settings, updateCallback, statusCallback);
    this.onSettingsChanged(settings);
  }

  onSettingsChanged(nextSettings: any = {}) {
    super.onSettingsChanged(nextSettings);

    const refreshSeconds = Math.max(0, Number(nextSettings.refresh) || 0);
    if (refreshSeconds > 0) {
      this.setPollingInterval(() => {
        this.updateNow();
      }, refreshSeconds * 1000);
      this.setStaleMonitor(refreshSeconds * 3000);
    } else {
      this.setPollingInterval(() => {}, 0);
      this.setStaleMonitor(0);
    }

    this.updateNow();
  }

  updateNow() {
    this.emitData({
      data: parseStaticValue(this.currentSettings.value),
    });
  }
}
