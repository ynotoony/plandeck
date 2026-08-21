<!-- input: 代码库现状（core/app/src-tauri） | output: 分层、数据流、安全边界的权威描述 | position: 架构文档（改动架构必须同步更新）
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# PlanDeck Architecture

PlanDeck is a local Tauri desktop application with a Svelte frontend, a Rust runtime bridge, and a TypeScript core library.

## Layers

### Core

`core/src/` contains domain types, Catalog operations, recognition, adapters, switch planning, backups-related view data, and pure view derivation.

Each Tool adapter translates between a Tool's configuration files and a shared `ToolState`. Environment-capable adapters also project a `GroupContract` containing a stable credential variable name; they never receive the credential itself.

### Frontend

`app/src/` renders the Catalog and Tool state. Svelte state owns transient UI state such as tabs, drawers, modals, themes, and cascade expand/collapse state.

The frontend calls the Rust runtime through Tauri commands exposed in `app/src/lib/tauri-fs.ts`.

### Rust runtime

`app/src-tauri/src/` provides filesystem, SQLite, environment, backup, restore, editor, and tray commands. File writes are atomic and preserve or apply restrictive file modes where supported.

## Domain Terms

- **Plan:** a subscription or API provider entry in the Catalog.
- **Tool:** an AI application that consumes a model configuration.
- **Cascade:** a read-only Tool -> Project -> Session -> Model view.
- **Recognition:** comparison of a Tool's current configuration with Catalog entries.
- **Switch:** a Tool-level configuration change made after preview and confirmation.

## Data Flow

1. The Rust runtime resolves the home and app data directories.
2. The frontend loads `~/.config/ai-subscriptions/subscriptions.env` through the Rust `EnvironmentStore`; only credential presence and fingerprints cross IPC.
3. Tool adapters read configuration fragments and project/session data.
4. Core recognition derives status and Plan association.
5. A confirmed Group binding creates a backup, applies atomic environment-reference edits, and re-reads state. A bound Tool switch only updates Group `SELECTED` in the env file.

PlanDeck does not have a cloud backend. The env file is the source of truth for API credentials and Group selection; Tool configuration is a projection and running processes may lag until reload/restart. The Catalog stores only OAuth/non-credential metadata.

## Security Boundaries

The Tauri command layer is the authority for filesystem, SQLite, and env-store access. Capabilities should remain minimal. Credentials never return through IPC; env files are `0700`/`0600`, writes are backed up and atomic, and loader files contain no secrets.
