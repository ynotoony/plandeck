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
  projectsByCwd,
  readOrEmpty,
  recognizeSession,
  requireBaseUrl,
  slug,
  sortProjects,
  splitProviderModel,
  stateFromFragment,
  str,
} from "./shared.js";

export const OPENCLAW_TOOL_ID = "openclaw";

interface OpenclawConfig {
  agents?: { defaults?: { model?: { primary?: unknown } } };
  models?: { providers?: Record<string, { baseUrl?: unknown }> };
  auth?: { profiles?: Record<string, unknown> };
}

export function createOpenclawAdapter(ctx: AdapterContext): Adapter {
  const configPath = `${ctx.homeDir}/.openclaw/openclaw.json`;
  const sessionsDir = `${ctx.homeDir}/.openclaw/agents/main/sessions`;

  async function readConfig(): Promise<OpenclawConfig | null> {
    if (!(await ctx.fs.exists(configPath))) return null;
    return (parse(await ctx.fs.read(configPath)) ?? {}) as OpenclawConfig;
  }

  async function readFragment(): Promise<ConfigFragment | null> {
    const config = await readConfig();
    const primary = config?.agents?.defaults?.model?.primary;
    if (typeof primary !== "string" || !primary) return null;
    const split = splitProviderModel(primary);
    if (!split) return null;
    return {
      model: split.model,
      providerId: split.providerId,
      baseUrl: str(config?.models?.providers?.[split.providerId]?.baseUrl),
    };
  }

  async function readState(): Promise<ToolState> {
    const state = await stateFromFragment(
      OPENCLAW_TOOL_ID,
      await readFragment(),
      await ctx.fs.exists(configPath),
      ctx.catalog,
    );
    return { ...state, projects: await readProjects() };
  }

  async function readProjects(): Promise<ProjectState[]> {
    const config = await readConfig();
    const entries: { cwd?: string; session: SessionState }[] = [];
    for (const name of await ctx.fs.list(sessionsDir)) {
      if (!name.endsWith(".jsonl")) continue;
      let text: string;
      try {
        text = await ctx.fs.read(`${sessionsDir}/${name}`);
      } catch {
        continue;
      }
      let id = name.replace(/\.jsonl$/, "");
      let cwd: string | undefined;
      let providerId: string | undefined;
      let model: string | undefined;
      let when = "";
      for (const line of text.split("\n")) {
        if (!line) continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        const timestamp = str(event.timestamp);
        if (timestamp && timestamp > when) when = timestamp;
        if (event.type === "session") {
          id = str(event.id) ?? id;
          cwd = str(event.cwd) ?? cwd;
        }
        if (event.type === "model_change") {
          providerId = str(event.provider) ?? providerId;
          model = str(event.modelId) ?? model;
        }
        if (event.type === "custom" && event.customType === "model-snapshot") {
          const data = event.data as Record<string, unknown> | undefined;
          providerId = str(data?.provider) ?? providerId;
          model = str(data?.modelId) ?? model;
        }
      }
      const rec = await recognizeSession(
        {
          model,
          baseUrl: providerId ? str(config?.models?.providers?.[providerId]?.baseUrl) : undefined,
        },
        ctx.catalog,
      );
      entries.push({
        cwd,
        session: { id, model: model ?? "", plan: rec.plan, status: rec.status, when },
      });
    }
    return sortProjects(projectsByCwd(entries));
  }

  async function planChange(plan: Plan, model: string): Promise<FileEdit[]> {
    requireBaseUrl(plan, "OpenClaw");
    const providerId = plan.providerId ?? slug(plan.name);
    const oldText = await readOrEmpty(ctx.fs, configPath);
    const config = oldText.trim() === "" ? null : ((parse(oldText) ?? {}) as OpenclawConfig);

    let newText = oldText === "" ? "{}\n" : oldText;
    newText = jsonSet(newText, ["agents", "defaults", "model", "primary"], `${providerId}/${model}`);
    newText = jsonSet(newText, ["models", "providers", providerId, "baseUrl"], plan.baseUrl);
    if (!config?.auth?.profiles?.[`${providerId}:default`]) {
      newText = jsonSet(newText, ["auth", "profiles", `${providerId}:default`], {
        provider: providerId,
        mode: "api_key",
      });
    }
    return [{ path: configPath, oldText, newText }];
  }

  return {
    toolId: OPENCLAW_TOOL_ID,
    toolName: "OpenClaw",
    configPath,
    readState,
    readFragment,
    planChange,
  };
}
