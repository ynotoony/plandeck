// input: FileEdit[] 与 FsPort
// output: applyFileEdits()
// position: 唯一写入原语：磁盘旧文本与预期不符即拒写
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

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
