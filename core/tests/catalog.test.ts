import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptyCatalog,
  loadCatalog,
  newPlanId,
  removePlan,
  saveCatalog,
  upsertPlan,
} from "../src/catalog.js";
import { nodeFs } from "../src/node-fs.js";
import type { Plan } from "../src/types.js";
import { loadFixtureCatalog, makeTempHome, minimaxEnvPlan } from "./helpers.js";

const minimax: Plan = {
  ...minimaxEnvPlan,
  name: "MiniMax",
  models: ["MiniMax-M2.5-highspeed"],
  note: "只存在于环境变量",
};

describe("Catalog 存储", () => {
  it("读写 JSON round-trip", async () => {
    const home = makeTempHome();
    const file = join(home, "plandeck", "catalog.json");
    const catalog = loadFixtureCatalog();
    await saveCatalog(file, catalog, nodeFs);
    expect(await loadCatalog(file, nodeFs)).toEqual(catalog);
  });

  it("文件权限 600", async () => {
    const home = makeTempHome();
    const file = join(home, "plandeck", "catalog.json");
    await saveCatalog(file, emptyCatalog(), nodeFs);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("覆盖写入后权限仍为 600", async () => {
    const home = makeTempHome();
    const file = join(home, "plandeck", "catalog.json");
    await saveCatalog(file, emptyCatalog(), nodeFs);
    await saveCatalog(file, loadFixtureCatalog(), nodeFs);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("文件不存在时返回空 Catalog", async () => {
    const home = makeTempHome();
    expect(await loadCatalog(join(home, "nope.json"), nodeFs)).toEqual(emptyCatalog());
  });

  it("新建 Plan 保存后重读即时可见，权限仍为 600", async () => {
    const home = makeTempHome();
    const file = join(home, "plandeck", "catalog.json");
    const catalog = upsertPlan(loadFixtureCatalog(), minimax);
    await saveCatalog(file, catalog, nodeFs);
    const reloaded = await loadCatalog(file, nodeFs);
    expect(reloaded.plans.map((p) => p.id)).toContain("env-minimax");
    expect(reloaded.plans.find((p) => p.id === "env-minimax")).toEqual(minimax);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});

describe("Plan CRUD（纯函数）", () => {
  it("upsertPlan 新建追加在末尾", () => {
    const catalog = upsertPlan(loadFixtureCatalog(), minimax);
    expect(catalog.plans.map((p) => p.id)).toEqual([
      "alibaba-token-plan",
      "deepseek",
      "claude-max",
      "env-minimax",
    ]);
  });

  it("upsertPlan 编辑按 id 原位替换", () => {
    const catalog = loadFixtureCatalog();
    const edited = { ...minimax, id: "deepseek", name: "DeepSeek 官方（改）" };
    const next = upsertPlan(catalog, edited);
    expect(next.plans.map((p) => p.id)).toEqual(["alibaba-token-plan", "deepseek", "claude-max"]);
    expect(next.plans[1]!.name).toBe("DeepSeek 官方（改）");
  });

  it("upsertPlan 不修改原 Catalog（不可变）", () => {
    const catalog = loadFixtureCatalog();
    upsertPlan(catalog, minimax);
    expect(catalog.plans).toHaveLength(3);
  });

  it("removePlan 按 id 删除；id 不存在时原样返回", () => {
    const catalog = loadFixtureCatalog();
    expect(removePlan(catalog, "deepseek").plans.map((p) => p.id)).toEqual([
      "alibaba-token-plan",
      "claude-max",
    ]);
    expect(removePlan(catalog, "nope").plans).toHaveLength(3);
    expect(catalog.plans).toHaveLength(3);
  });

  it("newPlanId 由名称生成 slug，冲突时追加序号", () => {
    const catalog = loadFixtureCatalog();
    expect(newPlanId(catalog, "MiniMax")).toBe("minimax");
    expect(newPlanId(catalog, "DeepSeek 官方")).toBe("deepseek-2");
    expect(newPlanId(upsertPlan(catalog, minimax), "DeepSeek 官方")).toBe("deepseek-2");
    expect(newPlanId(catalog, "???")).toBe("plan");
  });
});
