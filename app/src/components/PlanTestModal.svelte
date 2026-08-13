<script lang="ts">
  import type { Plan } from "@plandeck/core";
  import { testPlan, type PlanTestResult } from "../lib/tauri-fs";
  import { toast } from "../lib/toast.svelte";

  let { plan, onDone }: { plan: Plan; onDone: () => void } = $props();
  let model = $state("");
  let busy = $state(false);
  let result = $state<PlanTestResult | null>(null);

  $effect.pre(() => {
    if (!model) model = plan.models[0] ?? "";
  });

  async function runTest(): Promise<void> {
    if (!plan.baseUrl || !plan.key || !model) return;
    busy = true;
    result = null;
    try {
      result = await testPlan(plan.baseUrl, plan.key, model);
    } catch (e) {
      toast(String(e), "err");
    } finally {
      busy = false;
    }
  }
</script>

<div id="modalWrap">
  <dialog id="modal" open aria-label={`测试 Plan ${plan.name}`}>
    <h2>测试 Plan 可用性</h2>
    <dl class="kv">
      <dt>Plan</dt>
      <dd>{plan.name}</dd>
      <dt>地址</dt>
      <dd class="mono dim">{plan.baseUrl ?? "—"}</dd>
    </dl>
    {#if plan.models.length > 0}
      <label class="field">
        测试模型
        <select bind:value={model} disabled={busy}>
          {#each plan.models as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
    {:else}
      <p class="dim hint">此 Plan 没有模型清单，无法发起模型测试。</p>
    {/if}
    {#if !plan.key}
      <p class="dim hint">此 Plan 没有 API key，无法发起测试。</p>
    {/if}
    {#if result}
      <p class="plan-test-result status-{result.status}">{result.message}</p>
    {/if}
    <p class="dim hint">仅支持 OpenAI-compatible 接口。只发送一次最小请求，不修改 Tool 配置，也不保存响应内容。</p>
    <div class="modal-foot">
      <button class="btn ghost" disabled={busy} onclick={onDone}>关闭</button>
      <button class="btn" disabled={busy || !plan.baseUrl || !plan.key || !model} onclick={runTest}>
        {busy ? "测试中…" : "开始测试"}
      </button>
    </div>
  </dialog>
</div>
