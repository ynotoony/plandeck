<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# scripts/ — 流程与发版脚本

需求 size 分级（供 issue-triage workflow 调用）与 updater 清单生成，均配 node:test 测试；CI 用 `node --test scripts/*.test.mjs` 覆盖。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `requirement-size.mjs` | 脚本 | 从 issue 正文信号计算 XS~XL 与拆分要求 |
| `requirement-size.test.mjs` | 测试 | 分级算法单测 |
| `release-workflow.test.mjs` | 测试 | 断言 release.yml 构建 app+dmg 双产物等契约 |
| `updater-manifest.mjs` | 脚本 | 生成 Tauri updater 的 latest.json 清单 |
| `updater-manifest.test.mjs` | 测试 | 清单生成单测 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
