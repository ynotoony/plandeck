// input: 无（纯再导出）
// output: @plandeck/core 全部公共 API
// position: 包唯一入口（package.json main）
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

export * from "./types.js";
export * from "./recognize.js";
export * from "./catalog.js";
export * from "./env.js";
export * from "./environment.js";
export * from "./ccswitch.js";
export * from "./apply.js";
export * from "./switch.js";
export * from "./views.js";
export * from "./diff.js";
export * from "./bootstrap.js";
export * from "./registry.js";
export * from "./adapters/hermes.js";
export * from "./adapters/opencode.js";
export * from "./adapters/openclaw.js";
export * from "./adapters/codex.js";
export * from "./adapters/claude.js";
export * from "./adapters/zcode.js";
export * from "./adapters/kimi.js";
