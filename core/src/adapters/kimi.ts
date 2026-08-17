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

  function activeConfig(doc: Record<string, any> | null): {
    fragment: ConfigFragment;
    oauth: boolean;
  } | null {
    const alias = str(doc?.default_model);
    const selected = alias ? doc?.models?.[alias] : undefined;
    const model = str(selected?.model);
    const providerId = str(selected?.provider);
    if (!model || !providerId) return null;
    const provider = doc?.providers?.[providerId];
    return {
      fragment: {
        providerId,
        model,
        baseUrl: str(selected?.base_url) ?? str(provider?.base_url),
        key: str(provider?.api_key),
      },
      oauth: provider?.oauth != null && typeof provider.oauth === "object",
    };
  }

  async function readFragment(): Promise<ConfigFragment | null> {
    const active = activeConfig(await readDoc());
    return active?.oauth ? null : active?.fragment ?? null;
  }

  async function readState(): Promise<ToolState> {
    const doc = await readDoc();
    const active = activeConfig(doc);
    if (active?.oauth) {
      return {
        toolId: KIMI_TOOL_ID,
        status: "oauth",
        defaultModel: active.fragment.model,
        baseUrl: active.fragment.baseUrl,
        projects: [],
      };
    }
    return stateFromFragment(
      KIMI_TOOL_ID,
      active?.fragment ?? null,
      doc !== null,
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
    const existingProvider = doc.providers[providerId] as Record<string, any> | undefined;
    const hasStoredCredential =
      typeof existingProvider?.api_key === "string" ||
      (existingProvider?.oauth != null && typeof existingProvider.oauth === "object");
    if (!plan.key && !hasStoredCredential) {
      throw new Error(`plan has no key and Kimi Code has no stored credential: ${plan.name}`);
    }
    const provider: Record<string, any> = {
      ...existingProvider,
      type: str(existingProvider?.type) ?? kimiProviderType(plan.baseUrl!),
      base_url: plan.baseUrl!,
    };
    if (plan.key) {
      provider.api_key = plan.key;
      delete provider.oauth;
    } else if (provider.oauth && typeof provider.api_key !== "string") {
      provider.api_key = "";
    }
    doc.providers[providerId] = provider;
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

function kimiProviderType(baseUrl: string): "kimi" | "anthropic" | "openai_legacy" {
  const normalized = baseUrl.toLowerCase();
  if (normalized.includes("moonshot") || normalized.includes("kimi.com")) return "kimi";
  if (normalized.includes("anthropic")) return "anthropic";
  return "openai_legacy";
}
