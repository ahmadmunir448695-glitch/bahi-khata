import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";
import { loadSession } from "./lib/state.js";
import "./assets/app.css";

// Know who is signed in before the first route is chosen.
loadSession().finally(() => createApp(App).use(router).mount("#app"));
