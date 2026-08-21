<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# .github/ISSUE_TEMPLATE/ — issue 表单模板

约束 GitHub issue 的入口格式：禁止空白 issue，bug/feature 各有结构化表单并默认打 needs-triage 标签，提醒提交者先脱敏。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `bug_report.yml` | 表单 | bug 报告：版本、复现步骤、期望/实际，默认 labels bug+needs-triage |
| `feature_request.yml` | 表单 | 功能请求：问题、期望结果、验收标准，默认 labels enhancement+needs-triage |
| `config.yml` | 配置 | 关闭空白 issue，安全问题导向私密 advisory 渠道 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
