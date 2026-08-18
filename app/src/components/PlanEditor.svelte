<script lang="ts">
  import type { Plan, PlanSource } from "@plandeck/core";
  import {
    deleteEnvironmentPlan,
    deletePlan,
    saveEnvironmentPlan,
    savePlan,
  } from "../lib/state.svelte";
  import { toast } from "../lib/toast.svelte";

  let { plan, onDone }: { plan: Plan | null; onDone: () => void } = $props();

  let id = $state("");
  let name = $state("");
  let source = $state<PlanSource>("env");
  let provider = $state("openai-compatible");
  let baseUrl = $state("");
  let credential = $state("");
  let clearCredential = $state(false);
  let models = $state("");
  let note = $state("");
  let busy = $state(false);
  let initialized = false;
  const legacyReadOnly = $derived(plan != null && plan.source !== "env" && plan.source !== "oauth");

  $effect.pre(() => {
    if (initialized) return;
    id = plan?.id ?? "";
    name = plan?.name ?? "";
    source = plan?.source ?? "env";
    provider = plan?.providerId ?? "openai-compatible";
    baseUrl = plan?.baseUrl ?? "";
    models = plan?.models.join(", ") ?? "";
    note = plan?.note ?? "";
    initialized = true;
  });

  function envId(value: string): string {
    return value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function optional(value: string): string | undefined {
    return value.trim() || undefined;
  }

  async function save(): Promise<void> {
    if (legacyReadOnly) return;
    const trimmedName = name.trim();
    if (!trimmedName) return toast("请输入 Plan 名称", "err");
    busy = true;
    try {
      const parsedModels = models.split(/[\n,]/).map((model) => model.trim()).filter(Boolean);
      if (source === "env") {
        const nextId = envId(id || trimmedName);
        if (!nextId || !/^[A-Z][A-Z0-9_]*$/.test(nextId)) throw new Error("Plan ID 必须以大写字母开头，只能包含大写字母、数字和下划线");
        await saveEnvironmentPlan(
          {
            id: nextId,
            name: trimmedName,
            provider: provider.trim(),
            baseUrl: baseUrl.trim(),
            models: parsedModels,
            credential: optional(credential),
            clearCredential,
          },
          plan?.source === "env" ? plan.id : undefined,
        );
      } else {
        await savePlan(
          {
            name: trimmedName,
            source: "oauth",
            sourceDetail: plan?.sourceDetail,
            baseUrl: optional(baseUrl),
            models: parsedModels,
            note: optional(note),
          },
          plan?.id,
        );
      }
      toast(plan ? "Plan 已保存" : "Plan 已创建");
      onDone();
    } catch (error) {
      toast(String(error), "err");
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    if (!plan || legacyReadOnly || !confirm(`删除 Plan「${plan.name}」？`)) return;
    busy = true;
    try {
      if (plan.source === "env") await deleteEnvironmentPlan(plan.id);
      else await deletePlan(plan.id);
      toast("Plan 已删除");
      onDone();
    } catch (error) {
      toast(String(error), "err");
    } finally {
      busy = false;
    }
  }
</script>

<div id="modalWrap">
  <section id="modal" aria-label={plan ? "编辑 Plan" : "新建 Plan"}>
    <h2>{plan ? "编辑 Plan" : "新建 Plan"}</h2>
    {#if legacyReadOnly}<p class="dim">这是旧 Catalog 明文 Plan，只读。先迁移到环境订阅文件。</p>{/if}
    <label class="field">名称 <input bind:value={name} disabled={legacyReadOnly} /></label>
    <label class="field">
      来源
      <select bind:value={source} disabled={plan != null || legacyReadOnly}>
        <option value="env">environment</option>
        <option value="oauth">oauth</option>
      </select>
    </label>
    {#if source === "env"}
      <label class="field">ID <input bind:value={id} disabled={plan != null || legacyReadOnly} placeholder="MINIMAX_PRIMARY" /></label>
      <label class="field">provider <input bind:value={provider} disabled={legacyReadOnly} /></label>
      <label class="field">base_url <input bind:value={baseUrl} disabled={legacyReadOnly} placeholder="https://api.example.com/v1" /></label>
      <label class="field">新凭据 <input bind:value={credential} disabled={legacyReadOnly} type="password" placeholder={plan?.hasCredential ? "留空保留现有凭据" : "尚未设置"} /></label>
      {#if plan?.source === "env"}
        <p class="dim small">{plan.hasCredential ? `已设置 · 指纹 ${plan.credentialFingerprint ?? "未知"}` : "未设置凭据"}</p>
        <label class="update-setting"><input type="checkbox" bind:checked={clearCredential} /><span>清除现有凭据</span></label>
      {/if}
    {/if}
    <label class="field">模型清单 <textarea bind:value={models} disabled={legacyReadOnly} placeholder="每行或逗号分隔"></textarea></label>
    {#if source === "oauth"}<label class="field">备注 <textarea bind:value={note}></textarea></label>{/if}
    <div class="modal-foot">
      {#if plan && !legacyReadOnly}<button class="btn danger" disabled={busy} onclick={remove}>删除</button>{/if}
      <button class="btn ghost" disabled={busy} onclick={onDone}>取消</button>
      {#if !legacyReadOnly}<button class="btn" disabled={busy} onclick={save}>{busy ? "保存中…" : "保存"}</button>{/if}
    </div>
  </section>
</div>
