# Finding Validation (Cairo)

Every finding must pass this gate before reporting.

## FP Gate (Required)

Drop the finding if any check fails.

1. **Concrete attack path** exists: caller -> reachable function -> state transition -> loss/impact.
2. **Reachability**: threat actor in scope can call the path under actual access control (`assert_only_*`, role checks, caller checks, account validation paths). If only `owner/admin/governance` can call it, keep it in scope as governance/admin risk and score accordingly.
3. **No existing guard** blocks the attack (`assert`, non-reentrant lock, OZ component guard, explicit invariant check).

## Confidence Score

Start at `100`, apply deductions:

- Privileged caller required (`owner/admin/governance`) -> `-25`
- Partial path (cannot prove full transition to impact) -> `-20`
- Impact self-contained to attacker-only funds -> `-15`
- Requires narrow environmental assumptions (sequencer timing / unusual off-chain behavior) -> `-10`
- Safety depends on indirect framework behavior that is present but not locally asserted -> `-10`

Report format uses `[score]` confidence tags.
Findings with confidence `<75` may be reported as low-confidence notes, without fix blocks.

## Do Not Report

- Style/naming/comments/NatSpec-only findings.
- Linter/compiler-only warnings already enforced by toolchain.
- Generic centralization notes without concrete exploit path.
- Privileged-only path reports without explicit governance/admin-risk framing.
- Gas-only micro-optimizations.
- Missing events when no concrete security or accounting impact exists.
- Pure documentation debt without exploitability.
- Theoretical attacks that require compromised prover/sequencer and no realistic trigger path.
- Duplicate root causes already captured by a higher-confidence finding.

## Cairo-Specific Notes

- Distinguish direct `replace_class_syscall` from OZ `UpgradeableComponent` paths.
- For constructor/address findings, separate critical role loss from expected deploy-time config.
- For session/account flows, reason across `__validate__` and `__execute__` jointly.
