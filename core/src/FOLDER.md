<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# core/src/ — 核心库源码

领域逻辑全在这里：types 定契约 → adapters 读各 Tool 配置 → recognize 比对 Catalog → switch/apply 安全写回 → views 推导 UI/托盘行模型。
index.ts 是唯一出口；IO 一律走 FsPort/SqlitePort，Node 实现仅供测试。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `adapters/` | 子目录 | 7 个 Tool 适配器 + 共享工具箱 |
| `index.ts` | 入口 | 统一再导出全部模块（package.json main） |
| `types.ts` | 契约 | 全部领域类型：Status/ToolState/Plan/Catalog/GroupContract/Adapter/FsPort/SqlitePort |
| `registry.ts` | 注册表 | createAdapters()：实例化全部适配器，新增 Tool 在此登记 |
| `catalog.ts` | 数据操作 | Catalog 增删改查、持久化、去凭据化 |
| `recognize.ts` | 识别引擎 | 配置片段↔Catalog 比对出 matched/unknown/unset/oauth + 指纹/URL 归一化 |
| `switch.ts` | 切换编排 | commitSwitch()：备份→应用编辑→重读状态 |
| `apply.ts` | 写入原语 | applyFileEdits()：旧文本校验失败即拒写 |
| `views.ts` | 视图推导 | 托盘菜单/Cascade/Plan/Default 行的纯函数推导 + tray action 解析 |
| `bootstrap.ts` | 首跑自举 | 从现有 Tool 配置扫出初始 Catalog |
| `env.ts` | 环境扫描 | 从进程环境变量扫 *_API_KEY 类 Plan |
| `environment.ts` | 环境契约 | subscriptions.env 的 TS 侧解析/校验/序列化模型（权威实现在 Rust） |
| `diff.ts` | 算法 | diffLines()：LCS 行级差异，供切换预览 |
| `ccswitch.ts` | 导入逻辑 | ccSwitch providers 数据解析与 Catalog 合并（纯逻辑） |
| `node-fs.ts` | 端口实现 | nodeFs：FsPort 的 Node 实现（原子写/chmod），测试与脚本用 |
| `node-sqlite.ts` | 端口实现 | nodeSqlite：只读 SqlitePort 的 Node 实现 |
| `node-ccswitch.ts` | IO 绑定 | 读 ~/.cc-switch/cc-switch.db 并驱动导入/首跑 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
| `adapters` | 子目录 | 下级模块；职责详见其中的 FOLDER.md。 |
