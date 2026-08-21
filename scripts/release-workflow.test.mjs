// input: .github/workflows/release.yml 文本
// output: node:test 断言（双产物、签名、latest.json 契约）
// position: release workflow 契约测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

test("release build includes both the updater-enabled app target and the DMG", () => {
  const command = workflow.match(
    /npm run tauri build -- --target aarch64-apple-darwin --bundles ([^\s]+)/,
  );

  assert.ok(command, "release workflow must run the Apple Silicon Tauri build");
  assert.deepEqual(new Set(command[1].split(",")), new Set(["app", "dmg"]));
});
