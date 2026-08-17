<script lang="ts">
  import {
    checkForUpdate,
    installAvailableUpdate,
    setStartupCheckEnabled,
    updaterState,
  } from "../lib/updater.svelte";

  let { onDone }: { onDone: () => void } = $props();

  function toggleStartupCheck(event: Event): void {
    setStartupCheckEnabled((event.currentTarget as HTMLInputElement).checked);
  }
</script>

<div id="modalWrap" class="update-modal-wrap">
  <dialog id="modal" class="update-modal" open aria-label="应用更新">
    <h2>应用更新</h2>
    <dl class="kv update-kv">
      <dt>当前版本</dt>
      <dd class="mono">{updaterState.currentVersion || "读取中…"}</dd>
      {#if updaterState.update}
        <dt>可用版本</dt>
        <dd class="mono">{updaterState.update.version}</dd>
      {/if}
    </dl>

    <label class="update-setting">
      <input
        type="checkbox"
        checked={updaterState.startupCheckEnabled}
        onchange={toggleStartupCheck}
      />
      <span>启动时检查更新</span>
    </label>

    <div class="update-status" aria-live="polite">
      {#if updaterState.status === "idle"}
        <p class="dim">尚未检查更新。</p>
      {:else if updaterState.status === "checking"}
        <p class="dim">正在检查 GitHub Release…</p>
      {:else if updaterState.status === "current"}
        <p class="update-ok">当前已是最新版本。</p>
      {:else if updaterState.status === "available" && updaterState.update}
        <p class="update-available">PlanDeck {updaterState.update.version} 已可更新。</p>
        {#if updaterState.update.body}
          <div class="update-notes">{updaterState.update.body}</div>
        {/if}
      {:else if updaterState.status === "installing"}
        <p class="update-available">正在下载、验签并安装更新…</p>
      {:else if updaterState.status === "installed"}
        <p class="update-ok">更新已安装，应用正在重启。</p>
      {:else if updaterState.status === "error"}
        <p class="update-error">{updaterState.error ?? "检查更新失败"}</p>
      {/if}
    </div>

    <div class="modal-foot">
      <button class="btn ghost" disabled={updaterState.status === "installing"} onclick={onDone}>关闭</button>
      <button
        class="btn ghost"
        disabled={updaterState.status === "checking" || updaterState.status === "installing"}
        onclick={() => checkForUpdate(false)}
      >
        {updaterState.status === "checking" ? "检查中…" : "检查更新"}
      </button>
      {#if updaterState.update && updaterState.status !== "installed"}
        <button
          class="btn"
          disabled={updaterState.status === "checking" || updaterState.status === "installing"}
          onclick={installAvailableUpdate}
        >
          {updaterState.status === "installing" ? "安装中…" : `安装 ${updaterState.update.version}`}
        </button>
      {/if}
    </div>
  </dialog>
</div>
