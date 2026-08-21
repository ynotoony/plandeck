// input: environment.ts
// output: vitest 用例
// position: subscriptions.env 解析/校验/序列化的测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { describe, expect, it } from "vitest";
import {
  addCredentialFingerprints,
  parseSubscriptionsEnv,
  serializeSubscriptionsEnv,
  validateEnvironment,
} from "../src/environment.js";

const VALID = `# retained outside metadata
PLANDECK_ENV_VERSION='1'
PLANDECK_PLAN_PRIMARY_NAME='Primary account'
PLANDECK_PLAN_PRIMARY_PROVIDER='openai-compatible'
PLANDECK_PLAN_PRIMARY_BASE_URL='https://api.example.com/v1/'
PLANDECK_PLAN_PRIMARY_MODELS='["model-a"]'
PLANDECK_PLAN_PRIMARY_API_KEY='fixture-$-#-\\-key'
PLANDECK_GROUP_DEFAULT_PROVIDER='openai-compatible'
PLANDECK_GROUP_DEFAULT_BASE_URL='https://api.example.com/v1'
PLANDECK_GROUP_DEFAULT_MODEL='model-a'
PLANDECK_GROUP_DEFAULT_MEMBERS='["PRIMARY"]'
PLANDECK_GROUP_DEFAULT_SELECTED='PRIMARY'
PLANDECK_TOOL_CODEX_GROUP='DEFAULT'
`;

describe("subscription environment format", () => {
  it("parses values literally and validates compatible groups", async () => {
    const document = await addCredentialFingerprints(parseSubscriptionsEnv(VALID));
    expect(document.plans[0]).toMatchObject({
      id: "PRIMARY",
      apiKey: "fixture-$-#-\\-key",
      hasCredential: true,
    });
    expect(document.plans[0]!.credentialFingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(validateEnvironment(document)).toEqual({
      valid: true,
      errors: [],
      groups: document.groups,
    });
  });

  it("round-trips apostrophes through the canonical writer", () => {
    const document = parseSubscriptionsEnv(VALID);
    document.plans[0]!.name = "Owner's account";
    const serialized = serializeSubscriptionsEnv(document);
    expect(serialized).toContain("NAME='Owner'\\''s account'");
    expect(parseSubscriptionsEnv(serialized).plans[0]!.name).toBe("Owner's account");
  });

  it.each([
    "OTHER_KEY='secret'\n",
    "PLANDECK_ENV_VERSION=$(touch /tmp/nope)\n",
    "PLANDECK_ENV_VERSION='1'\nPLANDECK_ENV_VERSION='1'\n",
    "PLANDECK_PLAN_BAD_MODELS='not-json'\n",
    "PLANDECK_PLAN_bad_NAME='bad'\n",
  ])("rejects unsafe input: %s", (text) => {
    expect(() => parseSubscriptionsEnv(text)).toThrow();
  });

  it("reports missing credentials and incompatible group contracts", () => {
    const document = parseSubscriptionsEnv(VALID.replace("fixture-$-#-\\-key", ""));
    document.groups[0]!.model = "other-model";
    const validation = validateEnvironment(document);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join("\n")).toContain("has no credential");
    expect(validation.errors.join("\n")).toContain("is not supported");
  });
});
