<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# public/core/tests/fixtures/cc-switch/ — 测试 fixture 分层目录

本目录保存 cc-switch 相关的字节级测试数据或其分层；测试通过显式路径或扩展名过滤读取。
fixture 内容本身保持原格式，目录增删必须同步本说明和上级 FOLDER.md。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `providers.json` | 文件 | JSON 配置或会话 fixture，供对应适配器测试 |
| `FOLDER.md` | 本说明 | 本目录架构与文件职责索引（自维护） |
