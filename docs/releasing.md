# Releasing PlanDeck

## Current Release Target

The current Beta target is Apple Silicon macOS (`aarch64-apple-darwin`). The installer is unsigned and not notarized until Apple Developer signing and notarization are configured.

## Pre-release Checks

```bash
cd core
npm ci
npm test
npm run typecheck

cd ../app
npm ci
npm run typecheck
npm run build

cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
cargo build

cd ..
npm run e2e
```

Run the fixture generator before reviewing or changing committed SQLite fixtures:

```bash
cd core
npm run fixtures:generate
```

Run a secret scan over the release tree and inspect every result manually.

## Build

On an Apple Silicon Mac with full Xcode installed:

```bash
cd app
npm ci
npm run tauri build -- --target aarch64-apple-darwin --bundles dmg
```

The DMG is under `app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`.

## Checksums

```bash
cd app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg
shasum -a 256 PlanDeck*.dmg > SHA256SUMS
```

## GitHub Release

Use a version tag and mark the first Beta as a pre-release:

```bash
gh release create v0.1.0 \
  app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/PlanDeck*.dmg \
  app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/SHA256SUMS \
  --title "PlanDeck 0.1.0 Beta" \
  --prerelease \
  --notes-file docs/release-notes/0.1.0.md
```

Release notes must state:

- Apple Silicon only.
- Unsigned and not notarized.
- macOS may show a Gatekeeper warning.
- The app reads and writes local AI Tool configuration files.

## Signed Releases Later

For normal browser-downloadable macOS distribution, configure a Developer ID Application certificate, GitHub Actions secrets, Apple notarization, and verification of the final DMG. Never commit certificates, `.p12` files, private keys, or notarization credentials.
