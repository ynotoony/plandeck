import { parse } from "jsonc-parser";
import type { Adapter, AdapterContext, ConfigFragment, ToolState } from "../types.js";
import { splitProviderModel, stateFromFragment, str } from "./shared.js";

export const ZCODE_TOOL_ID = "zcode";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

export function createZcodeAdapter(ctx: AdapterContext): Adapter {
  const configPath = `${ctx.homeDir}/.zcode/v2/config.json`;

  async function readDoc(): Promise<JsonRecord | null> {
    if (!(await ctx.fs.exists(configPath))) return null;
    return (parse(await ctx.fs.read(configPath)) ?? {}) as JsonRecord;
  }

  async function readFragment(): Promise<ConfigFragment | null> {
    const doc = await readDoc();
    const selected = str(doc?.model) ?? str(record(doc?.model)?.main);
    const active = selected ? splitProviderModel(selected) : null;
    if (!active) return null;
    const provider = record(record(doc?.provider)?.[active.providerId]);
    const options = record(provider?.options);
    return {
      providerId: active.providerId,
      model: active.model,
      baseUrl: str(options?.baseURL),
      key: str(options?.apiKey),
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

  return {
    toolId: ZCODE_TOOL_ID,
    toolName: "ZCode",
    configPath,
    readState,
    readFragment,
    async planChange() {
      throw new Error("ZCode 的环境引用语法尚未通过契约测试，v1 不管理切换");
    },
    environmentSupport: {
      supported: false,
      reason: "ZCode 的环境引用语法尚未通过契约测试；v1 仅识别现有配置",
    },
  };
}
