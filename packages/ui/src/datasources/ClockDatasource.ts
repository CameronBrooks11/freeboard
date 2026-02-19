/**
 * @module datasources/ClockDatasource
 * @description Datasource that emits current date/time on a configured interval.
 */

import { DatasourceRuntimeBase } from "./runtime/DatasourceRuntimeBase.js";
import type { DatasourceStatusPayload, UnknownRecord } from "../types/runtime.js";
type DatasourceFieldModel = { settings?: UnknownRecord } | null | undefined;

export class ClockDatasource extends DatasourceRuntimeBase {
  static typeName = "clock";

  static label = "Clock";

  static fields = (
    datasource: DatasourceFieldModel,
    dashboard: unknown,
    general: UnknownRecord & { fields: UnknownRecord[]; settings: UnknownRecord },
  ) => [
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
          default: 1,
        },
      ],
    },
  ];

  static newInstance(
    settings: UnknownRecord,
    newInstanceCallback: (instance: ClockDatasource) => void,
    updateCallback: (payload: unknown) => void,
    statusCallback: (payload: DatasourceStatusPayload & { metrics: UnknownRecord }) => void,
  ) {
    newInstanceCallback(new ClockDatasource(settings, updateCallback, statusCallback));
  }

  constructor(
    settings: UnknownRecord,
    updateCallback: (payload: unknown) => void,
    statusCallback: (payload: DatasourceStatusPayload & { metrics: UnknownRecord }) => void,
  ) {
    super(settings, updateCallback, statusCallback);
    this.onSettingsChanged(settings);
  }

  onSettingsChanged(nextSettings: Record<string, unknown> = {}) {
    super.onSettingsChanged(nextSettings);
    const refreshSeconds = Math.max(1, Number(nextSettings.refresh) || 1);
    this.setPollingInterval(() => {
      this.updateNow();
    }, refreshSeconds * 1000);
    this.setStaleMonitor(refreshSeconds * 3000);
    this.updateNow();
  }

  updateNow() {
    this.emitData({
      data: new Date().toISOString(),
    });
  }
}
