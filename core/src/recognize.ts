import type { Catalog, ConfigFragment, Plan, Status } from "./types.js";

export interface Recognition {
  status: Status;
  plan?: Plan;
}

export async function keyFingerprint(key: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

export function normalizeBaseUrl(url: string | undefined): string {
  if (!url) return "";
  let u = url.trim().toLowerCase();
  u = u.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  while (u.endsWith("/")) u = u.slice(0, -1);
  return u;
}

export function baseUrlMatches(
  configUrl: string | undefined,
  planUrl: string | undefined,
): boolean {
  const a = normalizeBaseUrl(configUrl);
  const b = normalizeBaseUrl(planUrl);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!b.includes("/") && a.startsWith(b + "/")) return true;
  if (!a.includes("/") && b.startsWith(a + "/")) return true;
  return false;
}

export async function plansMatch(a: Plan, b: Plan): Promise<boolean> {
  if (a.source === "oauth" || b.source === "oauth") return false;
  return credentialsMatch(a, b);
}

async function credentialsMatch(
  a: { baseUrl?: string; key?: string },
  b: { baseUrl?: string; key?: string },
): Promise<boolean> {
  if (!baseUrlMatches(a.baseUrl, b.baseUrl)) return false;
  if (!a.key || !b.key) return true;
  return (await keyFingerprint(a.key)) === (await keyFingerprint(b.key));
}

async function envCredentialsMatch(fragment: ConfigFragment, plan: Plan): Promise<boolean> {
  if (!fragment.key) return false;
  const fingerprint = await keyFingerprint(fragment.key);
  return plan.credentialFingerprint === fingerprint || (!!plan.key && fingerprint === (await keyFingerprint(plan.key)));
}

export async function recognize(
  fragment: ConfigFragment,
  catalog: Catalog,
): Promise<Recognition> {
  if (!fragment.model) return { status: "unset" };
  for (const plan of catalog.plans) {
    if (plan.source === "oauth") continue;
    if (plan.source === "env") {
      if (!(await envCredentialsMatch(fragment, plan))) continue;
    } else if (!(await credentialsMatch(fragment, plan))) continue;
    if (plan.models.length > 0 && !plan.models.includes(fragment.model)) continue;
    return { status: "matched", plan };
  }
  return { status: "unknown" };
}
