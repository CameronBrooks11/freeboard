/**
 * @module router/index
 * @description Vue Router setup for Freeboard UI, handling static vs dynamic routing and authentication guards.
 */

import { createRouter, createWebHistory } from "vue-router";
import Freeboard from "../components/Freeboard.vue";
import Login from "../components/Login.vue";
import AdminConsole from "../components/AdminConsole.vue";
import { useFreeboardStore } from "../stores/freeboard";
import { resolveNavigationGuard } from "./authGuard";

/** @type {import('vue-router').Router} */
let router;

if (__FREEBOARD_STATIC__) {
  // Static deployment: only Home route
  router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
      {
        path: "/",
        name: "Home",
        component: Freeboard,
        props: true,
        sensitive: true,
      },
    ],
  });
} else {
  // Full app: login and dynamic dashboard routes
  router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
      {
        path: "/login",
        name: "Login",
        component: Login,
        props: true,
        sensitive: true,
      },
      {
        path: "/invite/:token",
        name: "InviteAccept",
        redirect: (to) => ({
          name: "Login",
          query: {
            invite: to.params.token,
          },
        }),
      },
      {
        path: "/reset-password/:token",
        name: "PasswordReset",
        redirect: (to) => ({
          name: "Login",
          query: {
            reset: to.params.token,
          },
        }),
      },
      {
        path: "/s/:shareToken",
        name: "SharedDashboard",
        component: Freeboard,
        props: (to) => ({
          shareToken: String(to.params.shareToken || ""),
        }),
        sensitive: true,
      },
      {
        path: "/p/:id",
        name: "PublicDashboard",
        component: Freeboard,
        props: (to) => ({
          id: String(to.params.id || ""),
        }),
        sensitive: true,
      },
      {
        path: "/",
        name: "Home",
        component: Freeboard,
        props: true,
        sensitive: true,
      },
      {
        path: "/admin",
        name: "Admin",
        component: AdminConsole,
        props: true,
        sensitive: true,
        meta: {
          requiresAdmin: true,
        },
      },
      {
        path: "/:id",
        name: "Freeboard",
        component: Freeboard,
        props: true,
        sensitive: true,
      },
    ],
  });

  /**
   * Global navigation guard to enforce login state.
   *
   * - Redirect unauthenticated users to Login when accessing any non-login route.
   * - Redirect authenticated users away from Login to Home.
   */
  router.beforeEach(async (to) => {
    const freeboardStore = useFreeboardStore();
    freeboardStore.loadSettingsFromLocalStorage();

    const redirect = resolveNavigationGuard({
      to,
      isLoggedIn: freeboardStore.isLoggedIn(),
      isAdmin: freeboardStore.isAdmin(),
    });
    if (redirect) {
      return redirect;
    }
  });
}

export default router;
