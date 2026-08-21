import {
  bootstrapCatalog,
  applyFileEdits,
  createAdapters,
  emptyCatalog,
  importCcSwitchCatalog,
  isFirstRun,
  loadCatalog,
  mergeCatalogPlans,
  newPlanId,
  removePlan,
  saveCatalog,
  stripCatalogCredentials,
  upsertPlan,
  groupContract,
} from "@plandeck/core";
import type {
  Adapter,
  Catalog,
  EnvironmentCatalog,
  EnvironmentCatalogWrite,
  EnvironmentPlanWrite,
  Plan,
  SubscriptionGroup,
  FileEdit,
  ToolState,
} from "@plandeck/core";
import {
  backupFiles,
  fetchCcSwitchRows,
  fetchDataDir,
  fetchEnvironmentCatalog,
  fetchHomeDir,
  previewEnvironmentMigration,
  saveEnvironmentCatalog,
  selectEnvironmentPlan as selectEnvironmentPlanIpc,
  tauriFs,
  tauriSqlite,
} from "./tauri-fs";
import type { BackupTarget } from "./tauri-fs";

const HIDDEN_TOOLS_STORAGE_KEY = "plandeck-hidden-tools";

export const appState = $state({
  ready: false,
  homeDir: "",
  dataDir: "",
  catalog: emptyCatalog() as Catalog,
  environment: { version: "1", plans: [], groups: [], bindings: [], errors: [] } as EnvironmentCatalog,
  tools: [] as ToolState[],
  hiddenToolIds: new Set<string>(),
  firstRunGuide: false,
  firstRunPlanCount: 0,
});

let adapters: Adapter[] = [];
let storedCatalog = emptyCatalog() as Catalog;
let runtimeEnvPlanIds = new Set<string>();
const PENDING_STATUS_KEY = "plandeck.environment.pending-status.v1";
let pendingBindingStatuses = loadPendingBindingStatuses();

function loadPendingBindingStatuses(): Record<string, "needs-reload" | "needs-restart"> {
  if (typeof localStorage === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_STATUS_KEY) ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, "needs-reload" | "needs-restart"] =>
        entry[1] === "needs-reload" || entry[1] === "needs-restart",
      ),
    );
  } catch {
    return {};
  }
}

function persistPendingBindingStatuses(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PENDING_STATUS_KEY, JSON.stringify(pendingBindingStatuses));
}

export function markToolBindingPending(
  toolId: string,
  status: "needs-reload" | "needs-restart",
): void {
  pendingBindingStatuses[toolId] = status;
  persistPendingBindingStatuses();
  const current = appState.tools.find((tool) => tool.toolId === toolId);
  if (current) updateTool({ ...current, bindingStatus: status });
}

export function clearToolBindingPending(toolId: string): void {
  delete pendingBindingStatuses[toolId];
  persistPendingBindingStatuses();
}

export function adapterFor(toolId: string): Adapter | undefined {
  return adapters.find((a) => a.toolId === toolId);
}

function normalizedToolId(toolId: string): string {
  return toolId.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

function adapterForBinding(toolId: string): Adapter | undefined {
  return adapters.find((adapter) => normalizedToolId(adapter.toolId) === toolId);
}

export function toolName(toolId: string): string {
  return adapterFor(toolId)?.toolName ?? toolId;
}

export function visibleTools(tools: ToolState[] = appState.tools): ToolState[] {
  return tools.filter((tool) => !appState.hiddenToolIds.has(tool.toolId));
}

function loadHiddenTools(): void {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_TOOLS_STORAGE_KEY) ?? "[]");
    if (Array.isArray(value) && value.every((id) => typeof id === "string")) {
      appState.hiddenToolIds = new Set(value);
    }
  } catch {
    appState.hiddenToolIds = new Set();
  }
}

export function setToolHidden(toolId: string, hidden: boolean): void {
  const next = new Set(appState.hiddenToolIds);
  if (hidden) next.add(toolId);
  else next.delete(toolId);
  appState.hiddenToolIds = next;
  localStorage.setItem(HIDDEN_TOOLS_STORAGE_KEY, JSON.stringify([...next].sort()));
}

export function backupTargets(): BackupTarget[] {
  return adapters.map((adapter) => ({ toolId: adapter.toolId, path: adapter.configPath }));
}

