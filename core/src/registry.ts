// input: adapters/* 各工厂 + AdapterContext
// output: createAdapters() 适配器实例列表
// position: 适配器注册表：新增 Tool 在此登记
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { createClaudeAdapter } from "./adapters/claude.js";
import { createCodexAdapter } from "./adapters/codex.js";
import { createHermesAdapter } from "./adapters/hermes.js";
import { createKimiAdapter } from "./adapters/kimi.js";
import { createOpenclawAdapter } from "./adapters/openclaw.js";
import { createOpencodeAdapter } from "./adapters/opencode.js";
import { createZcodeAdapter } from "./adapters/zcode.js";
import type { Adapter, AdapterContext } from "./types.js";

export function createAdapters(ctx: AdapterContext): Adapter[] {
  return [
    createHermesAdapter(ctx),
    createOpencodeAdapter(ctx),
    createOpenclawAdapter(ctx),
    createCodexAdapter(ctx),
    createClaudeAdapter(ctx),
    createZcodeAdapter(ctx),
    createKimiAdapter(ctx),
  ];
}
