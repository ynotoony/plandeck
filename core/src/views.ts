import type { Catalog, Plan, Status, ToolState } from "./types.js";

export interface TrayMenuItem {
  id: string;
  label: string;
  enabled: boolean;
  checked: boolean;
}

export interface TrayToolMenu {
  toolId: string;
  label: string;
  plans: TrayPlanMenu[];
}

export interface TrayPlanMenu {
  id: string;
  label: string;
  enabled: boolean;
  items: TrayMenuItem[];
}

export interface DefaultRow {
  toolId: string;
  status: Status;
  defaultModel?: string;
  plan?: string;
}

export interface PlanRow {
  plan: Plan;
  usedBy: string[];
  sourceLabel: string;
  credential: string;
}

function sourceInfo(plan: Plan): { sourceLabel: string; credential: string } {
  const label =
    plan.source === "oauth" ? "OAuth" : plan.source === "env" ? "env" : "config";
  const sourceLabel = plan.sourceDetail ? `${label} · ${plan.sourceDetail}` : label;
  if (plan.source === "oauth") return { sourceLabel, credential: "登录会话" };
  if (plan.hasCredential || plan.credentialFingerprint) {
    return {
      sourceLabel,
      credential: plan.credentialFingerprint ? `已设置 · ${plan.credentialFingerprint}` : "已设置",
    };
  }
  return { sourceLabel, credential: "—" };
}

export function trayToolLabel(toolName: string, tool: ToolState): string {
  switch (tool.status) {
    case "matched":
      return `${toolName} · ${tool.defaultModel}（已识别）`;
    case "unknown":
      return `${toolName} · ${tool.defaultModel ?? "?"}（未识别）`;
    case "unset":
      return `${toolName} · 未设默认`;
    case "oauth":
      return `${toolName} · OAuth 登录`;
  }
}

export function deriveTrayMenu(
  tools: ToolState[],
  catalog: Catalog,
  toolNames: Record<string, string>,
): TrayToolMenu[] {
  return tools.map((tool) => ({
    toolId: tool.toolId,
    label: trayToolLabel(toolNames[tool.toolId] ?? tool.toolId, tool),
    plans: trayPlanMenus(tool, catalog),
  }));
}

function trayPlanMenus(tool: ToolState, catalog: Catalog): TrayPlanMenu[] {
  return catalog.plans.map((plan) => {
    if (plan.source === "oauth") {
      return {
        id: `plan:${tool.toolId}:${plan.id}`,
        label: `${plan.name}（OAuth 登录）`,
        enabled: false,
        items: [],
      };
    }
    if (plan.models.length === 0) {
      return {
        id: `plan:${tool.toolId}:${plan.id}`,
        label: `${plan.name}（无可用模型）`,
        enabled: false,
        items: [],
      };
    }
    return {
      id: `plan:${tool.toolId}:${plan.id}`,
      label: plan.name,
      enabled: true,
      items: plan.models.map((model) => ({
        id: `switch:${tool.toolId}:${plan.id}:${model}`,
        label: model,
        enabled: !!plan.baseUrl,
        checked: tool.plan === plan.id && tool.defaultModel === model,
      })),
    };
  });
}

export interface TraySwitchAction {
  toolId: string;
  planId: string;
  model: string;
}

export function parseTrayAction(id: string): TraySwitchAction | null {
  const [kind, toolId, planId, ...rest] = id.split(":");
  if (kind !== "switch" || !toolId || !planId || rest.length === 0) return null;
  return { toolId, planId, model: rest.join(":") };
}

export interface CascadeRow {
  level: 0 | 1 | 2;
  toolId: string;
  label: string;
  path?: string;
  plan?: string;
  model?: string;
  status?: Status;
  when?: string;
}

export function deriveDefaultRows(tools: ToolState[], catalog: Catalog): DefaultRow[] {
  return tools.map((t) => ({
    toolId: t.toolId,
    status: t.status,
    defaultModel: t.defaultModel,
    plan: t.plan ? catalog.plans.find((p) => p.id === t.plan)?.name ?? t.plan : undefined,
  }));
}

export function derivePlanRows(tools: ToolState[], catalog: Catalog): PlanRow[] {
  return catalog.plans.map((plan) => ({
    plan,
    usedBy: tools.filter((t) => t.plan === plan.id).map((t) => t.toolId),
    ...sourceInfo(plan),
  }));
}

export function deriveCascadeRows(
  tools: ToolState[],
  catalog: Catalog,
  options: { activeOnly?: boolean } = {},
): CascadeRow[] {
  const planName = (id: string | undefined): string | undefined =>
    id ? catalog.plans.find((plan) => plan.id === id)?.name ?? id : undefined;
  const rows: CascadeRow[] = [];
  for (const tool of tools) {
    if (options.activeOnly && tool.status === "unset" && tool.projects.length === 0) continue;
    rows.push({
      level: 0,
      toolId: tool.toolId,
      label: tool.toolId,
      plan: planName(tool.plan),
      model: tool.defaultModel,
      status: tool.status,
    });
    for (const project of tool.projects) {
      rows.push({
        level: 1,
        toolId: tool.toolId,
        label: project.name,
        path: project.path,
      });
      for (const session of project.sessions) {
        rows.push({
          level: 2,
          toolId: tool.toolId,
          label: session.id,
          plan: planName(session.plan),
          model: session.model,
          status: session.status,
          when: session.when,
        });
      }
    }
  }
  return rows;
}
