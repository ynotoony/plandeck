// input: adapters/hermes.ts + fixtures（YAML+SQLite）
// output: vitest 用例
// position: Hermes 适配器的测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { createHermesAdapter } from "../src/adapters/hermes.js";
import { emptyCatalog } from "../src/catalog.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import {
  hermesConfigPath,
  loadFixtureCatalog,
  makeHermes,
  makeTempHome,
  readHermesConfig,
} from "./helpers.js";

const catalog = loadFixtureCatalog();
const alibabaPlan = catalog.plans.find((p) => p.id === "alibaba-token-plan")!;
const deepseekPlan = catalog.plans.find((p) => p.id === "deepseek")!;

describe("hermes adapter readState（fixture = 本机真实 config.yaml 匿名化样本）", () => {
  it("matched：当前配置能对上 Catalog", async () => {
    const { adapter } = makeHermes("config.yaml", catalog);
    const state = await adapter.readState();
    expect(state.toolId).toBe("hermes");
    expect(state.status).toBe("matched");
    expect(state.plan).toBe("alibaba-token-plan");
    expect(state.defaultModel).toBe("qwen3.8-max");
    expect(state.baseUrl).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
    expect(state.projects).toEqual([]);
  });

  it("unknown：手改过的配置对不上任何 Plan", async () => {
    const { adapter } = makeHermes("config.hand-edited.yaml", catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unknown");
    expect(state.plan).toBeUndefined();
    expect(state.defaultModel).toBe("mystery-model-x");
  });

  it("unknown：Catalog 里没有对应条目", async () => {
    const { adapter } = makeHermes("config.yaml", emptyCatalog());
    const state = await adapter.readState();
    expect(state.status).toBe("unknown");
    expect(state.defaultModel).toBe("qwen3.8-max");
  });

  it("unset：配置里没有 model.default", async () => {
    const { adapter } = makeHermes("config.unset.yaml", catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unset");
    expect(state.defaultModel).toBeUndefined();
    expect(state.plan).toBeUndefined();
  });

  it("配置文件不存在时正常跳过而不是崩溃", async () => {
    const { adapter } = makeHermes(undefined, catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unset");
    expect(state.note).toBe("配置文件不存在");
    expect(state.projects).toEqual([]);
  });

  it("readFragment 返回 model 段片段（bootstrap 用）", async () => {
    const { adapter } = makeHermes("config.yaml", catalog);
    expect(await adapter.readFragment()).toEqual({
      model: "qwen3.8-max",
      providerId: "alibaba",
      baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    });
  });
});

describe("hermes adapter planChange", () => {
  it("产出预期新文件内容（model.default/provider/base_url），其余内容保留", async () => {
    const { adapter, home } = makeHermes("config.yaml", catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");

    expect(edits).toHaveLength(1);
    const edit = edits[0]!;
    expect(edit.path).toBe(hermesConfigPath(home));
    expect(edit.oldText).toBe(readHermesConfig(home));

    const doc = parse(edit.newText) as any;
    expect(doc.model.default).toBe("deepseek-v4-pro");
    expect(doc.model.provider).toBe("ds");
    expect(doc.model.base_url).toBe("https://api.deepseek.com");

    expect(doc.agent.max_turns).toBe(60);
    expect(doc.telegram.model).toBe("qwen3.7-max");
    expect(doc.custom_providers).toHaveLength(2);
    expect(doc._config_version).toBe(33);
  });

  it("plan 没有 providerId 时用名称 slug 兜底", async () => {
    const { adapter } = makeHermes("config.yaml", catalog);
    const edits = await adapter.planChange(
      { ...deepseekPlan, providerId: undefined, name: "DeepSeek 官方" },
      "deepseek-v4-flash",
    );
    const doc = parse(edits[0]!.newText) as any;
    expect(doc.model.provider).toBe("deepseek");
    expect(doc.model.default).toBe("deepseek-v4-flash");
  });

  it("plan 没有 baseUrl 时拒绝生成写入（避免写出对不上 Catalog 的配置）", async () => {
    const { adapter } = makeHermes("config.yaml", catalog);
    await expect(
      adapter.planChange({ ...deepseekPlan, baseUrl: undefined }, "deepseek-v4-pro"),
    ).rejects.toThrow(/baseUrl/);
  });

  it("目标文件不存在时也能产出完整新内容", async () => {
    const { adapter } = makeHermes(undefined, catalog);
    const edits = await adapter.planChange(alibabaPlan, "qwen3-max");
    const doc = parse(edits[0]!.newText) as any;
    expect(doc.model.default).toBe("qwen3-max");
    expect(doc.model.provider).toBe("alibaba");
    expect(edits[0]!.oldText).toBe("");
  });
});

describe("hermes adapter 边界", () => {
  it("homeDir 可注入（测试用临时 HOME，不碰真实配置）", () => {
    const home = makeTempHome();
    const adapter = createHermesAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog });
    expect(adapter.configPath).toBe(hermesConfigPath(home));
  });
});
