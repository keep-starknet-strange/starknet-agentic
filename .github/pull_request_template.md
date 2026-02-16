## Summary
- What changed?
- Why now?

## Cross-repo boundary awareness

Boundary change: no

Counterpart repos:
- keep-starknet-strange/starkclaw: Not impacted
- omarespejel/SISNA: Not impacted

## Spec impact

Spec impact: none

## Validation
- [ ] `pnpm run build`
- [ ] `pnpm run test`
- [ ] `snforge test` (if Cairo files changed)

## Risk
- User-facing impact:
- Backward compatibility impact:
- Rollback plan:

## Security Notes
- Security-sensitive files touched? (`contracts/**`, auth/verification/signature/session-key logic)
- Trust assumptions introduced or changed:
- Failure mode if a check is bypassed:
- If a security feature is not fully implemented, behavior is:
  - [ ] Explicitly disabled (`panic`/revert)
  - [ ] Explicitly unverified (`verified = false`)
  - [ ] N/A

## Checklist
- [ ] Scope is focused and reviewable
- [ ] Tests were added or updated when behavior changed
- [ ] Docs were updated if needed
- [ ] No "stubbed security success" (`TODO` paths must not default to success/verified=true)
- [ ] If auth/verification logic changed, tests were added or updated to cover allow + deny paths