export async function init(): Promise<void> {
  loadHiddenTools();
  appState.homeDir = await fetchHomeDir();
  appState.dataDir = await fetchDataDir();
  appState.environment = await fetchEnvironmentCatalog();

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
  const migration = await previewEnvironmentMigration();
  const hasLegacyCatalogCredential = migration.candidateSources.some((source) => {
    const candidate = source.split(":")[0] ?? "";
    return candidate === path || candidate === "catalog.json" || candidate.endsWith("/catalog.json");
  });
  if (hasLegacyCatalogCredential) {
    throw new Error("Catalog 仍有旧凭据；请先运行“迁移旧凭据”，再扫描、导入或编辑 Catalog");
  }
  const safeCatalog = stripCatalogCredentials(catalog);
  if (await tauriFs.exists(path)) await backupFiles("catalog", [path]);
  await saveCatalog(path, safeCatalog, tauriFs);
  storedCatalog = safeCatalog;
  await refreshRuntimeCatalog();
  await refresh();
}

async function refreshRuntimeCatalog(): Promise<void> {
  const environmentPlans: Plan[] = appState.environment.plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    source: "env",
    sourceDetail: `subscriptions.env · ${plan.id}`,
    providerId: plan.provider,
    baseUrl: plan.baseUrl,
    models: plan.models,
    hasCredential: plan.hasCredential,
    credentialFingerprint: plan.credentialFingerprint,
  }));
  const environmentIds = new Set(environmentPlans.map((plan) => plan.id));
  const catalog = {
    ...storedCatalog,
    plans: [...storedCatalog.plans.filter((plan) => !environmentIds.has(plan.id)), ...environmentPlans],
  };
  runtimeEnvPlanIds = environmentIds;
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
  assertPlanUnused(planId);
  await useCatalog(removePlan(storedCatalog, planId));
}

function assertPlanUnused(planId: string): void {
  const usedBy = appState.tools.filter((tool) => tool.plan === planId);
  if (usedBy.length > 0) throw new Error(`Plan 正在被 ${usedBy.map((tool) => toolName(tool.toolId)).join("、")} 使用，请先切换工具`);
}

export function isRuntimeEnvPlan(planId: string): boolean {
  return runtimeEnvPlanIds.has(planId);
}

export function closeFirstRunGuide(): void {
  appState.firstRunGuide = false;
}

export async function refresh(): Promise<void> {
  appState.environment = await fetchEnvironmentCatalog();
  await refreshRuntimeCatalog();
  const states = await Promise.all(adapters.map((a) => a.readState()));
  appState.tools = states.map((state) => {
    const adapter = adapterFor(state.toolId);
    const binding = bindingFor(state.toolId);
    if (!adapter?.environmentSupport.supported) {
      return { ...state, bindingStatus: "unsupported-env" as const };
    }
    if (!binding) {
      clearToolBindingPending(state.toolId);
      return state;
    }
    const group = appState.environment.groups.find((item) => item.id === binding.groupId);
    if (!group || appState.environment.errors.length > 0) {
      return { ...state, groupId: binding.groupId, bindingStatus: "invalid-group" as const };
    }
    const drifted = state.defaultModel !== group.model || normalizeUrl(state.baseUrl) !== normalizeUrl(group.baseUrl);
    const pending = pendingBindingStatuses[state.toolId];
    return {
      ...state,
      groupId: group.id,
      bindingStatus: drifted ? "drifted" as const : pending ?? "bound" as const,
    };
  });
}

export function updateTool(state: ToolState): void {
  const i = appState.tools.findIndex((t) => t.toolId === state.toolId);
  if (i >= 0) appState.tools[i] = state;
  else appState.tools = [...appState.tools, state];
}

function normalizeUrl(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

function environmentWrite(): EnvironmentCatalogWrite {
  return {
    version: appState.environment.version,
    plans: appState.environment.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      provider: plan.provider,
      baseUrl: plan.baseUrl,
      models: plan.models,
    })),
    groups: appState.environment.groups,
    bindings: appState.environment.bindings,
  };
}

async function useEnvironment(document: EnvironmentCatalogWrite): Promise<void> {
  appState.environment = await saveEnvironmentCatalog(document);
  await refreshRuntimeCatalog();
}

export function bindingFor(toolId: string) {
  const id = normalizedToolId(toolId);
  return appState.environment.bindings.find((binding) => binding.toolId === id);
}

