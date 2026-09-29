import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// `vite build --mode preview` makes a self-contained build (no server needed):
// relative paths, hash URLs, and an in-browser copy of the API.
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  base: mode === "preview" ? "./" : "/",
  build: { outDir: mode === "preview" ? "dist-preview" : "dist", emptyOutDir: true },
  server: {
    port: 5175,
    proxy: { "/api": "http://localhost:3003" },
    fs: { allow: [".."] },
  },
}));
