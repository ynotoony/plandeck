import { keyFingerprint } from "./recognize.js";
import type { Catalog, Plan } from "./types.js";

export const ENV_KEY_PATTERN = /_(API_?KEY|AUTH_?TOKEN|ACCESS_?TOKEN)$/i;

export function scanEnvPlans(env: Record<string, string | undefined>): Plan[] {
  const seen = new Set<string>();
  return Object.entries(env)
    .filter(([name, value]) => ENV_KEY_PATTERN.test(name) && value && value.trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => {
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
        key: value,
        models: [],
      };
    });
}

export async function withEnvPlans(
  catalog: Catalog,
  env: Record<string, string | undefined>,
): Promise<Catalog> {
  return withRuntimeEnvPlans(catalog, scanEnvPlans(env));
}

export async function withRuntimeEnvPlans(catalog: Catalog, envPlans: Plan[]): Promise<Catalog> {
  const ids = new Set(catalog.plans.map((p) => p.id));
  const fingerprints = new Set<string>();
  for (const plan of catalog.plans) {
    if (plan.key) fingerprints.add(await keyFingerprint(plan.key));
    if (plan.credentialFingerprint) fingerprints.add(plan.credentialFingerprint);
  }
  const plans = [...catalog.plans];
  for (const plan of envPlans) {
    if (ids.has(plan.id)) continue;
    const fingerprint = plan.credentialFingerprint ?? (plan.key ? await keyFingerprint(plan.key) : undefined);
    if (fingerprint && fingerprints.has(fingerprint)) continue;
    plans.push(plan);
    ids.add(plan.id);
    if (fingerprint) fingerprints.add(fingerprint);
  }
  return { ...catalog, plans };
}
