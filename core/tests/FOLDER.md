<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# core/tests/ — vitest 测试

核心库的全部单元/集成测试：每个领域模块一组 .test.ts，helpers.ts 提供临时 HOME 与 fixture 安装工具，fixtures/ 是字节级测试数据。
fixtures 目录内不加注释、不放各自 FOLDER.md（见 fixtures/FOLDER.md）。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `fixtures/` | 子目录 | 各 Tool 配置/会话/数据库的测试数据（字节级，勿改勿注释） |
| `helpers.ts` | 测试基建 | FIXTURES 路径、临时 HOME、fixture 安装函数、共享 Plan 样本 |
| `binding.test.ts` | 测试 | Tool↔Group 绑定与契约投影 |
| `bootstrap.test.ts` | 测试 | 首跑 Catalog 自举 |
| `cascade.test.ts` | 测试 | Cascade 行推导 |
| `catalog.test.ts` | 测试 | Catalog CRUD 与去凭据化 |
| `ccswitch.test.ts` | 测试 | ccSwitch 导入与合并 |
| `claude.test.ts` | 测试 | Claude Code 适配器（含 OAuth/模型识别） |
| `codex.test.ts` | 测试 | Codex CLI 适配器与 TOML 编辑 |
| `diff.test.ts` | 测试 | diffLines 行级差异 |
| `env.test.ts` | 测试 | 环境变量 Plan 扫描 |
| `environment.test.ts` | 测试 | subscriptions.env 解析/校验/序列化 |
| `first-run.test.ts` | 测试 | 首跑导入端到端流程 |
| `hermes.test.ts` | 测试 | Hermes 适配器（YAML + SQLite 项目/会话） |
| `openclaw.test.ts` | 测试 | OpenClaw 适配器 |
| `opencode.test.ts` | 测试 | opencode 适配器（JSONC + db） |
| `recognize.test.ts` | 测试 | Recognition 状态机与指纹 |
| `roundtrip.test.ts` | 测试 | 识别→切换→再识别回环 |
| `switch.test.ts` | 测试 | commitSwitch 备份与拒写语义 |
| `views.test.ts` | 测试 | 托盘/Cascade/Plan 行推导 |
| `zcode-kimi.test.ts` | 测试 | ZCode/Kimi 只读检测适配器 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
| `fixtures` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
