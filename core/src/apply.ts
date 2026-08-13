import type { FileEdit, FsPort } from "./types.js";

export async function applyFileEdits(edits: FileEdit[], fs: FsPort): Promise<void> {
  for (const edit of edits) {
    const current = (await fs.exists(edit.path)) ? await fs.read(edit.path) : "";
    if (current !== edit.oldText) {
      throw new Error(`file changed on disk, refusing to write: ${edit.path}`);
    }
    await fs.write(edit.path, edit.newText);
  }
}
