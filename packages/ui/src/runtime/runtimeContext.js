const defaultContext = {
  getDashboardId: () => null,
  getAuthToken: () => null,
  getRuntimeShareToken: () => null,
  getDatasourcePlugin: () => null,
  getWidgetPlugin: () => null,
  processDatasourceUpdate: () => {},
};

let runtimeContext = { ...defaultContext };

const invokeAccessor = (accessor, fallback = null) => {
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

export const setRuntimeContext = (context = {}) => {
  runtimeContext = {
    ...defaultContext,
    ...context,
  };
};

export const resetRuntimeContext = () => {
  runtimeContext = { ...defaultContext };
};

export const getDashboardId = () => invokeAccessor(runtimeContext.getDashboardId, null);

export const getAuthToken = () => invokeAccessor(runtimeContext.getAuthToken, null);

export const getRuntimeShareToken = () => invokeAccessor(runtimeContext.getRuntimeShareToken, null);

export const getDatasourcePlugin = (typeName) => {
  if (typeof runtimeContext.getDatasourcePlugin !== "function") {
    return null;
  }
  try {
    return runtimeContext.getDatasourcePlugin(typeName) || null;
  } catch {
    return null;
  }
};

export const getWidgetPlugin = (typeName) => {
  if (typeof runtimeContext.getWidgetPlugin !== "function") {
    return null;
  }
  try {
    return runtimeContext.getWidgetPlugin(typeName) || null;
  } catch {
    return null;
  }
};

export const processDatasourceUpdate = (datasource) => {
  if (typeof runtimeContext.processDatasourceUpdate !== "function") {
    return;
  }

  try {
    runtimeContext.processDatasourceUpdate(datasource);
  } catch (error) {
    console.error("Datasource update pipeline failed", error);
  }
};
