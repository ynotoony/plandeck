// input: recognize（指纹/URL 归一化）
// output: subscriptions.env 的 TS 侧解析/校验/序列化与 groupContract()
// position: 环境契约的 TS 镜像（权威实现在 Rust EnvironmentStore）
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { keyFingerprint, normalizeBaseUrl } from "./recognize.js";

export const ENV_FILE_VERSION = "1";
export const ENV_ID_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export type { EnvironmentBindingStatus } from "./types.js";

export interface EnvironmentPlan {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  models: string[];
  hasCredential: boolean;
  credentialFingerprint?: string;
  /** Only present inside the Rust/store boundary; never serialize to the UI. */
  apiKey?: string;
}

export interface SubscriptionGroup {
  id: string;
  provider: string;
  baseUrl: string;
  model: string;
  members: string[];
  selected: string;
}

export interface ToolBinding {
  toolId: string;
  groupId: string;
}

export interface EnvironmentDocument {
  version: string;
  plans: EnvironmentPlan[];
  groups: SubscriptionGroup[];
  bindings: ToolBinding[];
  comments: string[];
}

export interface EnvironmentCatalog {
  version: string;
  plans: Array<Omit<EnvironmentPlan, "apiKey">>;
  groups: SubscriptionGroup[];
  bindings: ToolBinding[];
  errors: string[];
}

export interface EnvironmentPlanWrite extends Omit<EnvironmentPlan, "hasCredential" | "credentialFingerprint" | "apiKey"> {
  credential?: string;
  clearCredential?: boolean;
}

export interface EnvironmentCatalogWrite {
  version: string;
  plans: EnvironmentPlanWrite[];
  groups: SubscriptionGroup[];
  bindings: ToolBinding[];
}

export function groupContract(group: SubscriptionGroup) {
  return {
    id: group.id,
    provider: group.provider,
    baseUrl: group.baseUrl,
    model: group.model,
    credentialEnvVar: `PLANDECK_GROUP_${group.id}_API_KEY`,
  };
}

export interface EnvironmentValidation {
  valid: boolean;
  errors: string[];
  groups: SubscriptionGroup[];
}

function envName(kind: "PLAN" | "GROUP" | "TOOL", id: string, field: string): string {
  return `PLANDECK_${kind}_${id}_${field}`;
}

function parseShellValue(raw: string, line: number): string {
  if (!raw.startsWith("'")) throw new Error(`line ${line}: value must use single quotes`);
  let value = "";
  for (let i = 1; i < raw.length; i++) {
    const char = raw[i];
    if (char === "\0" || char === "\n" || char === "\r") {
      throw new Error(`line ${line}: value contains a forbidden control character`);
    }
    if (char !== "'") {
      value += char;
      continue;
    }
    if (raw.slice(i, i + 4) === "'\\''") {
      value += "'";
      i += 3;
      continue;
    }
    if (i !== raw.length - 1) throw new Error(`line ${line}: trailing text after quoted value`);
    return value;
  }
  throw new Error(`line ${line}: unterminated quoted value`);
}

function parseArray(value: string, label: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be a JSON string array`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a JSON string array`);
  }
  return parsed as string[];
}

function requireId(id: string, label: string): void {
  if (!ENV_ID_PATTERN.test(id)) throw new Error(`${label} id is invalid: ${id}`);
}

export function parseSubscriptionsEnv(text: string): EnvironmentDocument {
  const values = new Map<string, string>();
  const comments: string[] = [];
  for (const [index, original] of text.split("\n").entries()) {
    const line = index + 1;
    const trimmed = original.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      if (trimmed.startsWith("#")) comments.push(original);
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) throw new Error(`line ${line}: expected NAME='VALUE'`);
    const name = match[1]!;
    const raw = match[2]!;
    if (!name.startsWith("PLANDECK_") || !ENV_ID_PATTERN.test(name)) {
      throw new Error(`line ${line}: variable is outside PLANDECK namespace`);
    }
    if (values.has(name)) throw new Error(`line ${line}: duplicate variable ${name}`);
    values.set(name, parseShellValue(raw, line));
  }

  const version = values.get("PLANDECK_ENV_VERSION") ?? ENV_FILE_VERSION;
  if (version !== ENV_FILE_VERSION) throw new Error(`unsupported env version: ${version}`);
  const plans = new Map<string, Partial<EnvironmentPlan>>();
  const groups = new Map<string, Partial<SubscriptionGroup>>();
  const bindings = new Map<string, string>();
  for (const [name, value] of values) {
    if (name === "PLANDECK_ENV_VERSION") continue;
    const plan = /^PLANDECK_PLAN_([A-Z][A-Z0-9_]*)_(NAME|PROVIDER|BASE_URL|MODELS|API_KEY)$/.exec(name);
    if (plan) {
      const id = plan[1]!;
      requireId(id, "plan");
      const item = plans.get(id) ?? {};
      if (plan[2] === "NAME") item.name = value;
      if (plan[2] === "PROVIDER") item.provider = value;
      if (plan[2] === "BASE_URL") item.baseUrl = value;
      if (plan[2] === "MODELS") item.models = parseArray(value, name);
      if (plan[2] === "API_KEY") {
        item.apiKey = value;
        item.hasCredential = value.length > 0;
      }
      plans.set(id, item);
      continue;
    }
    const group = /^PLANDECK_GROUP_([A-Z][A-Z0-9_]*)_(PROVIDER|BASE_URL|MODEL|MEMBERS|SELECTED)$/.exec(name);
    if (group) {
      const id = group[1]!;
      const item = groups.get(id) ?? {};
      if (group[2] === "PROVIDER") item.provider = value;
      if (group[2] === "BASE_URL") item.baseUrl = value;
      if (group[2] === "MODEL") item.model = value;
      if (group[2] === "MEMBERS") item.members = parseArray(value, name);
      if (group[2] === "SELECTED") item.selected = value;
      groups.set(id, item);
      continue;
    }
    const binding = /^PLANDECK_TOOL_([A-Z][A-Z0-9_]*)_GROUP$/.exec(name);
    if (binding) {
      bindings.set(binding[1]!, value);
      continue;
    }
    throw new Error(`unknown PLANDECK variable: ${name}`);
  }

  const resultPlans: EnvironmentPlan[] = [...plans.entries()].map(([id, item]) => ({
    id,
    name: item.name ?? id,
    provider: item.provider ?? "",
    baseUrl: item.baseUrl ?? "",
    models: item.models ?? [],
    hasCredential: item.hasCredential ?? false,
    ...(item.apiKey !== undefined ? { apiKey: item.apiKey } : {}),
  }));
  const resultGroups: SubscriptionGroup[] = [...groups.entries()].map(([id, item]) => ({
    id,
    provider: item.provider ?? "",
    baseUrl: item.baseUrl ?? "",
    model: item.model ?? "",
    members: item.members ?? [],
    selected: item.selected ?? "",
  }));
  return {
    version,
    plans: resultPlans,
    groups: resultGroups,
    bindings: [...bindings.entries()].map(([toolId, groupId]) => ({ toolId, groupId })),
    comments,
  };
}

