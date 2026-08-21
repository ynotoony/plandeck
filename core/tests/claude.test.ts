// input: adapters/claude.ts + fixtures
// output: vitest 用例
// position: Claude Code 适配器的测试（含 OAuth/模型识别）
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { applyFileEdits } from "../src/apply.js";
import { createClaudeAdapter } from "../src/adapters/claude.js";
import { emptyCatalog } from "../src/catalog.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import { loadFixtureCatalog, makeClaude, makeTempHome, readHomeFile } from "./helpers.js";

const catalog = loadFixtureCatalog();
const deepseekPlan = catalog.plans.find((p) => p.id === "deepseek")!;

describe("claude adapter readState（fixture = 本机真实 settings.json 匿名化样本）", () => {
  it("matched：env 方式配置（ANTHROPIC_BASE_URL/AUTH_TOKEN/MODEL）", async () => {
    const { adapter } = makeClaude("settings.json", catalog);
    const state = await adapter.readState();
    expect(state.toolId).toBe("claude");
    expect(state.status).toBe("matched");
    expect(state.plan).toBe("alibaba-token-plan");
    expect(state.defaultModel).toBe("qwen3.8-max");
    expect(state.baseUrl).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
    expect(state.projects).toEqual([]);
  });

  it("oauth：无 env 配置（本机现状，OAuth 登录）", async () => {
    const { adapter } = makeClaude("settings.oauth.json", catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("oauth");
    expect(state.plan).toBeUndefined();
    expect(state.defaultModel).toBeUndefined();
    expect(state.projects).toEqual([]);
  });

  it("oauth：只设了 ANTHROPIC_MODEL 没有 BASE_URL 仍算 OAuth 登录", async () => {
    const { adapter } = makeClaude("settings.model-only.json", catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("oauth");
    expect(state.defaultModel).toBe("opus");
  });

  it("unknown：env 指向 Catalog 外的地址", async () => {
    const { adapter } = makeClaude("settings.json", emptyCatalog());
    const state = await adapter.readState();
    expect(state.status).toBe("unknown");
    expect(state.defaultModel).toBe("qwen3.8-max");
  });

  it("配置文件不存在时正常跳过而不是崩溃", async () => {
    const { adapter } = makeClaude(undefined, catalog);
    const state = await adapter.readState();
    expect(state.status).toBe("unset");
    expect(state.note).toBe("配置文件不存在");
    expect(state.projects).toEqual([]);
  });

  it("readFragment：env 有配置时返回片段，oauth 时返回 null", async () => {
    const { adapter } = makeClaude("settings.json", catalog);
    expect(await adapter.readFragment()).toEqual({
      model: "qwen3.8-max",
      baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      key: "fixture-credential-alpha-0001",
    });
    const { adapter: oauth } = makeClaude("settings.oauth.json", catalog);
    expect(await oauth.readFragment()).toBeNull();
  });
});

describe("claude adapter planChange（env 切换）", () => {
  it("产出预期新内容：不复制凭据，hooks 等无关字段保留", async () => {
    const { adapter, home } = makeClaude("settings.json", catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");

    expect(edits).toHaveLength(1);
    const edit = edits[0]!;
    expect(edit.path).toBe(`${home}/.claude/settings.json`);
    expect(edit.oldText).toBe(readHomeFile(home, ".claude/settings.json"));

    const doc = parse(edit.newText) as any;
    expect(doc.env.ANTHROPIC_BASE_URL).toBe("https://api.deepseek.com");
    expect(doc.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(doc.env.ANTHROPIC_MODEL).toBe("deepseek-v4-pro");
    expect(doc.hooks.Stop[0].hooks[0].command).toContain("notify.cjs --source=claude");
  });

  it("从 oauth 态切换：新增 env 块，其余保留", async () => {
    const { adapter } = makeClaude("settings.oauth.json", catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-flash");
    const doc = parse(edits[0]!.newText) as any;
    expect(doc.env.ANTHROPIC_BASE_URL).toBe("https://api.deepseek.com");
    expect(doc.env.ANTHROPIC_MODEL).toBe("deepseek-v4-flash");
    expect(doc.hooks.SessionEnd[0].hooks[0].command).toContain("notify.cjs");
  });

  it("plan 没有 key 时不写 ANTHROPIC_AUTH_TOKEN", async () => {
    const { adapter } = makeClaude("settings.oauth.json", catalog);
    const edits = await adapter.planChange(
      deepseekPlan,
      "deepseek-v4-pro",
    );
    const doc = parse(edits[0]!.newText) as any;
    expect(doc.env.ANTHROPIC_BASE_URL).toBe("https://api.deepseek.com");
    expect("ANTHROPIC_AUTH_TOKEN" in doc.env).toBe(false);
  });

  it("切到没有 key 的 plan 时清掉旧 provider 的 token（不串号）", async () => {
    const { adapter } = makeClaude("settings.json", catalog);
    const edits = await adapter.planChange(
      deepseekPlan,
      "deepseek-v4-pro",
    );
    const doc = parse(edits[0]!.newText) as any;
    expect(doc.env.ANTHROPIC_BASE_URL).toBe("https://api.deepseek.com");
    expect("ANTHROPIC_AUTH_TOKEN" in doc.env).toBe(false);
    expect("ANTHROPIC_API_KEY" in doc.env).toBe(false);
    expect(doc.env.ANTHROPIC_MODEL).toBe("deepseek-v4-pro");
  });

  it("plan 没有 baseUrl 时拒绝生成写入", async () => {
    const { adapter } = makeClaude("settings.json", catalog);
    await expect(
      adapter.planChange({ ...deepseekPlan, baseUrl: undefined }, "deepseek-v4-pro"),
    ).rejects.toThrow(/baseUrl/);
  });

  it("目标文件不存在时也能产出完整新内容", async () => {
    const { adapter } = makeClaude(undefined, catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");
    const edit = edits[0]!;
    expect(edit.oldText).toBe("");
    const doc = parse(edit.newText) as any;
    expect(doc.env.ANTHROPIC_MODEL).toBe("deepseek-v4-pro");
  });

  it("切换写入 → 重读为 matched（oauth → env）", async () => {
    const { adapter } = makeClaude("settings.oauth.json", catalog);
    expect((await adapter.readState()).status).toBe("oauth");
    await applyFileEdits(await adapter.planChange(deepseekPlan, "deepseek-v4-pro"), nodeFs);
    const after = await adapter.readState();
    expect(after.status).toBe("matched");
    expect(after.plan).toBe("deepseek");
    expect(after.defaultModel).toBe("deepseek-v4-pro");
  });
});

describe("claude adapter 边界", () => {
  it("homeDir 可注入（测试用临时 HOME，不碰真实配置）", () => {
    const home = makeTempHome();
    const adapter = createClaudeAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog });
    expect(adapter.configPath).toBe(`${home}/.claude/settings.json`);
    expect(adapter.toolName).toBe("Claude Code");
  });
});
