<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# .github/ — GitHub 自动化与模板

GitHub 侧的全部自动化配置：`workflows/` 是 CI / 发版 / 需求分级流水线，`ISSUE_TEMPLATE/` 约束 issue 入口，PR 模板强制可追溯性字段，dependabot 管依赖升级。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `workflows/` | 子目录 | ci.yml / release.yml / issue-triage.yml 三条流水线 |
| `ISSUE_TEMPLATE/` | 子目录 | bug 与 feature 的 issue 表单模板 |
| `dependabot.yml` | 配置 | npm(app/core) 与 cargo(src-tauri) 每周依赖升级 |
| `PULL_REQUEST_TEMPLATE.md` | 模板 | PR 必填：摘要、需求追溯、size、milestone、验收清单 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
| `ISSUE_TEMPLATE` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `workflows` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
