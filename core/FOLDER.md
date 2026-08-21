<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# core/ — TS 核心库 @plandeck/core

纯逻辑领域层：Tool 适配器、Catalog、Recognition、Switch、视图推导，全部不依赖 Tauri，通过 FsPort/SqlitePort 端口注入 IO。
被 `app` 以 file: 依赖引入；vitest 测试 + tsc 严格模式。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `src/` | 子目录 | 全部源码（入口 index.ts） |
| `tests/` | 子目录 | vitest 测试与 fixtures |
| `scripts/` | 子目录 | fixture SQLite 库生成脚本 |
| `package.json` | 清单 | 包名/脚本（test、typecheck、fixtures:generate）/依赖 jsonc-parser、smol-toml、yaml |
| `package-lock.json` | 锁定 | 依赖锁定（生成物，不加注释） |
| `tsconfig.json` | 配置 | ES2022 + strict + noUncheckedIndexedAccess，覆盖 src 与 tests |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
| `scripts` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `src` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `tests` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
