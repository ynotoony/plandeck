import { chromium } from "playwright-core";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMockBackend } from "./mocks.mjs";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_ROOT = join(APP_ROOT, "..", "core");
const BINARY = join(APP_ROOT, "src-tauri", "target", "debug", "plandeck");
const VITE_URL = "http://localhost:1420/";
const MOCK_PORT = 4399;

if (!existsSync(BINARY)) {
  console.error("缺少 debug 二进制，先在 app/src-tauri 下运行: cargo build");
  process.exit(1);
}

const E2E = mkdtempSync(join(tmpdir(), "plandeck-e2e-"));
const HOME_DIR = join(E2E, "home");
const DATA_DIR = join(E2E, "data");
const SHOTS = join(E2E, "shots");
mkdirSync(join(HOME_DIR, ".hermes"), { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
copyFileSync(join(CORE_ROOT, "tests/fixtures/hermes/config.yaml"), join(HOME_DIR, ".hermes/config.yaml"));
copyFileSync(join(CORE_ROOT, "tests/fixtures/hermes/projects.db"), join(HOME_DIR, ".hermes/projects.db"));
copyFileSync(join(CORE_ROOT, "tests/fixtures/hermes/state.db"), join(HOME_DIR, ".hermes/state.db"));
cpSync(join(CORE_ROOT, "tests/fixtures/hermes/sessions"), join(HOME_DIR, ".hermes/sessions"), { recursive: true });
copyFileSync(join(CORE_ROOT, "tests/fixtures/catalog.json"), join(DATA_DIR, "catalog.json"));

const backend = createMockBackend({
  homeDir: HOME_DIR,
  dataDir: DATA_DIR,
  envVars: { MINIMAX_API_KEY: "minimax-e2e-key" },
});
const server = await backend.start(MOCK_PORT);

const vite = spawn("npm", ["run", "dev"], { cwd: APP_ROOT, stdio: "ignore", detached: true });
async function waitVite() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(VITE_URL);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite dev server 未就绪 (localhost:1420)");
}

const results = [];
function check(name, ok, extra = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? " | " + extra : ""}`);
}

let browser;
let page;
try {
  await waitVite();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") pageErrors.push(m.text());
  });

  await page.addInitScript(
    ({ url }) => {
      let nextCallback = 1;
      const callbacks = new Map();
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          const r = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cmd, args }),
          });
          const j = await r.json();
          if (j.error) throw new Error(j.error);
          return j.value;
        },
        transformCallback: (callback) => {
          const id = nextCallback++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id) => callbacks.delete(id),
      };
      window.__runTauriCallback = (id, event) => callbacks.get(id)?.(event);
    },
    { url: `http://127.0.0.1:${MOCK_PORT}/invoke` },
  );

  const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

  await page.goto(VITE_URL);

  check("非首启不显示引导", (await page.locator(".first-run").count()) === 0);
  check("主题默认跟随系统", await page.getByRole("button", { name: "跟随系统主题" }).getAttribute("aria-pressed") === "true");
  await page.getByRole("button", { name: "使用浅色主题" }).click();
  check(
    "可切换到浅色主题并持久化",
    (await page.locator("html").getAttribute("data-theme")) === "light" &&
      (await page.evaluate(() => localStorage.getItem("plandeck-theme"))) === "light",
  );
  await page.reload();
  check(
    "重载后恢复已选主题",
    (await page.locator("html").getAttribute("data-theme")) === "light" &&
      (await page.getByRole("button", { name: "使用浅色主题" }).getAttribute("aria-pressed")) === "true",
  );
  await page.getByRole("button", { name: "使用深色主题" }).click();
  check("可切换到深色主题", (await page.locator("html").getAttribute("data-theme")) === "dark");
  await page.getByRole("button", { name: "跟随系统主题" }).click();
  await page.emulateMedia({ colorScheme: "light" });
  check("系统模式响应浅色偏好", (await page.locator("html").getAttribute("data-theme")) === "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  check(
    "系统模式实时响应偏好变化",
    (await page.locator("html").getAttribute("data-theme")) === "dark" &&
      (await page.getByRole("button", { name: "跟随系统主题" }).getAttribute("aria-pressed")) === "true",
  );
  await page.getByRole("button", { name: "现状（级联）" }).click();
  const cascadeTool = page.locator("tr[data-cascade-level='0'][data-cascade-label='hermes']");
  const cascadeProject = page.locator("tr[data-cascade-level='1'][data-cascade-label='研究']");
  const cascadeSession = page.locator("tr[data-cascade-level='2'][data-cascade-label='20260810_100000_aaa111']");
  const unknownSession = page.locator("tr[data-cascade-level='2'][data-cascade-label='20260809_090000_bbb222']");
  await cascadeTool.waitFor({ timeout: 15000 });
  check("级联视图显示工具行", (await cascadeTool.innerText()).includes("Hermes"));
  check("级联视图显示 project 行和路径", (await cascadeProject.innerText()).includes("/Users/placeholder/SideTrack"));
  check(
    "级联行按工具、project、session 三级缩进",
    (await cascadeTool.locator(".cascade-tool").count()) === 1 &&
      (await cascadeProject.locator(".level-1").count()) === 1 &&
      (await cascadeSession.locator(".level-2").count()) === 1,
  );
  const cascadeSessionText = await cascadeSession.innerText();
  check(
    "session 显示 Plan、模型、状态和最近时间",
    cascadeSessionText.includes("Alibaba Token Plan") &&
      cascadeSessionText.includes("qwen3.8-max") &&
      cascadeSessionText.includes("生效中 · 已识别") &&
      cascadeSessionText.includes("2026-08-10T12:00:00.000000"),
    cascadeSessionText.replace(/\n/g, " | "),
  );
  check("unknown session 显示红色未识别 badge", (await unknownSession.locator(".b-red").count()) === 1);
  check("级联占位文案已移除", (await page.getByText("现状级联视图 —— 见票 04").count()) === 0);
  const projectToggle = cascadeProject.getByRole("button", { name: "收起 Hermes project 研究 /Users/placeholder/SideTrack" });
  check("project 默认展开并提供展开状态", (await projectToggle.getAttribute("aria-expanded")) === "true");
  await projectToggle.press("Enter");
  check(
    "project 可通过键盘收起 session",
    (await cascadeSession.count()) === 0 &&
      (await unknownSession.count()) === 1 &&
      (await cascadeProject.getByRole("button", { name: "展开 Hermes project 研究 /Users/placeholder/SideTrack" }).getAttribute("aria-expanded")) === "false",
  );
  await page.getByRole("button", { name: "刷新" }).click();
  await page.getByRole("button", { name: "刷新" }).waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("button[aria-busy='true']"));
  check("刷新后保留 project 收起状态", (await cascadeSession.count()) === 0);
  await cascadeProject.getByRole("button", { name: "展开 Hermes project 研究 /Users/placeholder/SideTrack" }).click();
  check("project 重新展开后恢复 session", (await cascadeSession.count()) === 1 && (await unknownSession.count()) === 1);
  const toolToggle = cascadeTool.getByRole("button", { name: "收起 Hermes" });
  await toolToggle.click();
  check(
    "Tool 收起时隐藏全部 project 与 session",
    (await cascadeProject.count()) === 0 &&
      (await cascadeSession.count()) === 0 &&
      (await page.locator("tr[data-cascade-level='0']").count()) === 5,
  );
  await cascadeTool.getByRole("button", { name: "展开 Hermes" }).click();
  check("Tool 重新展开后恢复全部后代", (await cascadeProject.count()) === 1 && (await cascadeSession.count()) === 1);
  await page.getByRole("button", { name: "Plan 清单" }).click();
  check("Plan 清单保留 ccSwitch 导入入口", await page.getByRole("button", { name: "导入 ccSwitch" }).isVisible());
  const envPlan = page.locator("tr[data-plan='env-minimax']");
  check("env Plan 在 init 后显示变量来源", (await envPlan.innerText()).includes("env") && (await envPlan.innerText()).includes("MINIMAX_API_KEY"));
  const maskedKey = await page.locator("tr[data-plan='alibaba-token-plan'] td").nth(2).innerText();
  check("Plan key 默认打码", maskedKey.includes("fix…0001") && !maskedKey.includes("fixture-credential-alpha"), maskedKey);
  await page.getByRole("button", { name: "显示" }).first().click();
  check("Plan key 点击后显示明文", (await page.locator("tr[data-plan='alibaba-token-plan'] td").nth(2).innerText()).includes("fixture-credential-alpha-0001"));
  await page.getByRole("button", { name: "＋ 新建 Plan" }).click();
  const planEditor = page.getByRole("region", { name: "新建 Plan" });
  await planEditor.getByLabel("名称").fill("E2E Plan");
  await planEditor.getByLabel("base_url").fill("https://e2e.example.com");
  await planEditor.getByLabel("key").fill("e2e-key");
  await planEditor.getByLabel("模型清单").fill("e2e-model");
  await planEditor.getByRole("button", { name: "保存" }).click();
  const createdPlan = page.locator("tr[data-plan='e2e-plan']");
  await createdPlan.waitFor();
  check("新建 Plan 写入并刷新清单", (await createdPlan.innerText()).includes("e2e-model"));
  await createdPlan.click();
  const editPlanEditor = page.getByRole("region", { name: "编辑 Plan" });
  await editPlanEditor.getByLabel("名称").fill("E2E Plan Updated");
  await editPlanEditor.getByRole("button", { name: "保存" }).click();
  await page.waitForFunction(
    () => document.querySelector("tr[data-plan='e2e-plan']")?.textContent?.includes("E2E Plan Updated"),
  );
  check("编辑 Plan 原位更新", (await createdPlan.innerText()).includes("E2E Plan Updated"));
  await createdPlan.click();
  page.once("dialog", (dialog) => dialog.accept());
  await editPlanEditor.getByRole("button", { name: "删除" }).click();
  await createdPlan.waitFor({ state: "detached" });
  check("删除 Plan 从清单移除", (await createdPlan.count()) === 0);
  check("Plan 写入前自动备份 catalog", backend.listBackups().some((backup) => backup.files.includes("catalog.json")));
  await page.getByRole("button", { name: "默认模型" }).click();

  const row = page.locator("tr[data-tool='hermes']");
  await row.waitFor({ timeout: 15000 });
  const rowText = (await row.innerText()).replace(/\n/g, " | ");
  check("默认模型表显示 Hermes 行", rowText.includes("Hermes"), rowText);
  check("badge = 生效中 · 已识别", rowText.includes("生效中 · 已识别"));
  check("默认模型 = qwen3.8-max", rowText.includes("qwen3.8-max"));
  check("Plan 显示名 = Alibaba Token Plan", rowText.includes("Alibaba Token Plan"));
  await page.waitForFunction(() => true);
  check(
    "托盘菜单收到 5 个 Tool 的默认模型视图",
    backend.trayTools().length === 5 &&
      backend.trayTools().some((tool) =>
        tool.label.includes("Hermes · qwen3.8-max（已识别）"),
      ),
    JSON.stringify(backend.trayTools().map((tool) => tool.label)),
  );
  await shot("01-table");

  await row.click();
  const drawer = page.locator("#drawer");
  await drawer.waitFor();
  const drawerText = await drawer.innerText();
  check("抽屉显示注入 HOME 下的配置路径", drawerText.includes(join(HOME_DIR, ".hermes/config.yaml")));
  await shot("02-drawer");

  await drawer.getByRole("button", { name: "切换", exact: true }).click();
  const modal = page.locator("#modal");
  await modal.waitFor();
  await shot("03-modal-plans");

  const picks = modal.locator(".pick");
  check("Plan 列表包含 env Plan", (await picks.count()) === 4);
  const oauthPick = picks.filter({ hasText: "Claude Max" });
  check(
    "OAuth 型 Plan 置灰 + OAuth 登录 badge",
    (await oauthPick.getAttribute("class")).includes("dis") &&
      (await oauthPick.innerText()).includes("OAuth 登录"),
  );

  check("OAuth Plan 不可操作", await oauthPick.isDisabled());

  await picks.filter({ hasText: "DeepSeek" }).click();
  await modal.locator(".chip", { hasText: "deepseek-v4-pro" }).click();
  const diff = modal.locator(".diff");
  await diff.waitFor();
  const diffText = await diff.innerText();
  check(
    "diff 红删旧 base_url / 绿增新 base_url（来自 planChange 的 FileEdit）",
    /- *base_url: https:\/\/token-plan\.cn-beijing\.maas\.aliyuncs\.com/.test(diffText) &&
      /\+ *base_url: https:\/\/api\.deepseek\.com/.test(diffText),
  );
  check(
    "diff 含模型行变更",
    /- *default: qwen3\.8-max/.test(diffText) && /\+ *default: deepseek-v4-pro/.test(diffText),
  );
  await shot("04-modal-diff");

  await modal.getByRole("button", { name: "确认切换" }).click();
  await page.locator("#toast:not([hidden])").filter({ hasText: "已切换" }).waitFor();
  const toastText = await page.locator("#toast").innerText();
  check("toast 报告切换成功 + 备份位置", toastText.includes("已切换") && toastText.includes("backups"), toastText);
  await shot("05-after-switch");

  const cfg = readFileSync(join(HOME_DIR, ".hermes/config.yaml"), "utf8");
  check(
    "配置文件真实变更（default/provider/base_url）",
    cfg.includes("default: deepseek-v4-pro") &&
      cfg.includes("provider: ds") &&
      cfg.includes("base_url: https://api.deepseek.com"),
  );
  const backups = backend.listBackups();
  const configBackup = backups.find((backup) => backup.files.includes("config.yaml"));
  check(
    "备份写入 backups/<timestamp>/config.yaml",
    configBackup != null && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(configBackup.ts),
    JSON.stringify(backups),
  );
  const bcontent = readFileSync(join(DATA_DIR, "backups", configBackup.ts, "config.yaml"), "utf8");
  check("备份内容 = 切换前的原始配置", bcontent.includes("default: qwen3.8-max"));
  check("其余配置内容未被破坏（agent 段保留）", cfg.includes("agent:") && cfg.includes("max_turns: 60"));

  const rowText2 = (await row.innerText()).replace(/\n/g, " | ");
  check(
    "切换后行状态实时刷新为 matched + 新模型",
    rowText2.includes("生效中 · 已识别") && rowText2.includes("deepseek-v4-pro"),
    rowText2,
  );
  check(
    "窗口切换后托盘同步刷新为新模型",
    backend.trayTools().some((tool) =>
      tool.label.includes("Hermes · deepseek-v4-pro（已识别）"),
    ),
  );

  await row.click();
  await drawer.getByRole("button", { name: "历史版本", exact: true }).click();
  const backupCard = drawer.locator(".backup-card").first();
  await backupCard.waitFor();
  const backupText = await backupCard.innerText();
  check(
    "备份列表显示工具、时间和原文件路径",
    backupText.includes("Hermes") &&
      backupText.includes(join(HOME_DIR, ".hermes/config.yaml")) &&
      /\d{4}/.test(backupText),
    backupText.replace(/\n/g, " | "),
  );
  const backupRecordsBeforeRestore = backend.listBackupRecords().length;
  page.once("dialog", (dialog) => dialog.accept());
  await backupCard.getByRole("button", { name: "恢复此版本" }).click();
  await page.getByText("已恢复 · 当前版本已自动备份 · 状态已刷新").waitFor();

  const restored = readFileSync(join(HOME_DIR, ".hermes/config.yaml"), "utf8");
  check("一键恢复写回切换前内容", restored.includes("default: qwen3.8-max"));
  check("恢复动作先备份当前版本", backend.listBackupRecords().length === backupRecordsBeforeRestore + 1);
  check(
    "恢复前备份保留中间状态",
    backend
      .listBackupRecords()
      .some((record) => readFileSync(record.backupPath, "utf8").includes("default: deepseek-v4-pro")),
  );
  await drawer.getByRole("button", { name: "历史版本", exact: true }).click();
  await page.locator("#overlay").click({ position: { x: 5, y: 5 } });
  const restoredRowText = (await row.innerText()).replace(/\n/g, " | ");
  check(
    "恢复后重读状态为旧模型 matched",
    restoredRowText.includes("生效中 · 已识别") && restoredRowText.includes("qwen3.8-max"),
    restoredRowText,
  );

  writeFileSync(
    join(HOME_DIR, ".hermes/config.yaml"),
    restored.replace(
      "base_url: https://token-plan.cn-beijing.maas.aliyuncs.com",
      "base_url: https://rogue.example.com/v1",
    ),
  );
  await page.getByRole("button", { name: "刷新" }).click();
  await page.waitForTimeout(600);
  const rowText3 = (await row.innerText()).replace(/\n/g, " | ");
  check("手改配置后刷新为 未识别", rowText3.includes("未识别"), rowText3);
  await shot("06-unknown");

  const trayTarget = backend
    .trayTools()
    .find((tool) => tool.toolId === "hermes")
    .plans.find((plan) => plan.label === "Alibaba Token Plan")
    .items.find((item) => item.label === "qwen-plus");
  const trayActionHandler = backend.eventHandler("tray-action");
  await page.evaluate(
    ({ handler, payload }) =>
      window.__runTauriCallback(handler, { event: "tray-action", id: 1, payload }),
    { handler: trayActionHandler, payload: trayTarget.id },
  );
  await page.waitForFunction(
    () => document.querySelector("tr[data-tool='hermes']")?.textContent?.includes("qwen-plus"),
  );
  const cfgAfterTray = readFileSync(join(HOME_DIR, ".hermes/config.yaml"), "utf8");
  check(
    "托盘点击复用备份 + 原子写 + 重读路径",
    cfgAfterTray.includes("default: qwen-plus") &&
      cfgAfterTray.includes("base_url: https://token-plan.cn-beijing.maas.aliyuncs.com"),
  );
  check(
    "托盘切换后窗口同步刷新",
    (await row.innerText()).includes("qwen-plus") && (await row.innerText()).includes("生效中 · 已识别"),
  );
  check("托盘切换写前新增备份", backend.listBackupRecords().length === backupRecordsBeforeRestore + 2);

  await row.click();
  await drawer.getByRole("button", { name: "编辑", exact: true }).click();
  await page.waitForTimeout(300);
  check("「编辑」调用系统编辑器命令", backend.openedInEditor.includes(join(HOME_DIR, ".hermes/config.yaml")));

  check("前端无运行时错误", pageErrors.length === 0, pageErrors.slice(0, 3).join(" ;; "));

  writeFileSync(join(DATA_DIR, "catalog.json"), JSON.stringify({ version: 1, plans: [] }));
  backend.setEnvVars({});
  const firstRunPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await firstRunPage.addInitScript(
    ({ url }) => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          const r = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cmd, args }),
          });
          const j = await r.json();
          if (j.error) throw new Error(j.error);
          return j.value;
        },
        transformCallback: () => 0,
        unregisterCallback: () => {},
      };
    },
    { url: `http://127.0.0.1:${MOCK_PORT}/invoke` },
  );
  await firstRunPage.goto(VITE_URL);
  const guide = firstRunPage.locator(".first-run");
  await guide.waitFor();
  check("空 Catalog 自动扫描后显示首启引导", (await guide.innerText()).includes("已完成首次扫描"));
  check("自动扫描生成 catalog.json", existsSync(join(DATA_DIR, "catalog.json")));
  check("自动扫描后可开始使用", await guide.getByRole("button", { name: "开始使用" }).isEnabled());
  await firstRunPage.close();
} catch (e) {
  check("流程异常", false, String(e));
  await page?.screenshot({ path: join(SHOTS, "99-error.png") }).catch(() => {});
} finally {
  await browser?.close();
  server.close();
  try {
    process.kill(-vite.pid, "SIGTERM");
  } catch {}
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed · 截图在 ${SHOTS}`);
process.exit(passed === results.length ? 0 : 1);
