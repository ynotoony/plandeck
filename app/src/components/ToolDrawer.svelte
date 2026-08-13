<script lang="ts">
  import { adapterFor, appState, toolName } from "../lib/state.svelte";
  import { openInEditor } from "../lib/tauri-fs";
  import { toast } from "../lib/toast.svelte";
  import StatusBadge from "./StatusBadge.svelte";
  import BackupsView from "./BackupsView.svelte";

  let {
    toolId,
    onSwitch,
  }: {
    toolId: string;
    onSwitch: () => void;
  } = $props();

  const tool = $derived(appState.tools.find((t) => t.toolId === toolId));
  const adapter = $derived(adapterFor(toolId));
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
</script>

<aside id="drawer">
  {#if tool}
    <h2>⚙️ {toolName(toolId)} <StatusBadge status={tool.status} /></h2>
    <dl class="kv">
      <dt>默认模型</dt>
      <dd class="model">{tool.defaultModel ?? "（未设置）"}</dd>
      <dt>Plan</dt>
      <dd>{planName ?? "—"}</dd>
      <dt>配置文件</dt>
      <dd class="mono dim">{adapter?.configPath ?? "—"}</dd>
      {#if tool.note}
        <dt>备注</dt>
        <dd class="dim">{tool.note}</dd>
      {/if}
    </dl>
    <div class="actions">
      {#if tool.status !== "oauth"}
        <button class="btn" onclick={onSwitch}>切换</button>
      {/if}
      <button class="btn ghost" class:active={showHistory} onclick={() => (showHistory = !showHistory)}>历史版本</button>
      <button class="btn ghost" onclick={openConfig}>编辑</button>
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
    </p>
  {/if}
</aside>