export function groupForTool(toolId: string): SubscriptionGroup | undefined {
  const binding = bindingFor(toolId);
  return binding
    ? appState.environment.groups.find((group) => group.id === binding.groupId)
    : undefined;
}

export async function saveEnvironmentPlan(plan: EnvironmentPlanWrite, originalId?: string): Promise<void> {
  const document = environmentWrite();
  const index = document.plans.findIndex((item) => item.id === originalId);
  if (index >= 0) document.plans[index] = plan;
  else document.plans.push(plan);
  await useEnvironment(document);
}

export async function deleteEnvironmentPlan(planId: string): Promise<void> {
  assertPlanUnused(planId);
  const document = environmentWrite();
  document.plans = document.plans.filter((plan) => plan.id !== planId);
  await useEnvironment(document);
}

export interface GroupToolEdits {
  toolId: string;
  edits: FileEdit[];
}

export async function previewGroupReconfiguration(
  group: SubscriptionGroup,
  originalId?: string,
): Promise<GroupToolEdits[]> {
  if (!originalId) return [];
  const original = appState.environment.groups.find((item) => item.id === originalId);
  if (!original) return [];
  const contractChanged =
    original.provider !== group.provider ||
    normalizeUrl(original.baseUrl) !== normalizeUrl(group.baseUrl) ||
    original.model !== group.model;
  if (!contractChanged) return [];

  const changes: GroupToolEdits[] = [];
  for (const binding of appState.environment.bindings.filter((item) => item.groupId === originalId)) {
    const adapter = adapterForBinding(binding.toolId);
    if (!adapter?.environmentSupport.supported || !adapter.groupChange) {
      throw new Error(`${binding.toolId} 不支持环境 Group，无法同步重新配置`);
    }
    const edits = (await adapter.groupChange(contractForGroup(group))).filter(
      (edit) => edit.oldText !== edit.newText,
    );
    if (edits.length > 0) changes.push({ toolId: adapter.toolId, edits });
  }
  return changes;
}

export async function saveGroup(
  group: SubscriptionGroup,
  originalId?: string,
): Promise<{ affectedToolIds: string[]; backups: string[] }> {
  const toolChanges = await previewGroupReconfiguration(group, originalId);
  const backups: string[] = [];
  for (const change of toolChanges) {
    const existing: string[] = [];
    for (const edit of change.edits) {
      if (await tauriFs.exists(edit.path)) existing.push(edit.path);
    }
    if (existing.length > 0) backups.push(...await backupFiles(change.toolId, existing));
  }
  const document = environmentWrite();
  const index = document.groups.findIndex((item) => item.id === originalId);
  if (index >= 0) document.groups[index] = group;
  else document.groups.push(group);
  await useEnvironment(document);
  try {
    await applyFileEdits(toolChanges.flatMap((change) => change.edits), tauriFs);
  } catch (error) {
    await refresh().catch(() => {});
    throw new Error(`Group 已保存，但 Tool 配置同步失败；可根据备份恢复后重试：${error}`);
  }
  await refresh();
  const affectedToolIds = toolChanges.map((change) => change.toolId);
  for (const toolId of affectedToolIds) {
    markToolBindingPending(toolId, "needs-restart");
  }
  return { affectedToolIds, backups };
}

export async function deleteGroup(groupId: string): Promise<void> {
  const document = environmentWrite();
  document.groups = document.groups.filter((group) => group.id !== groupId);
  document.bindings = document.bindings.filter((binding) => binding.groupId !== groupId);
  await useEnvironment(document);
}

export async function saveToolBinding(toolId: string, groupId: string | null): Promise<void> {
  const document = environmentWrite();
  const id = normalizedToolId(toolId);
  document.bindings = document.bindings.filter((binding) => binding.toolId !== id);
  if (groupId) document.bindings.push({ toolId: id, groupId });
  await useEnvironment(document);
  if (groupId) markToolBindingPending(toolId, "needs-restart");
  else clearToolBindingPending(toolId);
}

export async function selectEnvironmentPlan(groupId: string, planId: string): Promise<void> {
  appState.environment = await selectEnvironmentPlanIpc(groupId, planId);
  await refreshRuntimeCatalog();
  for (const binding of appState.environment.bindings.filter((item) => item.groupId === groupId)) {
    const adapter = adapterForBinding(binding.toolId);
    if (adapter) markToolBindingPending(adapter.toolId, "needs-restart");
  }
}

export function contractForGroup(group: SubscriptionGroup) {
  return groupContract(group);
}
