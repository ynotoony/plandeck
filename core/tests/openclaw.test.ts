// input: adapters/openclaw.ts + fixtures
// output: vitest 用例
// position: OpenClaw 适配器的测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { applyFileEdits } from "../src/apply.js";
import { createOpenclawAdapter } from "../src/adapters/openclaw.js";
import { emptyCatalog } from "../src/catalog.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import { loadFixtureCatalog, makeOpenclaw, makeTempHome, readHomeFile } from "./helpers.js";

const catalog = loadFixtureCatalog();
const alibabaPlan = catalog.plans.find((p) => p.id === "alibaba-token-plan")!;
const deepseekPlan = catalog.plans.find((p) => p.id === "deepseek")!;

describe("openclaw adapter readState（fixture = 本机真实 openclaw.json 匿名化样本）", () => {
  it("matched：agents.defaults.model.primary 能对上 Catalog", async () => {
    const { adapter } = makeOpenclaw("openclaw.json", catalog);
    const state = await adapter.readState();
    expect(state.toolId).toBe("openclaw");
    expect(state.status).toBe("matched");
    expect(state.plan).toBe("alibaba-token-plan");
    expect(state.defaultModel).toBe("qwen3.8-max");
    expect(state.baseUrl).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
    expect(state.projects).toEqual([]);
  });

  it("unknown：primary 指向 Catalog 外的 provider（本机 minimax 现状）", async () => {
    const { adapter } = makeOpenclaw("openclaw.unknown.json", catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unknown");
    expect(state.plan).toBeUndefined();
    expect(state.defaultModel).toBe("MiniMax-M2.5-highspeed");
    expect(state.baseUrl).toBe("https://api.minimax.io/anthropic");
  });

  it("unknown：Catalog 为空", async () => {
    const { adapter } = makeOpenclaw("openclaw.json", emptyCatalog());
    const state = await adapter.readState();
    expect(state.status).toBe("unknown");
  });

  it("unset：没有 agents.defaults.model.primary", async () => {
    const { adapter } = makeOpenclaw("openclaw.unset.json", catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unset");
    expect(state.defaultModel).toBeUndefined();
    expect(state.plan).toBeUndefined();
  });

  it("配置文件不存在时正常跳过而不是崩溃", async () => {
    const { adapter } = makeOpenclaw(undefined, catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unset");
    expect(state.note).toBe("配置文件不存在");
    expect(state.projects).toEqual([]);
  });

  it("readFragment 返回 primary 拆分 + models.providers 里的 baseUrl", async () => {
    const { adapter } = makeOpenclaw("openclaw.json", catalog);
    expect(await adapter.readFragment()).toEqual({
      model: "qwen3.8-max",
      providerId: "alibaba",
      baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    });
  });
});

describe("openclaw adapter planChange", () => {
  it("产出预期新内容（primary + models.providers + auth.profiles），无关字段保留", async () => {
    const { adapter, home } = makeOpenclaw("openclaw.json", catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");

    expect(edits).toHaveLength(1);
    const edit = edits[0]!;
    expect(edit.path).toBe(`${home}/.openclaw/openclaw.json`);
    expect(edit.oldText).toBe(readHomeFile(home, ".openclaw/openclaw.json"));

    const doc = parse(edit.newText) as any;
    expect(doc.agents.defaults.model.primary).toBe("ds/deepseek-v4-pro");
    expect(doc.models.providers.ds.baseUrl).toBe("https://api.deepseek.com");
    expect(doc.auth.profiles["ds:default"]).toEqual({ provider: "ds", mode: "api_key" });

    expect(doc.meta.lastTouchedVersion).toBe("2026.6.11");
    expect(doc.agents.defaults.model.fallbacks).toEqual(["openrouter/auto"]);
    expect(doc.agents.defaults.workspace).toBe("/Users/placeholder/.openclaw/workspace");
    expect(doc.channels.telegram.botToken).toBe(
      "fixture-telegram-credential",
    );
    expect(doc.gateway.port).toBe(18789);
    expect(doc.models.providers.alibaba.baseUrl).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
    expect(doc.skills.entries.obsidian.enabled).toBe(false);
  });

  it("已存在的 auth profile 保持原样不重写", async () => {
    const { adapter } = makeOpenclaw("openclaw.json", catalog);
    const edits = await adapter.planChange(alibabaPlan, "qwen3-max");
    const edit = edits[0]!;
    const doc = parse(edit.newText) as any;
    expect(doc.agents.defaults.model.primary).toBe("alibaba/qwen3-max");
    expect(edit.newText).toContain(
      '"alibaba:default": {\n        "provider": "alibaba",\n        "mode": "api_key"\n      }',
    );
  });

  it("plan 没有 baseUrl 时拒绝生成写入", async () => {
    const { adapter } = makeOpenclaw("openclaw.json", catalog);
    await expect(
      adapter.planChange({ ...deepseekPlan, baseUrl: undefined }, "deepseek-v4-pro"),
    ).rejects.toThrow(/baseUrl/);
  });

  it("目标文件不存在时也能产出完整新内容", async () => {
    const { adapter } = makeOpenclaw(undefined, catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-flash");
    const edit = edits[0]!;
    expect(edit.oldText).toBe("");
    const doc = parse(edit.newText) as any;
    expect(doc.agents.defaults.model.primary).toBe("ds/deepseek-v4-flash");
    expect(doc.models.providers.ds.baseUrl).toBe("https://api.deepseek.com");
    expect(doc.auth.profiles["ds:default"]).toEqual({ provider: "ds", mode: "api_key" });
  });

  it("切换写入 → 重读为 matched", async () => {
    const { adapter } = makeOpenclaw("openclaw.json", catalog);
    await applyFileEdits(await adapter.planChange(deepseekPlan, "deepseek-v4-pro"), nodeFs);
    const after = await adapter.readState();
    expect(after.status).toBe("matched");
    expect(after.plan).toBe("deepseek");
    expect(after.defaultModel).toBe("deepseek-v4-pro");
  });
});

describe("openclaw adapter 边界", () => {
  it("homeDir 可注入（测试用临时 HOME，不碰真实配置）", () => {
    const home = makeTempHome();
    const adapter = createOpenclawAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog });
    expect(adapter.configPath).toBe(`${home}/.openclaw/openclaw.json`);
    expect(adapter.toolName).toBe("OpenClaw");
  });
});
