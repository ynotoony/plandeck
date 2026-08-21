// input: @tauri-apps/api invoke → Rust 命令（lib.rs 契约）
// output: tauriFs/tauriSqlite 端口 + 备份/环境/updater/编辑器命令封装
// position: 唯一 IPC 客户端
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { invoke } from "@tauri-apps/api/core";
import type {
  EnvironmentCatalog,
  EnvironmentCatalogWrite,
  FsPort,
  Plan,
  SqlitePort,
} from "@plandeck/core";
import type { CcSwitchRow } from "@plandeck/core";

export const tauriFs: FsPort = {
  exists(path) {
    return invoke<boolean>("fs_exists", { path });
  },
  read(path) {
    return invoke<string>("fs_read", { path });
  },
  write(path, text, opts) {
    return invoke<void>("fs_write", { path, text, mode: opts?.mode ?? null });
  },
  list(path) {
    return invoke<string[]>("fs_list", { path });
  },
  isDirectory(path) {
    return invoke<boolean>("fs_is_directory", { path });
  },
  async mtime(path) {
    return (await invoke<number | null>("fs_mtime", { path })) ?? undefined;
  },
};

export const tauriSqlite: SqlitePort = {
  query(path, sql, params = []) {
    return invoke<Record<string, unknown>[]>("sqlite_query", { path, sql, params });
  },
};

export interface BackupRecord {
  id: string;
  toolId: string;
  createdAt: string;
  originalPath: string;
  backupPath: string;
}

export interface BackupTarget {
  toolId: string;
  path: string;
}

export function backupFiles(toolId: string, paths: string[]): Promise<string[]> {
  return invoke<string[]>("backup_files", { toolId, paths });
}

export function listBackups(targets: BackupTarget[]): Promise<BackupRecord[]> {
  return invoke<BackupRecord[]>("list_backups", { targets });
}

export function restoreBackup(id: string, targets: BackupTarget[]): Promise<string[]> {
  return invoke<string[]>("restore_backup", { id, targets });
}

export function openInEditor(path: string): Promise<void> {
  return invoke<void>("open_in_editor", { path });
}

export function fetchHomeDir(): Promise<string> {
  return invoke<string>("home_dir");
}

export function fetchDataDir(): Promise<string> {
  return invoke<string>("data_dir");
}

export function fetchCcSwitchRows(): Promise<CcSwitchRow[]> {
  return invoke<CcSwitchRow[]>("cc_switch_rows");
}

export function fetchEnvPlans(): Promise<Plan[]> {
  return invoke<Plan[]>("env_plans");
}

export function fetchEnvironmentCatalog(): Promise<EnvironmentCatalog> {
  return invoke<EnvironmentCatalog>("environment_catalog");
}

export interface PlanTestResult {
  status: "available" | "auth_failed" | "model_not_found" | "busy" | "service_error" | "timeout" | "error";
  message: string;
}

export function testEnvironmentPlan(planId: string, model: string): Promise<PlanTestResult> {
  return invoke<PlanTestResult>("environment_test_plan", { planId, model });
}

export function saveEnvironmentCatalog(
  document: EnvironmentCatalogWrite,
): Promise<EnvironmentCatalog> {
  return invoke<EnvironmentCatalog>("environment_save", { document });
}

export function selectEnvironmentPlan(groupId: string, planId: string): Promise<EnvironmentCatalog> {
  return invoke<EnvironmentCatalog>("environment_select", { groupId, planId });
}

export interface LoaderInstallResult {
  installed: string[];
  backups: string[];
}

export function installEnvironmentLoader(): Promise<LoaderInstallResult> {
  return invoke<LoaderInstallResult>("environment_install_loader");
}

export interface MigrationPreview {
  candidatePlans: number;
  candidateSources: string[];
  warnings: string[];
}

export interface MigrationResult {
  importedPlans: number;
  removedCatalogKeys: number;
  removedShellAssignments: number;
  backups: string[];
  affectedPaths: string[];
}

export function previewEnvironmentMigration(): Promise<MigrationPreview> {
  return invoke<MigrationPreview>("environment_migration_preview");
}

export function migrateLegacyEnvironment(): Promise<MigrationResult> {
  return invoke<MigrationResult>("environment_migrate_legacy");
}
