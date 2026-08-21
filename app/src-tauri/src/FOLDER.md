<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# app/src-tauri/src/ — Rust 源码

三文件结构：main.rs 仅启动；lib.rs 是命令注册与托盘/UI 逻辑中枢；environment.rs 与 fsx.rs 分别是环境边界与文件边界。
凭据永不穿过 IPC：只回传存在性与指纹。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `main.rs` | 入口 | 调用 plandeck_lib::run() |
| `lib.rs` | 中枢 | 注册 fs/sqlite/env/backup/editor/tray/updater 命令；托盘菜单构建与窗口管理 |
| `environment.rs` | 环境边界 | EnvironmentStore：subscriptions.env 解析/校验/备份/原子写、loader 安装、遗留凭据迁移 |
| `fsx.rs` | 文件边界 | 原子写（临时文件+rename）、备份目录与 manifest、恢复、权限模式 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
