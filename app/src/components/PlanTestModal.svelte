<!-- input: tauri-fs testEnvironmentPlan | output: Plan 可用性测试弹窗 | position: 组件
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

<script lang="ts">
  import type { Plan } from "@plandeck/core";
  import { testEnvironmentPlan, type PlanTestResult } from "../lib/tauri-fs";
  import { toast } from "../lib/toast.svelte";

  let { plan, onDone }: { plan: Plan; onDone: () => void } = $props();
  let model = $state("");
  let busy = $state(false);
  let result = $state<PlanTestResult | null>(null);

  $effect.pre(() => {
    if (!model) model = plan.models[0] ?? "";
  });

  async function runTest(): Promise<void> {
    if (!model) return;
    busy = true;
    result = null;
    try {
      result = await testEnvironmentPlan(plan.id, model);
    } catch (error) {
      toast(String(error), "err");
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
    <label class="field">
      测试模型
      <select bind:value={model} disabled={busy}>
        {#each plan.models as option (option)}<option value={option}>{option}</option>{/each}
      </select>
    </label>
    {#if result}<p class="plan-test-result status-{result.status}">{result.message}</p>{/if}
    <p class="dim hint">凭据由本机 Rust 进程读取，不会返回前端。测试只发送一次最小请求。</p>
    <div class="modal-foot">
      <button class="btn ghost" disabled={busy} onclick={onDone}>关闭</button>
      <button class="btn" disabled={busy || !model} onclick={runTest}>{busy ? "测试中…" : "开始测试"}</button>
    </div>
  </dialog>
</div>
