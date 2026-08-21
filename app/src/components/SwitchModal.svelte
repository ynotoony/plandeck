<!-- input: core commitSwitch + state + tauri-fs backupFiles | output: 切换确认流程：diff 预览→备份→提交→刷新 | position: 组件
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

<script lang="ts">
  import { commitSwitch } from "@plandeck/core";
  import type { FileEdit, Plan, SubscriptionGroup } from "@plandeck/core";
  import {
    adapterFor,
    appState,
    contractForGroup,
    groupForTool,
    refresh,
    saveToolBinding,
    selectEnvironmentPlan,
    toolName,
    updateTool,
  } from "../lib/state.svelte";
  import { backupFiles, tauriFs } from "../lib/tauri-fs";
  import { toast } from "../lib/toast.svelte";
  import { refreshTray } from "../lib/tray";
  import DiffView from "./DiffView.svelte";

  let { toolId, onCancel, onDone }: { toolId: string; onCancel: () => void; onDone: () => void } = $props();

  const adapter = $derived(adapterFor(toolId));
  const boundGroup = $derived(groupForTool(toolId));
  const selectingMember = $derived(boundGroup != null);
  let groupId = $state<string | null>(null);
  let planId = $state<string | null>(null);
  let edits = $state<FileEdit[] | null>(null);
  let previewError = $state("");
  let busy = $state(false);
  let previewVersion = 0;

  const selectedGroup = $derived(
    selectingMember ? boundGroup : appState.environment.groups.find((group) => group.id === groupId),
  );
  const memberPlans = $derived(
    selectedGroup
      ? selectedGroup.members
          .map((id) => appState.catalog.plans.find((plan) => plan.id === id))
          .filter((plan): plan is Plan => plan != null)
      : [],
  );

  $effect(() => {
    const group = selectedGroup;
    const version = ++previewVersion;
    edits = null;
    previewError = "";
    if (selectingMember) {
      if (planId) edits = [];
      return;
    }
    if (!adapter || !group || !adapter.groupChange) return;
    adapter
      .groupChange(contractForGroup(group))
      .then((result) => {
        if (version === previewVersion) edits = result;
      })
      .catch((error: unknown) => {
        if (version === previewVersion) previewError = String(error);
      });
  });

  function chooseGroup(group: SubscriptionGroup): void {
    groupId = group.id;
    planId = null;
  }

  async function confirm(): Promise<void> {
    if (!adapter || !selectedGroup || edits == null) return;
    busy = true;
    try {
      if (selectingMember) {
        if (!planId) return;
        await selectEnvironmentPlan(selectedGroup.id, planId);
        const current = appState.tools.find((tool) => tool.toolId === toolId);
        if (current) updateTool({ ...current, plan: planId, bindingStatus: "needs-restart" });
        const plan = appState.catalog.plans.find((item) => item.id === planId);
        toast(`已选择 ${plan?.name ?? planId}；重启 ${toolName(toolId)} 后生效`);
      } else {
        const { state, backups } = await commitSwitch(
          adapter,
          edits,
          tauriFs,
          (paths) => backupFiles(toolId, paths),
        );
        await saveToolBinding(toolId, selectedGroup.id);
        updateTool({ ...state, groupId: selectedGroup.id, bindingStatus: "needs-restart" });
        const first = backups[0];
        const dir = first ? first.slice(0, first.lastIndexOf("/")) : "";
        toast(`已绑定 ${selectedGroup.id}；重启 ${toolName(toolId)} 后生效${dir ? `；备份于 ${dir}` : ""}`);
      }
      await refreshTray();
      onDone();
    } catch (error) {
      toast(String(error), "err");
      await refresh().catch(() => {});
    } finally {
      busy = false;
    }
  }
</script>

<div id="modalWrap">
  <div id="modal">
    <h2>{selectingMember ? `切换 ${toolName(toolId)} 的订阅账号` : `绑定 ${toolName(toolId)} 到 Group`}</h2>

    {#if !adapter?.environmentSupport.supported}
      <p class="dim">{adapter?.environmentSupport.reason ?? "此 Tool 不支持直接环境变量"}</p>
    {:else if selectingMember && selectedGroup}
      <div class="step">Group {selectedGroup.id} · 固定模型 {selectedGroup.model}</div>
      {#each memberPlans as plan (plan.id)}
        <button type="button" class="pick {planId === plan.id ? 'on' : ''}" onclick={() => (planId = plan.id)}>
          <span><b>{plan.name}</b> <span class="dim small">{plan.credentialFingerprint ?? "未设置凭据"}</span></span>
          {#if selectedGroup.selected === plan.id}<span class="badge b-ok">当前</span>{/if}
        </button>
      {:else}
        <p class="dim">该 Group 没有可用成员。</p>
      {/each}
      <div class="step">只更新 subscriptions.env；Tool 配置不会改写</div>
    {:else}
      <div class="step">1 · 选择兼容 Group</div>
      {#each appState.environment.groups as group (group.id)}
        <button type="button" class="pick {groupId === group.id ? 'on' : ''}" onclick={() => chooseGroup(group)}>
          <span><b>{group.id}</b> <span class="dim small">{group.provider} · {group.model}</span></span>
        </button>
      {:else}
        <p class="dim">没有可绑定的 Group。先在 Plan 页面创建 Group。</p>
      {/each}

      {#if selectedGroup}
        <div class="step">2 · Tool 配置投影（写前自动备份）</div>
        {#if previewError}
          <div class="dim">{previewError}</div>
        {:else if edits}
          <DiffView {edits} />
        {:else}
          <div class="dim">生成 diff 中…</div>
        {/if}
      {/if}
    {/if}

    <div class="modal-foot">
      <button class="btn ghost" onclick={onCancel}>取消</button>
      <button class="btn" disabled={edits == null || busy || (selectingMember && !planId)} onclick={confirm}>
        {busy ? "保存中…" : selectingMember ? "确认选择" : "确认绑定"}
      </button>
    </div>
  </div>
</div>
