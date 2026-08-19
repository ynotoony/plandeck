import { parse } from "jsonc-parser";
import type {
  Adapter,
  AdapterContext,
  ConfigFragment,
  FileEdit,
  GroupContract,
  Plan,
  ProjectState,
  SessionState,
  ToolState,
} from "../types.js";
import {
  baseName,
  jsonSet,
  readOrEmpty,
  recognizeSession,
  requireBaseUrl,
  slug,
  sortProjects,
  sortSessionsDesc,
  splitProviderModel,
  stateFromFragment,
  str,
} from "./shared.js";

export const OPENCODE_TOOL_ID = "opencode";

interface OpencodeConfig {
  model?: unknown;
  provider?: Record<
    string,
    { options?: { baseURL?: unknown; apiKey?: unknown }; models?: Record<string, unknown> }
  >;
}

interface ConfigFile {
  path: string;
  text: string;
  parsed: OpencodeConfig;
}

export function createOpencodeAdapter(ctx: AdapterContext): Adapter {
  const dir = `${ctx.homeDir}/.config/opencode`;
  const jsonPath = `${dir}/opencode.json`;
  const jsoncPath = `${dir}/opencode.jsonc`;
  const dbPath = `${ctx.homeDir}/.local/share/opencode/opencode.db`;

  async function loadConfigs(): Promise<{ merged: OpencodeConfig; files: ConfigFile[] }> {
    const files: ConfigFile[] = [];
    for (const path of [jsonPath, jsoncPath]) {
      if (!(await ctx.fs.exists(path))) continue;
      const text = await ctx.fs.read(path);
      files.push({ path, text, parsed: (parse(text) ?? {}) as OpencodeConfig });
    }
    const merged: Record<string, unknown> = {};
    for (const file of files) deepMerge(merged, file.parsed as Record<string, unknown>);
    return { merged: merged as OpencodeConfig, files };
  }

  async function readFragment(): Promise<ConfigFragment | null> {
    const { merged } = await loadConfigs();
    if (typeof merged.model !== "string" || !merged.model) return null;
    const split = splitProviderModel(merged.model);
    if (!split) return null;
    const provider = merged.provider?.[split.providerId];
    return {
      model: split.model,
      providerId: split.providerId,
      baseUrl: str(provider?.options?.baseURL),
      key: str(provider?.options?.apiKey),
    };
  }

  async function readProjects(): Promise<ProjectState[]> {
    const projRows = await ctx.sqlite.query(
      dbPath,
      "SELECT id, worktree, name FROM project ORDER BY time_created",
    );
    const sesRows = await ctx.sqlite.query(
      dbPath,
      "SELECT id, project_id, model, time_updated FROM session ORDER BY time_updated DESC",
    );
    if (projRows.length === 0 && sesRows.length === 0) return [];

    const projects = new Map<string, ProjectState>();
    for (const row of projRows) {
      const id = str(row.id);
      if (!id) continue;
      const worktree = str(row.worktree) ?? "";
      projects.set(id, {
        name: (str(row.name) ?? baseName(worktree)) || worktree,
        path: worktree,
        sessions: [],
      });
    }

    const { merged } = await loadConfigs();
    const orphan: SessionState[] = [];
    for (const row of sesRows) {
      const id = str(row.id);
      if (!id) continue;
      const parsed = parseSessionModel(str(row.model));
      const provider = parsed?.providerId ? merged.provider?.[parsed.providerId] : undefined;
      const rec = await recognizeSession(
        {
          model: parsed?.modelId,
          baseUrl: str(provider?.options?.baseURL),
          key: str(provider?.options?.apiKey),
        },
        ctx.catalog,
      );
      const session: SessionState = {
        id,
        model: parsed?.modelId ?? "",
        plan: rec.plan,
        status: rec.status,
        when: toIso(row.time_updated),
      };
      const owner = str(row.project_id) ? projects.get(str(row.project_id)!) : undefined;
      if (owner) owner.sessions.push(session);
      else orphan.push(session);
    }

    const list = [...projects.values()];
    if (orphan.length > 0) {
      list.push({ name: "（未归属）", path: "", sessions: sortSessionsDesc(orphan) });
    }
    for (const project of list) project.sessions = sortSessionsDesc(project.sessions);
    return sortProjects(list);
  }

  async function readState(): Promise<ToolState> {
    const { files } = await loadConfigs();
    const state = await stateFromFragment(
      OPENCODE_TOOL_ID,
      await readFragment(),
      files.length > 0,
      ctx.catalog,
    );
    return { ...state, projects: await readProjects() };
  }

  async function planChange(plan: Plan, model: string): Promise<FileEdit[]> {
    requireBaseUrl(plan, "opencode");
    const providerId = plan.providerId ?? slug(plan.name);
    const { files } = await loadConfigs();
    const withModel = files.filter((f) => typeof f.parsed.model === "string" && f.parsed.model);
    const target =
      withModel[withModel.length - 1] ??
      files.find((f) => f.path === jsoncPath) ??
      files[0];
    const path = target?.path ?? jsonPath;
    const oldText = target?.text ?? "";

    let newText = oldText === "" ? "{}\n" : oldText;
    newText = jsonSet(newText, ["model"], `${providerId}/${model}`);
    newText = jsonSet(newText, ["provider", providerId, "options", "baseURL"], plan.baseUrl);
    newText = jsonSet(newText, ["provider", providerId, "models", model], {});
    return [{ path, oldText, newText }];
  }

  async function groupChange(group: GroupContract): Promise<FileEdit[]> {
    const providerId = `plandeck-${slug(group.id)}`;
    const { files } = await loadConfigs();
    const target = files.find((file) => file.path === jsoncPath) ?? files[0];
    const path = target?.path ?? jsonPath;
    const oldText = target?.text ?? "";
    let newText = oldText === "" ? "{}\n" : oldText;
    newText = jsonSet(newText, ["model"], `${providerId}/${group.model}`);
    newText = jsonSet(newText, ["provider", providerId, "options", "baseURL"], group.baseUrl);
    newText = jsonSet(
      newText,
      ["provider", providerId, "options", "apiKey"],
      `{env:${group.credentialEnvVar}}`,
    );
    newText = jsonSet(newText, ["provider", providerId, "models", group.model], {});
    return [{ path, oldText, newText }];
  }

  return {
    toolId: OPENCODE_TOOL_ID,
    toolName: "opencode",
    configPath: jsonPath,
    readState,
    readFragment,
    planChange,
    environmentSupport: { supported: true },
    groupChange,
  };
}

function parseSessionModel(
  value: string | undefined,
): { modelId: string; providerId?: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { id?: unknown; providerID?: unknown };
    const modelId = str(parsed.id);
    if (!modelId) return null;
    return { modelId, providerId: str(parsed.providerID) };
  } catch {
    return { modelId: value };
  }
}

function toIso(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : "";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge(into: Record<string, unknown>, from: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(from)) {
    if (isRecord(value) && isRecord(into[key])) {
      deepMerge(into[key] as Record<string, unknown>, value);
    } else {
      into[key] = value;
    }
  }
}
