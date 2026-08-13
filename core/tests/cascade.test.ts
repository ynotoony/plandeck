import { describe, expect, it } from "vitest";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import { createAdapters } from "../src/registry.js";
import type { ToolState } from "../src/types.js";
import { deriveCascadeRows } from "../src/views.js";
import {
  installClaudeTranscripts,
  installCodexSessions,
  installHermesCascadeFixtures,
  installHermesFixture,
  installOpenclawSessions,
  installOpencodeSessions,
  installToolFixture,
  loadFixtureCatalog,
  makeTempHome,
} from "./helpers.js";

const catalog = loadFixtureCatalog();

function installCascadeFixtures(home: string): void {
  installHermesFixture(home);
  installHermesCascadeFixtures(home);
  installToolFixture(home, "opencode", "opencode.json", ".config/opencode/opencode.json");
  installToolFixture(home, "opencode", "opencode.jsonc", ".config/opencode/opencode.jsonc");
  installOpencodeSessions(home);
  installToolFixture(home, "openclaw", "openclaw.json", ".openclaw/openclaw.json");
  installOpenclawSessions(home);
  installToolFixture(home, "codex", "config.toml", ".codex/config.toml");
  installCodexSessions(home);
  installToolFixture(home, "claude", "settings.oauth.json", ".claude/settings.json");
  installClaudeTranscripts(home);
}

async function readAll(home: string): Promise<ToolState[]> {
  const adapters = createAdapters({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog });
  return Promise.all(adapters.map((adapter) => adapter.readState()));
}

describe("五个 Adapter 的 project/session 只读层", () => {
  it("按各自数据源返回 project/session，session 带模型、时间和 Recognition", async () => {
    const home = makeTempHome();
    installCascadeFixtures(home);
    const [hermes, opencode, openclaw, codex, claude] = await readAll(home);

    expect(hermes!.projects.map((p) => [p.name, p.sessions.map((s) => s.id)])).toEqual([
      ["研究", ["20260810_100000_aaa111"]],
      ["（未归属）", ["20260809_090000_bbb222"]],
      ["公司", []],
    ]);
    expect(hermes!.projects[0]!.sessions[0]).toEqual({
      id: "20260810_100000_aaa111",
      model: "qwen3.8-max",
      plan: "alibaba-token-plan",
      status: "matched",
      when: "2026-08-10T12:00:00.000000",
    });
    expect(hermes!.projects[1]!.sessions[0]!.status).toBe("unknown");

    expect(opencode!.projects.flatMap((p) => p.sessions).map((s) => [s.id, s.status])).toEqual([
      ["ses_gamma", "unset"],
      ["ses_beta", "unknown"],
      ["ses_alpha", "matched"],
    ]);
    expect(opencode!.projects.flatMap((p) => p.sessions).find((s) => s.id === "ses_alpha")?.plan)
      .toBe("alibaba-token-plan");

    expect(openclaw!.projects.flatMap((p) => p.sessions).map((s) => [s.model, s.status])).toEqual([
      ["qwen3.8-max", "matched"],
      ["google/gemini-3-flash-preview", "unknown"],
    ]);
    expect(openclaw!.projects[0]!.sessions[0]!.when).toBe("2026-08-12T00:25:00.000Z");

    expect(codex!.projects.flatMap((p) => p.sessions).map((s) => [s.model, s.status])).toEqual([
      ["gpt-5.6-sol", "unknown"],
      ["mystery-model-x", "unknown"],
      ["qwen3.8-max", "matched"],
    ]);
    expect(codex!.projects.find((p) => p.name === "demo")?.sessions).toHaveLength(2);
    expect(codex!.projects.find((p) => p.name === "（全局）")?.sessions).toHaveLength(1);

    expect(claude!.projects).toHaveLength(1);
    expect(claude!.projects[0]!.sessions[0]).toMatchObject({
      id: "ses_fixture001ffeAAAAAAAAAAAAAAAA",
      model: "",
      status: "unset",
      when: "2026-08-11T03:00:06.000Z",
    });
  });

  it("所有 project/session 数据源缺失时优雅返回空数组", async () => {
    const states = await readAll(makeTempHome());
    expect(states.map((state) => state.projects)).toEqual([[], [], [], [], []]);
  });
});

describe("现状（级联）视图推导", () => {
  it("平铺工具→project→session 三级行，解析 Plan 显示名并保留 unknown", async () => {
    const home = makeTempHome();
    installCascadeFixtures(home);
    const rows = deriveCascadeRows(await readAll(home), catalog);

    expect(rows.slice(0, 5)).toEqual([
      {
        level: 0,
        toolId: "hermes",
        label: "hermes",
        plan: "Alibaba Token Plan",
        model: "qwen3.8-max",
        status: "matched",
      },
      { level: 1, toolId: "hermes", label: "研究", path: "/Users/placeholder/SideTrack" },
      {
        level: 2,
        toolId: "hermes",
        label: "20260810_100000_aaa111",
        plan: "Alibaba Token Plan",
        model: "qwen3.8-max",
        status: "matched",
        when: "2026-08-10T12:00:00.000000",
      },
      { level: 1, toolId: "hermes", label: "（未归属）", path: "" },
      {
        level: 2,
        toolId: "hermes",
        label: "20260809_090000_bbb222",
        plan: undefined,
        model: "mystery-model-x",
        status: "unknown",
        when: "2026-08-09T09:30:00.000000",
      },
    ]);

    expect(rows.filter((row) => row.level === 0)).toHaveLength(5);
    expect(rows.some((row) => row.level === 2 && row.status === "unknown")).toBe(true);
    expect(deriveCascadeRows([], catalog)).toEqual([]);
  });
});
