#!/usr/bin/env node
// input: issue 正文（GitHub issue-triage workflow 传入）
// output: classifySignals()/signalsFromIssueBody()：XS~XL 分级与拆分要求
// position: 需求分级算法（被 .github/workflows/issue-triage.yml 调用）
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。


import { appendFileSync } from "node:fs";

const AREA_OPTIONS = [
  "Core / adapters / Catalog",
  "Desktop UI / interaction",
  "Native runtime / filesystem / tray",
  "CI / packaging / release",
  "Documentation",
];

const FLAG_OPTIONS = new Map([
  ["Persistent data, migration, or compatibility", "data_change"],
  ["Credentials, permissions, security, or privacy", "security_change"],
  ["External service, API, or operating-system behavior", "external_change"],
  ["Packaging, versioning, rollout, or release notes", "release_change"],
]);

export function classifySignals({ areas, acceptanceCount, outcomes, unknowns, flags }) {
  let score = Math.max(1, areas.length);
  if (acceptanceCount >= 4) score += 1;
  if (acceptanceCount >= 8) score += 1;
  score += flags.length;
  score += Math.min(unknowns, 2);
  score += Math.max(0, outcomes - 1);

  const size = score <= 1 ? "XS" : score <= 3 ? "S" : score <= 5 ? "M" : score <= 7 ? "L" : "XL";
  return {
    size,
    score,
    splitRequired: size === "L" || size === "XL" || outcomes > 1 || areas.length >= 4,
    areas,
    acceptanceCount,
    outcomes,
    unknowns,
    flags,
  };
}

function section(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.match(new RegExp(`### ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n### |$)`, "i"))?.[1]?.trim() ?? "";
}

function checked(sectionText, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^- \\[x\\] ${escaped}$`, "im").test(sectionText);
}

function countAcceptanceCriteria(text) {
  const bullets = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*]|\d+\.)\s+\S/.test(line));
  return bullets.length || (text && text !== "_No response_" ? 1 : 0);
}

export function signalsFromIssueBody(body = "") {
  const areaSection = section(body, "Affected areas");
  const areas = AREA_OPTIONS.filter((option) => checked(areaSection, option));
  const scopeShape = section(body, "Scope shape");
  const outcomes = scopeShape.includes("Multiple") ? 2 : 1;
  const unknownText = section(body, "Unknowns");
  const unknowns = unknownText.includes("Research") ? 2 : unknownText.includes("Some") ? 1 : 0;
  const riskSection = section(body, "Risk flags");
  const flags = [...FLAG_OPTIONS.entries()]
    .filter(([label]) => checked(riskSection, label))
    .map(([, value]) => value);
  const acceptanceCount = countAcceptanceCriteria(section(body, "Acceptance criteria"));
  return { areas, acceptanceCount, outcomes, unknowns, flags };
}

function main() {
  const signals = signalsFromIssueBody(process.env.ISSUE_BODY ?? "");
  const result = classifySignals(signals);
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `size=${result.size}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `split_required=${result.splitRequired}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `score=${result.score}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
