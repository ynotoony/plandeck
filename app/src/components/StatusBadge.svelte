<!-- input: Status props | output: matched/unset/unknown/oauth 徽章 | position: 组件
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

<script lang="ts">
  import type { Status } from "@plandeck/core";

  let { status }: { status: Status } = $props();

  const MAP: Record<Status, [string, string]> = {
    matched: ["b-green", "生效中 · 已识别"],
    unset: ["b-amber", "未设默认"],
    unknown: ["b-red", "未识别"],
    oauth: ["b-blue", "OAuth 登录"],
  };

  const cls = $derived(MAP[status][0]);
  const label = $derived(MAP[status][1]);
</script>

<span class="badge {cls}">{label}</span>
