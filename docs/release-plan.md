# Release Plan

Last updated: 2026-08-19

This file is the committed release ledger. GitHub milestones are the live issue and PR view; both must agree before a release is published.

## Released

| Version | Date | Status | Notes |
| --- | --- | --- | --- |
| `v0.1.0` | 2026-08-13 | Pre-release published | Initial Apple Silicon macOS Beta. Unsigned and not notarized. |
| `v0.1.1` | 2026-08-18 | Pre-release published | Tool compatibility, Plan tests, and signed in-app updates. |

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
