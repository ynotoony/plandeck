import { createServer } from "node:http";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

// 与 src-tauri/src/lib.rs + fsx.rs 的命令契约一一对应（cmd 名、参数名、错误语义）。
// 供 e2e 在浏览器里驱动前端时充当 Tauri 后端。
export function createMockBackend({
  homeDir,
  dataDir,
  envVars: initialEnvVars = {},
  update = null,
  releaseHistory = [],
}) {
  const openedInEditor = [];
  let trayTools = [];
  const eventHandlers = new Map();
  let envVars = initialEnvVars;
  const planTestCalls = [];
  const updateInstallCalls = [];
  let availableUpdate = update;
  let updateCheckCount = 0;
  let releaseHistoryCount = 0;

  function localTimestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(
      d.getMinutes(),
    )}-${p(d.getSeconds())}`;
  }

  function atomicWrite(path, text, mode) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = path + ".tmp";
    writeFileSync(tmp, text, "utf8");
    const writeMode = mode ?? (existsSync(path) ? statSync(path).mode & 0o777 : undefined);
    if (writeMode != null) chmodSync(tmp, writeMode);
    renameSync(tmp, path);
  }

  function backupFiles(toolId, paths) {
    const dir = join(dataDir, "backups", localTimestamp());
    const saved = [];
    const records = [];
    for (const p of paths) {
      if (!existsSync(p)) continue;
      mkdirSync(dir, { recursive: true });
      const name = p.split("/").pop();
      let dest = join(dir, name);
      if (existsSync(dest)) {
        const dot = name.lastIndexOf(".");
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        for (let i = 1; ; i++) {
          dest = join(dir, `${stem}-${i}${ext}`);
          if (!existsSync(dest)) break;
        }
      }
      copyFileSync(p, dest);
      saved.push(dest);
      records.push({
        id: `${dir.split("/").pop()}/${dest.split("/").pop()}`,
        toolId,
        createdAt: new Date().toISOString(),
        originalPath: p,
        backupPath: dest,
      });
    }
    if (records.length > 0) {
      const manifestPath = join(dir, ".manifest.json");
      const manifest = existsSync(manifestPath)
        ? JSON.parse(readFileSync(manifestPath, "utf8"))
        : { entries: [] };
      manifest.entries.push(...records);
      atomicWrite(manifestPath, JSON.stringify(manifest, null, 2), 0o600);
    }
    return saved;
  }

  function listBackupRecords(targets = []) {
    const root = join(dataDir, "backups");
    if (!existsSync(root)) return [];
    return readdirSync(root)
      .flatMap((ts) => {
        const manifest = join(root, ts, ".manifest.json");
        if (existsSync(manifest)) {
          try {
            return JSON.parse(readFileSync(manifest, "utf8")).entries;
          } catch {}
        }
        return readdirSync(join(root, ts)).flatMap((name) => {
          const matches = targets.filter((target) => target.path.split("/").pop() === name);
          if (matches.length !== 1) return [];
          return [{
            id: `${ts}/${name}`,
            toolId: matches[0].toolId,
            createdAt: ts,
            originalPath: matches[0].path,
            backupPath: join(root, ts, name),
          }];
        });
      })
      .filter((record) => existsSync(record.backupPath))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  function restoreBackup(id, targets) {
    const record = listBackupRecords(targets).find((candidate) => candidate.id === id);
    if (!record) throw new Error(`备份不存在: ${id}`);
    const current = backupFiles(record.toolId, [record.originalPath]);
    atomicWrite(record.originalPath, readFileSync(record.backupPath, "utf8"));
    return current;
  }

  function handle(cmd, args) {
    switch (cmd) {
      case "fs_exists":
        return existsSync(args.path);
      case "fs_read":
        if (!existsSync(args.path)) throw new Error(`读取失败 ${args.path}: No such file`);
        return readFileSync(args.path, "utf8");
      case "fs_write":
        atomicWrite(args.path, args.text, args.mode);
        return null;
      case "fs_list":
        return existsSync(args.path) ? readdirSync(args.path) : [];
      case "fs_is_directory":
        return existsSync(args.path) && statSync(args.path).isDirectory();
      case "fs_mtime":
        return existsSync(args.path) ? statSync(args.path).mtimeMs : null;
      case "sqlite_query": {
        if (!existsSync(args.path)) return [];
        const db = new DatabaseSync(args.path, { readOnly: true });
        try {
          return db.prepare(args.sql).all(...args.params);
        } finally {
          db.close();
        }
      }
      case "backup_files":
        return backupFiles(args.toolId, args.paths);
      case "list_backups":
        return listBackupRecords(args.targets);
      case "restore_backup":
        return restoreBackup(args.id, args.targets);
      case "open_in_editor":
        if (!existsSync(args.path)) throw new Error(`文件不存在: ${args.path}`);
        openedInEditor.push(args.path);
        return null;
      case "home_dir":
        return homeDir;
      case "data_dir":
        return dataDir;
      case "app_version":
        return "0.1.0";
      case "check_for_update":
        updateCheckCount += 1;
        return { currentVersion: "0.1.0", update: availableUpdate };
      case "release_history":
        releaseHistoryCount += 1;
        return releaseHistory;
      case "install_update":
        updateInstallCalls.push(args.version);
        return null;
      case "tray_set_menu":
        trayTools = args.tools;
        return null;
      case "plugin:event|listen":
        eventHandlers.set(args.event, args.handler);
        return 1;
      case "plugin:event|unlisten":
        return null;
      case "cc_switch_rows":
        return [];
      case "env_plans":
        return Object.entries(envVars)
          .filter(([name, value]) => /_(API_?KEY|AUTH_?TOKEN|ACCESS_?TOKEN)$/i.test(name) && value.trim())
          .map(([name, value]) => {
            const base = name.replace(/_(API_?KEY|AUTH_?TOKEN|ACCESS_?TOKEN)$/i, "");
            return {
              id: `env-${base.toLowerCase().replaceAll("_", "-")}`,
              name: base.toUpperCase(),
              source: "env",
              sourceDetail: name,
              credentialFingerprint: createHash("sha256").update(value).digest("hex").slice(0, 12),
              models: [],
            };
          });
      case "test_plan":
        planTestCalls.push({ baseUrl: args.baseUrl, key: args.key, model: args.model });
        return { status: "available", message: "连接成功，模型可用（HTTP 200）" };
      default:
        throw new Error(`unknown command: ${cmd}`);
    }
  }

  function start(port) {
    const server = createServer((req, res) => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST",
          "access-control-allow-headers": "content-type",
        });
        res.end();
        return;
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("access-control-allow-origin", "*");
        res.setHeader("content-type", "application/json");
        try {
          const { cmd, args } = JSON.parse(body);
          res.end(JSON.stringify({ value: handle(cmd, args ?? {}) }));
        } catch (e) {
          res.end(JSON.stringify({ error: String(e.message ?? e) }));
        }
      });
    });
    return new Promise((resolve, reject) => {
      server.on("error", reject);
      server.listen(port, "127.0.0.1", () => resolve(server));
    });
  }

  function listBackups() {
    const root = join(dataDir, "backups");
    if (!existsSync(root)) return [];
    return readdirSync(root).map((ts) => ({
      ts,
      files: readdirSync(join(root, ts)).filter((name) => name !== ".manifest.json"),
    }));
  }

  return {
    start,
    listBackups,
    listBackupRecords,
    openedInEditor,
    trayTools: () => trayTools,
    eventHandler: (event) => eventHandlers.get(event),
    setEnvVars: (next) => (envVars = next),
    planTestCalls: () => planTestCalls,
    updateCheckCount: () => updateCheckCount,
    updateInstallCalls: () => updateInstallCalls,
    releaseHistoryCount: () => releaseHistoryCount,
    setAvailableUpdate: (next) => (availableUpdate = next),
  };
}
