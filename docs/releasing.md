<!-- input: 发布流程实践 | output: 发版前置检查与产物清单操作手册 | position: 发版流程文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

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

GitHub Actions must contain these repository secrets before producing an updater-enabled release:

- `TAURI_SIGNING_PRIVATE_KEY`: the encrypted Tauri updater private key.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the private-key password.

The matching public key is committed in `app/src-tauri/tauri.conf.json`. Never print, download, or commit the private key or password.

On an Apple Silicon Mac with full Xcode installed:

```bash
cd app
npm ci
npm run tauri build -- --target aarch64-apple-darwin --bundles app,dmg
```

The DMG is under `app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`. The `app` target is required for updater packaging; with updater signing configured, Tauri creates a signed `.app.tar.gz` archive and adjacent `.sig` file under the bundle directory.

## Checksums

```bash
cd app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg
shasum -a 256 PlanDeck*.dmg > SHA256SUMS
```

## GitHub Release

Use the release workflow with a version matching `tauri.conf.json`. It uploads the DMG, checksum, updater archive, and signature to the versioned pre-release. It then replaces `latest.json` on the stable `updater` release so installed Beta builds can discover the newest pre-release.

For a manual legacy release without updater artifacts:

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
- The in-app updater archive is protected by the Tauri updater signature; Apple signing and notarization remain separate.

## Signed Releases Later

For normal browser-downloadable macOS distribution, configure a Developer ID Application certificate, GitHub Actions secrets, Apple notarization, and verification of the final DMG. Never commit certificates, `.p12` files, private keys, or notarization credentials.
