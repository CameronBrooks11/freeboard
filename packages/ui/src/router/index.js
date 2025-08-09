/**
 * @module router/index
 * @description Vue Router setup for Freeboard UI, handling static vs dynamic routing and authentication guards.
 */

import { createRouter, createWebHistory } from "vue-router";
import Freeboard from "../components/Freeboard.vue";
import Login from "../components/Login.vue";
import { useFreeboardStore } from "../stores/freeboard";

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
        path: "/",
        name: "Home",
        component: Freeboard,
        props: true,
        sensitive: true,
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
   * - Redirect unauthenticated users to Login when accessing Home.
   * - Redirect authenticated users away from Login to Home.
   */
  router.beforeEach(async (to, from) => {
    const freeboardStore = useFreeboardStore();
    freeboardStore.loadSettingsFromLocalStorage();
    if (!freeboardStore.isLoggedIn() && to.name === "Home") {
      return { name: "Login" };
    } else if (freeboardStore.isLoggedIn() && to.name === "Login") {
      return { name: "Home" };
    }
  });
}

export default router;
