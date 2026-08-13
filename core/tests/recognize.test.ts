import { describe, expect, it } from "vitest";
import { recognize } from "../src/recognize.js";
import { loadFixtureCatalog } from "./helpers.js";

const catalog = loadFixtureCatalog();

describe("recognize（配置片段 ↔ Catalog 归一化比对）", () => {
  it("base_url + model 对上 → matched，返回对应 Plan", async () => {
    const rec = await recognize(
      {
        baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        model: "qwen3.8-max",
      },
      catalog,
    );
    expect(rec.status).toBe("matched");
    expect(rec.plan?.name).toBe("Alibaba Token Plan");
  });

  it("归一化：忽略 scheme / 大小写 / 结尾斜杠", async () => {
    const rec = await recognize(
      { baseUrl: "HTTPS://API.DEEPSEEK.COM/", model: "deepseek-v4-pro" },
      catalog,
    );
    expect(rec.status).toBe("matched");
    expect(rec.plan?.id).toBe("deepseek");
  });

  it("归一化：Catalog 只存 host 也能对上带路径的配置 URL（双向）", async () => {
    const deepseek = catalog.plans.find((p) => p.id === "deepseek")!;
    const hostOnly = { version: 1 as const, plans: [{ ...deepseek, baseUrl: "api.deepseek.com" }] };
    const fullPath = { version: 1 as const, plans: [deepseek] };

    expect(
      (await recognize({ baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-pro" }, hostOnly)).status,
    ).toBe("matched");
    expect(
      (await recognize({ baseUrl: "api.deepseek.com", model: "deepseek-v4-pro" }, fullPath)).status,
    ).toBe("matched");
    expect(
      (await recognize({ baseUrl: "https://a.com/v1", model: "deepseek-v4-pro" }, hostOnly)).status,
    ).toBe("unknown");
  });

  it("model 不在 Plan 模型清单里 → unknown（手改过）", async () => {
    const rec = await recognize(
      {
        baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        model: "mystery-model-x",
      },
      catalog,
    );
    expect(rec.status).toBe("unknown");
    expect(rec.plan).toBeUndefined();
  });

  it("base_url 对不上任何 Plan → unknown", async () => {
    const rec = await recognize(
      { baseUrl: "https://rogue.example.com/v1", model: "qwen3.8-max" },
      catalog,
    );
    expect(rec.status).toBe("unknown");
  });

  it("没设默认模型 → unset", async () => {
    expect((await recognize({}, catalog)).status).toBe("unset");
    expect((await recognize({ baseUrl: "https://api.deepseek.com" }, catalog)).status).toBe("unset");
  });

  it("key 指纹对不上 → unknown", async () => {
    const rec = await recognize(
      { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-pro", key: "sk-other" },
      catalog,
    );
    expect(rec.status).toBe("unknown");
  });

  it("key 一致时仍为 matched", async () => {
    const rec = await recognize(
      {
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        key: "fixture-credential-beta-0002",
      },
      catalog,
    );
    expect(rec.status).toBe("matched");
  });

  it("OAuth 型 Plan 不参与配置比对", async () => {
    const rec = await recognize({ baseUrl: "claude.max", model: "sonnet" }, {
      version: 1,
      plans: [{ id: "c", name: "Claude Max", source: "oauth", baseUrl: "claude.max", models: ["sonnet"] }],
    });
    expect(rec.status).toBe("unknown");
  });
});
