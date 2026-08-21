// input: @sveltejs/vite-plugin-svelte
// output: Vite 配置（1420 端口、es2022、fs.allow 上级目录）
// position: 前端构建配置
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

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
