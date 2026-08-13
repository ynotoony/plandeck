import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitSwitch } from "../src/switch.js";
import { nodeFs } from "../src/node-fs.js";
import {
  hermesConfigPath,
  loadFixtureCatalog,
  makeHermes,
  readHermesConfig,
  writeHermesConfig,
} from "./helpers.js";

const catalog = loadFixtureCatalog();
const deepseekPlan = catalog.plans.find((p) => p.id === "deepseek")!;

function makeBackup(backupRoot: string) {
  const saved: string[] = [];
  return {
    saved,
    async backup(paths: string[]): Promise<string[]> {
      const { cpSync, mkdirSync } = await import("node:fs");
      const dir = join(backupRoot, "backups", `${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const out: string[] = [];
      for (const p of paths) {
        const dest = join(dir, p.split("/").pop()!);
        cpSync(p, dest);
        out.push(dest);
        saved.push(dest);
      }
      return out;
    },
  };
}

describe("commitSwitch（备份 → 原子写 → 重读）", () => {
  it("写入前备份原文件，写入后重读为 matched", async () => {
    const { adapter, home } = makeHermes("config.yaml", catalog);
    const original = readHermesConfig(home);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");
    const bk = makeBackup(mkdtempSync(join(tmpdir(), "plandeck-data-")));

    const { state, backups } = await commitSwitch(adapter, edits, nodeFs, bk.backup);

    expect(backups).toHaveLength(1);
    expect(readFileSync(backups[0]!, "utf8")).toBe(original);
    expect(readHermesConfig(home)).toBe(edits[0]!.newText);
    expect(state.status).toBe("matched");
    expect(state.plan).toBe("deepseek");
    expect(state.defaultModel).toBe("deepseek-v4-pro");
  });

  it("预览后文件被手改 → 拒绝写入，配置保持用户手改内容", async () => {
    const { adapter, home } = makeHermes("config.yaml", catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");

    const handEdited = readHermesConfig(home).replace(
      "default: qwen3.8-max",
      "default: hand-tuned-model",
    );
    writeHermesConfig(home, handEdited);

    const bk = makeBackup(mkdtempSync(join(tmpdir(), "plandeck-data-")));
    await expect(
      commitSwitch(adapter, edits, nodeFs, bk.backup),
    ).rejects.toThrow(/changed on disk/);

    expect(readHermesConfig(home)).toBe(handEdited);
    expect((await adapter.readState()).status).toBe("unknown");
  });

  it("配置文件不存在 → 不备份，直接创建，重读为 matched", async () => {
    const { adapter, home } = makeHermes(undefined, catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-flash");
    const bk = makeBackup(mkdtempSync(join(tmpdir(), "plandeck-data-")));

    const { state, backups } = await commitSwitch(adapter, edits, nodeFs, bk.backup);

    expect(backups).toHaveLength(0);
    expect(bk.saved).toHaveLength(0);
    expect(readFileSync(hermesConfigPath(home), "utf8")).toBe(edits[0]!.newText);
    expect(state.status).toBe("matched");
  });

  it("备份只收到真实存在的文件路径", async () => {
    const { adapter, home } = makeHermes("config.yaml", catalog);
    const edits = await adapter.planChange(deepseekPlan, "deepseek-v4-pro");
    const seen: string[][] = [];
    const backup = async (paths: string[]) => {
      seen.push(paths);
      return paths;
    };

    await commitSwitch(adapter, edits, nodeFs, backup);

    expect(seen).toEqual([[`${home}/.hermes/config.yaml`]]);
    expect(readdirSync(`${home}/.hermes`)).toContain("config.yaml");
  });
});
