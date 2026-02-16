## Summary
- What changed?
  - Converted session verification/message-hash flow to strict SNIP-12 v2 domain-separated semantics.
  - Removed legacy fallback signature validation path in `execute_from_outside_v2`.
  - Updated contract tests/helpers to match strict v2 hash construction.
  - Removed Cairo warnings in touched paths (unreachable code/unused binding).
- Why now?
  - Enforce deterministic cross-repo parity for Dfns-compatible SNIP-12 signing and remove downgrade/confusion behavior.

## Validation
- [x] `pnpm run build` (N/A: contracts-only change)
- [x] `pnpm run test` (N/A: contracts-only change)
- [x] `snforge test` (if Cairo files changed)

Executed evidence:
1. `scarb test` -> `136` passed, `0` failed.
2. `scarb build` -> pass, warning-free on touched files.

## Risk
- User-facing impact:
  - Session signatures now require strict v2 hash semantics; mismatched clients/signers will fail verification.
- Backward compatibility impact:
  - Intentional break from legacy fallback path.
- Rollback plan:
  - Revert this PR and redeploy previous class hash.
  - Revert paired SISNA/starkclaw v2-only PRs if deployed together.

## Security Notes
- Security-sensitive files touched? (`contracts/**`, auth/verification/signature/session-key logic)
  - Yes: session signature verification and message hash construction.
- Trust assumptions introduced or changed:
  - Session signatures are trusted only when domain-separated v2 hash matches exactly.
- Failure mode if a check is bypassed:
  - Potential replay/cross-context ambiguity or signer-contract drift.
- If a security feature is not fully implemented, behavior is:
  - [x] Explicitly disabled (`panic`/revert)
  - [ ] Explicitly unverified (`verified = false`)
  - [ ] N/A

## Checklist
- [x] Scope is focused and reviewable
- [x] Tests were added or updated when behavior changed
- [x] Docs were updated if needed
- [x] No "stubbed security success" (`TODO` paths must not default to success/verified=true)
- [x] If auth/verification logic changed, tests were added or updated to cover allow + deny paths
