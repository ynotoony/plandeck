// input: views.ts
// output: vitest 用例
// position: 托盘/Cascade/Plan 行推导的测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { describe, expect, it } from "vitest";
import { withEnvPlans } from "../src/env.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import { createAdapters } from "../src/registry.js";
import type { ToolState } from "../src/types.js";
import {
  deriveDefaultRows,
  derivePlanRows,
  deriveTrayMenu,
  parseTrayAction,
} from "../src/views.js";
import {
  MINIMAX_ENV_KEY,
  MINIMAX_ENV_VAR,
  installHermesFixture,
  installToolFixture,
  loadFixtureCatalog,
  makeTempHome,
} from "./helpers.js";

const catalog = loadFixtureCatalog();

const tools: ToolState[] = [
  {
    toolId: "hermes",
    status: "matched",
    defaultModel: "qwen3.8-max",
    plan: "alibaba-token-plan",
    baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    projects: [],
  },
  {
    toolId: "opencode",
    status: "unset",
    projects: [],
  },
  {
    toolId: "codex",
    status: "unknown",
    defaultModel: "mystery-model-x",
    baseUrl: "https://rogue.example.com/v1",
    projects: [],
  },
  {
    toolId: "claude",
    status: "oauth",
    defaultModel: "sonnet",
    plan: "claude-max",
    projects: [],
  },
];

describe("视图推导（纯函数）", () => {
  it("默认模型 tab 行：四态工具都有一行，plan id 解析为显示名", () => {
    const rows = deriveDefaultRows(tools, catalog);
    expect(rows).toEqual([
      {
        toolId: "hermes",
        status: "matched",
        defaultModel: "qwen3.8-max",
        plan: "Alibaba Token Plan",
      },
      { toolId: "opencode", status: "unset", defaultModel: undefined, plan: undefined },
      { toolId: "codex", status: "unknown", defaultModel: "mystery-model-x", plan: undefined },
      { toolId: "claude", status: "oauth", defaultModel: "sonnet", plan: "Claude Max" },
    ]);
  });

  it("ToolState.plan 不在 Catalog 里时原样透传", () => {
    const rows = deriveDefaultRows(
      [{ toolId: "x", status: "unknown", plan: "wild-plan", projects: [] }],
      catalog,
    );
    expect(rows[0]!.plan).toBe("wild-plan");
  });

  it("Plan 清单行：含 usedBy 反向映射（当前被谁用），按 plan id 关联", () => {
    const rows = derivePlanRows(tools, catalog);
    expect(rows.map((r) => [r.plan.name, r.usedBy])).toEqual([
      ["Alibaba Token Plan", ["hermes"]],
      ["DeepSeek 官方", []],
      ["Claude Max", ["claude"]],
    ]);
  });

  it("空输入不崩溃", () => {
    expect(deriveDefaultRows([], catalog)).toEqual([]);
    expect(derivePlanRows([], catalog)).toHaveLength(catalog.plans.length);
    expect(derivePlanRows(tools, { version: 1, plans: [] })).toEqual([]);
  });
});

describe("Plan 清单展示字段（来源 / 凭证指纹）", () => {
  it("config 型：来源标 config + 路径，只显示指纹", () => {
    const row = derivePlanRows(tools, catalog).find(
      (r) => r.plan.id === "alibaba-token-plan",
    )!;
    expect(row.sourceLabel).toBe("config · ~/.hermes/config.yaml");
    expect(row.credential).toBe("已设置 · 1132b888218a");
    expect(row.plan).not.toHaveProperty("key");
  });

  it("oauth 型：来源标 OAuth，凭证为登录会话", () => {
    const row = derivePlanRows(tools, catalog).find((r) => r.plan.id === "claude-max")!;
    expect(row.sourceLabel).toBe("OAuth");
    expect(row.credential).toBe("登录会话");
  });

  it("env 型：来源标 env + 变量名，凭证只显示指纹", async () => {
    const merged = await withEnvPlans(catalog, { [MINIMAX_ENV_VAR]: MINIMAX_ENV_KEY });
    const row = derivePlanRows(tools, merged).find((r) => r.plan.id === "env-minimax")!;
    expect(row.sourceLabel).toBe(`env · ${MINIMAX_ENV_VAR}`);
    expect(row.credential).toBe("已设置 · c74e7eefe77f");
  });

  it("无 sourceDetail 时只展示来源类型，不残留分隔符", () => {
    const rows = derivePlanRows([], {
      version: 1,
      plans: [
        { id: "x", name: "X", source: "config", models: [] },
        { id: "y", name: "Y", source: "oauth", models: [] },
      ],
    });
    expect(rows[0]!.sourceLabel).toBe("config");
    expect(rows[1]!.sourceLabel).toBe("OAuth");
    expect(rows[0]!.credential).toBe("—");
  });
});

