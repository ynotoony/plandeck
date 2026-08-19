import type { Adapter, Catalog, Plan } from "./types.js";
import { keyFingerprint } from "./recognize.js";

export function isFirstRun(catalog: Catalog): boolean {
  return catalog.plans.length === 0;
}

export async function bootstrapCatalog(adapters: Adapter[]): Promise<Catalog> {
  const plans: Plan[] = [];
  for (const adapter of adapters) {
    const fragment = await adapter.readFragment();
    if (fragment?.model) {
      const name = fragment.providerId ?? hostOf(fragment.baseUrl) ?? adapter.toolId;
      plans.push({
        id: `${adapter.toolId}-${name}`.toLowerCase(),
        name,
        source: "config",
        sourceDetail: adapter.configPath,
        providerId: fragment.providerId,
        baseUrl: fragment.baseUrl,
        hasCredential: !!fragment.key,
        credentialFingerprint: fragment.key ? await keyFingerprint(fragment.key) : undefined,
        models: [fragment.model],
      });
      continue;
    }
    const state = await adapter.readState();
    if (state.status === "oauth") {
      plans.push({
        id: `${adapter.toolId}-oauth`,
        name: adapter.toolName,
        source: "oauth",
        sourceDetail: adapter.configPath,
        models: state.defaultModel ? [state.defaultModel] : [],
      });
    }
  }
  return { version: 1, plans };
}

export function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const host = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0];
  return host || undefined;
}
