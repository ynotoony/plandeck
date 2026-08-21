// input: node:sqlite + types.SqlitePort
// output: nodeSqlite（只读查询）
// position: SqlitePort 的 Node 实现
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SqlitePort } from "./types.js";

export const nodeSqlite: SqlitePort = {
  async query(path, sql, params = []) {
    if (!existsSync(path)) return [];
    try {
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        db.exec("PRAGMA busy_timeout = 2000");
        return db.prepare(sql).all(...params) as Record<string, unknown>[];
      } finally {
        db.close();
      }
    } catch {
      return [];
    }
  },
};
