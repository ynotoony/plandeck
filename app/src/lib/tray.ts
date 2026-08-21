import { deriveTrayMenu, parseTrayAction } from "@plandeck/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  adapterFor,
  appState,
  groupForTool,
  refresh,
  selectEnvironmentPlan,
  toolName,
  updateTool,
  visibleTools,
} from "./state.svelte";
import { toast } from "./toast.svelte";

let refreshChain = Promise.resolve();
let initialized = false;

export async function refreshTray(): Promise<void> {
  refreshChain = refreshChain.catch(() => undefined).then(async () => {
    const shownTools = visibleTools();
    const names = Object.fromEntries(shownTools.map((tool) => [tool.toolId, toolName(tool.toolId)]));
    const tools = deriveTrayMenu(shownTools, appState.catalog, names).map((tool) => {
      const adapter = adapterFor(tool.toolId);
      const group = groupForTool(tool.toolId);
      if (!adapter?.environmentSupport.supported || !group) {
        // Keep the catalog hierarchy visible even when this Tool cannot switch
        // through an environment Group yet. Native status-bar menus otherwise
        // render only the top-level Tool item with no discoverable children.
        return {
          ...tool,
          plans: tool.plans.map((plan) => ({
            ...plan,
            items: plan.items.map((item) => ({ ...item, enabled: false })),
          })),
        };
      }
      const members = new Set(group.members);
      return {
        ...tool,
        plans: tool.plans
          .filter((plan) => members.has(plan.id))
          .map((plan) => ({
            ...plan,
            items: plan.items.filter((item) => item.id.endsWith(`:${group.model}`)),
          })),
      };
    });
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
    const plan = appState.catalog.plans.find((candidate) => candidate.id === action.planId);
    if (!plan) return;

    try {
      const group = groupForTool(action.toolId);
      if (group) {
        await selectEnvironmentPlan(group.id, plan.id);
        const current = appState.tools.find((tool) => tool.toolId === action.toolId);
        if (current) updateTool({ ...current, plan: plan.id, bindingStatus: "needs-restart" });
        toast(`已选择 ${plan.name}；重启 ${toolName(action.toolId)} 后生效`);
        await refreshTray();
        return;
      }
      throw new Error("请先绑定 Group，再从托盘切换订阅账号");
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
