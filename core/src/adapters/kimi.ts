import { parse, stringify } from "smol-toml";
import type { Adapter, AdapterContext, ConfigFragment, FileEdit, Plan, ToolState } from "../types.js";
import { readOrEmpty, requireBaseUrl, slug, stateFromFragment, str } from "./shared.js";

export const KIMI_TOOL_ID = "kimi";

export function createKimiAdapter(ctx: AdapterContext): Adapter {
  const configPath = `${ctx.homeDir}/.kimi/config.toml`;

  async function readDoc(path = configPath): Promise<Record<string, any> | null> {
    if (!(await ctx.fs.exists(path))) return null;
    return parse(await ctx.fs.read(path)) as Record<string, any>;
  }

  async function readFragment(): Promise<ConfigFragment | null> {
    const doc = await readDoc();
    const alias = str(doc?.default_model);
    const selected = alias ? doc?.models?.[alias] : undefined;
    const model = str(selected?.model);
    const providerId = str(selected?.provider);
    if (!model || !providerId) return null;
    const provider = doc?.providers?.[providerId];
    return {
      providerId,
      model,
      baseUrl: str(selected?.base_url) ?? str(provider?.base_url),
      key: str(provider?.api_key),
    };
  }

  async function readState(): Promise<ToolState> {
    return stateFromFragment(
      KIMI_TOOL_ID,
      await readFragment(),
      await ctx.fs.exists(configPath),
      ctx.catalog,
    );
  }

  async function planChange(plan: Plan, model: string): Promise<FileEdit[]> {
    requireBaseUrl(plan, "Kimi Code");
    const providerId = plan.providerId ?? slug(plan.name);
    const alias = `${providerId}/${model}`;
    const oldText = await readOrEmpty(ctx.fs, configPath);
    const doc = oldText ? (parse(oldText) as Record<string, any>) : {};
    doc.providers ??= {};
    doc.models ??= {};
    doc.providers[providerId] = {
      ...doc.providers[providerId],
      type: plan.baseUrl!.includes("moonshot") || plan.baseUrl!.includes("kimi.com") ? "kimi" : "openai_legacy",
      base_url: plan.baseUrl,
      ...(plan.key ? { api_key: plan.key } : {}),
    };
    doc.models[alias] = {
      ...doc.models[alias],
      provider: providerId,
      model,
      max_context_size: doc.models[alias]?.max_context_size ?? 262144,
    };
    doc.default_model = alias;
    return [{ path: configPath, oldText, newText: stringify(doc) }];
  }

  return {
    toolId: KIMI_TOOL_ID,
    toolName: "Kimi Code",
    configPath,
    readState,
    readFragment,
    planChange,
  };
}
