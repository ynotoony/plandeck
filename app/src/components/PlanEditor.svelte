<script lang="ts">
  import type { Plan, PlanSource } from "@plandeck/core";
  import { deletePlan, isRuntimeEnvPlan, savePlan } from "../lib/state.svelte";
  import { toast } from "../lib/toast.svelte";

  let { plan, onDone }: { plan: Plan | null; onDone: () => void } = $props();

  let name = $state("");
  let source = $state<PlanSource>("config");
  let baseUrl = $state("");
  let key = $state("");
  let models = $state("");
  let note = $state("");
  let busy = $state(false);
  let initialized = false;
  const readOnly = $derived(plan != null && isRuntimeEnvPlan(plan.id));

  $effect.pre(() => {
    if (initialized) return;
    name = plan?.name ?? "";
    source = plan?.source ?? "config";
    baseUrl = plan?.baseUrl ?? "";
    key = plan?.key ?? "";
    models = plan?.models.join(", ") ?? "";
    note = plan?.note ?? "";
    initialized = true;
  });

  function optional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  async function save(): Promise<void> {
    if (readOnly) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("请输入 Plan 名称", "err");
      return;
    }
    busy = true;
    try {
      await savePlan(
        {
          name: trimmedName,
          source,
          sourceDetail: plan?.sourceDetail,
          baseUrl: optional(baseUrl),
          key: optional(key),
          models: models.split(/[\n,]/).map((model) => model.trim()).filter(Boolean),
          note: optional(note),
        },
        plan?.id,
      );
      toast(plan ? "Plan 已保存" : "Plan 已创建");
      onDone();
    } catch (e) {
      toast(String(e), "err");
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    if (readOnly) return;
    if (!plan || !confirm(`删除 Plan「${plan.name}」？`)) return;
    busy = true;
    try {
      await deletePlan(plan.id);
      toast("Plan 已删除");
      onDone();
    } catch (e) {
      toast(String(e), "err");
    } finally {
      busy = false;
    }
  }
</script>

<div id="modalWrap">
  <section id="modal" aria-label={plan ? "编辑 Plan" : "新建 Plan"}>
    <h2>{plan ? "编辑 Plan" : "新建 Plan"}</h2>
    {#if readOnly}<p class="dim">此 Plan 从当前进程环境自动发现，只读。</p>{/if}
    <label class="field">名称 <input bind:value={name} disabled={readOnly} /></label>
    <label class="field">
      来源
      <select bind:value={source} disabled={readOnly}>
        <option value="config">config</option>
        <option value="oauth">oauth</option>
      </select>
    </label>
    <label class="field">base_url <input bind:value={baseUrl} disabled={readOnly} placeholder="https://api.example.com" /></label>
    <label class="field">key <input bind:value={key} disabled={readOnly} type="password" placeholder="留空表示未设置" /></label>
    <label class="field">模型清单 <textarea bind:value={models} disabled={readOnly} placeholder="每行或逗号分隔"></textarea></label>
    <label class="field">备注 <textarea bind:value={note} disabled={readOnly}></textarea></label>
    <div class="modal-foot">
      {#if plan && !readOnly}<button class="btn danger" disabled={busy} onclick={remove}>删除</button>{/if}
      <button class="btn ghost" disabled={busy} onclick={onDone}>取消</button>
      {#if !readOnly}<button class="btn" disabled={busy} onclick={save}>{busy ? "保存中…" : "保存"}</button>{/if}
    </div>
  </section>
</div>
