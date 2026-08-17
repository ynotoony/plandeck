import assert from "node:assert/strict";
import test from "node:test";
import { classifySignals, signalsFromIssueBody } from "./requirement-size.mjs";

test("classifies one narrow outcome as XS", () => {
  assert.deepEqual(
    classifySignals({ areas: ["Documentation"], acceptanceCount: 1, outcomes: 1, unknowns: 0, flags: [] }),
    {
      size: "XS",
      score: 1,
      splitRequired: false,
      areas: ["Documentation"],
      acceptanceCount: 1,
      outcomes: 1,
      unknowns: 0,
      flags: [],
    },
  );
});

test("parses issue-form signals and requires a split for multiple outcomes", () => {
  const body = `### Affected areas

- [x] Core / adapters / Catalog
- [x] Desktop UI / interaction

### Scope shape

Multiple independently useful outcomes

### Unknowns

Some technical or product unknowns

### Risk flags

- [x] Persistent data, migration, or compatibility

### Acceptance criteria

- First outcome works
- Second outcome works
- Existing behavior remains compatible
- Migration is verified`;

  const signals = signalsFromIssueBody(body);
  assert.deepEqual(signals, {
    areas: ["Core / adapters / Catalog", "Desktop UI / interaction"],
    acceptanceCount: 4,
    outcomes: 2,
    unknowns: 1,
    flags: ["data_change"],
  });
  assert.deepEqual(classifySignals(signals), {
    size: "L",
    score: 6,
    splitRequired: true,
    ...signals,
  });
});

test("requires a split when four areas are selected", () => {
  const result = classifySignals({
    areas: ["core", "app", "rust", "ci"],
    acceptanceCount: 2,
    outcomes: 1,
    unknowns: 0,
    flags: [],
  });
  assert.equal(result.size, "M");
  assert.equal(result.splitRequired, true);
});
