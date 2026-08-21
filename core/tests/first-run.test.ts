// input: ccswitch/bootstrap + helpers
// output: vitest 用例
// position: 首跑导入端到端流程的测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapCatalog, isFirstRun } from "../src/bootstrap.js";
import { emptyCatalog, loadCatalog, saveCatalog } from "../src/catalog.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import { firstRunSetupFromDb } from "../src/node-ccswitch.js";
import { createAdapters } from "../src/registry.js";
import {
  installHermesFixture,
  installToolFixture,
  loadCcSwitchFixtureRows,
  loadFixtureCatalog,
  makeCcSwitchDb,
  makeTempHome,
  OPENCODE_DIR_REL,
} from "./helpers.js";

function adaptersFor(home: string) {
  return createAdapters({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog: emptyCatalog() });
}

describe("isFirstRun（首启判定）", () => {
  it("空 Catalog → 首启，应出现引导", () => {
    expect(isFirstRun(emptyCatalog())).toBe(true);
  });

  it("非空 Catalog → 非首启，不弹引导", () => {
    expect(isFirstRun(loadFixtureCatalog())).toBe(false);
  });
});

describe("bootstrapCatalog（首启扫描）", () => {
  it("opencode 片段里的 apiKey 只以指纹入库", async () => {
    const home = makeTempHome();
    installToolFixture(home, "opencode", "opencode.with-model.json", join(OPENCODE_DIR_REL, "opencode.json"));
    const catalog = await bootstrapCatalog(adaptersFor(home));
    expect(catalog.plans).toHaveLength(1);
    expect(catalog.plans[0]!.credentialFingerprint).toBe("1132b888218a");
    expect(catalog.plans[0]).not.toHaveProperty("key");
  });

  it("只有 Claude OAuth 时也生成 OAuth Plan，不会重复触发首启", async () => {
    const home = makeTempHome();
    installToolFixture(home, "claude", "settings.oauth.json", ".claude/settings.json");
    const catalog = await bootstrapCatalog(adaptersFor(home));
    expect(catalog.plans).toMatchObject([
      {
        name: "Claude Code",
        source: "oauth",
        sourceDetail: `${home}/.claude/settings.json`,
      },
    ]);
    expect(isFirstRun(catalog)).toBe(false);
  });
});

describe("firstRunSetup（首启扫描 + ccSwitch 导入）", () => {
  it("扫描在用的 Plan，与 ccSwitch 历史配置去重合并，零录入可用", async () => {
    const home = makeTempHome();
    installHermesFixture(home);
    makeCcSwitchDb(home, loadCcSwitchFixtureRows());

    const result = await firstRunSetupFromDb({ adapters: adaptersFor(home), homeDir: home });

    expect(result.scanned).toHaveLength(1);

    const alibaba = result.catalog.plans.filter((p) => p.baseUrl?.includes("token-plan"));
    expect(alibaba).toHaveLength(1);
    expect(alibaba[0]!.credentialFingerprint).toBe("1132b888218a");
    expect(alibaba[0]!.models).toEqual(["qwen3.8-max", "qwen3-max", "qwen-plus"]);
    expect(alibaba[0]!.sourceDetail).toBe(`${home}/.hermes/config.yaml`);

    expect(result.added.map((p) => p.name)).toContain("My Codex");
    expect(result.merged).toHaveLength(2);
    expect(result.skipped).toBe(2);
    expect(isFirstRun(result.catalog)).toBe(false);

    const state = await createAdapters({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog: result.catalog })[0]!.readState();
    expect(state.status).toBe("matched");
  });

  it("没有 ccSwitch db 时只产出扫描结果", async () => {
    const home = makeTempHome();
    installHermesFixture(home);
    const result = await firstRunSetupFromDb({ adapters: adaptersFor(home), homeDir: home });
    expect(result.catalog.plans).toHaveLength(1);
    expect(result.added).toEqual([]);
    expect(result.merged).toEqual([]);
  });

  it("保存后再加载，Catalog 非空（下次启动不再触发引导）", async () => {
    const home = makeTempHome();
    installHermesFixture(home);
    const result = await firstRunSetupFromDb({ adapters: adaptersFor(home), homeDir: home });
    const file = join(home, "plandeck", "catalog.json");
    await saveCatalog(file, result.catalog, nodeFs);
    expect(isFirstRun(await loadCatalog(file, nodeFs))).toBe(false);
  });
});
