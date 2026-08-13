import { commitSwitch, deriveTrayMenu, parseTrayAction } from "@plandeck/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { adapterFor, appState, refresh, toolName, updateTool } from "./state.svelte";
import { backupFiles, tauriFs } from "./tauri-fs";
import { toast } from "./toast.svelte";

let refreshChain = Promise.resolve();
let initialized = false;

export async function refreshTray(): Promise<void> {
  refreshChain = refreshChain.catch(() => undefined).then(async () => {
    const names = Object.fromEntries(appState.tools.map((tool) => [tool.toolId, toolName(tool.toolId)]));
    const tools = deriveTrayMenu(appState.tools, appState.catalog, names);
    await invoke("tray_set_menu", { tools });
  });
  await refreshChain;
}

export async function initTray(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await listen<string>("tray-action", async ({ payload }) => {
    const action = parseTrayAction(payload);
    if (!action) return;
    const adapter = adapterFor(action.toolId);
    const plan = appState.catalog.plans.find((candidate) => candidate.id === action.planId);
    if (!adapter || !plan) return;

    try {
      const edits = await adapter.planChange(plan, action.model);
      const { state } = await commitSwitch(
        adapter,
        edits,
        tauriFs,
        (paths) => backupFiles(adapter.toolId, paths),
      );
      updateTool(state);
      await refreshTray();
    } catch (error) {
      toast(String(error), "err");
      await refresh().catch(() => {});
      await refreshTray().catch(() => {});
    }
  });
  await listen("tray-open-requested", async () => {
    await refresh();
    await refreshTray();
  });
  await refreshTray();
}
