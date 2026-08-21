// input: smol-toml + bootstrap/recognize/shared
// output: importCcSwitchCatalog()/firstRunSetup()/mergeCatalogPlans()
// position: ccSwitch 历史导入的纯逻辑层
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { parse as parseToml } from "smol-toml";
import { bootstrapCatalog, hostOf } from "./bootstrap.js";
import { keyFingerprint, normalizeBaseUrl, plansMatch } from "./recognize.js";
import { slug, str } from "./adapters/shared.js";
import type { Adapter, Catalog, Plan } from "./types.js";

export interface CcSwitchRow {
  id: string;
  appType: string;
  name: string;
  settingsConfig: string;
  notes?: string;
}

interface MergeResult {
  catalog: Catalog;
  added: Plan[];
  merged: Plan[];
}

export interface ImportCcSwitchResult extends MergeResult {
  skipped: number;
}

export interface FirstRunSetupResult extends ImportCcSwitchResult {
  scanned: Plan[];
}

interface Extracted {
  baseUrl: string;
  key?: string;
  models: string[];
  providerId?: string;
  name?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function modelIds(models: unknown): string[] {
  if (!Array.isArray(models)) return [];
  return models
    .map((m) => (isRecord(m) ? str(m.id) : undefined))
    .filter((m): m is string => m !== undefined);
}

function extractFromSettings(cfg: unknown, rowId: string): Extracted | undefined {
  if (!isRecord(cfg)) return undefined;

  const baseUrl = str(cfg.base_url);
  if (baseUrl) {
    return {
      baseUrl,
      key: str(cfg.api_key),
      models: modelIds(cfg.models),
      providerId: str(cfg.provider_key),
      name: str(cfg.name),
    };
  }

  const options = isRecord(cfg.options) ? cfg.options : undefined;
  const baseURL = str(options?.baseURL);
  if (baseURL) {
    return {
      baseUrl: baseURL,
      key: str(options?.apiKey),
      models: isRecord(cfg.models) ? Object.keys(cfg.models) : [],
      providerId: rowId,
      name: str(cfg.name),
    };
  }

  const clawBaseUrl = str(cfg.baseUrl);
  if (clawBaseUrl) {
    return {
      baseUrl: clawBaseUrl,
      key: str(cfg.apiKey),
      models: modelIds(cfg.models),
      name: str(cfg.name),
    };
  }

  if (typeof cfg.config === "string" && cfg.config.trim() !== "") {
    try {
      const toml = parseToml(cfg.config) as Record<string, unknown>;
      const providerId = str(toml.model_provider);
      const providers = isRecord(toml.model_providers) ? toml.model_providers : undefined;
      const section =
        providerId && isRecord(providers?.[providerId])
          ? (providers[providerId] as Record<string, unknown>)
          : undefined;
      const sectionBaseUrl = str(section?.base_url);
      if (!sectionBaseUrl) return undefined;
      const model = str(toml.model);
      return {
        baseUrl: sectionBaseUrl,
        key: isRecord(cfg.auth) ? str(cfg.auth.OPENAI_API_KEY) : undefined,
        models: model ? [model] : [],
        providerId,
        name: str(section?.name),
      };
    } catch {
      return undefined;
    }
  }

  return undefined;
}

async function ccSwitchRowToPlan(
  row: CcSwitchRow,
  sourceDetail: string,
): Promise<Plan | undefined> {
  let cfg: unknown;
  try {
    cfg = JSON.parse(row.settingsConfig);
  } catch {
    return undefined;
  }
  const extracted = extractFromSettings(cfg, row.id);
  if (!extracted) return undefined;
  const name = row.name || extracted.name || hostOf(extracted.baseUrl) || row.id;
  const fingerprint = await keyFingerprint(
    `${normalizeBaseUrl(extracted.baseUrl)}\n${extracted.key ?? ""}`,
  );
  return {
    id: `ccswitch-${slug(hostOf(extracted.baseUrl) ?? name)}-${fingerprint.slice(0, 8)}`,
    name,
    source: "config",
    sourceDetail,
    providerId: extracted.providerId,
    baseUrl: extracted.baseUrl,
    hasCredential: !!extracted.key,
    credentialFingerprint: extracted.key ? await keyFingerprint(extracted.key) : undefined,
    models: extracted.models,
    note: row.notes || undefined,
  };
}

export async function mergeCatalogPlans(catalog: Catalog, incoming: Plan[]): Promise<MergeResult> {
  const plans = [...catalog.plans];
  const added: Plan[] = [];
  const merged: Plan[] = [];
  for (const plan of incoming) {
    const existing = await findDuplicate(plans, plan);
    if (!existing) {
      plans.push(plan);
      added.push(plan);
      continue;
    }
    const updated: Plan = {
      ...existing,
      models: [...existing.models, ...plan.models.filter((m) => !existing.models.includes(m))],
      hasCredential: existing.hasCredential || plan.hasCredential,
      credentialFingerprint: existing.credentialFingerprint ?? plan.credentialFingerprint,
      baseUrl: existing.baseUrl ?? plan.baseUrl,
      providerId: existing.providerId ?? plan.providerId,
      note: existing.note ?? plan.note,
    };
    plans[plans.indexOf(existing)] = updated;
    merged.push(plan);
  }
  return { catalog: { version: 1, plans }, added, merged };
}

export async function importCcSwitchCatalog(
  rows: CcSwitchRow[],
  sourceDetail: string,
  catalog: Catalog,
): Promise<ImportCcSwitchResult> {
  const parsed = await Promise.all(rows.map((row) => ccSwitchRowToPlan(row, sourceDetail)));
  const incoming = parsed.filter((plan): plan is Plan => plan !== undefined);
  const result = await mergeCatalogPlans(catalog, incoming);
  return { ...result, skipped: rows.length - incoming.length };
}

export async function firstRunSetup(
  adapters: Adapter[],
  rows: CcSwitchRow[],
  sourceDetail: string,
): Promise<FirstRunSetupResult> {
  const seeded = await bootstrapCatalog(adapters);
  const result = await importCcSwitchCatalog(rows, sourceDetail, seeded);
  return { ...result, scanned: seeded.plans };
}

async function findDuplicate(plans: Plan[], plan: Plan): Promise<Plan | undefined> {
  for (const candidate of plans) {
    if (candidate.id === plan.id) return candidate;
    if (await plansMatch(candidate, plan)) return candidate;
  }
  return undefined;
}
