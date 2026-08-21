<!-- input: core diffLines + FileEdit[] props | output: 只读 diff 渲染 | position: 组件
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

<script lang="ts">
  import { diffLines } from "@plandeck/core";
  import type { FileEdit } from "@plandeck/core";

  let { edits }: { edits: FileEdit[] } = $props();
</script>

{#each edits as edit (edit.path)}
  <div class="diff-path mono dim">{edit.path}</div>
  <div class="diff">
    {#each diffLines(edit.oldText, edit.newText) as line}
      <div class={line.type}>{line.type === "del" ? "- " : line.type === "add" ? "+ " : "  "}{line.text || " "}</div>
    {/each}
  </div>
{/each}
