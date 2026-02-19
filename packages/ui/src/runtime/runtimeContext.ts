import type { DatasourcePlugin, WidgetPlugin } from "../types/runtime.js";

type RuntimeContext = {
  getDashboardId: () => string | null;
  getAuthToken: () => string | null;
  getRuntimeShareToken: () => string | null;
  getDatasourcePlugin: (typeName: string) => DatasourcePlugin | null;
  getWidgetPlugin: (typeName: string) => WidgetPlugin | null;
  processDatasourceUpdate: (datasource: unknown) => void;
};

const defaultContext: RuntimeContext = {
  getDashboardId: () => null,
  getAuthToken: () => null,
  getRuntimeShareToken: () => null,
  getDatasourcePlugin: () => null,
  getWidgetPlugin: () => null,
  processDatasourceUpdate: () => {},
};

let runtimeContext: RuntimeContext = { ...defaultContext };

const invokeAccessor = <T>(accessor: (() => T) | undefined, fallback: T): T => {
  if (typeof accessor !== "function") {
    return fallback;
  }

  try {
    const value = accessor();
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

export const setRuntimeContext = (context: Partial<RuntimeContext> = {}): void => {
  runtimeContext = {
    ...defaultContext,
    ...context,
  };
};

export const resetRuntimeContext = (): void => {
  runtimeContext = { ...defaultContext };
};

export const getDashboardId = (): string | null =>
  invokeAccessor(runtimeContext.getDashboardId, null);

export const getAuthToken = (): string | null => invokeAccessor(runtimeContext.getAuthToken, null);

export const getRuntimeShareToken = (): string | null =>
  invokeAccessor(runtimeContext.getRuntimeShareToken, null);

export const getDatasourcePlugin = (typeName: string): DatasourcePlugin | null => {
  try {
    return runtimeContext.getDatasourcePlugin(typeName) || null;
  } catch {
    return null;
  }
};

export const getWidgetPlugin = (typeName: string): WidgetPlugin | null => {
  try {
    return runtimeContext.getWidgetPlugin(typeName) || null;
  } catch {
    return null;
  }
};

export const processDatasourceUpdate = (datasource: unknown): void => {
  try {
    runtimeContext.processDatasourceUpdate(datasource);
  } catch (error: unknown) {
    console.error("Datasource update pipeline failed", error);
  }
};
