<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# docs/ — 对外文档

架构与流程文档：architecture.md 定分层与安全边界，release-plan.md 是发布台账（须与 GitHub milestones 一致），requirements-workflow.md 是需求状态机。
release-notes/ 每版一篇，随 release 发布。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `release-notes/` | 子目录 | 每个已发布版本的正式 release notes |
| `adr/` | 子目录 | 架构决策记录（当前为空，决策产生时惰性创建） |
| `architecture.md` | 架构 | Core/前端/Rust 三层、数据流、安全边界 |
| `release-plan.md` | 台账 | 已发布表 + 各版本需求→交付映射 + 出入门禁 |
| `releasing.md` | 流程 | 发版前置检查与产物清单操作手册 |
| `requirements-workflow.md` | 流程 | 需求 intake/triage/size/实现/验收/发布状态机 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
| `adr` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `release-notes` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