describe("usedBy 反向映射随现状变化", () => {
  it("env plan 被某工具引用时出现在 usedBy", async () => {
    const merged = await withEnvPlans(catalog, { [MINIMAX_ENV_VAR]: MINIMAX_ENV_KEY });
    const using: ToolState[] = [
      ...tools,
      { toolId: "openclaw", status: "matched", defaultModel: "MiniMax-M2.5", plan: "env-minimax", projects: [] },
    ];
    const row = derivePlanRows(using, merged).find((r) => r.plan.id === "env-minimax")!;
    expect(row.usedBy).toEqual(["openclaw"]);
  });

  it("切换后 usedBy 随之变化：原工具移出、新工具移入", () => {
    const before = derivePlanRows(tools, catalog).find(
      (r) => r.plan.id === "alibaba-token-plan",
    )!;
    expect(before.usedBy).toEqual(["hermes"]);

    const switched: ToolState[] = tools.map((t) =>
      t.toolId === "hermes"
        ? { ...t, status: "matched", defaultModel: "deepseek-v4-flash", plan: "deepseek" }
        : t,
    );
    const after = derivePlanRows(switched, catalog);
    expect(after.find((r) => r.plan.id === "alibaba-token-plan")!.usedBy).toEqual([]);
    expect(after.find((r) => r.plan.id === "deepseek")!.usedBy).toEqual(["hermes"]);
  });

  it("多工具共用同一 Plan 时 usedBy 全列出", () => {
    const shared: ToolState[] = [
      { toolId: "hermes", status: "matched", plan: "deepseek", projects: [] },
      { toolId: "opencode", status: "matched", plan: "deepseek", projects: [] },
    ];
    const row = derivePlanRows(shared, catalog).find((r) => r.plan.id === "deepseek")!;
    expect(row.usedBy).toEqual(["hermes", "opencode"]);
  });
});

describe("托盘菜单推导（默认模型视图的菜单形态）", () => {
  const toolNames = {
    hermes: "Hermes",
    opencode: "opencode",
    codex: "Codex CLI",
    claude: "Claude Code",
  };

  it("顶层一行一个工具：工具名 + 当前默认模型 + 状态标记（四态）", () => {
    const menu = deriveTrayMenu(tools, catalog, toolNames);
    expect(menu.map((m) => m.label)).toEqual([
      "Hermes · qwen3.8-max（已识别）",
      "opencode · 未设默认",
      "Codex CLI · mystery-model-x（未识别）",
      "Claude Code · OAuth 登录",
    ]);
  });

  it("工具子菜单按 Plan 分组，Plan 子菜单列出模型且当前项勾选", () => {
    const menu = deriveTrayMenu(tools, catalog, toolNames);
    const hermes = menu.find((m) => m.toolId === "hermes")!;
    expect(hermes.plans.map((plan) => [plan.label, plan.enabled])).toEqual([
      ["Alibaba Token Plan", true],
      ["DeepSeek 官方", true],
      ["Claude Max（OAuth 登录）", false],
    ]);
    expect(hermes.plans[0]!.items.map((item) => [item.label, item.enabled, item.checked])).toEqual([
      ["qwen3.8-max", true, true],
      ["qwen3-max", true, false],
      ["qwen-plus", true, false],
    ]);
  });

  it("OAuth 项置灰；OAuth Tool 仍可切到非 OAuth Plan", () => {
    const menu = deriveTrayMenu(tools, catalog, toolNames);
    const claude = menu.find((m) => m.toolId === "claude")!;
    expect(claude.plans.map((plan) => [plan.label, plan.enabled])).toEqual([
      ["Alibaba Token Plan", true],
      ["DeepSeek 官方", true],
      ["Claude Max（OAuth 登录）", false],
    ]);
  });

  it("切换项 id 编码 tool/plan/model，可被 parseTrayAction 还原", () => {
    const menu = deriveTrayMenu(tools, catalog, toolNames);
    const hermes = menu.find((m) => m.toolId === "hermes")!;
    const target = hermes.plans.find((plan) => plan.label === "DeepSeek 官方")!.items.find((item) => item.label === "deepseek-v4-pro")!;
    expect(parseTrayAction(target.id)).toEqual({
      toolId: "hermes",
      planId: "deepseek",
      model: "deepseek-v4-pro",
    });
    expect(parseTrayAction("oauth:claude")).toBeNull();
    expect(parseTrayAction("switch:hermes")).toBeNull();
  });

  it("未识别工具没有勾选项（配置对不上任何 Plan）", () => {
    const menu = deriveTrayMenu(tools, catalog, toolNames);
    const codex = menu.find((m) => m.toolId === "codex")!;
    expect(codex.plans.some((plan) => plan.items.some((item) => item.checked))).toBe(false);
  });
});

