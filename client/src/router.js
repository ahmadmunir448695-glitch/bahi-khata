import { createRouter, createWebHistory, createWebHashHistory } from "vue-router";
import { app } from "./lib/state.js";
import HomeView from "./views/HomeView.vue";

const routes = [
  { path: "/login", component: () => import("./views/AuthView.vue"), meta: { guest: true } },
  { path: "/", component: HomeView },
  { path: "/c/new", component: () => import("./views/CustomerFormView.vue") },
  { path: "/c/:id", component: () => import("./views/CustomerView.vue"), props: true },
  { path: "/c/:id/edit", component: () => import("./views/CustomerFormView.vue"), props: true },
  { path: "/settings", component: () => import("./views/SettingsView.vue") },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  // The self-contained preview build has no server to answer deep links, so it uses #/ URLs.
  history: import.meta.env.MODE === "preview" ? createWebHashHistory() : createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved || { top: 0 },
});

router.beforeEach((to) => {
  if (!app.ready) return true;
  if (!app.user && !to.meta.guest) return { path: "/login", query: to.fullPath !== "/" ? { next: to.fullPath } : {} };
  if (app.user && to.meta.guest) return "/";
  return true;
});
