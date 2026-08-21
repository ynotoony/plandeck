<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# core/tests/fixtures/ — 测试数据（字节级，勿注释勿改）

模拟各 Tool 的 HOME 配置：配置文件、会话 jsonl、SQLite 库（由 core/scripts 生成）。
测试按显式路径加载；适配器对会话文件按扩展名/文件名模式过滤。新增 fixture 必须同步 helpers.ts 与相关测试。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `catalog.json` | fixture | 基线 Catalog（含 env/config/oauth 三类 Plan） |
| `cc-switch/providers.json` | fixture | ccSwitch providers 表导出样本 |
| `claude/settings*.json` | fixture | Claude Code 配置的 matched/model-only/oauth 三态 |
| `claude/transcripts/*.jsonl` | fixture | Claude 会话 transcript 样本 |
| `codex/config*.toml` | fixture | Codex 配置的 matched/hand-edited/unset 三态 |
| `codex/sessions/**/*.jsonl` | fixture | Codex rollout 会话样本（按日期目录） |
| `hermes/config*.yaml` | fixture | Hermes 配置的 matched/hand-edited/unset 三态 |
| `hermes/projects.db · state.db` | fixture | Hermes 项目/状态 SQLite（脚本生成，勿手改） |
| `hermes/sessions/request_dump_*.json` | fixture | Hermes 会话 dump（文件名模式被适配器依赖） |
| `openclaw/*.json + sessions/` | fixture | OpenClaw 配置三态与 jsonl 会话 |
| `opencode/*.json(c) + opencode.db` | fixture | opencode 配置四态与 SQLite |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
| `cc-switch` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `claude` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `codex` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `hermes` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `openclaw` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
| `opencode` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
