export type UnknownRecord = Record<string, unknown>;

export type DatasourceStatusPayload = {
  status?: string;
  lastMessageAt?: Date | string | number | null;
  lastUpdatedAt?: Date | string | number | null;
  lastErrorAt?: Date | string | number | null;
  errorCode?: string | null;
  error?: string | null;
  metrics?: { messageCount?: number; errorCount?: number; retryCount?: number };
};

export type DatasourceLifecycleInstance = {
  applySettings?: (settings: UnknownRecord) => void;
  onSettingsChanged?: (settings: UnknownRecord) => void;
  onDispose?: () => void;
  updateNow?: () => void;
};

export type WidgetRuntimeContext = {
  changedDatasource?: string | null;
  changedDatasourceId?: string | null;
  changedDatasourceTitle?: string | null;
  snapshot?: UnknownRecord;
  timestamp?: string;
};

export type WidgetRuntimeInstance = {
  onSettingsChanged?: (settings: UnknownRecord) => void;
  onDispose?: () => void;
  render?: (element: Element) => void;
  processDatasourceUpdate?: (datasource: unknown, context?: WidgetRuntimeContext) => void;
  onResize?: (size: { width: number; height: number }) => void;
  getPreferredRows?: (settings: UnknownRecord | null, snapshot: UnknownRecord) => number;
  lastError?: unknown;
};

export type DatasourcePlugin = {
  typeName: string;
  label?: string;
  fields?(
    datasource: unknown,
    dashboard: unknown,
    general: UnknownRecord,
    runtimeContext?: UnknownRecord,
  ): UnknownRecord[];
  newInstance(
    settings: UnknownRecord,
    newInstanceCallback: (instance: DatasourceLifecycleInstance) => void,
    updateCallback: (payload: unknown) => void,
    statusCallback: (payload: DatasourceStatusPayload) => void,
    runtimeContext?: UnknownRecord,
  ): void;
};

export type WidgetPlugin = {
  typeName: string;
  label?: string;
  minRows?: number;
  preferredRows?: number;
  fields?(widget: unknown, dashboard: unknown, general: UnknownRecord): UnknownRecord[];
  newInstance(settings: UnknownRecord, callback: (instance: WidgetRuntimeInstance) => void): void;
};
