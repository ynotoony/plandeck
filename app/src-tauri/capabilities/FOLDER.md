<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# app/src-tauri/capabilities/ — Tauri 权限

Tauri v2 capability 声明：最小权限原则，新增 IPC 需在此显式放行。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `default.json` | 权限 | 主窗口默认能力（当前仅 core:default，JSON 不加注释） |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
