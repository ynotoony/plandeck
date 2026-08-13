import { describe, expect, it } from "vitest";
import { scanEnvPlans, withEnvPlans } from "../src/env.js";
import { recognize } from "../src/recognize.js";
import type { Catalog } from "../src/types.js";
import {
  MINIMAX_ENV_KEY,
  MINIMAX_ENV_VAR,
  loadFixtureCatalog,
  minimaxEnvPlan,
} from "./helpers.js";

describe("env 扫描", () => {
  it("发现 *_API_KEY 类变量并归入清单（来源标 env）", () => {
    const plans = scanEnvPlans({
      [MINIMAX_ENV_VAR]: MINIMAX_ENV_KEY,
      OPENAI_API_KEY: "a",
      DEEPSEEK_APIKEY: "b",
      CLAUDE_AUTH_TOKEN: "c",
      GEMINI_ACCESS_TOKEN: "d",
    });
    expect(plans.map((p) => [p.name, p.source, p.sourceDetail, p.key])).toEqual([
      ["CLAUDE", "env", "CLAUDE_AUTH_TOKEN", "c"],
      ["DEEPSEEK", "env", "DEEPSEEK_APIKEY", "b"],
      ["GEMINI", "env", "GEMINI_ACCESS_TOKEN", "d"],
      ["MINIMAX", "env", MINIMAX_ENV_VAR, MINIMAX_ENV_KEY],
      ["OPENAI", "env", "OPENAI_API_KEY", "a"],
    ]);
    expect(plans.every((p) => p.models.length === 0)).toBe(true);
    expect(plans[0]!.id).toBe("env-claude");
    expect(plans.find((p) => p.sourceDetail === MINIMAX_ENV_VAR)).toEqual(minimaxEnvPlan);
  });

  it("忽略不匹配的变量、空值与非凭证变量", () => {
    const plans = scanEnvPlans({
      PATH: "/usr/bin",
      HOME: "/Users/x",
      GITHUB_TOKEN: "ghp_x",
      ANTHROPIC_BASE_URL: "https://example.com",
      EMPTY_API_KEY: "",
      BLANK_API_KEY: "   ",
      [MINIMAX_ENV_VAR]: MINIMAX_ENV_KEY,
    });
    expect(plans.map((p) => p.sourceDetail)).toEqual([MINIMAX_ENV_VAR]);
  });

  it("同一 base 的多个变量（API_KEY / APIKEY）都保留，id 追加序号", () => {
    const plans = scanEnvPlans({
      FOO_API_KEY: "a",
      FOO_APIKEY: "b",
    });
    expect(plans.map((p) => [p.id, p.key])).toEqual([
      ["env-foo", "a"],
      ["env-foo-2", "b"],
    ]);
  });

  it("空 env 返回空清单", () => {
    expect(scanEnvPlans({})).toEqual([]);
  });
});

describe("env 清单并入 Catalog", () => {
  it("env Plan 以 key 匹配工具配置，不要求 base_url", async () => {
    const catalog = await withEnvPlans({ version: 1, plans: [] }, { [MINIMAX_ENV_VAR]: MINIMAX_ENV_KEY });
    await expect(recognize({ model: "MiniMax-M2.5", key: MINIMAX_ENV_KEY }, catalog)).resolves.toMatchObject({
      status: "matched",
      plan: { id: "env-minimax" },
    });
  });

  it("env plan 追加到 Catalog 之后，原有条目不变", async () => {
    const catalog = loadFixtureCatalog();
    const merged = await withEnvPlans(catalog, { [MINIMAX_ENV_VAR]: MINIMAX_ENV_KEY });
    expect(merged.plans.map((p) => p.id)).toEqual([
      "alibaba-token-plan",
      "deepseek",
      "claude-max",
      "env-minimax",
    ]);
    expect(catalog.plans).toHaveLength(3);
  });

  it("key 与已有 Plan 相同（指纹一致）时不重复收录", async () => {
    const catalog = loadFixtureCatalog();
    const merged = await withEnvPlans(catalog, {
      ALIBABA_API_KEY: "fixture-credential-alpha-0001",
      [MINIMAX_ENV_VAR]: MINIMAX_ENV_KEY,
    });
    expect(merged.plans.map((p) => p.id)).toEqual([
      "alibaba-token-plan",
      "deepseek",
      "claude-max",
      "env-minimax",
    ]);
  });

  it("id 冲突时不覆盖已有 Plan", async () => {
    const catalog: Catalog = {
      version: 1,
      plans: [{ id: "env-minimax", name: "手工 MiniMax", source: "config", models: [] }],
    };
    const merged = await withEnvPlans(catalog, { [MINIMAX_ENV_VAR]: MINIMAX_ENV_KEY });
    expect(merged.plans).toEqual(catalog.plans);
  });

  it("两个 env 变量 key 相同时只收录一个", async () => {
    const merged = await withEnvPlans(
      { version: 1, plans: [] },
      { A_API_KEY: "same-key", B_API_KEY: "same-key" },
    );
    expect(merged.plans.map((p) => p.id)).toEqual(["env-a"]);
  });

  it("同一 base 且 key 相同的两个变量只收录一个", async () => {
    const merged = await withEnvPlans(
      { version: 1, plans: [] },
      { FOO_API_KEY: "same-key", FOO_APIKEY: "same-key" },
    );
    expect(merged.plans.map((p) => p.id)).toEqual(["env-foo"]);
  });

  it("并入后的 env plan 保留完整 key（打码与切换的前提）", async () => {
    const merged = await withEnvPlans({ version: 1, plans: [] }, {
      [MINIMAX_ENV_VAR]: MINIMAX_ENV_KEY,
    });
    const plan = merged.plans.find((p) => p.id === "env-minimax");
    expect(plan?.key).toBe(MINIMAX_ENV_KEY);
    expect(plan?.source).toBe("env");
  });
});
