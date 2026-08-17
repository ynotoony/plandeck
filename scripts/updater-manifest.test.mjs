import assert from "node:assert/strict";
import test from "node:test";
import { createUpdaterManifest } from "./updater-manifest.mjs";

test("creates a signed Apple Silicon manifest for a versioned GitHub Release", () => {
  const manifest = createUpdaterManifest({
    version: "v0.2.0",
    notes: "Signed updates.",
    artifactPath: "/tmp/PlanDeck.app.tar.gz",
    signature: "signed-value\n",
    repository: "ynotoony/plandeck",
    pubDate: "2026-08-17T12:00:00.000Z",
  });

  assert.equal(manifest.version, "0.2.0");
  assert.equal(manifest.pub_date, "2026-08-17T12:00:00.000Z");
  assert.deepEqual(manifest.platforms["darwin-aarch64-app"], {
    signature: "signed-value",
    url: "https://github.com/ynotoony/plandeck/releases/download/v0.2.0/PlanDeck.app.tar.gz",
  });
  assert.deepEqual(
    manifest.platforms["darwin-aarch64"],
    manifest.platforms["darwin-aarch64-app"],
  );
});

test("rejects malformed versions and unsigned artifacts", () => {
  const base = {
    version: "0.2.0",
    notes: "notes",
    artifactPath: "/tmp/PlanDeck.app.tar.gz",
    signature: "signature",
    repository: "ynotoony/plandeck",
  };
  assert.throws(() => createUpdaterManifest({ ...base, version: "next" }), /Invalid updater version/);
  assert.throws(() => createUpdaterManifest({ ...base, signature: "" }), /signature is empty/);
});
