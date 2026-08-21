// input: recognize/switch/apply + helpers
// output: vitest 用例
// position: 识别→切换→再识别回环的测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { chmodSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyFileEdits } from "../src/apply.js";
import { nodeFs } from "../src/node-fs.js";
import {
  loadFixtureCatalog,
  makeHermes,
  makeTempHome,
  readHermesConfig,
  writeHermesConfig,
} from "./helpers.js";

const catalog = loadFixtureCatalog();
const deepseekPlan = catalog.plans.find((p) => p.id === "deepseek")!;

describe("切换 round-trip（临时 HOME）", () => {
  it("切换写入 → 重读为 matched", async () => {
    const { adapter } = makeHermes("config.yaml", catalog);

    expect((await adapter.readState()).status).toBe("matched");

    await applyFileEdits(await adapter.planChange(deepseekPlan, "deepseek-v4-pro"), nodeFs);

    const after = await adapter.readState();
    expect(after.status).toBe("matched");
    expect(after.plan).toBe("deepseek");
    expect(after.defaultModel).toBe("deepseek-v4-pro");
  });

  it("手改配置 → 重读为 unknown（ccSwitch 的核心痛点）", async () => {
    const { adapter, home } = makeHermes("config.yaml", catalog);

    const tampered = readHermesConfig(home).replace(
      "  base_url: https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "  base_url: https://rogue.example.com/v1",
    );
    writeHermesConfig(home, tampered);

    const state = await adapter.readState();
    expect(state.status).toBe("unknown");
    expect(state.plan).toBeUndefined();
  });

  it("applyFileEdits 拒绝写入已被并发改动的文件", async () => {
    const { adapter, home } = makeHermes("config.yaml", catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");

    writeHermesConfig(home, readHermesConfig(home) + "\n# sneaky concurrent edit\n");

    await expect(applyFileEdits(edits, nodeFs)).rejects.toThrow(/changed on disk/);
  });
});

describe("applyFileEdits 边界", () => {
  it("oldText 为空时可创建新文件", async () => {
    const home = makeTempHome();
    const path = `${home}/new/dir/config.yaml`;
    await applyFileEdits([{ path, oldText: "", newText: "model: {}\n" }], nodeFs);
    expect(readFileSync(path, "utf8")).toBe("model: {}\n");
  });

  it("原子替换保留已有文件权限", async () => {
    const { adapter, home } = makeHermes("config.yaml", catalog);
    const path = home + "/.hermes/config.yaml";
    chmodSync(path, 0o600);

    await applyFileEdits(await adapter.planChange(deepseekPlan, "deepseek-v4-pro"), nodeFs);

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
