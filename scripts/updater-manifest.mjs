#!/usr/bin/env node
// input: 版本/签名/产物路径参数
// output: createUpdaterManifest()：Tauri latest.json 清单
// position: updater 清单生成（release workflow 调用）
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。


import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

export function createUpdaterManifest({
  version,
  notes,
  artifactPath,
  signature,
  repository,
  pubDate = new Date().toISOString(),
}) {
  const normalizedVersion = version.trim().replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalizedVersion)) {
    throw new Error(`Invalid updater version: ${version}`);
  }
  if (!/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error(`Invalid GitHub repository: ${repository}`);
  }
  const artifactName = basename(artifactPath);
  if (!artifactName.endsWith(".app.tar.gz")) {
    throw new Error(`Unexpected macOS updater artifact: ${artifactName}`);
  }
  if (!signature.trim()) throw new Error("Updater signature is empty");

  const tag = `v${normalizedVersion}`;
  const url = `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(artifactName)}`;
  const platform = { signature: signature.trim(), url };
  return {
    version: normalizedVersion,
    notes,
    pub_date: pubDate,
    platforms: {
      "darwin-aarch64-app": platform,
      "darwin-aarch64": platform,
    },
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value == null) throw new Error(`Invalid argument: ${key ?? ""}`);
    values[key.slice(2)] = value;
  }
  return values;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ["version", "notes-file", "artifact", "signature-file", "repository", "output"];
  for (const key of required) {
    if (!args[key]) throw new Error(`Missing --${key}`);
  }
  const manifest = createUpdaterManifest({
    version: args.version,
    notes: readFileSync(args["notes-file"], "utf8").trim(),
    artifactPath: args.artifact,
    signature: readFileSync(args["signature-file"], "utf8"),
    repository: args.repository,
  });
  writeFileSync(args.output, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
