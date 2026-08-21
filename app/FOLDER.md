<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# app/ — 桌面应用 @plandeck/app

Svelte 5 前端（src/）+ Tauri 2/Rust 运行时（src-tauri/）+ 浏览器 E2E（e2e/）。
Vite dev server 固定 1420 端口；E2E 用 mock Tauri 后端驱动系统 Chrome，作用于临时 HOME。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `src/` | 子目录 | 前端源码（入口 main.ts） |
| `src-tauri/` | 子目录 | Rust 运行时：Tauri 命令、环境存储、备份、托盘 |
| `e2e/` | 子目录 | 端到端测试：playwright-core + mock 后端 |
| `scripts/` | 子目录 | 图标生成脚本 |
| `index.html` | 入口 | Vite HTML 壳，挂载 #app |
| `package.json` | 清单 | 脚本 dev/build/typecheck/e2e/tauri 与依赖 |
| `package-lock.json` | 锁定 | 依赖锁定（生成物） |
| `tsconfig.json` | 配置 | 前端 TS 严格配置，覆盖 src 与 vite.config.ts |
| `vite.config.ts` | 构建配置 | Svelte 插件、1420 端口、es2022 产物 |
| `.gitignore` | 配置 | 忽略 dist 等 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
| `e2e` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `public` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `scripts` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `src` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `src-tauri` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
