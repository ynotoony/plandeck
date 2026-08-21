<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# app/e2e/ — 端到端测试

playwright-core 驱动 debug 二进制 + 系统 Chrome，mock Tauri 后端监听 4399 端口，全部作用于临时 HOME。
前置：先 cargo build 出 debug 二进制。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `e2e.mjs` | 入口 | 搭临时 HOME/装 fixtures、起 mock 后端与应用、跑断言用例 |
| `mocks.mjs` | mock 后端 | 按 lib.rs/fsx.rs 命令契约实现的 HTTP mock（fs/sqlite/env/backup/tray） |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
