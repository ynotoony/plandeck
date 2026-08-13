import { parse } from "smol-toml";
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
  projectsByCwd,
  readOrEmpty,
  recognizeSession,
  requireBaseUrl,
  slug,
  sortProjects,
  stateFromFragment,
  str,
  walkFiles,
} from "./shared.js";

export const CODEX_TOOL_ID = "codex";

export function createCodexAdapter(ctx: AdapterContext): Adapter {
  const configPath = `${ctx.homeDir}/.codex/config.toml`;
  const sessionsDir = `${ctx.homeDir}/.codex/sessions`;

  async function readDoc(): Promise<Record<string, unknown> | null> {
    if (!(await ctx.fs.exists(configPath))) return null;
    return parse(await ctx.fs.read(configPath)) as Record<string, unknown>;
  }

  async function readFragment(): Promise<ConfigFragment | null> {
    const doc = await readDoc();
    const model = str(doc?.model);
    if (!model) return null;
    const providerId = str(doc?.model_provider) ?? "openai";
    const section = (doc?.model_providers as Record<string, { base_url?: unknown }> | undefined)?.[
      providerId
    ];
    return { model, providerId, baseUrl: str(section?.base_url) };
  }

  async function readState(): Promise<ToolState> {
    const state = await stateFromFragment(
      CODEX_TOOL_ID,
      await readFragment(),
      await ctx.fs.exists(configPath),
      ctx.catalog,
    );
    return { ...state, projects: await readProjects() };
  }

  async function readProjects(): Promise<ProjectState[]> {
    const doc = await readDoc();
    const providers = doc?.model_providers as
      | Record<string, { base_url?: unknown }>
      | undefined;
    const entries: { cwd?: string; session: SessionState }[] = [];
    for (const path of await walkFiles(ctx.fs, sessionsDir)) {
      if (!path.endsWith(".jsonl")) continue;
      let text: string;
      try {
        text = await ctx.fs.read(path);
      } catch {
        continue;
      }
      let id: string | undefined;
      let cwd: string | undefined;
      let providerId: string | undefined;
      let model: string | undefined;
      let when = "";
      for (const line of text.split("\n")) {
        if (!line) continue;
        let event: { timestamp?: unknown; type?: unknown; payload?: Record<string, unknown> };
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        const timestamp = str(event.timestamp);
        if (timestamp && timestamp > when) when = timestamp;
        if (event.type === "session_meta") {
          id = str(event.payload?.session_id) ?? str(event.payload?.id) ?? id;
          cwd = str(event.payload?.cwd) ?? cwd;
          providerId = str(event.payload?.model_provider) ?? providerId;
          model = str(event.payload?.model) ?? model;
        }
        if (event.type === "turn_context") {
          model = str(event.payload?.model) ?? model;
          cwd = str(event.payload?.cwd) ?? cwd;
        }
      }
      id ??= path.split("/").at(-1)?.replace(/\.jsonl$/, "");
      if (!id) continue;
      const rec = await recognizeSession(
        { model, baseUrl: providerId ? str(providers?.[providerId]?.base_url) : undefined },
        ctx.catalog,
      );
      entries.push({
        cwd,
        session: {
          id,
          model: model ?? "",
          plan: rec.plan,
          status: rec.status,
          when,
        },
      });
    }
    return sortProjects(projectsByCwd(entries));
  }

  async function planChange(plan: Plan, model: string): Promise<FileEdit[]> {
    requireBaseUrl(plan, "Codex");
    const providerId = plan.providerId ?? slug(plan.name);
    const oldText = await readOrEmpty(ctx.fs, configPath);
    let newText = tomlSetTop(oldText, "model", model);
    newText = tomlSetTop(newText, "model_provider", providerId);
    newText = tomlEnsureProvider(newText, providerId, plan.name, plan.baseUrl!);
    return [{ path: configPath, oldText, newText }];
  }

  return {
    toolId: CODEX_TOOL_ID,
    toolName: "Codex",
    configPath,
    readState,
    readFragment,
    planChange,
  };
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tomlSetTop(text: string, key: string, value: string): string {
  const lines = text.split("\n");
  const firstSection = lines.findIndex((l) => /^\s*\[/.test(l));
  const topEnd = firstSection === -1 ? lines.length : firstSection;
  const line = `${key} = ${tomlString(value)}`;
  for (let i = 0; i < topEnd; i++) {
    if (new RegExp(`^\\s*${escapeRe(key)}\\s*=`).test(lines[i]!)) {
      lines[i] = line;
      return lines.join("\n");
    }
  }
  let insertAt = topEnd;
  while (insertAt > 0 && lines[insertAt - 1]!.trim() === "") insertAt--;
  lines.splice(insertAt, 0, line);
  return lines.join("\n");
}

function tomlEnsureProvider(
  text: string,
  providerId: string,
  name: string,
  baseUrl: string,
): string {
  const lines = text.split("\n");
  const headerRe = new RegExp(
    `^\\s*\\[\\s*model_providers\\s*\\.\\s*${escapeRe(providerId)}\\s*\\]\\s*$`,
  );
  const start = lines.findIndex((l) => headerRe.test(l));
  if (start === -1) {
    let out = text;
    if (out !== "" && !out.endsWith("\n")) out += "\n";
    if (out !== "") out += "\n";
    return (
      out +
      `[model_providers.${providerId}]\n` +
      `name = ${tomlString(name)}\n` +
      `base_url = ${tomlString(baseUrl)}\n`
    );
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  for (let i = start + 1; i < end; i++) {
    if (/^\s*base_url\s*=/.test(lines[i]!)) {
      lines[i] = `base_url = ${tomlString(baseUrl)}`;
      return lines.join("\n");
    }
  }
  let insertAt = end;
  while (insertAt > start + 1 && lines[insertAt - 1]!.trim() === "") insertAt--;
  lines.splice(insertAt, 0, `base_url = ${tomlString(baseUrl)}`);
  return lines.join("\n");
}
