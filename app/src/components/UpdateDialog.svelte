<!-- input: lib/updater.svelte | output: 更新检查对话框 + release 历史 | position: 组件
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

<script lang="ts">
  import {
    checkForUpdate,
    installAvailableUpdate,
    loadReleaseHistory,
    setStartupCheckEnabled,
    updaterState,
  } from "../lib/updater.svelte";

  let { onDone }: { onDone: () => void } = $props();
  let view = $state<"update" | "history">("update");

  function toggleStartupCheck(event: Event): void {
    setStartupCheckEnabled((event.currentTarget as HTMLInputElement).checked);
  }

  function showHistory(): void {
    view = "history";
    loadReleaseHistory();
  }

  function displayDate(value?: string): string {
    if (!value) return "发布时间未知";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }
</script>

<div id="modalWrap" class="update-modal-wrap">
  <dialog id="modal" class="update-modal" open aria-label="应用更新">
    <h2>应用更新</h2>
    <div class="update-tabs" role="tablist" aria-label="更新视图">
      <button type="button" role="tab" aria-selected={view === "update"} class:active={view === "update"} onclick={() => (view = "update")}>更新</button>
      <button type="button" role="tab" aria-selected={view === "history"} class:active={view === "history"} onclick={showHistory}>更新记录</button>
    </div>

    {#if view === "update"}
      <dl class="kv update-kv">
        <dt>当前版本</dt>
        <dd class="mono">{updaterState.currentVersion || "读取中…"}</dd>
        {#if updaterState.update}
          <dt>可用版本</dt>
          <dd class="mono">{updaterState.update.version}</dd>
        {/if}
      </dl>

      <label class="update-setting">
        <input type="checkbox" checked={updaterState.startupCheckEnabled} onchange={toggleStartupCheck} />
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
          {#if updaterState.update.body}<div class="update-notes">{updaterState.update.body}</div>{/if}
        {:else if updaterState.status === "installing"}
          <p class="update-available">正在下载、验签并安装更新…</p>
        {:else if updaterState.status === "installed"}
          <p class="update-ok">更新已安装，应用正在重启。</p>
        {:else if updaterState.status === "error"}
          <p class="update-error">{updaterState.error ?? "检查更新失败"}</p>
        {/if}
      </div>
    {:else}
      <div class="release-history" aria-live="polite">
        {#if updaterState.historyStatus === "loading"}
          <p class="dim">正在获取 GitHub Release 记录…</p>
        {:else if updaterState.historyStatus === "error"}
          <p class="update-error">{updaterState.historyError ?? "获取更新记录失败"}</p>
        {:else if updaterState.historyStatus === "ready" && updaterState.history.length === 0}
          <p class="dim">暂无公开更新记录。</p>
        {:else}
          {#each updaterState.history as release (release.version)}
            <article class="release-entry">
              <div class="release-heading">
                <div><b>{release.name}</b><span class="mono dim">{release.version}</span></div>
                <div class="release-meta">
                  {#if release.prerelease}<span class="badge b-amber">预发布</span>{/if}
                  <span class="small dim">{displayDate(release.publishedAt)}</span>
                </div>
              </div>
              <div class="release-body">{release.body?.trim() || "没有更新说明。"}</div>
            </article>
          {/each}
        {/if}
      </div>
    {/if}

    <div class="modal-foot">
      <button class="btn ghost" disabled={updaterState.status === "installing"} onclick={onDone}>关闭</button>
      {#if view === "history"}
        <button class="btn ghost" disabled={updaterState.historyStatus === "loading"} onclick={() => loadReleaseHistory(true)}>{updaterState.historyStatus === "loading" ? "加载中…" : "刷新记录"}</button>
      {:else}
        <button class="btn ghost" disabled={updaterState.status === "checking" || updaterState.status === "installing"} onclick={() => checkForUpdate(false)}>{updaterState.status === "checking" ? "检查中…" : "检查更新"}</button>
        {#if updaterState.update && updaterState.status !== "installed"}
          <button class="btn" disabled={updaterState.status === "checking" || updaterState.status === "installing"} onclick={installAvailableUpdate}>{updaterState.status === "installing" ? "安装中…" : `安装 ${updaterState.update.version}`}</button>
        {/if}
      {/if}
    </div>
  </dialog>
</div>
