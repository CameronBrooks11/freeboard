import { useAuthStore } from "../stores/auth.js";
import { useDashboardStore } from "../stores/dashboard.js";
import { usePluginRegistryStore } from "../stores/pluginRegistry.js";
import { setRuntimeContext } from "../runtime/runtimeContext.js";
import type { Pinia } from "pinia";
import type { Datasource } from "../models/Datasource.js";

export const bootstrapApp = ({ pinia }: { pinia: Pinia }) => {
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
    getDatasourcePlugin: (typeName: string) => pluginRegistryStore.getDatasourcePlugin(typeName),
    getWidgetPlugin: (typeName: string) => pluginRegistryStore.getWidgetPlugin(typeName),
    processDatasourceUpdate: (datasource: unknown) => {
      dashboardStore.dashboard?.processDatasourceUpdate?.(datasource as Datasource);
    },
  });

  dashboardStore.syncEditingPermissions();
};
