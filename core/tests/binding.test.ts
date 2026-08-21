// input: environment/绑定相关模块 + helpers
// output: vitest 用例
// position: Tool↔Group 绑定与契约投影的测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { parse as parseJson } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import type { GroupContract } from "../src/types.js";
import { loadFixtureCatalog, makeClaude, makeCodex, makeHermes, makeOpenclaw, makeOpencode } from "./helpers.js";

const catalog = loadFixtureCatalog();
const group: GroupContract = {
  id: "DEFAULT",
  provider: "openai-compatible",
  baseUrl: "https://api.example.com/v1",
  model: "model-a",
  credentialEnvVar: "PLANDECK_GROUP_DEFAULT_API_KEY",
};

describe("environment group adapter projections", () => {
  it("Codex writes env_key and never receives a credential", async () => {
    const { adapter } = makeCodex("config.toml", catalog);
    const edit = (await adapter.groupChange!(group))[0]!;
    const doc = parseToml(edit.newText) as any;
    expect(doc.model).toBe("model-a");
    expect(doc.model_providers["plandeck-default"].env_key).toBe(group.credentialEnvVar);
    expect(edit.newText).not.toContain("fixture-secret");
  });

  it("opencode writes its environment reference syntax", async () => {
    const { adapter } = makeOpencode(["opencode.with-model.json"], catalog);
    const edit = (await adapter.groupChange!(group))[0]!;
    const doc = parseJson(edit.newText) as any;
    expect(doc.provider["plandeck-default"].options.apiKey).toBe(
      "{env:PLANDECK_GROUP_DEFAULT_API_KEY}",
    );
  });

  it("Claude removes inline credentials and keeps the fixed contract", async () => {
    const { adapter } = makeClaude("settings.json", catalog);
    const edit = (await adapter.groupChange!(group))[0]!;
    const doc = parseJson(edit.newText) as any;
    expect(doc.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(doc.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(doc.env.ANTHROPIC_BASE_URL).toBe(group.baseUrl);
    expect(doc.env.ANTHROPIC_MODEL).toBe(group.model);
  });

  it("Hermes writes only provider/base URL/model and OpenClaw stays unsupported", async () => {
    const { adapter } = makeHermes("config.yaml", catalog);
    const edit = (await adapter.groupChange!(group))[0]!;
    const doc = parseYaml(edit.newText) as any;
    expect(doc.model).toMatchObject({
      default: group.model,
      provider: group.provider,
      base_url: group.baseUrl,
    });
    const openclaw = makeOpenclaw("openclaw.json", catalog).adapter;
    expect(openclaw.environmentSupport.supported).toBe(false);
    expect(openclaw.groupChange).toBeUndefined();
  });
});
