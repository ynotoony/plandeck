<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# .github/workflows/ — CI 与发版流水线

三条 GitHub Actions 流水线：合入前检查、发版产物构建、issue 自动分级。全部跑在公共 runner，不接触任何真实凭据。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `ci.yml` | 主流水线 | push/PR 触发：workflow 脚本测试 → core vitest+typecheck → app typecheck/build/cargo test/clippy → gitleaks 密钥扫描 |
| `release.yml` | 发版流水线 | 手动触发：Apple Silicon 构建 DMG+updater 产物、签名、生成 latest.json 并发布 GitHub pre-release |
| `issue-triage.yml` | 分级流水线 | issue 打开/编辑时按正文信号自动计算 XS~XL 并评论 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
