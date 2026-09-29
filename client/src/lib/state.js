import { reactive, watchEffect } from "vue";
import { api } from "./api.js";

// App-wide state: the signed-in seller and the toast message.
export const app = reactive({ user: null, ready: false, loadError: "", toast: "" });

export async function loadSession() {
  try {
    app.user = (await api("GET", "/auth/me")).user;
    app.ready = true;
  } catch (err) {
    app.loadError = err.message;
  }
}

export async function login(email, password) {
  app.user = (await api("POST", "/auth/login", { email, password })).user;
}
export async function register(fields) {
  app.user = (await api("POST", "/auth/register", fields)).user;
}
export async function logout() {
  await api("POST", "/auth/logout", {});
  app.user = null;
}

let timer;
export function toast(text) {
  app.toast = text;
  clearTimeout(timer);
  timer = setTimeout(() => (app.toast = ""), 2600);
}

// Browser tab title, e.g. "Orders · Bahi".
export function useTitle(getter) {
  watchEffect(() => {
    const part = getter();
    document.title = part ? `${part} · Bahi` : "Bahi · Digital khata";
  });
}
