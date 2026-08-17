# Requirements and Delivery Workflow

PlanDeck accepts requests from GitHub Issues and from maintainer conversations in Codex. Both paths converge on the same public issue, sizing, implementation, and release process.

## Source of Truth

- A request submitted on GitHub uses its issue as the canonical public record.
- A request submitted in Codex receives a local tracking ID immediately. Before public implementation, the maintainer creates a sanitized GitHub issue and links the local record to it.
- Private credentials, paths, sessions, internal notes, and private Git history are never copied into GitHub.
- All public implementation branches, PRs, tags, and releases are created from the dedicated `plandeck-public` repository, starting from `origin/main`.

## Intake and Triage

Every request moves through this state machine:

```text
needs-triage -> needs-info | ready-for-agent | ready-for-human | wontfix
ready-for-agent -> in-progress -> in-review -> done -> released
in-progress/in-review -> blocked -> ready-for-agent
```

Before a request becomes `ready-for-agent`, it needs:

- a user-visible desired outcome;
- externally verifiable acceptance criteria;
- affected areas and risk flags;
- an automatically calculated size;
- dependencies and parent/child links;
- a target milestone or an explicit `unplanned` decision;
- a privacy review.

## Automatic Size Classification

Issue forms collect affected areas, acceptance criteria, scope shape, unknowns, and risk flags. `.github/workflows/issue-triage.yml` runs `scripts/requirement-size.mjs` and applies one label:

- `size/XS`: one narrow behavior in one area;
- `size/S`: one coherent small change;
- `size/M`: cross-file or cross-layer work with one outcome;
- `size/L`: several areas, risks, or outcomes;
- `size/XL`: an initiative or release theme.

`L` and `XL` requests, requests with multiple independent outcomes, and requests spanning four or more areas also receive `needs-split`.

The score is deterministic:

1. Start with the number of affected areas, minimum one.
2. Add points for four/eight acceptance criteria.
3. Add one point for each data, security, external, or release risk flag.
4. Add up to two points for unknowns.
5. Add one point for each independent outcome after the first.

The calculated size is a planning aid, not an estimate of elapsed time. A maintainer may correct incorrectly selected issue-form signals, after which the workflow recalculates the label.

## Splitting Rules

Split by independently testable and independently mergeable outcome. Do not split merely by file or language.

A parent issue records the overall outcome and release target. Child issues each contain:

- one deliverable;
- their own acceptance criteria and verification;
- explicit dependencies;
- a size no larger than `M` unless there is a documented reason;
- a branch and PR that can merge without leaving the repository invalid.

## Implementation and Version Management

1. Fetch and prune `origin` in the public repository.
2. Create `<type>/<issue-id>-<slug>` from `origin/main`.
3. Mark the issue `in-progress` and record the branch.
4. Implement only the issue or one child issue.
5. Open a PR using the repository template; link the issue, size, milestone, acceptance criteria, and release impact.
6. Move the issue to `in-review`.
7. Merge only after required CI passes and conversations are resolved.
8. Mark the issue `done`; delete the remote implementation branch.
9. When the release tag is published, mark included issues `released`.

`done` means merged into `main`. `released` means available in a published GitHub Release.

## Release Tracking

GitHub milestones are the live issue and PR view. [release-plan.md](release-plan.md) is the committed human-readable ledger.

Every release records:

- version, target window, status, and theme;
- included issues and PRs;
- migration, compatibility, privacy, and packaging notes;
- required CI and manual gates;
- the final tag and GitHub Release link.

Every PR entering or leaving a planned release updates both its milestone and the release plan. This keeps conversation requests, GitHub work, implementation, and published versions traceable end to end.
