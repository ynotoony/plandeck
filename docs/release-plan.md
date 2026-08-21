# Release Plan

Last updated: 2026-08-21

This file is the committed release ledger. GitHub milestones are the live issue and PR view; both must agree before a release is published.

## Released

| Version | Date | Status | Notes |
| --- | --- | --- | --- |
| `v0.1.0` | 2026-08-13 | Pre-release published | Initial Apple Silicon macOS Beta. Unsigned and not notarized. |
| `v0.1.1` | 2026-08-18 | Pre-release published | Tool compatibility, Plan tests, and signed in-app updates. |

## v0.1.3

Status: Release candidate

Theme: restore the complete status-bar menu hierarchy and make Plan management safe for high-frequency use.

| Requirement | Delivery | State | Release note |
| --- | --- | --- | --- |
| Tool visibility preferences | `GH-20`, `LOCAL-20260819-01` | In progress | Persist hide/restore preferences across main and status-bar views. |
| Plan list and detail editor | `GH-21`, `LOCAL-20260819-02` | In progress | Search/filter Plan inventory, edit in a right-side drawer, and protect credentials and in-use Plans. |
| Status-bar Plan/Model child menu visibility | `LOCAL-20260821-01` | In progress | Preserve child items and disable unavailable entries when no Group is bound. |

### Entry Gates

- The menu hierarchy is preserved for unbound and unsupported Tools.
- Bound Group filtering remains unchanged.

### Exit Gates

- Core tests, App typecheck/build, and the E2E regression assertion pass.
- `v0.1.3` artifacts and checksums are produced by the release workflow.

## v0.1.2

Status: Release candidate

Theme: move subscription credentials into a dedicated local environment boundary and manage account Groups without exposing secrets to the frontend.

| Requirement | Delivery | State | Release note |
| --- | --- | --- | --- |
| Environment subscription Plans and Groups | `6e2cc29` | Done | Adds the canonical env file, Group model, bindings, loader, and management UI. |
| Transactional legacy credential migration | `b6abafb` | Done | Validates, backs up, and rolls back Catalog, shell, Tool, and loader changes as one operation. |
| Bound Tool synchronization | `8e42017` | Done | Updates supported Tool projections when Group contracts change and backs up before writes. |
| Binding lifecycle and unsupported Tool boundary | `5d9dc9e` | Done | Persists restart state and keeps Kimi/ZCode environment binding read-only. |
| Public Catalog credential removal | `2a79293` | Done | Removes API keys from public Plan types, Catalog persistence, and frontend state. |
| Release verification | `0101fc7`, `dd82e51` | Done | Covers environment workflows, upstream compatibility, and the full release check suite. |

### Entry Gates

- The environment subscription specification and security boundary are implemented end to end.
- Large requirements are split into independently mergeable children.
- Release metadata and user-facing migration notes match the shipped behavior.

### Exit Gates

- Core tests, App checks, Workflow tests, and fixture/secret scan pass on every included PR and on `main`.
- Desktop behavior changes receive local E2E verification.
- Migration, privacy, compatibility, and packaging notes are complete.
- The DMG, signed updater archive, updater signature, `latest.json`, and `SHA256SUMS` are produced by the release workflow.
- The GitHub Release is published as a pre-release and every included requirement is marked `released`.

## Unscheduled

- Dependabot PRs are evaluated against the coupled compatibility PRs before inclusion.
- Requests without acceptance criteria, size, and milestone remain in triage and are not release commitments.
