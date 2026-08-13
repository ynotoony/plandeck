<script lang="ts">
  import { commitSwitch } from "@plandeck/core";
  import type { FileEdit, Plan } from "@plandeck/core";
  import { adapterFor, appState, refresh, toolName, updateTool } from "../lib/state.svelte";
  import { backupFiles, tauriFs } from "../lib/tauri-fs";
  import { toast } from "../lib/toast.svelte";
  import { refreshTray } from "../lib/tray";
  import DiffView from "./DiffView.svelte";
  import StatusBadge from "./StatusBadge.svelte";

  let {
    toolId,
    onCancel,
    onDone,
  }: {
    toolId: string;
    onCancel: () => void;
    onDone: () => void;
  } = $props();

  const adapter = $derived(adapterFor(toolId));

  let planId = $state<string | null>(null);
  let model = $state<string | null>(null);
  let edits = $state<FileEdit[] | null>(null);
  let previewError = $state("");
  let busy = $state(false);
  let previewVersion = 0;

  const plan = $derived(appState.catalog.plans.find((p) => p.id === planId) ?? null);

  $effect(() => {
    const p = plan;
    const m = model;
    const version = ++previewVersion;
    edits = null;
    previewError = "";
    if (!adapter || !p || !m) return;
    adapter
      .planChange(p, m)
      .then((e) => {
        if (version === previewVersion) edits = e;
      })
      .catch((e: unknown) => {
        if (version === previewVersion) previewError = String(e);
      });
  });

  function pickPlan(p: Plan): void {
    if (p.source === "oauth") {
      toast("OAuth 型订阅需在对应 Tool 内切换登录", "err");
      return;
    }
    planId = p.id;
    model = null;
  }

  async function confirm(): Promise<void> {
    if (!adapter || !edits) return;
    busy = true;
    try {
      const { state, backups } = await commitSwitch(
        adapter,
        edits,
        tauriFs,
        (paths) => backupFiles(toolId, paths),
      );
      updateTool(state);
      await refreshTray();
      const first = backups[0];
      const dir = first ? first.slice(0, first.lastIndexOf("/")) : "";
      toast(`已切换 · 配置已更新${dir ? ` · 备份于 ${dir}` : ""}`);
      onDone();
    } catch (e) {
      toast(String(e), "err");
      await refresh().catch(() => {});
    } finally {
      busy = false;
    }
  }
</script>

<div id="modalWrap">
  <div id="modal">
    <h2>切换 {toolName(toolId)} 的默认 Plan / 模型</h2>

    <div class="step">1 · 选 Plan（OAuth 型不可在此切换）</div>
    {#each appState.catalog.plans as p (p.id)}
      <button
        type="button"
        class="pick {planId === p.id ? 'on' : ''} {p.source === 'oauth' ? 'dis' : ''}"
        disabled={p.source === "oauth"}
        onclick={() => pickPlan(p)}
      >
        <span><b>{p.name}</b> <span class="dim small">{p.sourceDetail ?? p.source}</span></span>
        {#if p.source === "oauth"}<StatusBadge status="oauth" />{/if}
      </button>
    {:else}
      <div class="dim">Catalog 还没有 Plan —— 首次启动导入见票 08</div>
    {/each}

    <div class="step">2 · 选模型</div>
    <div>
      {#if plan}
        {#each plan.models as m (m)}
          <button type="button" class="chip {model === m ? 'on' : ''}" onclick={() => (model = m)}
            >{m}</button>
        {:else}
          <span class="dim">该 Plan 未记录可用模型</span>
        {/each}
      {:else}
        <span class="dim">先选一个 Plan</span>
      {/if}
    </div>

    {#if plan && model}
      <div class="step">3 · 将写入（写前自动备份）</div>
      {#if previewError}
        <div class="dim">{previewError}</div>
      {:else if edits}
        <DiffView {edits} />
      {:else}
        <div class="dim">生成 diff 中…</div>
      {/if}
    {/if}

    <div class="modal-foot">
      <button class="btn ghost" onclick={onCancel}>取消</button>
      <button class="btn" disabled={!edits || busy} onclick={confirm}>
        {busy ? "切换中…" : "确认切换"}
      </button>
    </div>
  </div>
</div>
