import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClaudeAdapter } from "../src/adapters/claude.js";
import { createCodexAdapter } from "../src/adapters/codex.js";
import { createHermesAdapter } from "../src/adapters/hermes.js";
import { createOpenclawAdapter } from "../src/adapters/openclaw.js";
import { createOpencodeAdapter } from "../src/adapters/opencode.js";
import { nodeFs } from "../src/node-fs.js";
import { nodeSqlite } from "../src/node-sqlite.js";
import type { Adapter, Catalog, Plan } from "../src/types.js";

export const FIXTURES = join(import.meta.dirname, "fixtures");

export const MINIMAX_ENV_VAR = "MINIMAX_API_KEY";
export const MINIMAX_ENV_KEY = "sk-minimax-001";
export const minimaxEnvPlan: Plan = {
  id: "env-minimax",
  name: "MINIMAX",
  source: "env",
  sourceDetail: MINIMAX_ENV_VAR,
  key: MINIMAX_ENV_KEY,
  models: [],
};

export function loadFixtureCatalog(): Catalog {
  return JSON.parse(readFileSync(join(FIXTURES, "catalog.json"), "utf8")) as Catalog;
}

export function makeTempHome(): string {
  return mkdtempSync(join(tmpdir(), "plandeck-test-"));
}

export function installHermesFixture(homeDir: string, fixture = "config.yaml"): void {
  cpSync(join(FIXTURES, "hermes", fixture), join(homeDir, ".hermes", "config.yaml"), {
    recursive: true,
  });
}

export function hermesConfigPath(homeDir: string): string {
  return `${homeDir}/.hermes/config.yaml`;
}

export function readHermesConfig(homeDir: string): string {
  return readFileSync(hermesConfigPath(homeDir), "utf8");
}

export function writeHermesConfig(homeDir: string, text: string): void {
  writeFileSync(hermesConfigPath(homeDir), text, "utf8");
}

export function makeHermes(
  fixture: string | undefined,
  catalog: Catalog,
): { adapter: Adapter; home: string } {
  const home = makeTempHome();
  if (fixture) installHermesFixture(home, fixture);
  return { adapter: createHermesAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog }), home };
}

export function installToolFixture(
  homeDir: string,
  tool: string,
  fixture: string,
  destRel: string,
): void {
  cpSync(join(FIXTURES, tool, fixture), join(homeDir, destRel), { recursive: true });
}

export function readHomeFile(homeDir: string, rel: string): string {
  return readFileSync(join(homeDir, rel), "utf8");
}

export const OPENCODE_DIR_REL = ".config/opencode";

export function makeOpencode(
  fixtures: string[] | undefined,
  catalog: Catalog,
): { adapter: Adapter; home: string } {
  const home = makeTempHome();
  for (const fixture of fixtures ?? []) {
    const dest = fixture.endsWith(".jsonc") ? "opencode.jsonc" : "opencode.json";
    installToolFixture(home, "opencode", fixture, join(OPENCODE_DIR_REL, dest));
  }
  return { adapter: createOpencodeAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog }), home };
}

export function makeOpenclaw(
  fixture: string | undefined,
  catalog: Catalog,
): { adapter: Adapter; home: string } {
  const home = makeTempHome();
  if (fixture) installToolFixture(home, "openclaw", fixture, ".openclaw/openclaw.json");
  return { adapter: createOpenclawAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog }), home };
}

export function makeCodex(
  fixture: string | undefined,
  catalog: Catalog,
): { adapter: Adapter; home: string } {
  const home = makeTempHome();
  if (fixture) installToolFixture(home, "codex", fixture, ".codex/config.toml");
  return { adapter: createCodexAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog }), home };
}

export function makeClaude(
  fixture: string | undefined,
  catalog: Catalog,
): { adapter: Adapter; home: string } {
  const home = makeTempHome();
  if (fixture) installToolFixture(home, "claude", fixture, ".claude/settings.json");
  return { adapter: createClaudeAdapter({ fs: nodeFs, sqlite: nodeSqlite, homeDir: home, catalog }), home };
}

export function installHermesCascadeFixtures(homeDir: string): void {
  for (const file of ["projects.db", "state.db"]) {
    installToolFixture(homeDir, "hermes", file, `.hermes/${file}`);
  }
  cpSync(join(FIXTURES, "hermes", "sessions"), join(homeDir, ".hermes", "sessions"), {
    recursive: true,
  });
}

export function installOpencodeSessions(homeDir: string): void {
  installToolFixture(
    homeDir,
    "opencode",
    "opencode.db",
    ".local/share/opencode/opencode.db",
  );
}

export function installCodexSessions(homeDir: string): void {
  cpSync(join(FIXTURES, "codex", "sessions"), join(homeDir, ".codex", "sessions"), {
    recursive: true,
  });
}

export function installClaudeTranscripts(homeDir: string): void {
  cpSync(
    join(FIXTURES, "claude", "transcripts"),
    join(homeDir, ".claude", "transcripts"),
    { recursive: true },
  );
}

export function installOpenclawSessions(homeDir: string): void {
  cpSync(
    join(FIXTURES, "openclaw", "sessions"),
    join(homeDir, ".openclaw", "agents", "main", "sessions"),
    { recursive: true },
  );
}

export interface CcSwitchFixtureRow {
  id: string;
  app_type: string;
  name: string;
  category: string | null;
  notes: string | null;
  settings_config: string;
}

export function loadCcSwitchFixtureRows(): CcSwitchFixtureRow[] {
  return JSON.parse(readFileSync(join(FIXTURES, "cc-switch", "providers.json"), "utf8")) as CcSwitchFixtureRow[];
}

export function makeCcSwitchDb(homeDir: string, rows: CcSwitchFixtureRow[]): string {
  const dbPath = join(homeDir, ".cc-switch", "cc-switch.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE providers (
    id TEXT NOT NULL,
    app_type TEXT NOT NULL,
    name TEXT NOT NULL,
    settings_config TEXT NOT NULL,
    category TEXT,
    notes TEXT,
    PRIMARY KEY (id, app_type)
  )`);
  const insert = db.prepare(
    "INSERT INTO providers (id, app_type, name, settings_config, category, notes) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const row of rows) {
    insert.run(row.id, row.app_type, row.name, row.settings_config, row.category, row.notes);
  }
  db.close();
  return dbPath;
}
