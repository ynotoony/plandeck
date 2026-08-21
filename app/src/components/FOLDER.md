<!-- 一旦我所属的文件夹有所变化，请更新我。 -->
<!-- input: 本目录的结构与直接子项 | output: 本目录的极简架构说明及逐文件职责索引 | position: 所属文件夹的自维护架构文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# app/src/components/ — UI 组件

无自有业务状态的展示/交互组件：业务动作一律委托 lib/state.svelte.ts，反馈走 toast。

| 文件 | 地位 | 功能 |
| --- | --- | --- |
| `ToolDrawer.svelte` | 组件 | Tool 详情抽屉：状态、绑定、重载提示、备份列表 |
| `PlanEditor.svelte` | 组件 | Plan 右侧详情编辑器：表单、显式保存、删除保护 |
| `GroupEditor.svelte` | 组件 | Group 编辑器：成员/契约表单 + 重绑定 diff 预览 |
| `SwitchModal.svelte` | 组件 | 切换确认弹窗：diff 预览 → 备份 → commitSwitch |
| `PlanTestModal.svelte` | 组件 | Plan 可用性测试弹窗（模型选择 + 结果展示） |
| `BackupsView.svelte` | 组件 | 备份列表与恢复按钮（可按 Tool 过滤） |
| `DiffView.svelte` | 组件 | FileEdit[] 的只读 diff 渲染 |
| `StatusBadge.svelte` | 组件 | matched/unset/unknown/oauth 四态徽章 |
| `UpdateDialog.svelte` | 组件 | 更新检查对话框 + release 历史视图 |
| `FOLDER.md` | 本说明 | 本目录架构与逐文件职责索引（自维护）。 |
