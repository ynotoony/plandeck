// input: node:fs + types.FsPort
// output: nodeFs（含原子写与 chmod）
// position: FsPort 的 Node 实现：测试与脚本环境用
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { FsPort } from "./types.js";

export const nodeFs: FsPort = {
  async exists(path) {
    return existsSync(path);
  },
  async read(path) {
    return readFileSync(path, "utf8");
  },
  async write(path, text, opts) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = path + ".tmp";
    writeFileSync(tmp, text, "utf8");
    const mode = opts?.mode ?? (existsSync(path) ? statSync(path).mode & 0o777 : undefined);
    if (mode != null) chmodSync(tmp, mode);
    renameSync(tmp, path);
  },
  async list(path) {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  },
  async isDirectory(path) {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
  async mtime(path) {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return undefined;
    }
  },
};
