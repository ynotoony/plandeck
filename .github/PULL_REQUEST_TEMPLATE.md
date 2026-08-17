## Summary

<!-- What changed and why? -->

## Traceability

- Request/issue: <!-- Fixes #123 or LOCAL-YYYYMMDD-NN -->
- Calculated size: <!-- XS / S / M / L / XL -->
- Milestone/release: <!-- v0.x.y -->
- Parent/child split: <!-- Parent issue and child issue, or N/A -->

## Acceptance Criteria

<!-- Copy the request's externally verifiable criteria and mark each complete. -->

- [ ]

## Verification

- [ ] `cd core && npm test`
- [ ] `cd core && npm run typecheck`
- [ ] `cd app && npm run typecheck`
- [ ] `cd app && npm run build`
- [ ] `node --test scripts/*.test.mjs` when workflow tooling changes
- [ ] Rust checks when applicable
- [ ] E2E when desktop behavior changes

## Release Impact

- [ ] `docs/release-plan.md` is updated when this PR enters or leaves a planned release.
- [ ] Migration, compatibility, privacy, and user-facing release notes are included when applicable.

## Privacy Checklist

- [ ] No API keys, tokens, private paths, session data, certificates, or generated runtime data are included.
- [ ] Fixtures are synthetic and deterministic.
