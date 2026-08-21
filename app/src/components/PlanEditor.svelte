<script lang="ts">
  import { onMount } from "svelte";
  import type { Plan, PlanSource } from "@plandeck/core";
  import { appState, deleteEnvironmentPlan, deletePlan, isRuntimeEnvPlan, saveEnvironmentPlan, savePlan, toolName } from "../lib/state.svelte";
  import { toast } from "../lib/toast.svelte";

  let { plan, onDone, onDirtyChange }: { plan: Plan | null; onDone: () => void; onDirtyChange?: (dirty: boolean) => void } = $props();
  let id = $state("");
  let name = $state("");
  let source = $state<PlanSource>("config");
  let provider = $state("");
  let baseUrl = $state("");
  let credential = $state("");
  let showCredential = $state(false);
  let clearCredential = $state(false);
  let models = $state("");
  let note = $state("");
  let busy = $state(false);
  let initialized = false;
  const readOnly = $derived(plan != null && (plan.source === "env" || plan.source === "oauth"));
  const usedBy = $derived(plan ? appState.tools.filter((tool) => tool.plan === plan.id) : []);
  const deleteBlocked = $derived(plan == null || readOnly || usedBy.length > 0);
  const initial = $state({ id: "", name: "", source: "config" as PlanSource, provider: "", baseUrl: "", credential: "", clearCredential: false, models: "", note: "" });
  const dirty = $derived(initialized && (id !== initial.id || name !== initial.name || source !== initial.source || provider !== initial.provider || baseUrl !== initial.baseUrl || credential !== initial.credential || clearCredential !== initial.clearCredential || models !== initial.models || note !== initial.note));

  $effect.pre(() => {
    if (initialized) return;
    id = plan?.id ?? "";
    name = plan?.name ?? "";
    source = plan?.source ?? "config";
    provider = plan?.providerId ?? "";
    baseUrl = plan?.baseUrl ?? "";
    models = plan?.models.join(", ") ?? "";
    note = plan?.note ?? "";
    Object.assign(initial, { id, name, source, provider, baseUrl, credential, clearCredential, models, note });
    initialized = true;
  });
  $effect(() => onDirtyChange?.(dirty));

  function close(): void {
    if (dirty && !confirm("存在未保存修改，确定放弃吗？")) return;
    onDirtyChange?.(false);
    onDone();
  }
  onMount(() => {
    const handler = (event: KeyboardEvent): void => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  function optional(value: string): string | undefined { const trimmed = value.trim(); return trimmed || undefined; }
  function commit(): void { Object.assign(initial, { id, name, source, provider, baseUrl, credential, clearCredential, models, note }); }

  async function save(): Promise<void> {
    if (readOnly) return;
    const trimmedName = name.trim();
    if (!trimmedName) return toast("请输入 Plan 名称", "err");
    busy = true;
    try {
      const parsedModels = models.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
      if (source === "env") {
        const nextId = (id || trimmedName).trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
        if (!/^[A-Z][A-Z0-9_]*$/.test(nextId)) throw new Error("Plan ID 必须以大写字母开头，只能包含大写字母、数字和下划线");
        await saveEnvironmentPlan({ id: nextId, name: trimmedName, provider: provider.trim(), baseUrl: baseUrl.trim(), models: parsedModels, credential: optional(credential), clearCredential }, plan?.source === "env" ? plan.id : undefined);
      } else {
        await savePlan({ name: trimmedName, source, sourceDetail: plan?.sourceDetail, providerId: optional(provider), baseUrl: optional(baseUrl), hasCredential: plan?.hasCredential, credentialFingerprint: plan?.credentialFingerprint, models: parsedModels, note: optional(note) }, plan?.id);
      }
      commit();
      toast(plan ? "Plan 已保存" : "Plan 已创建");
      onDirtyChange?.(false);
      onDone();
    } catch (error) { toast(String(error), "err"); }
    finally { busy = false; }
  }
  async function remove(): Promise<void> {
    if (deleteBlocked || !plan || !confirm(`删除 Plan「${plan.name}」？`)) return;
    busy = true;
    try {
      if (isRuntimeEnvPlan(plan.id)) await deleteEnvironmentPlan(plan.id); else await deletePlan(plan.id);
      toast("Plan 已删除"); onDirtyChange?.(false); onDone();
    } catch (error) { toast(String(error), "err"); }
    finally { busy = false; }
  }
</script>

<div id="plan-overlay" role="presentation" onclick={close}></div>
<aside id="plan-drawer" role="region" aria-label={plan ? "编辑 Plan" : "新建 Plan"}>
  <div class="drawer-head"><div><div class="eyebrow">PLAN DETAIL</div><h2>{plan ? "Plan 详情" : "新建 Plan"}</h2></div><button class="icon-btn" title="关闭" aria-label="关闭" onclick={close}>×</button></div>
  {#if readOnly}<p class="notice">{plan?.source === "oauth" ? "OAuth Plan 使用登录会话，只读。" : "环境变量 Plan 由运行时环境提供，只读。"}</p>{/if}
  {#if usedBy.length}<p class="notice warning">正在使用：{usedBy.map((tool) => toolName(tool.toolId)).join("、")}。切换这些工具后才能删除。</p>{/if}
  <label class="field">名称 <input bind:value={name} disabled={readOnly} /></label>
  <div class="detail-row"><span>来源</span><b>{source}</b></div>
  {#if plan?.sourceDetail}<div class="detail-row"><span>来源详情</span><code>{plan.sourceDetail}</code></div>{/if}
  <label class="field">provider <input bind:value={provider} disabled={readOnly} /></label>
  {#if source === "env"}<label class="field">ID <input bind:value={id} disabled={!!plan || readOnly} placeholder="MINIMAX_PRIMARY" /></label>{/if}
  <label class="field">base_url <input bind:value={baseUrl} disabled={readOnly} /></label>
  <div class="detail-row"><span>凭证状态</span><b>{source === "oauth" ? "登录会话" : plan?.hasCredential || credential ? "已配置" : "未设置"}</b></div>
  {#if source === "env" && !readOnly}<label class="field">新凭证 <div class="credential-editor"><input bind:value={credential} type={showCredential ? "text" : "password"} placeholder={plan?.hasCredential ? "留空保留现有凭据" : "输入凭证"} /><button class="key-toggle" type="button" onclick={() => (showCredential = !showCredential)}>{showCredential ? "隐藏" : "显示"}</button></div></label>{/if}
  {#if plan?.hasCredential}<p class="dim small">已有凭证已安全存储，不在界面回显{plan.credentialFingerprint ? ` · 指纹 ${plan.credentialFingerprint}` : ""}。</p>{/if}
  {#if source === "env" && plan}<label class="update-setting"><input type="checkbox" bind:checked={clearCredential} /><span>清除现有凭据</span></label>{/if}
  <div class="detail-row"><span>模型数量</span><b>{models.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).length} 个</b></div>
  <label class="field">模型清单 <textarea bind:value={models} disabled={readOnly} placeholder="每行或逗号分隔"></textarea></label>
  <div class="detail-row"><span>当前使用</span><b>{usedBy.length ? usedBy.map((tool) => toolName(tool.toolId)).join("、") : "未使用"}</b></div>
  <label class="field">备注 <textarea bind:value={note} disabled={readOnly}></textarea></label>
  <div class="drawer-actions">{#if plan && !readOnly}<button class="btn danger" disabled={busy || deleteBlocked} title={deleteBlocked ? "正在使用的 Plan 不能删除" : "删除 Plan"} onclick={remove}>删除</button>{/if}<button class="btn ghost" disabled={busy} onclick={close}>取消</button>{#if !readOnly}<button class="btn" disabled={busy || !dirty} onclick={save}>{busy ? "保存中…" : "保存"}</button>{/if}</div>
</aside>
