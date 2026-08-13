# PlanDeck

Local AI subscription and model plan manager for macOS.

PlanDeck gives people who use several AI tools and providers one local view of their Plans, models, project/session state, backups, and tool-level switching.

> **Beta:** the first public release targets Apple Silicon macOS only. The initial installer is unsigned and not notarized.

[中文说明](README.zh-CN.md)

## What It Does

- Shows the Tool -> Project -> Session -> Model cascade.
- Lists API, environment-variable, and OAuth Plans in one Catalog.
- Recognizes the current Tool configuration against the Catalog.
- Switches a Tool's default Plan and model with a preview.
- Creates a backup before writing configuration files.
- Restores previous configuration versions from the Tool drawer.
- Provides macOS tray menu quick switching.
- Supports system, light, and dark themes.
- Imports compatible provider history from ccSwitch.

The current adapters cover Hermes, opencode, OpenClaw, Codex CLI, and Claude Code.

## Status And Scope

This is an early macOS Beta, not a production-stability promise. The first release supports Apple Silicon (`aarch64-apple-darwin`) only. Windows and Linux are not supported yet; some runtime behavior is macOS-specific.

The first downloadable build is unsigned and unnotarized. macOS may show a Gatekeeper or unidentified-developer warning when opening it.

## Privacy And Credentials

PlanDeck is local-first:

- It reads supported AI Tool configuration files from your machine.
- It writes only when you confirm a Plan switch, restore a backup, or edit a Plan.
- It does not provide a PlanDeck cloud service or upload your configurations.
- The Catalog contains Plan metadata and may contain API keys. It is saved under the app data directory with `0600` file permissions on Unix systems.
- Backups contain copies of configuration files and must be protected like the originals.

Do not commit your runtime Catalog, backups, AI Tool configuration files, or credentials to Git.

## Install

Download the latest `.dmg` from [GitHub Releases](https://github.com/ynotoony/plandeck/releases). The initial Beta is Apple Silicon only and unsigned.

After downloading an unsigned build, macOS may block the first launch. Open it from Finder using **Control-click -> Open**, or approve it in **System Settings -> Privacy & Security**. Only do this when the checksum and release source are trusted.

## Build From Source

Prerequisites:

- macOS on Apple Silicon for the supported desktop target.
- Node.js `22.23.1`.
- Rust `1.94.0` with the `aarch64-apple-darwin` target.
- Full Xcode for Tauri macOS bundling. Command Line Tools alone are not sufficient for every bundle operation.

Install and run the frontend:

```bash
cd core && npm ci
cd ../app && npm ci
npm run dev
```

Run the Tauri app:

```bash
cd app
npm run tauri dev
```

Build the macOS DMG:

```bash
cd app
npm run tauri build -- --target aarch64-apple-darwin --bundles dmg
```

## Tests

Core tests and typecheck:

```bash
cd core
npm ci
npm test
npm run typecheck
```

Frontend typecheck and build:

```bash
cd app
npm ci
npm run typecheck
npm run build
```

Rust tests and lint:

```bash
cd app/src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

The end-to-end suite uses a temporary HOME and a mock Tauri backend. It requires a debug Tauri binary first:

```bash
cd app/src-tauri
cargo build
cd ..
npm run e2e
```

## Data Locations

PlanDeck reads each Tool's normal configuration location under your home directory. Its own Catalog and backup data are stored under the platform app data directory. Set `PLANDECK_HOME` or `PLANDECK_DATA_DIR` when running development and tests to use an isolated location.

## Documentation

- [中文 README](README.zh-CN.md)
- [Architecture](docs/architecture.md)
- [Release guide](docs/releasing.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## License

PlanDeck is released under the [MIT License](LICENSE).
