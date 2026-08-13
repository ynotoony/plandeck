# PlanDeck Architecture

PlanDeck is a local Tauri desktop application with a Svelte frontend, a Rust runtime bridge, and a TypeScript core library.

## Layers

### Core

`core/src/` contains domain types, Catalog operations, recognition, adapters, switch planning, backups-related view data, and pure view derivation.

Each Tool adapter translates between a Tool's configuration files and a shared `ToolState`. It also produces file edits for a requested Plan/model switch.

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
2. The frontend loads the local Catalog and environment Plans.
3. Tool adapters read configuration fragments and project/session data.
4. Core recognition derives status and Plan association.
5. A confirmed switch creates a backup, applies atomic file edits, and re-reads state.

PlanDeck does not have a cloud backend. The local configuration files remain the source of truth; the Catalog stores candidate Plans and recognition metadata.

## Security Boundaries

The Tauri command layer is the authority for filesystem and SQLite access. Capabilities should remain minimal. Catalog and backup manifests may contain credentials and must not be logged or committed.
