<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# app/src-tauri/ — Rust 运行时

Tauri 2 主进程：lib.rs 注册全部 IPC 命令与托盘；environment.rs 是 subscriptions.env 的唯一读写边界；fsx.rs 管原子写/备份/恢复。
capabilities/ 限权限，gen/schemas/ 为生成物，icons/ 由 app/scripts 生成。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `src/` | 子目录 | Rust 源码（main.rs 入口） |
| `capabilities/` | 子目录 | Tauri 权限声明（当前仅 core:default） |
| `gen/schemas/` | 生成物 | Tauri CLI 生成的权限 schema（勿手改勿注释） |
| `icons/` | 资源 | 应用与托盘图标 PNG（脚本生成，勿注释） |
| `Cargo.toml` | 清单 | crate plandeck/plandeck_lib 与依赖（tauri、rusqlite、sha2…） |
| `Cargo.lock` | 锁定 | 依赖锁定（生成物） |
| `build.rs` | 构建脚本 | tauri_build::build() |
| `tauri.conf.json` | 配置 | 窗口/打包/updater 公钥/产品元数据（JSON，不加注释） |
| `.gitignore` | 配置 | 忽略 gen/target |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
| `capabilities` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `gen` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `icons` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `src` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
