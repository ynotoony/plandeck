# Release Plan

Last updated: 2026-08-17

This file is the committed release ledger. GitHub milestones are the live issue and PR view; both must agree before a release is published.

## Released

| Version | Date | Status | Notes |
| --- | --- | --- | --- |
| `v0.1.0` | 2026-08-13 | Pre-release published | Initial Apple Silicon macOS Beta. Unsigned and not notarized. |

## v0.2.0

Status: Planning and review

Theme: complete the first post-Beta compatibility and Tool-support changes while making requirement intake and releases reproducible.

| Requirement | Delivery | State | Release note |
| --- | --- | --- | --- |
| [#6](https://github.com/ynotoony/plandeck/issues/6) Light-mode background consistency | [PR #9](https://github.com/ynotoony/plandeck/pull/9) | In review | Visual fix; verify both themes. |
| [#7](https://github.com/ynotoony/plandeck/issues/7) ZCode and Kimi support | [PR #12](https://github.com/ynotoony/plandeck/pull/12) | In review | Adds two Tool adapters and switching support. |
| Dependency compatibility | [PR #10](https://github.com/ynotoony/plandeck/pull/10) | In review | sha2 0.11 fingerprint compatibility. |
| Vite/Svelte compatibility | [PR #11](https://github.com/ynotoony/plandeck/pull/11) | In review | Upgrade coupled Vite and Svelte plugin versions. |
| Requirement intake and automatic sizing | [PR #13](https://github.com/ynotoony/plandeck/pull/13) | Done | Adds structured intake, size labels, splitting rules, and traceability. Merged as `5b3187f`. |
| [#16](https://github.com/ynotoony/plandeck/issues/16) GitHub Release auto-update | [PR #17](https://github.com/ynotoony/plandeck/pull/17) | In review | Adds release history, signed in-app updates, and optional startup checks. |

### Entry Gates

- Included requirements have acceptance criteria, size labels, and the `v0.2.0` milestone.
- Large requirements are split into independently mergeable children.
- Each PR references its requirement and updates this table.

### Exit Gates

- Core tests, App checks, Workflow tests, and fixture/secret scan pass on every included PR and on `main`.
- Desktop behavior changes receive local E2E verification.
- Migration, privacy, compatibility, and packaging notes are complete.
- The DMG, signed updater archive, updater signature, `latest.json`, and `SHA256SUMS` are produced by the release workflow.
- The GitHub Release is published as a pre-release and every included requirement is marked `released`.

## Unscheduled

- Dependabot PRs are evaluated against the coupled compatibility PRs before inclusion.
- Requests without acceptance criteria, size, and milestone remain in triage and are not release commitments.
