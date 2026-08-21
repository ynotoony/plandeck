<!-- input: state（adapterFor/groupForTool）+ tauri-fs（openInEditor） | output: Tool 详情抽屉：状态/绑定/重载提示/备份 | position: 组件
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

<script lang="ts">
  import type { EnvironmentBindingStatus } from "@plandeck/core";
  import { adapterFor, appState, clearToolBindingPending, groupForTool, refresh, saveToolBinding, toolName } from "../lib/state.svelte";
  import { openInEditor } from "../lib/tauri-fs";
  import { toast } from "../lib/toast.svelte";
  import StatusBadge from "./StatusBadge.svelte";
  import BackupsView from "./BackupsView.svelte";

  let {
    toolId,
    onSwitch,
    onHide,
  }: {
    toolId: string;
    onSwitch: () => void;
    onHide: () => void;
  } = $props();

  const tool = $derived(appState.tools.find((t) => t.toolId === toolId));
  const adapter = $derived(adapterFor(toolId));
  const group = $derived(groupForTool(toolId));
  const planName = $derived(
    tool?.plan
      ? (appState.catalog.plans.find((p) => p.id === tool.plan)?.name ?? tool.plan)
      : undefined,
  );
  let showHistory = $state(false);

  async function openConfig(): Promise<void> {
    if (!adapter) return;
    try {
      await openInEditor(adapter.configPath);
    } catch (e) {
      toast(String(e), "err");
    }
  }

  async function unbind(): Promise<void> {
    if (!confirm(`解除 ${toolName(toolId)} 的 Group 绑定？Tool 配置文件不会自动回退。`)) return;
    try {
      await saveToolBinding(toolId, null);
      toast("已解除绑定；现有 Tool 配置保持不变");
    } catch (error) {
      toast(String(error), "err");
    }
  }

  async function recheckBinding(): Promise<void> {
    clearToolBindingPending(toolId);
    await refresh();
    toast("已重新检查 Tool 配置");
  }

  function bindingLabel(status: EnvironmentBindingStatus | undefined): string {
    return ({
      bound: "已绑定",
      "needs-reload": "需要重新加载 shell",
      "needs-restart": "需要重启 Tool",
      "invalid-group": "Group 无效",
      "unsupported-env": "不支持直接环境变量",
      drifted: "配置已漂移",
    } as Record<string, string>)[status ?? ""] ?? "未绑定";
  }
</script>

<aside id="drawer">
  {#if tool}
    <h2>⚙️ {toolName(toolId)} <StatusBadge status={tool.status} /></h2>
    <dl class="kv">
      <dt>默认模型</dt>
      <dd class="model">{tool.defaultModel ?? "（未设置）"}</dd>
      <dt>Plan</dt>
      <dd>{planName ?? "—"}</dd>
      <dt>环境 Group</dt>
      <dd>{group?.id ?? "—"} · {bindingLabel(tool.bindingStatus)}</dd>
      <dt>配置文件</dt>
      <dd class="mono dim">{adapter?.configPath ?? "—"}</dd>
      {#if tool.note}
        <dt>备注</dt>
        <dd class="dim">{tool.note}</dd>
      {/if}
    </dl>
    <div class="actions">
      {#if adapter?.environmentSupport.supported}
        <button class="btn" onclick={onSwitch}>{group ? "切换账号" : "绑定 Group"}</button>
        {#if group}<button class="btn ghost" onclick={unbind}>解除绑定</button>{/if}
        {#if tool.bindingStatus === "needs-reload" || tool.bindingStatus === "needs-restart"}
          <button class="btn ghost" onclick={recheckBinding}>重新检查</button>
        {/if}
      {/if}
      <button class="btn ghost" class:active={showHistory} onclick={() => (showHistory = !showHistory)}>历史版本</button>
      <button class="btn ghost" onclick={openConfig}>编辑</button>
      <button class="btn ghost danger-text" onclick={onHide}>隐藏工具</button>
    </div>
    {#if showHistory}
      <section class="drawer-history">
        <h3>历史版本</h3>
        <BackupsView {toolId} />
      </section>
    {/if}
    <p class="dim hint">
      项目 / 会话层只读；切换只作用于工具层默认。
      {#if tool.status === "oauth"}OAuth 登录型 —— 请在对应 Tool 内切换登录。{/if}
      {#if !adapter?.environmentSupport.supported}{adapter?.environmentSupport.reason}{/if}
    </p>
  {/if}
</aside>
