// input: types + FsPort
// output: Catalog 增删改查、load/save、stripCatalogCredentials
// position: Catalog 持久化的数据操作层
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import type { Catalog, Plan } from "./types.js";
import type { FsPort } from "./types.js";

export function emptyCatalog(): Catalog {
  return { version: 1, plans: [] };
}

export function stripCatalogCredentials(catalog: Catalog): Catalog {
  return {
    ...catalog,
    plans: catalog.plans.map((plan) => {
      const { key: _key, ...safe } = plan as Plan & { key?: unknown };
      return safe;
    }),
  };
}

export function upsertPlan(catalog: Catalog, plan: Plan): Catalog {
  const exists = catalog.plans.some((p) => p.id === plan.id);
  return {
    ...catalog,
    plans: exists
      ? catalog.plans.map((p) => (p.id === plan.id ? plan : p))
      : [...catalog.plans, plan],
  };
}

export function removePlan(catalog: Catalog, planId: string): Catalog {
  return { ...catalog, plans: catalog.plans.filter((p) => p.id !== planId) };
}

export function newPlanId(catalog: Catalog, name: string): string {
  const ids = new Set(catalog.plans.map((p) => p.id));
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "plan";
  if (!ids.has(base)) return base;
  let n = 2;
  while (ids.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function loadCatalog(filePath: string, fs: FsPort): Promise<Catalog> {
  if (!(await fs.exists(filePath))) return emptyCatalog();
  const parsed = JSON.parse(await fs.read(filePath)) as Catalog;
  if (!parsed || !Array.isArray(parsed.plans)) return emptyCatalog();
  return stripCatalogCredentials(parsed);
}

export async function saveCatalog(
  filePath: string,
  catalog: Catalog,
  fs: FsPort,
): Promise<void> {
  await fs.write(filePath, JSON.stringify(stripCatalogCredentials(catalog), null, 2) + "\n", { mode: 0o600 });
}
