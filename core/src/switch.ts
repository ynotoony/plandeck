import { applyFileEdits } from "./apply.js";
import type { Adapter, FileEdit, FsPort, ToolState } from "./types.js";

export type BackupFn = (paths: string[]) => Promise<string[]>;

export interface SwitchResult {
  state: ToolState;
  backups: string[];
}

export async function commitSwitch(
  adapter: Adapter,
  edits: FileEdit[],
  fs: FsPort,
  backup: BackupFn,
): Promise<SwitchResult> {
  const existing: string[] = [];
  for (const edit of edits) {
    if (await fs.exists(edit.path)) existing.push(edit.path);
  }
  const backups = existing.length > 0 ? await backup(existing) : [];
  await applyFileEdits(edits, fs);
  return { state: await adapter.readState(), backups };
}
