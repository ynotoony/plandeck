<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# app/src/lib/ — 前端状态与桥接

前端的大脑：state.svelte.ts 聚合全部业务状态并编排 core 领域函数与 Rust IPC；tauri-fs.ts 是唯一的 IPC 客户端；tray.ts 负责状态栏菜单。
其余为独立小模块：主题、toast、updater。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `state.svelte.ts` | 核心状态 | appState：catalog/tools/env/binding 全状态 + init/refresh/切换/绑定/Plan 编辑编排 |
| `tauri-fs.ts` | IPC 客户端 | FsPort/SqlitePort 的 Tauri invoke 实现 + 备份/环境/updater 命令封装 |
| `tray.ts` | 托盘桥 | tray 菜单构建与 switch action 监听，串行刷新防竞态 |
| `theme.svelte.ts` | 主题 | system/light/dark 选择与 localStorage 持久化 |
| `toast.svelte.ts` | 提示 | 全局 toast 状态与定时消失 |
| `updater.svelte.ts` | 更新器 | 检查/安装更新、release 历史、启动检查偏好 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
