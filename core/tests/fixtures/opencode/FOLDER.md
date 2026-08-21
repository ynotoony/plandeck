<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# public/core/tests/fixtures/opencode/ — 测试 fixture 分层目录

本目录保存 opencode 相关的字节级测试数据或其分层；测试通过显式路径或扩展名过滤读取。
fixture 内容本身保持原格式，目录增删必须同步本说明和上级 FOLDER.md。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `opencode.db` | 文件 | SQLite fixture，供只读查询测试 |
| `opencode.json` | 文件 | JSON 配置或会话 fixture，供对应适配器测试 |
| `opencode.jsonc` | 文件 | 测试或运行资源 |
| `opencode.unset.json` | 文件 | JSON 配置或会话 fixture，供对应适配器测试 |
| `opencode.with-model.json` | 文件 | JSON 配置或会话 fixture，供对应适配器测试 |
| `FOLDER.md` | 本说明 | 本目录架构与文件职责索引（自维护） |
