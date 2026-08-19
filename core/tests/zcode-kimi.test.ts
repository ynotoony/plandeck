import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createKimiAdapter } from "../src/adapters/kimi.js";
import { createZcodeAdapter } from "../src/adapters/zcode.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import type { Catalog } from "../src/types.js";
import { loadFixtureCatalog, makeTempHome } from "./helpers.js";

const catalog = loadFixtureCatalog();
const plan = catalog.plans[0]!;

function write(home: string, path: string, text: string): string {
  const target = join(home, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return target;
}

function context(homeDir: string, value: Catalog = catalog) {
  return { fs: nodeFs, sqlite: nodeSqlite, homeDir, catalog: value };
}

describe("unsupported environment adapters", () => {
  it("recognizes Kimi Code without offering a write path", async () => {
    const home = makeTempHome();
    const path = write(
      home,
      ".kimi/config.toml",
      `default_model = "active"\n[providers.current]\nbase_url = "${plan.baseUrl}"\napi_key = "fixture-credential-alpha-0001"\n[models.active]\nprovider = "current"\nmodel = "${plan.models[0]}"\n`,
    );
    const adapter = createKimiAdapter(context(home));

    expect(await adapter.readState()).toMatchObject({ toolId: "kimi", status: "matched" });
    expect(adapter.environmentSupport).toMatchObject({ supported: false });
    await expect(adapter.planChange(plan, plan.models[0]!)).rejects.toThrow(/v1 不管理切换/);
    expect(readFileSync(path, "utf8")).toContain("api_key");
  });

  it("recognizes ZCode without claiming opencode env compatibility", async () => {
    const home = makeTempHome();
    const path = write(
      home,
      ".zcode/v2/config.json",
      JSON.stringify({
        model: `current/${plan.models[0]}`,
        provider: { current: { options: { baseURL: plan.baseUrl, apiKey: "fixture-credential-alpha-0001" } } },
      }),
    );
    const adapter = createZcodeAdapter(context(home));

    expect(await adapter.readState()).toMatchObject({ toolId: "zcode", status: "matched" });
    expect(adapter.environmentSupport).toMatchObject({ supported: false });
    await expect(adapter.planChange(plan, plan.models[0]!)).rejects.toThrow(/v1 不管理切换/);
    expect(readFileSync(path, "utf8")).toContain("apiKey");
  });
});
