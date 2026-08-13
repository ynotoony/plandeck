import { createClaudeAdapter } from "./adapters/claude.js";
import { createCodexAdapter } from "./adapters/codex.js";
import { createHermesAdapter } from "./adapters/hermes.js";
import { createOpenclawAdapter } from "./adapters/openclaw.js";
import { createOpencodeAdapter } from "./adapters/opencode.js";
import type { Adapter, AdapterContext } from "./types.js";

export function createAdapters(ctx: AdapterContext): Adapter[] {
  return [
    createHermesAdapter(ctx),
    createOpencodeAdapter(ctx),
    createOpenclawAdapter(ctx),
    createCodexAdapter(ctx),
    createClaudeAdapter(ctx),
  ];
}
