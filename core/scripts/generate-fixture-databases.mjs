// input: node:sqlite
// output: tests/fixtures 下的 hermes projects.db/state.db 与 opencode.db
// position: fixture 数据库重建脚本（npm run fixtures:generate）
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { DatabaseSync } from "node:sqlite";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function createDatabase(path, statements) {
  rmSync(path, { force: true });
  const db = new DatabaseSync(path);
  try {
    for (const statement of statements) db.exec(statement);
  } finally {
    db.close();
  }
}

createDatabase(join(root, "tests/fixtures/hermes/projects.db"), [
  `CREATE TABLE projects (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    description TEXT, icon TEXT, color TEXT, board_slug TEXT,
    primary_path TEXT, created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE project_folders (
    project_id TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL,
    label TEXT, is_primary INTEGER NOT NULL DEFAULT 0, added_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, path)
  )`,
  `INSERT INTO projects VALUES
    ('p_aaa', 'research', '研究', NULL, NULL, NULL, NULL, '/Users/placeholder/SideTrack', 1784769887, 0),
    ('p_bbb', 'company', '公司', NULL, NULL, NULL, NULL, '/Users/placeholder/bicWork', 1786086150, 0),
    ('p_ccc', 'old', '旧项目', NULL, NULL, NULL, NULL, '/Users/placeholder/old', 1700000000, 1)`,
  `INSERT INTO project_folders VALUES
    ('p_aaa', '/Users/placeholder/SideTrack', NULL, 1, 1784769887),
    ('p_aaa', '/Users/placeholder/SideTrack/研究', '研究', 0, 1784769888),
    ('p_bbb', '/Users/placeholder/bicWork', NULL, 1, 1786086150)`,
]);

createDatabase(join(root, "tests/fixtures/hermes/state.db"), [
  "CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT)",
  `INSERT INTO sessions VALUES
    ('20260810_100000_aaa111', '/Users/placeholder/SideTrack/研究'),
    ('20260809_090000_bbb222', '/Users/placeholder/nowhere')`,
]);

createDatabase(join(root, "tests/fixtures/opencode/opencode.db"), [
  "CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT NOT NULL, name TEXT, time_created INTEGER NOT NULL)",
  `CREATE TABLE session (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, model TEXT, time_updated INTEGER NOT NULL
  )`,
  `INSERT INTO project VALUES
    ('prj_demo', '/Users/placeholder/demo', 'Demo', 1785000000000),
    ('global', '/Users/placeholder', 'Global', 1785000060000)`,
  `INSERT INTO session VALUES
    ('ses_alpha', 'prj_demo', '{"id":"qwen3.8-max","providerID":"alibaba","variant":"default"}', 1786000000000),
    ('ses_beta', 'prj_demo', '{"id":"mystery-model-x","providerID":"ghost"}', 1786000060000),
    ('ses_gamma', 'global', NULL, 1786000120000)`,
]);

console.log("Regenerated synthetic SQLite fixtures.");
