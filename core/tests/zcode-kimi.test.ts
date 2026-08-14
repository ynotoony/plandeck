import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseJson } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { applyFileEdits } from "../src/apply.js";
import { createKimiAdapter } from "../src/adapters/kimi.js";
import { createZcodeAdapter } from "../src/adapters/zcode.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import type { Catalog, Plan } from "../src/types.js";
import { makeTempHome } from "./helpers.js";

const plan: Plan = {
  id: "moonshot",
  name: "Moonshot",
  source: "config",
  providerId: "moonshot",
  baseUrl: "https://api.moonshot.ai/v1",
  key: "fixture-credential-kimi-0001",
  models: ["kimi-k2-thinking-turbo"],
};
const catalog: Catalog = { version: 1, plans: [plan] };

function write(home: string, path: string, text: string): void {
  const target = join(home, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

describe("ZCode adapter", () => {
  it("recognizes and switches provider configuration", async () => {
    const home = makeTempHome();
    write(home, ".zcode/v2/config.json", JSON.stringify({
      provider: { moonshot: { kind: "openai-compatible", options: { baseURL: plan.baseUrl, apiKey: plan.key }, models: { "kimi-k2-thinking-turbo": {} } } },
      model: "moonshot/kimi-k2-thinking-turbo",
      small_model: "moonshot/kimi-k2-thinking-turbo",
      permission: { mode: "build" },
    }));
    const adapter = createZcodeAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog });
    expect(await adapter.readState()).toMatchObject({ toolId: "zcode", status: "matched", plan: "moonshot", defaultModel: "kimi-k2-thinking-turbo" });

    await applyFileEdits(await adapter.planChange({ ...plan, providerId: "other" }, "kimi-k3"), nodeFs);
    const doc = parseJson(await nodeFs.read(`${home}/.zcode/v2/config.json`)) as any;
    expect(doc.model).toBe("other/kimi-k3");
    expect(doc.small_model).toBe("other/kimi-k3");
    expect(doc.provider.other.options.apiKey).toBe(plan.key);
    expect(doc.permission.mode).toBe("build");
  });
});

describe("Kimi adapter", () => {
  it("recognizes and switches provider configuration", async () => {
    const home = makeTempHome();
    write(home, ".kimi/config.toml", `default_model = "kimi"\ntelemetry = false\n\n[providers.moonshot]\ntype = "kimi"\nbase_url = "${plan.baseUrl}"\napi_key = "${plan.key}"\n\n[models.kimi]\nprovider = "moonshot"\nmodel = "kimi-k2-thinking-turbo"\nmax_context_size = 262144\n`);
    const adapter = createKimiAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog });
    expect(await adapter.readState()).toMatchObject({ toolId: "kimi", status: "matched", plan: "moonshot", defaultModel: "kimi-k2-thinking-turbo" });

    await applyFileEdits(await adapter.planChange(plan, "kimi-k3"), nodeFs);
    const doc = parseToml(await nodeFs.read(`${home}/.kimi/config.toml`)) as any;
    expect(doc.default_model).toBe("moonshot/kimi-k3");
    expect(doc.models["moonshot/kimi-k3"]).toMatchObject({ provider: "moonshot", model: "kimi-k3" });
    expect(doc.telemetry).toBe(false);
  });
});
