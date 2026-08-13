<script lang="ts">
  import { onMount } from "svelte";
  import { backupTargets, refresh, toolName } from "../lib/state.svelte";
  import { listBackups, restoreBackup } from "../lib/tauri-fs";
  import type { BackupRecord } from "../lib/tauri-fs";
  import { toast } from "../lib/toast.svelte";

  let backups = $state<BackupRecord[]>([]);
  let loading = $state(true);
  let restoring = $state<string | null>(null);
  let { toolId }: { toolId?: string } = $props();

  const visibleBackups = $derived(toolId ? backups.filter((backup) => backup.toolId === toolId) : backups);

  onMount(() => load());

  async function load(): Promise<void> {
    loading = true;
    try {
      backups = await listBackups(backupTargets());
    } catch (e) {
      toast(String(e), "err");
    } finally {
      loading = false;
    }
  }

  async function restore(record: BackupRecord): Promise<void> {
    if (!confirm(`恢复 ${record.originalPath} 到这个历史版本？当前版本会先自动备份。`)) return;
    restoring = record.id;
    try {
      await restoreBackup(record.id, backupTargets());
      await refresh();
      await load();
      toast("已恢复 · 当前版本已自动备份 · 状态已刷新");
    } catch (e) {
      toast(String(e), "err");
      await refresh().catch(() => {});
    } finally {
      restoring = null;
    }
  }

  function displayTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
</script>

{#if loading}
  <div class="placeholder dim">正在读取历史备份…</div>
{:else if visibleBackups.length === 0}
  <div class="placeholder backup-empty">
    <b>还没有历史备份</b>
    <span class="dim">切换 Plan / 模型时会在写入前自动保存原配置。</span>
  </div>
{:else}
  <div class="backup-list">
    {#each visibleBackups as backup (backup.id)}
      <article class="backup-card">
        <div class="backup-main">
          <div><b>{toolName(backup.toolId)}</b> <span class="dim small">{displayTime(backup.createdAt)}</span></div>
          <div class="mono backup-path">{backup.originalPath}</div>
        </div>
        <button
          class="btn ghost mini"
          disabled={restoring !== null}
          onclick={() => restore(backup)}
        >
          {restoring === backup.id ? "恢复中…" : "恢复此版本"}
        </button>
      </article>
    {/each}
  </div>
{/if}
