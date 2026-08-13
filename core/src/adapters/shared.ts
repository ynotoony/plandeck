import { applyEdits, modify } from "jsonc-parser";
import { recognize } from "../recognize.js";
import type {
  Catalog,
  ConfigFragment,
  FsPort,
  Plan,
  ProjectState,
  SessionState,
  Status,
  ToolState,
} from "../types.js";

export function jsonSet(text: string, path: (string | number)[], value: unknown): string {
  return applyEdits(
    text,
    modify(text, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
  );
}

export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "plan"
  );
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export function splitProviderModel(value: string): { providerId: string; model: string } | null {
  const [providerId, ...rest] = value.split("/");
  const model = rest.join("/");
  if (!providerId || !model) return null;
  return { providerId, model };
}

export async function readOrEmpty(fs: FsPort, path: string): Promise<string> {
  return (await fs.exists(path)) ? fs.read(path) : "";
}

export function requireBaseUrl(plan: Plan, toolName: string): string {
  if (!plan.baseUrl) {
    throw new Error(`plan has no baseUrl, cannot switch ${toolName} to it: ${plan.name}`);
  }
  return plan.baseUrl;
}

export function baseName(path: string): string {
  const segments = path.split("/").filter((s) => s !== "");
  return segments[segments.length - 1] ?? "";
}

export function stripApiPath(url: string): string {
  return url.replace(/\/(chat\/completions|completions|messages|responses|embeddings)\/?$/, "");
}

export async function walkFiles(fs: FsPort, dir: string): Promise<string[]> {
  if (!(await fs.exists(dir))) return [];
  const out: string[] = [];
  for (const name of await fs.list(dir)) {
    const path = `${dir}/${name}`;
    if (await fs.isDirectory(path)) out.push(...(await walkFiles(fs, path)));
    else out.push(path);
  }
  return out;
}

export async function recognizeSession(
  fragment: { model?: string; baseUrl?: string; key?: string },
  catalog: Catalog,
): Promise<{ status: Status; plan?: string }> {
  if (!fragment.model) return { status: "unset" };
  const rec = await recognize(fragment, catalog);
  return { status: rec.status, plan: rec.plan?.id };
}

export function sortSessionsDesc(sessions: SessionState[]): SessionState[] {
  return [...sessions].sort((a, b) => b.when.localeCompare(a.when));
}

export function sortProjects(projects: ProjectState[]): ProjectState[] {
  const withSessions = projects.filter((p) => p.sessions.length > 0);
  const withoutSessions = projects.filter((p) => p.sessions.length === 0);
  withSessions.sort((a, b) => latestWhen(b).localeCompare(latestWhen(a)));
  return [...withSessions, ...withoutSessions];
}

function latestWhen(project: ProjectState): string {
  return project.sessions.reduce((max, s) => (s.when > max ? s.when : max), "");
}

export function projectsByCwd(entries: { cwd?: string; session: SessionState }[]): ProjectState[] {
  const byCwd = new Map<string, SessionState[]>();
  for (const { cwd, session } of entries) {
    const key = cwd ?? "";
    const list = byCwd.get(key) ?? [];
    list.push(session);
    byCwd.set(key, list);
  }
  return [...byCwd.entries()].map(([cwd, sessions]) => ({
    name: cwd ? baseName(cwd) : "（全局）",
    path: cwd,
    sessions: sortSessionsDesc(sessions),
  }));
}

export async function stateFromFragment(
  toolId: string,
  fragment: ConfigFragment | null,
  fileExists: boolean,
  catalog: Catalog,
): Promise<ToolState> {
  if (!fileExists) {
    return { toolId, status: "unset", note: "配置文件不存在", projects: [] };
  }
  if (!fragment) return { toolId, status: "unset", projects: [] };
  const rec = await recognize(fragment, catalog);
  return {
    toolId,
    status: rec.status,
    defaultModel: fragment.model,
    baseUrl: fragment.baseUrl,
    plan: rec.plan?.id,
    projects: [],
  };
}
