// input: adapters/codex.ts + fixtures
// output: vitest 用例
// position: Codex 适配器与 TOML 编辑的测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { applyFileEdits } from "../src/apply.js";
import { createCodexAdapter } from "../src/adapters/codex.js";
import { emptyCatalog } from "../src/catalog.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import { loadFixtureCatalog, makeCodex, makeTempHome, readHomeFile } from "./helpers.js";

const catalog = loadFixtureCatalog();
const alibabaPlan = catalog.plans.find((p) => p.id === "alibaba-token-plan")!;
const deepseekPlan = catalog.plans.find((p) => p.id === "deepseek")!;

describe("codex adapter readState（fixture = 本机真实 config.toml 匿名化样本）", () => {
  it("matched：model + model_provider 能对上 Catalog", async () => {
    const { adapter } = makeCodex("config.toml", catalog);
    const state = await adapter.readState();
    expect(state.toolId).toBe("codex");
    expect(state.status).toBe("matched");
    expect(state.plan).toBe("alibaba-token-plan");
    expect(state.defaultModel).toBe("qwen3.8-max");
    expect(state.baseUrl).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
    expect(state.projects).toEqual([]);
  });

  it("unknown：provider 指向 Catalog 外（本机 uocode 现状）", async () => {
    const { adapter } = makeCodex("config.hand-edited.toml", catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unknown");
    expect(state.plan).toBeUndefined();
    expect(state.defaultModel).toBe("gpt-5.6-sol");
    expect(state.baseUrl).toBe("https://www.uocode.com/v1");
  });

  it("unknown：Catalog 为空", async () => {
    const { adapter } = makeCodex("config.toml", emptyCatalog());
    const state = await adapter.readState();
    expect(state.status).toBe("unknown");
  });

  it("unset：配置里没有 model 键", async () => {
    const { adapter } = makeCodex("config.unset.toml", catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unset");
    expect(state.defaultModel).toBeUndefined();
    expect(state.plan).toBeUndefined();
  });

  it("配置文件不存在时正常跳过而不是崩溃", async () => {
    const { adapter } = makeCodex(undefined, catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unset");
    expect(state.note).toBe("配置文件不存在");
    expect(state.projects).toEqual([]);
  });

  it("readFragment 返回顶层 model/model_provider + section 里的 base_url", async () => {
    const { adapter } = makeCodex("config.toml", catalog);
    expect(await adapter.readFragment()).toEqual({
      model: "qwen3.8-max",
      providerId: "alibaba",
      baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    });
  });
});

describe("codex adapter planChange（TOML 只改目标键）", () => {
  it("产出预期新内容：顶层 model/model_provider + 追加 provider section，其余逐字节保留", async () => {
    const { adapter, home } = makeCodex("config.toml", catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");

    expect(edits).toHaveLength(1);
    const edit = edits[0]!;
    expect(edit.path).toBe(`${home}/.codex/config.toml`);
    expect(edit.oldText).toBe(readHomeFile(home, ".codex/config.toml"));

    const doc = parse(edit.newText) as Record<string, any>;
    expect(doc.model).toBe("deepseek-v4-pro");
    expect(doc.model_provider).toBe("ds");
    expect(doc.model_reasoning_effort).toBe("high");
    expect(doc.disable_response_storage).toBe(true);
    expect(doc.model_providers.ds.base_url).toBe("https://api.deepseek.com");
    expect(doc.model_providers.alibaba.base_url).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
    expect(doc.mcp_servers.node_repl.startup_timeout_sec).toBe(120);
    expect(doc.desktop.localeOverride).toBe("zh-CN");
    expect(doc.features.js_repl).toBe(false);

    for (const line of edit.oldText.split("\n")) {
      if (line.startsWith("model =") || line.startsWith("model_provider =")) continue;
      expect(edit.newText).toContain(line);
    }
  });

  it("目标 section 已存在时只更新 base_url，不重复追加", async () => {
    const { adapter } = makeCodex("config.toml", catalog);
    const edits = await adapter.planChange(alibabaPlan, "qwen3-max");
    const edit = edits[0]!;
    const doc = parse(edit.newText) as Record<string, any>;
    expect(doc.model).toBe("qwen3-max");
    expect(doc.model_provider).toBe("alibaba");
    expect(doc.model_providers.alibaba.base_url).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
    expect(doc.model_providers.alibaba.wire_api).toBe("chat");
    expect(edit.newText.match(/\[model_providers\.alibaba\]/g)).toHaveLength(1);
    expect(edit.newText).toContain('name = "Alibaba Token Plan"');
  });

  it("plan 没有 baseUrl 时拒绝生成写入", async () => {
    const { adapter } = makeCodex("config.toml", catalog);
    await expect(
      adapter.planChange({ ...deepseekPlan, baseUrl: undefined }, "deepseek-v4-pro"),
    ).rejects.toThrow(/baseUrl/);
  });

  it("目标文件不存在时也能产出完整新内容", async () => {
    const { adapter } = makeCodex(undefined, catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-flash");
    const edit = edits[0]!;
    expect(edit.oldText).toBe("");
    const doc = parse(edit.newText) as Record<string, any>;
    expect(doc.model).toBe("deepseek-v4-flash");
    expect(doc.model_provider).toBe("ds");
    expect(doc.model_providers.ds.base_url).toBe("https://api.deepseek.com");
  });

  it("切换写入 → 重读为 matched", async () => {
    const { adapter } = makeCodex("config.toml", catalog);
    await applyFileEdits(await adapter.planChange(deepseekPlan, "deepseek-v4-pro"), nodeFs);
    const after = await adapter.readState();
    expect(after.status).toBe("matched");
    expect(after.plan).toBe("deepseek");
    expect(after.defaultModel).toBe("deepseek-v4-pro");
  });
});

describe("codex adapter 边界", () => {
  it("homeDir 可注入（测试用临时 HOME，不碰真实配置）", () => {
    const home = makeTempHome();
    const adapter = createCodexAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog });
    expect(adapter.configPath).toBe(`${home}/.codex/config.toml`);
    expect(adapter.toolName).toBe("Codex");
  });
});
