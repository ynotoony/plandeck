import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: [".."] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  optimizeDeps: { exclude: ["@plandeck/core"] },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
