import { useAuthStore } from "../stores/auth.js";
import { useDashboardStore } from "../stores/dashboard.js";
import { usePluginRegistryStore } from "../stores/pluginRegistry.js";
import { setRuntimeContext } from "../runtime/runtimeContext.js";

export const bootstrapApp = ({ pinia }) => {
  const authStore = useAuthStore(pinia);
  const dashboardStore = useDashboardStore(pinia);
  const pluginRegistryStore = usePluginRegistryStore(pinia);

  authStore.loadSession();
  authStore.hydrateFromToken();
  authStore.setPublicAuthPolicy(authStore.publicAuthPolicy);

  pluginRegistryStore.registerCorePlugins();

  setRuntimeContext({
    getDashboardId: () => dashboardStore.dashboard?._id || null,
    getAuthToken: () => authStore.token || null,
    getRuntimeShareToken: () => authStore.runtimeShareToken || null,
    getDatasourcePlugin: (typeName) => pluginRegistryStore.getDatasourcePlugin(typeName),
    getWidgetPlugin: (typeName) => pluginRegistryStore.getWidgetPlugin(typeName),
    processDatasourceUpdate: (datasource) => {
      dashboardStore.dashboard?.processDatasourceUpdate?.(datasource);
    },
  });

  dashboardStore.syncEditingPermissions();
};
