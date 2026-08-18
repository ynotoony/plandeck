import { parse } from "smol-toml";
import type { Adapter, AdapterContext, ConfigFragment, ToolState } from "../types.js";
import { stateFromFragment, str } from "./shared.js";

export const KIMI_TOOL_ID = "kimi";

type TomlRecord = Record<string, unknown>;

function record(value: unknown): TomlRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as TomlRecord
    : undefined;
}

export function createKimiAdapter(ctx: AdapterContext): Adapter {
  const configPath = `${ctx.homeDir}/.kimi/config.toml`;

  async function readDoc(): Promise<TomlRecord | null> {
    if (!(await ctx.fs.exists(configPath))) return null;
    return parse(await ctx.fs.read(configPath)) as TomlRecord;
  }

  async function readFragment(): Promise<ConfigFragment | null> {
    const doc = await readDoc();
    const alias = str(doc?.default_model);
    const selected = alias ? record(record(doc?.models)?.[alias]) : undefined;
    const model = str(selected?.model);
    const providerId = str(selected?.provider);
    if (!model || !providerId) return null;
    const provider = record(record(doc?.providers)?.[providerId]);
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

  return {
    toolId: KIMI_TOOL_ID,
    toolName: "Kimi Code",
    configPath,
    readState,
    readFragment,
    async planChange() {
      throw new Error("Kimi Code 的环境凭据契约尚未验证，v1 不管理切换");
    },
    environmentSupport: {
      supported: false,
      reason: "Kimi Code 的凭据环境契约尚未验证；v1 仅识别现有配置",
    },
  };
}
