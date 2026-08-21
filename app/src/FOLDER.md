<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# app/src/ — 前端源码

Svelte 5：App.svelte 是窗口壳与路由（级联/Plans/备份三个 Tab），lib/ 持有全部状态与 Tauri IPC，components/ 是抽屉与弹窗。
主题走 CSS 变量（styles.css），localStorage 持久化。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `components/` | 子目录 | 可复用组件：抽屉、弹窗、徽章、diff 视图 |
| `lib/` | 子目录 | 全局状态、Tauri IPC、托盘、主题、toast、updater |
| `main.ts` | 入口 | 应用主题并 mount App.svelte |
| `App.svelte` | 根组件 | 三 Tab 布局、首跑引导、刷新编排、设置入口 |
| `styles.css` | 样式 | 全部 CSS 变量与组件样式（system/light/dark 主题） |
| `vite-env.d.ts` | 类型声明 | vite/client 类型引用 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
| `components` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `lib` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