describe("默认模型表（7 个 Adapter 全量集成）", () => {
  it("显示全部 7 个工具，状态 badge 全对", async () => {
    const home = makeTempHome();
    installHermesFixture(home, "config.yaml");
    installToolFixture(home, "opencode", "opencode.json", ".config/opencode/opencode.json");
    installToolFixture(home, "opencode", "opencode.jsonc", ".config/opencode/opencode.jsonc");
    installToolFixture(home, "openclaw", "openclaw.json", ".openclaw/openclaw.json");
    installToolFixture(home, "codex", "config.toml", ".codex/config.toml");
    installToolFixture(home, "claude", "settings.oauth.json", ".claude/settings.json");

    const adapters = createAdapters({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog });
    expect(adapters.map((a) => a.toolId)).toEqual([
      "hermes",
      "opencode",
      "openclaw",
      "codex",
      "claude",
      "zcode",
      "kimi",
    ]);

    const states: ToolState[] = [];
    for (const adapter of adapters) states.push(await adapter.readState());

    expect(deriveDefaultRows(states, catalog)).toEqual([
      {
        toolId: "hermes",
        status: "matched",
        defaultModel: "qwen3.8-max",
        plan: "Alibaba Token Plan",
      },
      {
        toolId: "opencode",
        status: "matched",
        defaultModel: "qwen3.8-max",
        plan: "Alibaba Token Plan",
      },
      {
        toolId: "openclaw",
        status: "matched",
        defaultModel: "qwen3.8-max",
        plan: "Alibaba Token Plan",
      },
      {
        toolId: "codex",
        status: "matched",
        defaultModel: "qwen3.8-max",
        plan: "Alibaba Token Plan",
      },
      { toolId: "claude", status: "oauth", defaultModel: undefined, plan: undefined },
      { toolId: "zcode", status: "unset", defaultModel: undefined, plan: undefined },
      { toolId: "kimi", status: "unset", defaultModel: undefined, plan: undefined },
    ]);
  });

  it("Plan 清单行与 usedBy：来自真实配置文件的状态（含 env 并入）", async () => {
    const home = makeTempHome();
    installHermesFixture(home, "config.yaml");
    installToolFixture(home, "opencode", "opencode.json", ".config/opencode/opencode.json");
    installToolFixture(home, "opencode", "opencode.jsonc", ".config/opencode/opencode.jsonc");
    installToolFixture(home, "openclaw", "openclaw.json", ".openclaw/openclaw.json");
    installToolFixture(home, "codex", "config.toml", ".codex/config.toml");
    installToolFixture(home, "claude", "settings.oauth.json", ".claude/settings.json");

    const merged = await withEnvPlans(catalog, { [MINIMAX_ENV_VAR]: MINIMAX_ENV_KEY });
    const adapters = createAdapters({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog: merged });
    const states: ToolState[] = [];
    for (const adapter of adapters) states.push(await adapter.readState());

    const rows = derivePlanRows(states, merged);
    expect(rows.map((r) => [r.plan.name, r.usedBy])).toEqual([
      ["Alibaba Token Plan", ["hermes", "opencode", "openclaw", "codex"]],
      ["DeepSeek 官方", []],
      ["Claude Max", []],
      ["MINIMAX", []],
    ]);
    expect(rows[0]!.credential).toBe("已设置 · 1132b888218a");
    expect(rows[3]!.sourceLabel).toBe(`env · ${MINIMAX_ENV_VAR}`);
  });
});
