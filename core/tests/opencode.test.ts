import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { applyFileEdits } from "../src/apply.js";
import { createOpencodeAdapter } from "../src/adapters/opencode.js";
import { emptyCatalog } from "../src/catalog.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import {
  FIXTURES,
  OPENCODE_DIR_REL,
  loadFixtureCatalog,
  makeOpencode,
  makeTempHome,
  readHomeFile,
} from "./helpers.js";

const catalog = loadFixtureCatalog();
const alibabaPlan = catalog.plans.find((p) => p.id === "alibaba-token-plan")!;
const deepseekPlan = catalog.plans.find((p) => p.id === "deepseek")!;

describe("opencode adapter readState（fixture = 本机真实 opencode.json/jsonc 匿名化样本）", () => {
  it("matched：model 在 jsonc、provider 块在 json，合并后能对上 Catalog", async () => {
    const { adapter } = makeOpencode(["opencode.json", "opencode.jsonc"], catalog);
    const state = await adapter.readState();
    expect(state.toolId).toBe("opencode");
    expect(state.status).toBe("matched");
    expect(state.plan).toBe("alibaba-token-plan");
    expect(state.defaultModel).toBe("qwen3.8-max");
    expect(state.baseUrl).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
    expect(state.projects).toEqual([]);
  });

  it("matched：单个纯 json 文件也能读", async () => {
    const { adapter } = makeOpencode(["opencode.with-model.json"], catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("matched");
    expect(state.plan).toBe("alibaba-token-plan");
    expect(state.defaultModel).toBe("qwen3.8-max");
  });

  it("unknown：model 对不上 Catalog 里任何 Plan 的模型清单", async () => {
    const unknown = await makeOpencodeFromText(
      catalog,
      readFixtureText("opencode.with-model.json").replace("qwen3.8-max", "mystery-model-x"),
    );
    const state = await unknown.readState();
    expect(state.status).toBe("unknown");
    expect(state.defaultModel).toBe("mystery-model-x");
    expect(state.plan).toBeUndefined();
  });

  it("unknown：Catalog 为空时已设模型也算未识别", async () => {
    const { adapter } = makeOpencode(["opencode.json", "opencode.jsonc"], emptyCatalog());
    const state = await adapter.readState();
    expect(state.status).toBe("unknown");
    expect(state.defaultModel).toBe("qwen3.8-max");
  });

  it("unset：配置文件存在但没有 model 键", async () => {
    const { adapter } = makeOpencode(["opencode.unset.json"], catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unset");
    expect(state.defaultModel).toBeUndefined();
    expect(state.plan).toBeUndefined();
  });

  it("配置文件不存在时正常跳过而不是崩溃", async () => {
    const { adapter } = makeOpencode(undefined, catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unset");
    expect(state.note).toBe("配置文件不存在");
    expect(state.projects).toEqual([]);
  });

  it("readFragment 返回 provider/model 拆分结果（bootstrap 用）", async () => {
    const { adapter } = makeOpencode(["opencode.json", "opencode.jsonc"], catalog);
    expect(await adapter.readFragment()).toEqual({
      model: "qwen3.8-max",
      providerId: "alibaba",
      baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      key: "fixture-credential-alpha-0001",
    });
  });
});

describe("opencode adapter planChange", () => {
  it("产出预期新内容（model + provider 块），注释与无关字段保留", async () => {
    const { adapter, home } = makeOpencode(["opencode.json", "opencode.jsonc"], catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");

    expect(edits).toHaveLength(1);
    const edit = edits[0]!;
    expect(edit.path).toBe(`${home}/${OPENCODE_DIR_REL}/opencode.jsonc`);
    expect(edit.oldText).toBe(readHomeFile(home, `${OPENCODE_DIR_REL}/opencode.jsonc`));

    const doc = parse(edit.newText) as any;
    expect(doc.model).toBe("ds/deepseek-v4-pro");
    expect(doc.provider.ds.options.baseURL).toBe("https://api.deepseek.com");
    expect(doc.provider.ds.options.apiKey).toBeUndefined();
    expect(doc.provider.ds.models["deepseek-v4-pro"]).toEqual({});

    expect(edit.newText).toContain("// 本机默认模型");
    expect(edit.newText).toContain("// provider/model 格式");
    expect(doc.$schema).toBe("https://opencode.ai/config.json");
  });

  it("model 在 json 里时写入 json，无关字段保留", async () => {
    const { adapter, home } = makeOpencode(["opencode.with-model.json"], catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-flash");
    const edit = edits[0]!;
    expect(edit.path).toBe(`${home}/${OPENCODE_DIR_REL}/opencode.json`);

    const doc = parse(edit.newText) as any;
    expect(doc.model).toBe("ds/deepseek-v4-flash");
    expect(doc.provider.ds.options.baseURL).toBe("https://api.deepseek.com");
    expect(doc.theme).toBe("dark");
    expect(doc.provider.alibaba.options.baseURL).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
  });

  it("plan 没有 key 时不写 apiKey", async () => {
    const { adapter } = makeOpencode(["opencode.with-model.json"], catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");
    const doc = parse(edits[0]!.newText) as any;
    expect(doc.provider.ds.options.baseURL).toBe("https://api.deepseek.com");
    expect("apiKey" in doc.provider.ds.options).toBe(false);
  });

  it("plan 没有 baseUrl 时拒绝生成写入", async () => {
    const { adapter } = makeOpencode(["opencode.with-model.json"], catalog);
    await expect(
      adapter.planChange({ ...deepseekPlan, baseUrl: undefined }, "deepseek-v4-pro"),
    ).rejects.toThrow(/baseUrl/);
  });

  it("目标文件不存在时创建 opencode.json", async () => {
    const { adapter, home } = makeOpencode(undefined, catalog);
    const edits = await adapter.planChange(alibabaPlan, "qwen3-max");
    const edit = edits[0]!;
    expect(edit.path).toBe(`${home}/${OPENCODE_DIR_REL}/opencode.json`);
    expect(edit.oldText).toBe("");
    const doc = parse(edit.newText) as any;
    expect(doc.model).toBe("alibaba/qwen3-max");
    expect(doc.provider.alibaba.options.baseURL).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
  });

  it("切换写入 → 重读为 matched", async () => {
    const { adapter } = makeOpencode(["opencode.json", "opencode.jsonc"], catalog);
    await applyFileEdits(await adapter.planChange(deepseekPlan, "deepseek-v4-pro"), nodeFs);
    const after = await adapter.readState();
    expect(after.status).toBe("matched");
    expect(after.plan).toBe("deepseek");
    expect(after.defaultModel).toBe("deepseek-v4-pro");
  });
});

describe("opencode adapter 边界", () => {
  it("homeDir 可注入（测试用临时 HOME，不碰真实配置）", () => {
    const home = makeTempHome();
    const adapter = createOpencodeAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog });
    expect(adapter.configPath).toBe(`${home}/${OPENCODE_DIR_REL}/opencode.json`);
    expect(adapter.toolName).toBe("opencode");
  });

  it("两个文件都有 model 时 jsonc 优先：读与写一致", async () => {
    const home = makeTempHome();
    mkdirSync(`${home}/${OPENCODE_DIR_REL}`, { recursive: true });
    writeFileSync(
      `${home}/${OPENCODE_DIR_REL}/opencode.json`,
      JSON.stringify({ model: "relay/gpt-5.6-sol" }, null, 2) + "\n",
      "utf8",
    );
    writeFileSync(
      `${home}/${OPENCODE_DIR_REL}/opencode.jsonc`,
      '{\n  "model": "alibaba/qwen3.8-max",\n}\n',
      "utf8",
    );
    const adapter = createOpencodeAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog });

    const state = await adapter.readState();
    expect(state.defaultModel).toBe("qwen3.8-max");

    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");
    expect(edits[0]!.path).toBe(`${home}/${OPENCODE_DIR_REL}/opencode.jsonc`);
    expect((parse(edits[0]!.newText) as any).model).toBe("ds/deepseek-v4-pro");
  });
});

function readFixtureText(fixture: string): string {
  return readFileSync(join(FIXTURES, "opencode", fixture), "utf8");
}

async function makeOpencodeFromText(catalog2: typeof catalog, text: string) {
  const home = makeTempHome();
  mkdirSync(`${home}/${OPENCODE_DIR_REL}`, { recursive: true });
  writeFileSync(`${home}/${OPENCODE_DIR_REL}/opencode.json`, text, "utf8");
  return createOpencodeAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog: catalog2 });
}
