// input: smol-toml + shared；读 ~/.kimi/config.toml
// output: createKimiAdapter（detection-only，不做环境绑定）
// position: Kimi Code 只读检测适配器
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

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

  function activeConfig(doc: TomlRecord | null): {
    fragment: ConfigFragment;
    oauth: boolean;
  } | null {
    const alias = str(doc?.default_model);
    const selected = alias ? record(record(doc?.models)?.[alias]) : undefined;
    const model = str(selected?.model);
    const providerId = str(selected?.provider);
    if (!model || !providerId) return null;
    const provider = record(record(doc?.providers)?.[providerId]);
    return {
      fragment: {
        providerId,
        model,
        baseUrl: str(selected?.base_url) ?? str(provider?.base_url),
        key: str(provider?.api_key),
      },
      oauth: record(provider?.oauth) !== undefined,
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
