// input: ccswitch.ts + helpers
// output: vitest 用例
// position: ccSwitch 导入与合并的测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { describe, expect, it } from "vitest";
import { emptyCatalog } from "../src/catalog.js";
import { importCcSwitchCatalog, type CcSwitchRow } from "../src/ccswitch.js";
import { ccSwitchDbPath, importCcSwitchDatabase, readCcSwitchRows } from "../src/node-ccswitch.js";
import type { Catalog } from "../src/types.js";
import {
  loadCcSwitchFixtureRows,
  makeCcSwitchDb,
  makeTempHome,
  type CcSwitchFixtureRow,
} from "./helpers.js";

const DB = "~/.cc-switch/cc-switch.db";
const KEY1 = "fixture-credential-alpha-0001";
const KEY2 = "fixture-credential-beta-0002";
const FP1 = "1132b888218a";
const FP2 = "ef111d9eab0e";

function toRow(id: string, appType: string): CcSwitchRow {
  const row = loadCcSwitchFixtureRows().find((r) => r.id === id && r.app_type === appType);
  if (!row) throw new Error(`fixture row not found: ${id}/${appType}`);
  return toCcSwitchRow(row);
}

function toCcSwitchRow(row: CcSwitchFixtureRow): CcSwitchRow {
  return {
    id: row.id,
    appType: row.app_type,
    name: row.name,
    settingsConfig: row.settings_config,
    notes: row.notes ?? undefined,
  };
}

describe("importCcSwitchCatalog（SQLite 导入）", () => {
  it("fixture 全量导入：重复项合并、official 行跳过、id 唯一", async () => {
    const home = makeTempHome();
    const dbPath = makeCcSwitchDb(home, loadCcSwitchFixtureRows());
    const result = await importCcSwitchDatabase({ dbPath, catalog: emptyCatalog() });

    expect(result.added).toHaveLength(6);
    expect(result.merged).toHaveLength(1);
    expect(result.skipped).toBe(2);
    expect(result.catalog.plans.map((p) => p.name).sort()).toEqual([
      "Alibaba Token Plan",
      "DeepSeek",
      "DeepSeek",
      "MiniMax M2.5 Highspeed",
      "My Codex",
      "Volcengine Agent Plan",
    ]);
    expect(new Set(result.catalog.plans.map((p) => p.id)).size).toBe(6);

    const deepseeks = result.catalog.plans.filter((p) => p.name === "DeepSeek");
    expect(deepseeks.map((p) => p.credentialFingerprint).sort()).toEqual([FP1, FP2]);
    expect(result.catalog.plans.find((p) => p.name === "DeepSeek" && p.credentialFingerprint === FP1)!.note).toBe(
      "公司报销",
    );
  });

  it("与现有 Catalog 去重：同 base_url+key 不产生两份", async () => {
    const home = makeTempHome();
    const dbPath = makeCcSwitchDb(home, loadCcSwitchFixtureRows());
    const existing: Catalog = {
      version: 1,
      plans: [
        {
          id: "my-ds",
          name: "我的 DeepSeek",
          source: "config",
          baseUrl: "https://api.deepseek.com",
          hasCredential: true,
          credentialFingerprint: FP1,
          models: ["deepseek-v3"],
        },
      ],
    };
    const result = await importCcSwitchDatabase({ dbPath, catalog: existing });

    const ds = result.catalog.plans.find((p) => p.id === "my-ds")!;
    expect(ds.name).toBe("我的 DeepSeek");
    expect(ds.models).toEqual(["deepseek-v3", "deepseek-v4-pro", "deepseek-v4-flash"]);
    expect(
      result.catalog.plans.filter((p) => p.credentialFingerprint === FP1 && p.baseUrl?.includes("api.deepseek.com")),
    ).toHaveLength(1);
  });

  it("db 不存在时返回空结果不抛错", async () => {
    const home = makeTempHome();
    const result = await importCcSwitchDatabase({
      dbPath: ccSwitchDbPath(home),
      catalog: emptyCatalog(),
    });
    expect(result.added).toEqual([]);
    expect(result.merged).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.catalog.plans).toEqual([]);
  });

  it("readCcSwitchRows 读全部行，notes 为 null 时转 undefined", () => {
    const home = makeTempHome();
    const dbPath = makeCcSwitchDb(home, loadCcSwitchFixtureRows());
    const rows = readCcSwitchRows(dbPath);
    expect(rows).toHaveLength(9);
    expect(rows.find((r) => r.id === "ds" && r.appType === "hermes")!.notes).toBe("公司报销");
    expect(rows.find((r) => r.id === "ds" && r.appType === "claude")!.notes).toBeUndefined();
  });

  it("同 host 不同路径、同 key 的独立 Plan 获得不同 id", async () => {
    const rows: CcSwitchRow[] = [
      {
        id: "a",
        appType: "hermes",
        name: "A",
        settingsConfig: JSON.stringify({ base_url: "https://relay.example.com/v1", api_key: KEY1 }),
      },
      {
        id: "b",
        appType: "hermes",
        name: "B",
        settingsConfig: JSON.stringify({ base_url: "https://relay.example.com/anthropic", api_key: KEY1 }),
      },
    ];
    const result = await importCcSwitchCatalog(rows, DB, emptyCatalog());
    expect(result.catalog.plans).toHaveLength(2);
    expect(new Set(result.catalog.plans.map((p) => p.id)).size).toBe(2);
  });

  it("标准/opencode/OpenClaw/Codex 四种行形态均从行输入解析到 Catalog", async () => {
    const rows = [
      toRow("ds", "hermes"),
      toRow("ccfor", "opencode"),
      toRow("minimax", "openclaw"),
      toRow("mycodex-1", "codex"),
    ];
    const result = await importCcSwitchCatalog(rows, DB, emptyCatalog());
    expect(result.catalog.plans).toHaveLength(4);
    expect(result.catalog.plans.find((p) => p.providerId === "ccfor")!.credentialFingerprint).toBe(FP2);
    expect(result.catalog.plans.find((p) => p.name === "MiniMax M2.5 Highspeed")!.credentialFingerprint).toBeUndefined();
    expect(result.catalog.plans.every((plan) => !("key" in plan))).toBe(true);
    expect(result.catalog.plans.find((p) => p.name === "My Codex")).toMatchObject({
      baseUrl: "https://www.uocode.com/v1",
      providerId: "custom",
      models: ["gpt-5.6-sol"],
    });
  });
});
