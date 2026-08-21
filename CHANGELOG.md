# Changelog

## 0.1.3 Beta

This release fixes the status-bar menu hierarchy.

- Add persistent Tool visibility controls across the window and status-bar views.
- Replace the Plan modal with a searchable, filterable high-density list and right-side details editor.
- Keep credentials out of the list, require explicit saves, and protect in-use Plans from deletion across hidden Tools.
- Hide empty, unconfigured Tools from the cascade view by default.
- Keep Plan and Model child items visible when a Tool has no environment Group binding.
- Disable unavailable Model actions without disabling their expandable Plan parent.
- Preserve Group member/model filtering for bound Tools.

## 0.1.2 Beta

This release moves subscription credentials behind a dedicated local environment boundary and adds account groups for supported Tools.

- Store subscription credentials in `~/.config/ai-subscriptions/subscriptions.env`; expose only credential presence and fingerprints to the frontend.
- Create Groups with a fixed provider, base URL, and model, then switch the selected member without rewriting Tool configuration.
- Bind Codex, opencode, Claude Code, and Hermes through stable environment-variable references.
- Back up and synchronize bound Tool configuration when a Group contract changes.
- Persist reload/restart status and provide an explicit recheck action.
- Install an independent shell loader and command wrapper without relying on the PlanDeck process or `launchctl setenv`.
- Migrate legacy Catalog and shell credentials transactionally, with validation, backups, and full rollback on failure.
- Remove credentials from the public Plan and Catalog model.
- Treat Kimi Code and ZCode as read-only detection adapters until their environment credential contracts are verified.

## 0.1.1 Beta

The first post-Beta update expands Tool compatibility and adds a signed update path.

- Add ZCode and Kimi Code configuration recognition and Plan/model switching.
- Add Plan availability testing from the Plan catalog.
- Add in-app GitHub Release history and signature-verified updates.
- Add an optional persisted startup update check.
- Fix light-theme root background consistency.
- Improve provider credential preservation during Tool switching.
- Improve dependency compatibility for SHA-256 fingerprints and the Vite/Svelte toolchain.
- Add traceable requirement intake, sizing, release planning, and verification workflows.

## 0.1.0 Beta

Initial public Beta target for Apple Silicon macOS.

- Plan and model Catalog.
- Tool configuration recognition and switching.
- Tool, project, and session cascade view.
- Automatic backups and restore.
- macOS tray menu quick switching.
- Light, dark, and system themes.
- ccSwitch history import.

This release is unsigned and not notarized.
