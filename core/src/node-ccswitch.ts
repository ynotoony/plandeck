// input: node:sqlite + ccswitch.ts
// output: readCcSwitchRows()/importCcSwitchDatabase()/firstRunSetupFromDb()
// position: ccSwitch 数据库的 IO 绑定层
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  firstRunSetup,
  importCcSwitchCatalog,
  type CcSwitchRow,
  type FirstRunSetupResult,
  type ImportCcSwitchResult,
} from "./ccswitch.js";
import type { Adapter, Catalog } from "./types.js";

export function ccSwitchDbPath(homeDir: string): string {
  return `${homeDir}/.cc-switch/cc-switch.db`;
}

export function readCcSwitchRows(dbPath: string): CcSwitchRow[] {
  if (!existsSync(dbPath)) return [];
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        "SELECT id, app_type AS appType, name, settings_config AS settingsConfig, notes FROM providers",
      )
      .all() as Array<{
      id: string;
      appType: string;
      name: string;
      settingsConfig: string;
      notes: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      appType: row.appType,
      name: row.name,
      settingsConfig: row.settingsConfig,
      notes: row.notes ?? undefined,
    }));
  } finally {
    db.close();
  }
}

export async function importCcSwitchDatabase(opts: {
  dbPath: string;
  catalog: Catalog;
}): Promise<ImportCcSwitchResult> {
  const rows = readCcSwitchRows(opts.dbPath);
  return importCcSwitchCatalog(rows, opts.dbPath, opts.catalog);
}

export async function firstRunSetupFromDb(opts: {
  adapters: Adapter[];
  homeDir: string;
}): Promise<FirstRunSetupResult> {
  const dbPath = ccSwitchDbPath(opts.homeDir);
  return firstRunSetup(opts.adapters, readCcSwitchRows(dbPath), dbPath);
}
