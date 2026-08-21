// input: diff.ts
// output: vitest 用例
// position: diffLines 行级差异的测试
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { describe, expect, it } from "vitest";
import { diffLines } from "../src/diff.js";

describe("diffLines（diff 预览：红删绿增）", () => {
  it("相同内容全是 ctx", () => {
    expect(diffLines("a\nb", "a\nb")).toEqual([
      { type: "ctx", text: "a" },
      { type: "ctx", text: "b" },
    ]);
  });

  it("单行替换 = del + add", () => {
    expect(diffLines("model: old\nx: 1", "model: new\nx: 1")).toEqual([
      { type: "del", text: "model: old" },
      { type: "add", text: "model: new" },
      { type: "ctx", text: "x: 1" },
    ]);
  });

  it("纯新增与纯删除", () => {
    expect(diffLines("", "a\nb")).toEqual([
      { type: "add", text: "a" },
      { type: "add", text: "b" },
    ]);
    expect(diffLines("a\nb", "")).toEqual([
      { type: "del", text: "a" },
      { type: "del", text: "b" },
    ]);
  });

  it("中间插入", () => {
    expect(diffLines("a\nc", "a\nb\nc")).toEqual([
      { type: "ctx", text: "a" },
      { type: "add", text: "b" },
      { type: "ctx", text: "c" },
    ]);
  });

  it("hermes 切换场景：只有 model 段变化", () => {
    const oldText = "model:\n  default: qwen3.8-max\n  provider: alibaba\nagent:\n  max_turns: 60";
    const newText = "model:\n  default: deepseek-v4-pro\n  provider: ds\nagent:\n  max_turns: 60";
    const diff = diffLines(oldText, newText);
    expect(diff.filter((l) => l.type !== "ctx")).toEqual([
      { type: "del", text: "  default: qwen3.8-max" },
      { type: "del", text: "  provider: alibaba" },
      { type: "add", text: "  default: deepseek-v4-pro" },
      { type: "add", text: "  provider: ds" },
    ]);
  });
});
