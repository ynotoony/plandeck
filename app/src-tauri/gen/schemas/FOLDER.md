<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# app/src-tauri/gen/schemas/ — 生成物（勿手改）

Tauri CLI 生成的权限/能力 JSON schema，供 capabilities/default.json 的 $schema 引用。由 `tauri dev/build` 自动重写，不加注释。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `acl-manifests.json` | 生成物 | 各插件 ACL 清单 |
| `capabilities.json` | 生成物 | 合并后的能力解析结果 |
| `desktop-schema.json` | 生成物 | 桌面端 capability schema |
| `macOS-schema.json` | 生成物 | macOS 平台 schema |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
