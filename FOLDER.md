<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# public/ — 公开仓库根

PlanDeck 的对外发布面：代码在 `core/`（TS 领域核心库）与 `app/`（Svelte 5 + Tauri 2 桌面应用），流程与发布文档在 `docs/`，需求分级与 updater 脚本在 `scripts/`，GitHub 自动化在 `.github/`。
所有 branch / PR / tag / release 只从这里推送 `ynotoony/plandeck`；私有规划一律放 `../private/`。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `.github/` | 子目录 | GitHub 自动化：CI/发版/分级 workflow、issue 与 PR 模板、dependabot |
| `core/` | 子目录 | TS 核心库 @plandeck/core：领域类型、Catalog、识别、适配器、视图推导 |
| `app/` | 子目录 | 桌面应用 @plandeck/app：Svelte 前端 + Tauri/Rust 运行时 + E2E |
| `docs/` | 子目录 | 架构、发布计划、发布说明、需求流程等对外文档 |
| `scripts/` | 子目录 | 需求分级与 updater 清单脚本及其测试 |
| `.gitignore` | 配置 | 忽略 node_modules/dist/target/密钥等 |
| `.node-version` | 配置 | 锁定 Node 22.23.1（CI node-version-file 依赖，**单行文件禁止任何注释**） |
| `rust-toolchain.toml` | 配置 | 锁定 Rust 1.94.0 |
| `README.md` | 入口文档 | 英文项目说明：功能、安装、构建、测试 |
| `README.zh-CN.md` | 入口文档 | 中文项目说明 |
| `CHANGELOG.md` | 发布记录 | 0.1.0 起各版本用户可见变更摘要 |
| `CONTRIBUTING.md` | 流程文档 | 贡献指引 |
| `SECURITY.md` | 流程文档 | 安全漏洞私密报告渠道 |
| `LICENSE` | 法律 | MIT 许可证全文 |
| `FOLDER.md` | 本说明 | 本目录架构说明（自维护） |
| `.github` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `app` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `core` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `docs` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `scripts` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
