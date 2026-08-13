import { parse } from "jsonc-parser";
import type {
  Adapter,
  AdapterContext,
  ConfigFragment,
  FileEdit,
  Plan,
  ProjectState,
  SessionState,
  ToolState,
} from "../types.js";
import {
  jsonSet,
  readOrEmpty,
  requireBaseUrl,
  sortSessionsDesc,
  stateFromFragment,
  str,
} from "./shared.js";

export const CLAUDE_TOOL_ID = "claude";

interface ClaudeSettings {
  env?: Record<string, unknown>;
}

export function createClaudeAdapter(ctx: AdapterContext): Adapter {
  const configPath = `${ctx.homeDir}/.claude/settings.json`;
  const transcriptsDir = `${ctx.homeDir}/.claude/transcripts`;

  async function readSettings(): Promise<ClaudeSettings | null> {
    if (!(await ctx.fs.exists(configPath))) return null;
    return (parse(await ctx.fs.read(configPath)) ?? {}) as ClaudeSettings;
  }

  function envFragment(settings: ClaudeSettings): ConfigFragment | null {
    const baseUrl = str(settings.env?.ANTHROPIC_BASE_URL);
    if (!baseUrl) return null;
    return {
      model: str(settings.env?.ANTHROPIC_MODEL),
      baseUrl,
      key: str(settings.env?.ANTHROPIC_AUTH_TOKEN) ?? str(settings.env?.ANTHROPIC_API_KEY),
    };
  }

  async function readFragment(): Promise<ConfigFragment | null> {
    const settings = await readSettings();
    if (!settings) return null;
    return envFragment(settings);
  }

  async function readState(): Promise<ToolState> {
    const settings = await readSettings();
    const projects = await readProjects();
    if (!settings) {
      const state = await stateFromFragment(CLAUDE_TOOL_ID, null, false, ctx.catalog);
      return { ...state, projects };
    }
    const fragment = envFragment(settings);
    if (!fragment) {
      return {
        toolId: CLAUDE_TOOL_ID,
        status: "oauth",
        defaultModel: str(settings.env?.ANTHROPIC_MODEL),
        projects,
      };
    }
    const state = await stateFromFragment(CLAUDE_TOOL_ID, fragment, true, ctx.catalog);
    return { ...state, projects };
  }

  async function readProjects(): Promise<ProjectState[]> {
    const sessions: SessionState[] = [];
    for (const name of await ctx.fs.list(transcriptsDir)) {
      if (!name.endsWith(".jsonl")) continue;
      const path = `${transcriptsDir}/${name}`;
      let when = "";
      try {
        for (const line of (await ctx.fs.read(path)).split("\n")) {
          if (!line) continue;
          try {
            const timestamp = str((JSON.parse(line) as { timestamp?: unknown }).timestamp);
            if (timestamp && timestamp > when) when = timestamp;
          } catch {
            // A malformed line should not hide the rest of the transcript.
          }
        }
      } catch {
        continue;
      }
      if (!when) {
        const mtime = await ctx.fs.mtime(path);
        when = mtime == null ? "" : new Date(mtime).toISOString();
      }
      sessions.push({
        id: name.replace(/\.jsonl$/, ""),
        model: "",
        status: "unset",
        when,
      });
    }
    if (sessions.length === 0) return [];
    return [{ name: "（会话记录）", path: "", sessions: sortSessionsDesc(sessions) }];
  }

  async function planChange(plan: Plan, model: string): Promise<FileEdit[]> {
    requireBaseUrl(plan, "Claude Code");
    const oldText = await readOrEmpty(ctx.fs, configPath);
    let newText = oldText === "" ? "{}\n" : oldText;
    newText = jsonSet(newText, ["env", "ANTHROPIC_BASE_URL"], plan.baseUrl);
    newText = jsonSet(newText, ["env", "ANTHROPIC_AUTH_TOKEN"], plan.key);
    newText = jsonSet(newText, ["env", "ANTHROPIC_API_KEY"], undefined);
    newText = jsonSet(newText, ["env", "ANTHROPIC_MODEL"], model);
    return [{ path: configPath, oldText, newText }];
  }

  return {
    toolId: CLAUDE_TOOL_ID,
    toolName: "Claude Code",
    configPath,
    readState,
    readFragment,
    planChange,
  };
}
