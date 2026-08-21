<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# core/src/adapters/ — Tool 适配器

每个 AI Tool 一个声明式适配器：读配置文件→ConfigFragment→ToolState，并生成切换所需 FileEdit；支持环境契约的适配器额外投影 GroupContract。
格式分工：hermes=YAML、codex/kimi=TOML、其余=JSONC；kimi/zcode 为只读检测（detection-only）。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `shared.ts` | 工具箱 | jsonSet/slug/walkFiles/stateFromFragment/排序等共享函数 |
| `hermes.ts` | 适配器 | Hermes：~/.hermes/config.yaml + projects.db/state.db/sessions，支持 Group 绑定 |
| `codex.ts` | 适配器 | Codex CLI：~/.codex/config.toml 的 TOML 编辑与 rollout 会话，支持 Group 绑定 |
| `claude.ts` | 适配器 | Claude Code：~/.claude/settings.json + OAuth 识别 + transcripts，支持 Group 绑定 |
| `opencode.ts` | 适配器 | opencode：~/.config/opencode/opencode.json(c) + db 会话，支持 Group 绑定 |
| `openclaw.ts` | 适配器 | OpenClaw：~/.openclaw/openclaw.json + 会话目录 |
| `kimi.ts` | 适配器 | Kimi Code：~/.kimi/config.toml 只读检测，不做环境绑定 |
| `zcode.ts` | 适配器 | ZCode：~/.zcode/v2/config.json 只读检测，不做环境绑定 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
