import { parse } from "jsonc-parser";
import type { Adapter, AdapterContext, ConfigFragment, FileEdit, Plan, ToolState } from "../types.js";
import {
  jsonSet,
  readOrEmpty,
  requireBaseUrl,
  slug,
  splitProviderModel,
  stateFromFragment,
  str,
} from "./shared.js";

export const ZCODE_TOOL_ID = "zcode";

export function createZcodeAdapter(ctx: AdapterContext): Adapter {
  const configPath = `${ctx.homeDir}/.zcode/v2/config.json`;

  async function readDoc(path = configPath): Promise<Record<string, any> | null> {
    if (!(await ctx.fs.exists(path))) return null;
    return (parse(await ctx.fs.read(path)) ?? {}) as Record<string, any>;
  }

  async function readFragment(): Promise<ConfigFragment | null> {
    const doc = await readDoc();
    const selected = str(doc?.model) ?? str(doc?.model?.main);
    if (!selected) return null;
    const active = splitProviderModel(selected);
    if (!active) return null;
    const provider = doc?.provider?.[active.providerId];
    return {
      providerId: active.providerId,
      model: active.model,
      baseUrl: str(provider?.options?.baseURL),
      key: str(provider?.options?.apiKey),
    };
  }

  async function readState(): Promise<ToolState> {
    return stateFromFragment(
      ZCODE_TOOL_ID,
      await readFragment(),
      await ctx.fs.exists(configPath),
      ctx.catalog,
    );
  }

  async function planChange(plan: Plan, model: string): Promise<FileEdit[]> {
    requireBaseUrl(plan, "ZCode");
    const providerId = plan.providerId ?? slug(plan.name);
    const oldText = await readOrEmpty(ctx.fs, configPath);
    let newText = oldText || "{}\n";
    newText = jsonSet(
      newText,
      ["provider", providerId, "kind"],
      plan.baseUrl!.includes("anthropic") ? "anthropic" : "openai-compatible",
    );
    newText = jsonSet(newText, ["provider", providerId, "name"], plan.name);
    newText = jsonSet(newText, ["provider", providerId, "options", "baseURL"], plan.baseUrl);
    if (plan.key) {
      newText = jsonSet(newText, ["provider", providerId, "options", "apiKey"], plan.key);
    }
    newText = jsonSet(newText, ["provider", providerId, "models", model, "name"], model);
    newText = jsonSet(newText, ["model"], `${providerId}/${model}`);
    newText = jsonSet(newText, ["small_model"], `${providerId}/${model}`);
    return [{ path: configPath, oldText, newText }];
  }

  return {
    toolId: ZCODE_TOOL_ID,
    toolName: "ZCode",
    configPath,
    readState,
    readFragment,
    planChange,
  };
}
