<script lang="ts">
  import type { SubscriptionGroup } from "@plandeck/core";
  import { appState, deleteGroup, saveGroup } from "../lib/state.svelte";
  import { toast } from "../lib/toast.svelte";

  let { group, onDone }: { group: SubscriptionGroup | null; onDone: () => void } = $props();

  let id = $state("");
  let provider = $state("");
  let baseUrl = $state("");
  let model = $state("");
  let members = $state<string[]>([]);
  let selected = $state("");
  let busy = $state(false);
  let initialized = false;

  $effect.pre(() => {
    if (initialized) return;
    id = group?.id ?? "";
    provider = group?.provider ?? "";
    baseUrl = group?.baseUrl ?? "";
    model = group?.model ?? "";
    members = group?.members.slice() ?? [];
    selected = group?.selected ?? "";
    initialized = true;
  });

  function normalizedId(value: string): string {
    return value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function toggleMember(planId: string, checked: boolean): void {
    members = checked ? [...members, planId] : members.filter((id) => id !== planId);
    if (!members.includes(selected)) selected = members[0] ?? "";
    const first = appState.environment.plans.find((plan) => plan.id === members[0]);
    if (first && members.length === 1) {
      provider ||= first.provider;
      baseUrl ||= first.baseUrl;
      model ||= first.models[0] ?? "";
    }
  }

  async function save(): Promise<void> {
    const nextId = normalizedId(id);
    if (!nextId) return toast("请输入 Group ID", "err");
    busy = true;
    try {
      await saveGroup(
        {
          id: nextId,
          provider: provider.trim(),
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          members,
          selected,
        },
        group?.id,
      );
      toast(group ? "Group 已保存" : "Group 已创建");
      onDone();
    } catch (error) {
      toast(String(error), "err");
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    if (!group || !confirm(`删除 Group「${group.id}」并解除相关 Tool 绑定？`)) return;
    busy = true;
    try {
      await deleteGroup(group.id);
      toast("Group 已删除");
      onDone();
    } catch (error) {
      toast(String(error), "err");
    } finally {
      busy = false;
    }
  }
</script>

<div id="modalWrap">
  <section id="modal" aria-label={group ? "编辑 Group" : "新建 Group"}>
    <h2>{group ? "编辑 Group" : "新建 Group"}</h2>
    <label class="field">ID <input bind:value={id} disabled={group != null} placeholder="DEFAULT" /></label>
    <label class="field">provider <input bind:value={provider} /></label>
    <label class="field">base_url <input bind:value={baseUrl} /></label>
    <label class="field">固定模型 <input bind:value={model} /></label>
    <fieldset class="group-members">
      <legend>成员</legend>
      {#each appState.environment.plans as plan (plan.id)}
        <label>
          <input type="checkbox" checked={members.includes(plan.id)} onchange={(event) => toggleMember(plan.id, event.currentTarget.checked)} />
          <span>{plan.name}</span><span class="dim small">{plan.provider} · {plan.baseUrl}</span>
        </label>
      {:else}
        <p class="dim">先创建环境 Plan。</p>
      {/each}
    </fieldset>
    <label class="field">
      当前选择
      <select bind:value={selected}>
        <option value="">请选择</option>
        {#each members as member}<option value={member}>{member}</option>{/each}
      </select>
    </label>
    <div class="modal-foot">
      {#if group}<button class="btn danger" disabled={busy} onclick={remove}>删除</button>{/if}
      <button class="btn ghost" disabled={busy} onclick={onDone}>取消</button>
      <button class="btn" disabled={busy} onclick={save}>{busy ? "保存中…" : "保存"}</button>
    </div>
  </section>
</div>
