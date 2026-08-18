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
  envVars: {
    MINIMAX_API_KEY: "minimax-e2e-key",
    MINIMAX_BACKUP_API_KEY: "minimax-backup-e2e-key",
  },
  update: {
    version: "0.2.0",
    date: "2026-08-17T12:00:00Z",
    body: "Adds signed GitHub Release updates.",
  },
  releaseHistory: [
    {
      version: "v0.1.0",
      name: "PlanDeck 0.1.0 Beta",
      body: "Initial Apple Silicon macOS Beta.",
      publishedAt: "2026-08-13T12:00:00Z",
      prerelease: true,
    },
  ],
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
  await page.getByRole("button", { name: "应用更新" }).click();
  const updateDialog = page.getByRole("dialog", { name: "应用更新" });
  await updateDialog.getByText("PlanDeck 0.2.0 已可更新。").waitFor();
  await shot("00-update-dialog");
  check("启动时默认检查更新", backend.updateCheckCount() === 1);
  check(
    "更新弹窗显示当前与可用版本",
    (await updateDialog.innerText()).includes("0.1.0") && (await updateDialog.innerText()).includes("0.2.0"),
  );
  await updateDialog.getByRole("tab", { name: "更新记录" }).click();
  await updateDialog.getByText("PlanDeck 0.1.0 Beta").waitFor();
  check(
    "更新记录显示版本、预发布状态和 Release Notes",
    backend.releaseHistoryCount() === 1 &&
      (await updateDialog.innerText()).includes("v0.1.0") &&
      (await updateDialog.innerText()).includes("预发布") &&
      (await updateDialog.innerText()).includes("Initial Apple Silicon macOS Beta."),
  );
  await shot("00-update-history");
  await updateDialog.getByRole("tab", { name: "更新", exact: true }).click();
  await updateDialog.getByLabel("启动时检查更新").uncheck();
  check(
    "可关闭并持久化启动检查",
    (await page.evaluate(() => localStorage.getItem("plandeck.check-updates-on-start"))) === "false",
  );
  await updateDialog.getByRole("button", { name: "安装 0.2.0" }).click();
  await updateDialog.getByText("更新已安装，应用正在重启。").waitFor();
  check("安装时传递已确认版本", backend.updateInstallCalls().at(-1) === "0.2.0");
  await updateDialog.getByRole("button", { name: "关闭" }).click();
  backend.setAvailableUpdate(null);
  check("主题默认跟随系统", await page.getByRole("button", { name: "跟随系统主题" }).getAttribute("aria-pressed") === "true");
  await page.getByRole("button", { name: "使用浅色主题" }).click();
  check(
    "可切换到浅色主题并持久化",
    (await page.locator("html").getAttribute("data-theme")) === "light" &&
      (await page.evaluate(() => localStorage.getItem("plandeck-theme"))) === "light",
  );
  await page.reload();
  check("关闭后重载不执行启动检查", backend.updateCheckCount() === 1);
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
  await page.getByRole("button", { name: "应用更新" }).click();
  const currentDialog = page.getByRole("dialog", { name: "应用更新" });
  await currentDialog.getByRole("button", { name: "检查更新" }).click();
  await currentDialog.getByText("当前已是最新版本。").waitFor();
  check("手动检查可显示已是最新", backend.updateCheckCount() === 2);
  await currentDialog.getByRole("button", { name: "关闭" }).click();
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
  const envPlan = page.locator("tr[data-plan='MINIMAX']");
  await envPlan.waitFor();
  const envPlanText = await envPlan.innerText();
  check(
    "environment Plan 显示脱敏来源和凭证状态",
    envPlanText.includes("env") && envPlanText.includes("已设置") && !envPlanText.includes("minimax-e2e-key"),
  );
  await envPlan.getByRole("button", { name: "测试可用性" }).click();
  const planTestModal = page.getByRole("dialog", { name: "测试 Plan MiniMax Primary" });
  await planTestModal.getByRole("button", { name: "开始测试" }).click();
  await planTestModal.getByText("连接成功，模型可用（HTTP 200）").waitFor();
  check(
    "环境 Plan 测试不把凭据传给前端",
    backend.planTestCalls().at(-1)?.planId === "MINIMAX" && !("key" in backend.planTestCalls().at(-1)),
  );
  await planTestModal.getByRole("button", { name: "关闭" }).click();
  await envPlan.click();
  const envPlanEditor = page.getByRole("region", { name: "编辑 Plan" });
  await envPlanEditor.waitFor();
  check(
    "编辑 environment Plan 时凭据输入为空且不含明文",
    (await envPlanEditor.locator("input[type='password']").inputValue()) === "" &&
      !(await envPlanEditor.innerText()).includes("minimax-e2e-key"),
  );
  await envPlanEditor.getByRole("button", { name: "取消" }).click();

  await page.getByRole("button", { name: "新建 Group" }).click();
  const groupEditor = page.getByRole("region", { name: "新建 Group" });
  await groupEditor.getByLabel("ID", { exact: true }).fill("DEFAULT");
  await groupEditor.getByLabel("provider", { exact: true }).fill("openai-compatible");
  await groupEditor.getByLabel("base_url", { exact: true }).fill("https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1");
  await groupEditor.getByLabel("固定模型", { exact: true }).fill("qwen3.8-max");
  await groupEditor.locator(".group-members label").filter({ hasText: "MiniMax Primary" }).getByRole("checkbox").check();
  await groupEditor.locator(".group-members label").filter({ hasText: "MiniMax Backup" }).getByRole("checkbox").check();
  await groupEditor.locator("select").selectOption("MINIMAX");
  await groupEditor.getByRole("button", { name: "保存" }).click();
  const groupRow = page.locator("section[aria-label='订阅 Group'] tbody tr").filter({ hasText: "DEFAULT" });
  await groupRow.waitFor();
  check("Group 保存成员、固定模型和当前选择", (await groupRow.innerText()).includes("MINIMAX") && (await groupRow.innerText()).includes("qwen3.8-max"));

  await page.getByRole("button", { name: "配置环境变量" }).click();
  await page.locator("#toast:not([hidden])").filter({ hasText: "已配置环境变量" }).waitFor();
  check("UI 可配置环境变量", backend.loaderInstallCalls().length === 1);

  backend.setMigrationPreview({ candidatePlans: 1, candidateSources: ["catalog.json"], warnings: [] });
  backend.setMigrationResult({ importedPlans: 1, removedCatalogKeys: 1, removedShellAssignments: 1, backups: ["catalog.json", ".zshrc"], affectedPaths: ["catalog.json", ".zshrc"] });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "迁移旧凭据" }).click();
  await page.locator("#toast:not([hidden])").filter({ hasText: "已迁移 1 个 Plan" }).waitFor();
  check("UI 提供显式旧凭据迁移确认和结果", (await page.locator("#toast").innerText()).includes("已备份 2 个文件"));
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
  await page.locator("#overlay").click({ position: { x: 5, y: 5 } });

  const codexRow = page.locator("tr[data-tool='codex']");
  await codexRow.waitFor();
  await codexRow.click();
  const codexDrawer = page.locator("#drawer");
  await codexDrawer.getByRole("button", { name: "绑定 Group" }).click();
  const bindModal = page.locator("#modal");
  await bindModal.getByRole("button", { name: /DEFAULT/ }).click();
  const bindDiff = bindModal.locator(".diff");
  await bindDiff.waitFor();
  const bindDiffText = await bindDiff.innerText();
  check(
    "Group 绑定 diff 写入固定契约和 env_key",
    bindDiffText.includes("PLANDECK_GROUP_DEFAULT_API_KEY") && !bindDiffText.includes("minimax-e2e-key"),
    bindDiffText,
  );
  await bindModal.getByRole("button", { name: "确认绑定" }).click();
  await page.locator("#toast:not([hidden])").filter({ hasText: "已绑定 DEFAULT" }).waitFor();
  const codexConfigPath = join(HOME_DIR, ".codex/config.toml");
  const codexConfig = readFileSync(codexConfigPath, "utf8");
  check(
    "Codex 绑定只写 env_key，不写明文凭据",
    codexConfig.includes('env_key = "PLANDECK_GROUP_DEFAULT_API_KEY"') &&
      !codexConfig.includes("minimax-e2e-key") &&
      !codexConfig.includes("minimax-backup-e2e-key"),
  );
  check(
    "绑定保存 Tool → Group 关系",
    backend.environmentSaveCalls().at(-1)?.bindings?.some((binding) => binding.toolId === "CODEX" && binding.groupId === "DEFAULT"),
  );

  const selectedBefore = backend.environmentSelectCalls().length;
  await codexRow.click();
  await codexDrawer.getByRole("button", { name: "切换账号" }).click();
  const selectModal = page.locator("#modal");
  const backupPick = selectModal.locator(".pick").filter({ hasText: "MiniMax Backup" });
  await backupPick.click();
  await selectModal.getByRole("button", { name: "确认选择" }).click();
  await page.locator("#toast:not([hidden])").filter({ hasText: "重启 Codex 后生效" }).waitFor();
  const codexAfterSelect = readFileSync(codexConfigPath, "utf8");
  check(
    "切换 Group 成员只更新 SELECTED，不改 Tool 配置",
    backend.environmentSelectCalls().length === selectedBefore + 1 &&
      backend.environmentSelectCalls().at(-1)?.groupId === "DEFAULT" &&
      backend.environmentSelectCalls().at(-1)?.planId === "MINIMAX_BACKUP" &&
      codexAfterSelect === codexConfig,
  );
  await codexRow.click();
  check("切换后抽屉状态标记为需要重启", (await codexDrawer.innerText()).includes("需要重启 Tool"));

  await codexDrawer.getByRole("button", { name: "编辑", exact: true }).click();
  await page.waitForTimeout(300);
  check("绑定后仍可调用系统编辑器命令", backend.openedInEditor.includes(codexConfigPath));

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
