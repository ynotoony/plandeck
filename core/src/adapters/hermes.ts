import { Document, parse, parseDocument } from "yaml";
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
  readOrEmpty,
  recognizeSession,
  requireBaseUrl,
  slug,
  sortProjects,
  sortSessionsDesc,
  stateFromFragment,
  str,
  stripApiPath,
} from "./shared.js";

export const HERMES_TOOL_ID = "hermes";

export function createHermesAdapter(ctx: AdapterContext): Adapter {
  const configPath = `${ctx.homeDir}/.hermes/config.yaml`;
  const projectsDbPath = `${ctx.homeDir}/.hermes/projects.db`;
  const stateDbPath = `${ctx.homeDir}/.hermes/state.db`;
  const sessionsDir = `${ctx.homeDir}/.hermes/sessions`;

  async function readFragment(): Promise<ConfigFragment | null> {
    if (!(await ctx.fs.exists(configPath))) return null;
    const doc = parse(await ctx.fs.read(configPath)) as {
      model?: { default?: unknown; provider?: unknown; base_url?: unknown };
    } | null;
    const fragment: ConfigFragment = {
      model: str(doc?.model?.default),
      providerId: str(doc?.model?.provider),
      baseUrl: str(doc?.model?.base_url),
    };
    return fragment.model || fragment.baseUrl ? fragment : null;
  }

  async function readProjects(): Promise<ProjectState[]> {
    const projRows = await ctx.sqlite.query(
      projectsDbPath,
      "SELECT id, name, primary_path FROM projects WHERE archived = 0 ORDER BY created_at",
    );
    const folderRows = await ctx.sqlite.query(
      projectsDbPath,
      "SELECT project_id, path FROM project_folders",
    );
    const pathsByProject = new Map<string, Set<string>>();
    for (const row of folderRows) {
      const id = str(row.project_id);
      const path = str(row.path);
      if (!id || !path) continue;
      const set = pathsByProject.get(id) ?? new Set<string>();
      set.add(path);
      pathsByProject.set(id, set);
    }
    const projects: ProjectState[] = [];
    const projectByPath = new Map<string, ProjectState>();
    for (const row of projRows) {
      const id = str(row.id) ?? "";
      const path = str(row.primary_path) ?? "";
      const set = pathsByProject.get(id) ?? new Set<string>();
      if (path) set.add(path);
      const project: ProjectState = { name: str(row.name) ?? id, path, sessions: [] };
      projects.push(project);
      for (const p of set) projectByPath.set(p, project);
    }

    const latestBySession = new Map<
      string,
      { when: string; model?: string; url?: string }
    >();
    for (const name of await ctx.fs.list(sessionsDir)) {
      if (!/^request_dump_.*\.json$/.test(name)) continue;
      let dump: {
        timestamp?: unknown;
        session_id?: unknown;
        request?: { url?: unknown; body?: { model?: unknown } };
      };
      try {
        dump = JSON.parse(await ctx.fs.read(`${sessionsDir}/${name}`));
      } catch {
        continue;
      }
      const sessionId = str(dump.session_id);
      const when = str(dump.timestamp);
      if (!sessionId || !when) continue;
      const prev = latestBySession.get(sessionId);
      if (prev && prev.when >= when) continue;
      latestBySession.set(sessionId, {
        when,
        model: str(dump.request?.body?.model),
        url: str(dump.request?.url),
      });
    }
    if (latestBySession.size === 0) return sortProjects(projects);

    const ids = [...latestBySession.keys()];
    const cwdRows = await ctx.sqlite.query(
      stateDbPath,
      `SELECT id, cwd FROM sessions WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    const cwdBySession = new Map<string, string>();
    for (const row of cwdRows) {
      const id = str(row.id);
      const cwd = str(row.cwd);
      if (id && cwd) cwdBySession.set(id, cwd);
    }

    const unassigned: SessionState[] = [];
    for (const [sessionId, dump] of latestBySession) {
      const rec = await recognizeSession(
        { model: dump.model, baseUrl: dump.url ? stripApiPath(dump.url) : undefined },
        ctx.catalog,
      );
      const session: SessionState = {
        id: sessionId,
        model: dump.model ?? "",
        plan: rec.plan,
        status: rec.status,
        when: dump.when,
      };
      const cwd = cwdBySession.get(sessionId);
      const owner = cwd ? projectByPath.get(cwd) : undefined;
      if (owner) owner.sessions.push(session);
      else unassigned.push(session);
    }
    if (unassigned.length > 0) {
      projects.push({ name: "（未归属）", path: "", sessions: sortSessionsDesc(unassigned) });
    }
    for (const project of projects) project.sessions = sortSessionsDesc(project.sessions);
    return sortProjects(projects);
  }

  async function readState(): Promise<ToolState> {
    const state = await stateFromFragment(
      HERMES_TOOL_ID,
      await readFragment(),
      await ctx.fs.exists(configPath),
      ctx.catalog,
    );
    return { ...state, projects: await readProjects() };
  }

  async function planChange(plan: Plan, model: string): Promise<FileEdit[]> {
    requireBaseUrl(plan, "Hermes");
    const oldText = await readOrEmpty(ctx.fs, configPath);
    const doc = oldText.trim() === "" ? new Document({}) : parseDocument(oldText);
    doc.setIn(["model", "default"], model);
    doc.setIn(["model", "provider"], plan.providerId ?? slug(plan.name));
    doc.setIn(["model", "base_url"], plan.baseUrl);
    return [{ path: configPath, oldText, newText: doc.toString() }];
  }

  async function groupChange(group: GroupContract): Promise<FileEdit[]> {
    const oldText = await readOrEmpty(ctx.fs, configPath);
    const doc = oldText.trim() === "" ? new Document({}) : parseDocument(oldText);
    doc.setIn(["model", "default"], group.model);
    doc.setIn(["model", "provider"], group.provider);
    doc.setIn(["model", "base_url"], group.baseUrl);
    return [{ path: configPath, oldText, newText: doc.toString() }];
  }

  return {
    toolId: HERMES_TOOL_ID,
    toolName: "Hermes",
    configPath,
    readState,
    readFragment,
    planChange,
    environmentSupport: { supported: true },
    groupChange,
  };
}
