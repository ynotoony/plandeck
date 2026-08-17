<script lang="ts">
  import { onMount } from "svelte";
  import { deriveCascadeRows, deriveDefaultRows, derivePlanRows, maskKey } from "@plandeck/core";
  import {
    appState,
    closeFirstRunGuide,
    importCcSwitch,
    init,
    refresh,
    scanCurrentPlans,
    toolName,
  } from "./lib/state.svelte";
  import { toast, toastState } from "./lib/toast.svelte";
  import { initTray, refreshTray } from "./lib/tray";
  import { applyTheme, initTheme, themeState, type Theme } from "./lib/theme.svelte";
  import StatusBadge from "./components/StatusBadge.svelte";
  import SwitchModal from "./components/SwitchModal.svelte";
  import ToolDrawer from "./components/ToolDrawer.svelte";
  import PlanEditor from "./components/PlanEditor.svelte";
  import PlanTestModal from "./components/PlanTestModal.svelte";
  import UpdateDialog from "./components/UpdateDialog.svelte";
  import { initializeUpdater, updaterState } from "./lib/updater.svelte";
  import type { Plan } from "@plandeck/core";

  const TABS: [string, string][] = [
    ["status", "现状（级联）"],
    ["defaults", "默认模型"],
    ["plans", "Plan 清单"],
  ];
  const THEMES: [Theme, string, string][] = [
    ["system", "系统", "跟随系统主题"],
    ["light", "浅色", "使用浅色主题"],
    ["dark", "深色", "使用深色主题"],
  ];

  let tab = $state("defaults");
  let drawerToolId = $state<string | null>(null);
  let switchToolId = $state<string | null>(null);
  let revealedPlanId = $state<string | null>(null);
  let importing = $state(false);
  let scanning = $state(false);
  let refreshing = $state(false);
  let editingPlan = $state<Plan | null | undefined>(undefined);
  let testingPlan = $state<Plan | null>(null);
  let updateDialogOpen = $state(false);
  let collapsedCascadeNodes = $state(new Set<string>());

  const rows = $derived(deriveDefaultRows(appState.tools, appState.catalog));
  const planRows = $derived(derivePlanRows(appState.tools, appState.catalog));
  const cascadeRows = $derived(deriveCascadeRows(appState.tools, appState.catalog));
  const visibleCascadeRows = $derived.by(() => {
    const visible: Array<{ row: (typeof cascadeRows)[number]; key: string }> = [];
    let collapsedTool: string | null = null;
    let collapsedProject = false;
    let projectKey = "";
    const projectOccurrences = new Map<string, number>();
    const sessionOccurrences = new Map<string, number>();
    for (const row of cascadeRows) {
      if (row.level === 0) {
        collapsedTool = collapsedCascadeNodes.has(cascadeKey(row)) ? row.toolId : null;
        collapsedProject = false;
        visible.push({ row, key: cascadeKey(row) });
        continue;
      }
      if (collapsedTool === row.toolId) continue;
      if (row.level === 1) {
        const baseKey = cascadeKey(row);
        const occurrence = projectOccurrences.get(baseKey) ?? 0;
        projectOccurrences.set(baseKey, occurrence + 1);
        projectKey = `${baseKey}:${occurrence}`;
        collapsedProject = collapsedCascadeNodes.has(projectKey);
        visible.push({ row, key: projectKey });
        continue;
      }
      if (collapsedProject) continue;
      const baseKey = `${projectKey}:session:${row.label}`;
      const occurrence = sessionOccurrences.get(baseKey) ?? 0;
      sessionOccurrences.set(baseKey, occurrence + 1);
      visible.push({ row, key: `${baseKey}:${occurrence}` });
    }
    return visible;
  });

  onMount(() => {
    const destroyTheme = initTheme();
    init()
      .then(initTray)
      .catch((e: unknown) => toast(String(e), "err"));
    initializeUpdater();
    const onFocus = (): void => {
      if (appState.ready) {
        refresh()
          .then(refreshTray)
          .catch((e: unknown) => toast(String(e), "err"));
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        switchToolId = null;
        drawerToolId = null;
        editingPlan = undefined;
        testingPlan = null;
        updateDialogOpen = false;
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("keydown", onKey);
    return () => {
      destroyTheme();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKey);
    };
  });

  function closeAll(): void {
    drawerToolId = null;
    switchToolId = null;
  }

  function cascadeKey(row: (typeof cascadeRows)[number]): string {
    if (row.level === 0) return `tool:${row.toolId}`;
    return `project:${row.toolId}:${row.path || row.label}`;
  }

  function toggleCascade(key: string): void {
    if (collapsedCascadeNodes.has(key)) collapsedCascadeNodes.delete(key);
    else collapsedCascadeNodes.add(key);
    collapsedCascadeNodes = new Set(collapsedCascadeNodes);
  }

  async function refreshView(): Promise<void> {
    refreshing = true;
    try {
      await refresh();
    } catch (e) {
      toast(String(e), "err");
    } finally {
      refreshing = false;
    }
  }

  async function scan(): Promise<void> {
    scanning = true;
    try {
      const count = await scanCurrentPlans();
      toast(`扫描完成：发现 ${count} 个正在使用的 Plan`);
    } catch (e) {
      toast(String(e), "err");
    } finally {
      scanning = false;
    }
  }

  async function importHistory(): Promise<void> {
    importing = true;
    try {
      const result = await importCcSwitch();
      toast(`ccSwitch：新增 ${result.added}，合并 ${result.merged}，跳过 ${result.skipped}`);
    } catch (e) {
      toast(String(e), "err");
    } finally {
      importing = false;
    }
  }
</script>

<header class="app-header">
  <h1>PlanDeck</h1>
  <div class="header-controls">
    <button
      type="button"
      class="icon-button update-button"
      class:update-ready={updaterState.status === "available"}
      aria-label="应用更新"
      title="应用更新"
      onclick={() => (updateDialogOpen = true)}
    >↻</button>
    <div class="theme-switcher" role="group" aria-label="主题">
      {#each THEMES as [value, label, title] (value)}
        <button
          type="button"
          class:active={themeState.selected === value}
          aria-label={title}
          aria-pressed={themeState.selected === value}
          {title}
          onclick={() => applyTheme(value)}
        >
          {label}
        </button>
      {/each}
    </div>
  </div>
</header>
<div class="sub">
  <span>工具默认模型一览 · 配置文件即真相{appState.homeDir ? ` · 配置根 ${appState.homeDir}` : ""}</span>
  <button
    class="btn ghost mini"
    disabled={refreshing}
    aria-busy={refreshing}
    onclick={refreshView}
  >
    刷新
  </button>
</div>

<div class="c-tabbar">
  {#each TABS as [key, label] (key)}
    <button type="button" class="c-tab {tab === key ? 'on' : ''}" onclick={() => (tab = key)}>
      {label}
    </button>
  {/each}
</div>

{#if !appState.ready}
  <p class="dim">加载中…</p>
{:else if tab === "defaults"}
  <table class="c-table">
    <thead>
      <tr>
        <th style="width:24%">工具</th>
        <th>默认模型</th>
        <th>Plan</th>
        <th>状态</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.toolId)}
        <tr data-tool={r.toolId} onclick={() => (drawerToolId = r.toolId)}>
          <td><b>⚙️ {toolName(r.toolId)}</b></td>
          <td class="model">{r.defaultModel ?? "未设置"}</td>
          <td>{r.plan ?? "—"}</td>
          <td><StatusBadge status={r.status} /></td>
        </tr>
      {:else}
        <tr>
          <td colspan="4" class="dim">没有已注册的 Tool</td>
        </tr>
      {/each}
    </tbody>
  </table>
{:else if tab === "status"}
  <table class="c-table cascade-table">
    <thead>
      <tr>
        <th style="width:34%">层级</th>
        <th>Plan</th>
        <th>模型</th>
        <th>状态</th>
        <th>最近使用时间</th>
      </tr>
    </thead>
    <tbody>
        {#each visibleCascadeRows as item (item.key)}
          {@const row = item.row}
        <tr data-cascade-level={row.level} data-cascade-label={row.label}>
          <td class:cascade-tool={row.level === 0}>
            <div class="cascade-label level-{row.level}" title={row.path ?? row.label}>
              {#if row.level < 2}
                <button
                  type="button"
                  class="cascade-toggle"
                  aria-label={`${collapsedCascadeNodes.has(item.key) ? "展开" : "收起"} ${row.level === 0 ? toolName(row.toolId) : `${toolName(row.toolId)} project ${row.label}${row.path ? ` ${row.path}` : ""}`}`}
                  aria-expanded={!collapsedCascadeNodes.has(item.key)}
                  onclick={(event) => { event.stopPropagation(); toggleCascade(item.key); }}
                >{collapsedCascadeNodes.has(item.key) ? "▸" : "▾"}</button>
              {/if}
              {row.level === 0 ? toolName(row.toolId) : row.label}
            </div>
            {#if row.level === 1 && row.path}
              <div class="small dim cascade-path">{row.path}</div>
            {/if}
          </td>
          <td>{row.plan ?? "—"}</td>
          <td class="model">{row.model ?? "—"}</td>
          <td>
            {#if row.status}
              <StatusBadge status={row.status} />
            {:else}
              —
            {/if}
          </td>
          <td class="small dim">{row.when ?? "—"}</td>
        </tr>
      {:else}
        <tr>
          <td colspan="5" class="dim">没有可显示的 project 或 session</td>
        </tr>
      {/each}
    </tbody>
  </table>
{:else if tab === "plans"}
  <div class="plan-actions">
    <span class="dim">Catalog 共 {planRows.length} 个 Plan</span>
    <button class="btn ghost mini" disabled={scanning} onclick={scan}>
      {scanning ? "扫描中…" : "扫描当前配置"}
    </button>
    <button class="btn mini" disabled={importing} onclick={importHistory}>
      {importing ? "导入中…" : "导入 ccSwitch"}
    </button>
    <button class="btn mini" onclick={() => (editingPlan = null)}>＋ 新建 Plan</button>
  </div>
  <table class="c-table">
    <thead>
      <tr>
        <th>Plan</th>
        <th>来源</th>
        <th>凭证</th>
        <th>模型</th>
        <th>当前使用</th>
      </tr>
    </thead>
    <tbody>
      {#each planRows as row (row.plan.id)}
         <tr data-plan={row.plan.id} onclick={() => (editingPlan = row.plan)}>
           <td>
             <b>{row.plan.name}</b>{#if row.plan.note}<div class="small dim">{row.plan.note}</div>{/if}
             {#if row.plan.baseUrl && row.plan.key && row.plan.models.length}
               <button class="key-toggle plan-test-button" onclick={(event) => { event.stopPropagation(); testingPlan = row.plan; }}>测试可用性</button>
             {/if}
           </td>
          <td><span class="badge b-dim">{row.plan.source}</span><div class="small dim source-detail">{row.plan.sourceDetail ?? "—"}</div></td>
          <td class="mono">
            {#if row.plan.key}
              {revealedPlanId === row.plan.id ? row.plan.key : maskKey(row.plan.key)}
              <button class="key-toggle" onclick={(event) => { event.stopPropagation(); revealedPlanId = revealedPlanId === row.plan.id ? null : row.plan.id; }}>
                {revealedPlanId === row.plan.id ? "隐藏" : "显示"}
              </button>
            {:else}
              —
            {/if}
          </td>
          <td>{row.plan.models.length ? row.plan.models.join(", ") : "—"}</td>
          <td>{row.usedBy.length ? row.usedBy.map(toolName).join(", ") : "—"}</td>
        </tr>
      {:else}
        <tr><td colspan="5" class="dim">Catalog 为空，可扫描当前配置或导入 ccSwitch。</td></tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if appState.ready && appState.firstRunGuide}
  <div class="first-run-backdrop">
    <section class="first-run" aria-label="首次启动">
      <div class="eyebrow">FIRST RUN</div>
      <h2>已完成首次扫描</h2>
      <p class="dim">已自动扫描 {appState.firstRunPlanCount} 个 Plan。可继续导入 ccSwitch 的历史供应商配置。</p>
      <div class="first-run-actions">
        <button class="first-run-action" disabled={scanning} onclick={scan}>
          <b>{scanning ? "扫描中…" : "重新扫描当前配置"}</b>
          <span>可随时重新识别 Hermes、opencode、OpenClaw、Codex、Claude Code</span>
        </button>
        <button class="first-run-action" disabled={importing} onclick={importHistory}>
          <b>{importing ? "导入中…" : "导入 ccSwitch"}</b>
          <span>合并 ~/.cc-switch/cc-switch.db 中的历史 Plan</span>
        </button>
      </div>
      <div class="modal-foot">
        <span class="dim">当前已发现 {appState.catalog.plans.length} 个 Plan</span>
        <button class="btn" disabled={appState.catalog.plans.length === 0} onclick={closeFirstRunGuide}>开始使用</button>
      </div>
    </section>
  </div>
{/if}

{#if drawerToolId !== null || switchToolId !== null}
  <div id="overlay" onclick={closeAll} role="presentation"></div>
{/if}
{#if drawerToolId}
  <ToolDrawer toolId={drawerToolId} onSwitch={() => (switchToolId = drawerToolId)} />
{/if}
{#if switchToolId}
  <SwitchModal toolId={switchToolId} onCancel={() => (switchToolId = null)} onDone={closeAll} />
{/if}
{#if editingPlan !== undefined}
  <PlanEditor plan={editingPlan} onDone={() => (editingPlan = undefined)} />
{/if}
{#if testingPlan}
  <PlanTestModal plan={testingPlan} onDone={() => (testingPlan = null)} />
{/if}
{#if updateDialogOpen}
  <UpdateDialog onDone={() => (updateDialogOpen = false)} />
{/if}

<div id="toast" class={toastState.kind} hidden={!toastState.visible}>{toastState.msg}</div>
