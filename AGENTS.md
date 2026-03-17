# AGENTS.md - Canonical Agent Instructions

This is the single canonical instruction file for automated coding agents in this
repository. Keep behavior and workflow directives here.

Compatibility policy:
- `AGENTS.md` is canonical.
- Any tool-specific file (for example `CLAUDE.md`) must be a thin adapter or
  reference layer, not a conflicting instruction source.

## Mission

Build production-grade Starknet agent infrastructure: secure Cairo contracts,
reliable runtimes, and high-signal skills that external developers can install
and use with minimal friction.

## Scope

This repository includes:
- Cairo contracts (`contracts/**`)
- TypeScript packages and examples (`packages/**`, `examples/**`)
- public installable skills (`skills/**`)
- quality/security gates (`scripts/quality/**`, CI workflows)

## Core Operating Principles

1. Single source of truth:
   - Keep normative process guidance in this file only.
   - Do not duplicate behavioral rules across multiple root files.
2. Small, testable changes:
   - Prefer narrow diffs with explicit acceptance checks.
3. Security-first for high-risk paths:
   - Treat key handling, policy enforcement, and upgrade paths as critical.
4. Reproducibility:
   - Use pinned refs for install docs and deterministic validation scripts.
5. Explicit handoffs:
   - Use authoring -> testing -> optimization -> auditor flow for Cairo work.

## Roles and Boundaries

| Role | Owns | Does Not Own |
| --- | --- | --- |
| Coordinator | Scope, plan, sequencing, `STATUS.md` accuracy | Large feature implementation |
| Contracts Executor | Cairo contracts/tests/deploy scripts | Mobile or unrelated UX changes |
| Runtime Executor | MCP/A2A/adapters/tool runtime | Silent ABI/policy shape changes |
| Skills Executor | `skills/**`, references, install UX docs | Contract logic changes without coordination |
| Reviewer | Correctness, security regressions, release gates | Initial implementation |

## Task Lifecycle

`todo -> inprogress -> inreview -> done`

The `blocked` state can be entered from any state when waiting on a dependency or decision.

## Work Protocol

### 1) Investigation (Coordinator)

- Identify touched files/interfaces and risk class.
- Define acceptance checks before implementation.
- Mark parallelizable vs serialized work.

### 2) Execution (Executor)

- Implement only approved scope.
- Keep changes focused and reversible.
- Surface blockers immediately.

### 3) Review (Reviewer)

- Run relevant checks.
- Verify interface compatibility and security posture.
- Confirm acceptance criteria are satisfied.

## Parallelization Rules

Safe to parallelize:
- `apps/mobile/**` vs `contracts/**` when interfaces are stable
- independent skill docs under different `skills/<name>/`
- docs work while long test suites run

Must serialize:
- Any shared interface change (ABI, calldata shape, policy fields)
- changes to `scripts/**` and CI workflows
- concurrent edits to the same skill directory

Conflict resolution:
1. Detect overlap early (`rg` on touched files).
2. Pause dependent work if overlap exists.
3. Land interface change first with tests.
4. Rebase/adjust dependents, then re-verify.

## Required Validation by Change Type

Skills/install UX changes:
- `python3 scripts/quality/validate_skills.py`
- `python3 scripts/skills_manifest.py --check`
- `python3 scripts/quality/check_codex_distribution.py`
- `python3 -m unittest scripts/quality/test_codex_distribution.py`
- `python3 scripts/quality/validate_marketplace.py`

Cairo skill benchmark/eval changes:
- run the relevant deterministic benchmark command
- if touching benchmark/eval policy, update scorecards and gate docs

Contract changes:
- `scarb build` and `snforge test` in impacted contract package(s)

TypeScript package changes:
- package build + tests for impacted workspace packages

## Escalation Rules

Escalate when:
- public interfaces or policy schema change
- security-sensitive behavior changes (keys, approvals, upgrade authority)
- deployment credentials/funding/network access are required
- contradictory requirements block progress

Escalation format:

```md
## Escalation: [Title]
**Blocker**: [...]
**Options**:
1. [...]
2. [...]
**Recommendation**: [...]
```

## Canonical References

- Skills spec and format: `references/agentskills/**`
- System architecture and boundaries: `docs/SPECIFICATION.md`
- Security policy: `SECURITY.md`
- Cairo migration mapping: `docs/CAIRO_SKILLS_MIGRATION.md`
- Skills distribution docs: `skills/README.md`
