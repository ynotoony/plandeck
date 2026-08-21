// input: Rust updater/release 命令（经 tauri invoke）
// output: updaterState + 检查/安装/历史/启动检查偏好
// position: 应用内更新模块
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { invoke } from "@tauri-apps/api/core";
import { toast } from "./toast.svelte";

const STARTUP_CHECK_KEY = "plandeck.check-updates-on-start";

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

export interface ReleaseHistoryItem {
  version: string;
  name: string;
  body?: string;
  publishedAt?: string;
  prerelease: boolean;
}

interface UpdateCheckResult {
  currentVersion: string;
  update?: UpdateInfo;
}

type UpdateStatus = "idle" | "checking" | "current" | "available" | "installing" | "installed" | "error";

interface UpdaterState {
  currentVersion: string;
  startupCheckEnabled: boolean;
  status: UpdateStatus;
  update: UpdateInfo | null;
  error: string | null;
  historyStatus: "idle" | "loading" | "ready" | "error";
  history: ReleaseHistoryItem[];
  historyError: string | null;
}

function storedStartupPreference(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(STARTUP_CHECK_KEY) !== "false";
}

export const updaterState = $state<UpdaterState>({
  currentVersion: "",
  startupCheckEnabled: storedStartupPreference(),
  status: "idle",
  update: null,
  error: null,
  historyStatus: "idle",
  history: [],
  historyError: null,
});

let activeCheck: Promise<void> | null = null;
let activeHistoryLoad: Promise<void> | null = null;

export function setStartupCheckEnabled(enabled: boolean): void {
  updaterState.startupCheckEnabled = enabled;
  localStorage.setItem(STARTUP_CHECK_KEY, String(enabled));
}

export async function initializeUpdater(): Promise<void> {
  try {
    updaterState.currentVersion = await invoke<string>("app_version");
  } catch (error) {
    updaterState.status = "error";
    updaterState.error = String(error);
    return;
  }
  if (updaterState.startupCheckEnabled) await checkForUpdate(true);
}

export function checkForUpdate(silent = false): Promise<void> {
  if (activeCheck) return activeCheck;
  activeCheck = runUpdateCheck(silent).finally(() => {
    activeCheck = null;
  });
  return activeCheck;
}

async function runUpdateCheck(silent: boolean): Promise<void> {
  updaterState.status = "checking";
  updaterState.update = null;
  updaterState.error = null;
  try {
    const result = await invoke<UpdateCheckResult>("check_for_update");
    updaterState.currentVersion = result.currentVersion;
    updaterState.update = result.update ?? null;
    updaterState.status = result.update ? "available" : "current";
    if (silent && result.update) toast(`PlanDeck ${result.update.version} 已可更新`);
  } catch (error) {
    updaterState.status = "error";
    updaterState.error = String(error);
    if (!silent) toast(updaterState.error, "err");
  }
}

export async function installAvailableUpdate(): Promise<void> {
  if (!updaterState.update || updaterState.status === "installing") return;
  updaterState.status = "installing";
  updaterState.error = null;
  try {
    await invoke("install_update", { version: updaterState.update.version });
    updaterState.status = "installed";
  } catch (error) {
    updaterState.status = "error";
    updaterState.error = String(error);
    toast(updaterState.error, "err");
  }
}

export function loadReleaseHistory(force = false): Promise<void> {
  if (!force && updaterState.historyStatus === "ready") return Promise.resolve();
  if (activeHistoryLoad) return activeHistoryLoad;
  activeHistoryLoad = runReleaseHistoryLoad().finally(() => {
    activeHistoryLoad = null;
  });
  return activeHistoryLoad;
}

async function runReleaseHistoryLoad(): Promise<void> {
  updaterState.historyStatus = "loading";
  updaterState.historyError = null;
  try {
    updaterState.history = await invoke<ReleaseHistoryItem[]>("release_history");
    updaterState.historyStatus = "ready";
  } catch (error) {
    updaterState.historyStatus = "error";
    updaterState.historyError = String(error);
  }
}
