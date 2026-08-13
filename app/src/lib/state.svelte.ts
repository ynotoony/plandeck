import {
  bootstrapCatalog,
  createAdapters,
  emptyCatalog,
  importCcSwitchCatalog,
  isFirstRun,
  loadCatalog,
  mergeCatalogPlans,
  newPlanId,
  removePlan,
  saveCatalog,
  upsertPlan,
  withRuntimeEnvPlans,
} from "@plandeck/core";
import type { Adapter, Catalog, Plan, ToolState } from "@plandeck/core";
import { backupFiles, fetchCcSwitchRows, fetchDataDir, fetchEnvPlans, fetchHomeDir, tauriFs, tauriSqlite } from "./tauri-fs";
import type { BackupTarget } from "./tauri-fs";

export const appState = $state({
  ready: false,
  homeDir: "",
  dataDir: "",
  catalog: emptyCatalog() as Catalog,
  tools: [] as ToolState[],
  firstRunGuide: false,
  firstRunPlanCount: 0,
});

let adapters: Adapter[] = [];
let storedCatalog = emptyCatalog() as Catalog;
let runtimeEnvPlanIds = new Set<string>();

export function adapterFor(toolId: string): Adapter | undefined {
  return adapters.find((a) => a.toolId === toolId);
}

export function toolName(toolId: string): string {
  return adapterFor(toolId)?.toolName ?? toolId;
}

export function backupTargets(): BackupTarget[] {
  return adapters.map((adapter) => ({ toolId: adapter.toolId, path: adapter.configPath }));
}

export async function init(): Promise<void> {
  appState.homeDir = await fetchHomeDir();
  appState.dataDir = await fetchDataDir();

  const catalogPath = `${appState.dataDir}/catalog.json`;
  storedCatalog = await loadCatalog(catalogPath, tauriFs);
  await refreshRuntimeCatalog();
  if (isFirstRun(storedCatalog)) {
    await scanCurrentPlans();
    appState.firstRunGuide = true;
    appState.firstRunPlanCount = appState.catalog.plans.length;
  } else {
    await refresh();
  }
  appState.ready = true;
}

async function useCatalog(catalog: Catalog): Promise<void> {
  const path = `${appState.dataDir}/catalog.json`;
  if (await tauriFs.exists(path)) await backupFiles("catalog", [path]);
  await saveCatalog(path, catalog, tauriFs);
  storedCatalog = catalog;
  await refreshRuntimeCatalog();
  await refresh();
}

async function refreshRuntimeCatalog(): Promise<void> {
  const catalog = await withRuntimeEnvPlans(storedCatalog, await fetchEnvPlans());
  runtimeEnvPlanIds = new Set(catalog.plans.filter((plan) => !storedCatalog.plans.some((stored) => stored.id === plan.id)).map((plan) => plan.id));
  appState.catalog = catalog;
  adapters = createAdapters({ fs: tauriFs, sqlite: tauriSqlite, homeDir: appState.homeDir, catalog });
}

export async function scanCurrentPlans(): Promise<number> {
  const scanned = await bootstrapCatalog(adapters);
  const result = await mergeCatalogPlans(storedCatalog, scanned.plans);
  await useCatalog(result.catalog);
  return scanned.plans.length;
}

export async function importCcSwitch(): Promise<{ added: number; merged: number; skipped: number }> {
  const rows = await fetchCcSwitchRows();
  const source = `${appState.homeDir}/.cc-switch/cc-switch.db`;
  const result = await importCcSwitchCatalog(rows, source, storedCatalog);
  await useCatalog(result.catalog);
  return { added: result.added.length, merged: result.merged.length, skipped: result.skipped };
}

export async function savePlan(plan: Omit<Plan, "id">, id?: string): Promise<void> {
  if (id && runtimeEnvPlanIds.has(id)) throw new Error("环境变量 Plan 为只读");
  const nextPlan: Plan = { ...plan, id: id ?? newPlanId(storedCatalog, plan.name) };
  await useCatalog(upsertPlan(storedCatalog, nextPlan));
}

export async function deletePlan(planId: string): Promise<void> {
  if (runtimeEnvPlanIds.has(planId)) throw new Error("环境变量 Plan 为只读");
  await useCatalog(removePlan(storedCatalog, planId));
}

export function isRuntimeEnvPlan(planId: string): boolean {
  return runtimeEnvPlanIds.has(planId);
}

export function closeFirstRunGuide(): void {
  appState.firstRunGuide = false;
}

export async function refresh(): Promise<void> {
  appState.tools = await Promise.all(adapters.map((a) => a.readState()));
}

export function updateTool(state: ToolState): void {
  const i = appState.tools.findIndex((t) => t.toolId === state.toolId);
  if (i >= 0) appState.tools[i] = state;
  else appState.tools = [...appState.tools, state];
}
