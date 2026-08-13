import { describe, expect, it } from "vitest";
import { bootstrapCatalog } from "../src/bootstrap.js";
import { emptyCatalog } from "../src/catalog.js";
import { createAdapters } from "../src/registry.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import { installHermesFixture, makeTempHome } from "./helpers.js";

describe("bootstrapCatalog（首启扫描的雏形）", () => {
  it("从当前配置生成初始 Catalog：能对上 → 重读为 matched", async () => {
    const home = makeTempHome();
    installHermesFixture(home);

    const seeded = await bootstrapCatalog(
      createAdapters({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog: emptyCatalog() }),
    );

    expect(seeded.plans).toHaveLength(1);
    const plan = seeded.plans[0]!;
    expect(plan.name).toBe("alibaba");
    expect(plan.source).toBe("config");
    expect(plan.providerId).toBe("alibaba");
    expect(plan.baseUrl).toBe(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    );
    expect(plan.models).toEqual(["qwen3.8-max"]);

    const [adapter] = createAdapters({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog: seeded });
    const state = await adapter!.readState();
    expect(state.status).toBe("matched");
    expect(state.plan).toBe(plan.id);
  });

  it("没有配置文件的工具不产出 Plan", async () => {
    const home = makeTempHome();
    const seeded = await bootstrapCatalog(
      createAdapters({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog: emptyCatalog() }),
    );
    expect(seeded.plans).toEqual([]);
  });
});
