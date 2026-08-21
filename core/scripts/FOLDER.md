<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# core/scripts/ — 核心库维护脚本

开发期一次性脚本，不进产物。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `generate-fixture-databases.mjs` | 脚本 | 用 node:sqlite 重建 tests/fixtures 下的 hermes projects.db/state.db 与 opencode.db |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
