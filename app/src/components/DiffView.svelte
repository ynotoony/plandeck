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
