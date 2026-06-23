# Finding Validation (Cairo)

Every finding must pass this gate before reporting.

## FP Gate (Required)

Drop the finding if any check fails.

1. **Concrete attack path** exists: caller -> reachable function -> state transition -> loss/impact.
2. **Reachability**: threat actor in scope can call the path under actual access control (`assert_only_*`, role checks, caller checks, account validation paths). If only `owner/admin/governance` can call it, keep it in scope as governance/admin risk and score accordingly.
3. **No existing guard** blocks the attack (`assert`, non-reentrant lock, OZ component guard, explicit invariant check).
4. **Component resolution** (see below): resolve embedded OZ components before claiming a missing rotation path or missing non-zero guard.

## Component Resolution (Required before reporting)

The single largest false-positive family in external triage was reporting
`IRREVOCABLE_ADMIN`, missing-rotation, or missing non-zero guards against
contracts that embed OpenZeppelin components which already provide those
surfaces. Before reporting any such finding, resolve embedded components:

- The deterministic surface map (`{workdir}/cairo-audit-surface-map.md`) has a
  **Component Resolution** section listing each in-scope file's Ownable /
  AccessControl / Upgradeable components and the rotation surfaces they expose.
  Read it first.
- Treat the following as **valid rotation surfaces** (so the role is NOT irrevocable):
  - Ownable: `transfer_ownership`, `renounce_ownership`, `OwnableMixinImpl`, `OwnableTwoStepMixinImpl`.
  - AccessControl: `grant_role`, `revoke_role`, `renounce_role`, `AccessControlMixinImpl`.
- Treat the following as **valid non-zero guards** (so no missing-guard finding):
  - An address seeded through `<component>.initializer(addr)` where the component is OZ Ownable/AccessControl — the initializer rejects the zero address internally.
  - A class hash routed through `UpgradeableComponent.upgrade(...)` — the component performs its own non-zero check.
- Only report the finding if the embedded component does **not** expose the
  relevant surface for the specific seeded role/address. Name the missing
  surface explicitly in `guard_analysis`.

This rule resolves the IRREVOCABLE_ADMIN and CRITICAL_ADDRESS_INIT false
positives observed on `ForgeYields` (OZ `OwnableImpl` rotation + initializer
non-zero) without suppressing genuinely irrevocable roles.

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

## Evidence Tags

Every finding must carry at least one evidence tag. Tags declare _how_ the finding was validated and give reviewers instant signal about evidence quality.

| Tag | Meaning | Who applies |
|-----|---------|-------------|
| `[CODE-TRACE]` | Concrete path traced through in-scope source code | Any agent |
| `[PREFLIGHT-HIT]` | Deterministic preflight scanner flagged this pattern | Orchestrator (Turn 4) |
| `[CROSS-AGENT]` | Independently confirmed by 2+ specialist agents | Orchestrator (Turn 4) |
| `[ADVERSARIAL]` | Discovered or confirmed by adversarial specialist (Agent 5) | Agent 5 / Orchestrator |

Rules:

- Every reported finding must have at least `[CODE-TRACE]`.
- `[PREFLIGHT-HIT]` is added by the orchestrator when a deterministic scanner flagged the same class/entry.
- `[CROSS-AGENT]` is added by the orchestrator when 2+ agents independently reported the same root cause before deduplication. Because vector agents 1-4 scan disjoint partitions, the common case is corroboration between a vector agent and the adversarial agent (Agent 5) — that is the signal that a finding survived two independent reasoning paths, and it is the cross-partition value deep mode adds.
- `[ADVERSARIAL]` is added when Agent 5 discovered or independently confirmed the finding.
- Tags appear on the finding metadata line after the severity field.
- Multiple tags are space-separated: `[CODE-TRACE] [PREFLIGHT-HIT]`.