export async function addCredentialFingerprints(document: EnvironmentDocument): Promise<EnvironmentDocument> {
  const plans = await Promise.all(document.plans.map(async (plan) => ({
    ...plan,
    ...(plan.apiKey ? { credentialFingerprint: await keyFingerprint(plan.apiKey) } : {}),
  })));
  return { ...document, plans };
}

export function validateEnvironment(document: EnvironmentDocument): EnvironmentValidation {
  const errors: string[] = [];
  const planMap = new Map(document.plans.map((plan) => [plan.id, plan]));
  const groupIds = new Set<string>();
  for (const group of document.groups) {
    requireId(group.id, "group");
    if (groupIds.has(group.id)) errors.push(`duplicate group ${group.id}`);
    groupIds.add(group.id);
    const selected = planMap.get(group.selected);
    if (!selected) errors.push(`group ${group.id} selected plan is missing`);
    if (group.members.length === 0) errors.push(`group ${group.id} has no members`);
    for (const memberId of group.members) {
      const member = planMap.get(memberId);
      if (!member) {
        errors.push(`group ${group.id} member ${memberId} is missing`);
        continue;
      }
      if (!member.hasCredential || !member.apiKey) errors.push(`group ${group.id} member ${memberId} has no credential`);
      if (member.provider !== group.provider) errors.push(`group ${group.id} provider mismatch for ${memberId}`);
      if (normalizeBaseUrl(member.baseUrl) !== normalizeBaseUrl(group.baseUrl)) errors.push(`group ${group.id} base URL mismatch for ${memberId}`);
      if (!member.models.includes(group.model)) errors.push(`group ${group.id} model ${group.model} is not supported by ${memberId}`);
    }
    if (selected && !group.members.includes(selected.id)) errors.push(`group ${group.id} selected plan is not a member`);
  }
  for (const binding of document.bindings) {
    if (!groupIds.has(binding.groupId)) errors.push(`tool ${binding.toolId} references missing group ${binding.groupId}`);
  }
  return { valid: errors.length === 0, errors, groups: document.groups };
}

function quote(value: string): string {
  if (value.includes("\0") || value.includes("\n") || value.includes("\r")) throw new Error("env values cannot contain NUL or newline");
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function serializeSubscriptionsEnv(document: EnvironmentDocument): string {
  const lines = ["# PlanDeck managed environment", `PLANDECK_ENV_VERSION=${quote(document.version)}`, ""];
  for (const plan of [...document.plans].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`PLANDECK_PLAN_${plan.id}_NAME=${quote(plan.name)}`);
    lines.push(`PLANDECK_PLAN_${plan.id}_PROVIDER=${quote(plan.provider)}`);
    lines.push(`PLANDECK_PLAN_${plan.id}_BASE_URL=${quote(plan.baseUrl)}`);
    lines.push(`PLANDECK_PLAN_${plan.id}_MODELS=${quote(JSON.stringify(plan.models))}`);
    if (plan.apiKey !== undefined) lines.push(`PLANDECK_PLAN_${plan.id}_API_KEY=${quote(plan.apiKey)}`);
    lines.push("");
  }
  for (const group of [...document.groups].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`PLANDECK_GROUP_${group.id}_PROVIDER=${quote(group.provider)}`);
    lines.push(`PLANDECK_GROUP_${group.id}_BASE_URL=${quote(group.baseUrl)}`);
    lines.push(`PLANDECK_GROUP_${group.id}_MODEL=${quote(group.model)}`);
    lines.push(`PLANDECK_GROUP_${group.id}_MEMBERS=${quote(JSON.stringify(group.members))}`);
    lines.push(`PLANDECK_GROUP_${group.id}_SELECTED=${quote(group.selected)}`, "");
  }
  for (const binding of [...document.bindings].sort((a, b) => a.toolId.localeCompare(b.toolId))) {
    lines.push(`PLANDECK_TOOL_${binding.toolId}_GROUP=${quote(binding.groupId)}`);
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
