// input: 进程环境变量 + recognize
// output: scanEnvPlans()/withEnvPlans()
// position: 环境变量 *_API_KEY 扫描，产出 env 类 Plan
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { keyFingerprint } from "./recognize.js";
import type { Catalog, Plan } from "./types.js";

export const ENV_KEY_PATTERN = /_(API_?KEY|AUTH_?TOKEN|ACCESS_?TOKEN)$/i;

export async function scanEnvPlans(env: Record<string, string | undefined>): Promise<Plan[]> {
  const seen = new Set<string>();
  const entries = Object.entries(env)
    .filter(([name, value]) => ENV_KEY_PATTERN.test(name) && value && value.trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b))
  return Promise.all(entries.map(async ([name, value]) => {
      const base = name.replace(ENV_KEY_PATTERN, "");
      let id = `env-${base.toLowerCase()}`;
      let n = 2;
      while (seen.has(id)) id = `env-${base.toLowerCase()}-${n++}`;
      seen.add(id);
      return {
        id,
        name: base,
        source: "env",
        sourceDetail: name,
        hasCredential: true,
        credentialFingerprint: await keyFingerprint(value!),
        models: [],
      };
    }));
}

export async function withEnvPlans(
  catalog: Catalog,
  env: Record<string, string | undefined>,
): Promise<Catalog> {
  return withRuntimeEnvPlans(catalog, await scanEnvPlans(env));
}

export async function withRuntimeEnvPlans(catalog: Catalog, envPlans: Plan[]): Promise<Catalog> {
  const ids = new Set(catalog.plans.map((p) => p.id));
  const fingerprints = new Set<string>();
  for (const plan of catalog.plans) {
    if (plan.credentialFingerprint) fingerprints.add(plan.credentialFingerprint);
  }
  const plans = [...catalog.plans];
  for (const plan of envPlans) {
    if (ids.has(plan.id)) continue;
    const fingerprint = plan.credentialFingerprint;
    if (fingerprint && fingerprints.has(fingerprint)) continue;
    plans.push(plan);
    ids.add(plan.id);
    if (fingerprint) fingerprints.add(fingerprint);
  }
  return { ...catalog, plans };
}
