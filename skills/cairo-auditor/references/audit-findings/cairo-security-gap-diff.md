# `cairo-security` Gap Diff for Migration

This document is the required pre-deletion coverage check for replacing
`skills/cairo-security` with `skills/cairo-auditor`.

## Scope

- Source removed skill: `skills/cairo-security/SKILL.md` (main branch baseline before cutover)
- Target skill set:
  - `skills/cairo-auditor/` (workflow, vectors, vuln DB, judging)
  - `skills/cairo-contract-authoring/` (secure authoring patterns)
  - `skills/cairo-testing/` (security regression test strategy)
  - `skills/account-abstraction/` and `skills/starknet-network-facts/` (specialized risk domains)

## Method

1. Enumerated source major sections from removed `cairo-security`.
2. Checked each section for explicit target coverage in migrated skill references.
3. Verified source preservation file exists:
   `skills/cairo-auditor/references/audit-findings/source-cairo-security-import.md`.
4. Verified core security signal packs remain intact:
   - vulnerability database: 29 class files
   - attack vectors: 170 vectors across 4 partitions

## Section Coverage Mapping

| Source `cairo-security` domain | Migration coverage |
| --- | --- |
| Access control, upgrades, initializers | `cairo-auditor/references/attack-vectors/attack-vectors-1.md` + vuln-db classes (`IMMEDIATE-UPGRADE-WITHOUT-TIMELOCK`, `NO-ACCESS-CONTROL-MUTATION`, etc.) |
| CEI / reentrancy | attack vectors + vuln-db classes on unsafe external interaction ordering |
| Precision and rounding exploits | vuln-db + attack vectors; authoring/testing references for invariant enforcement |
| Cairo-specific pitfalls (`felt252`, maps, unwraps) | vuln-db cards + `cairo-contract-authoring/references/anti-pattern-pairs.md` |
| Signature replay / nonce protection | attack vectors + `account-abstraction` workflow |
| Session key and AA risks | `account-abstraction` skill + auditor attack vectors |
| L1/L2 and protocol-level constraints | `starknet-network-facts` skill + auditor vectors |
| OpenZeppelin hardening patterns | `cairo-contract-authoring/references/legacy-full.md` + anti-pattern pairs |
| Audit workflow and reporting discipline | `cairo-auditor/SKILL.md`, `references/judging.md`, `references/report-formatting.md` |
| Security tooling and triage process | `cairo-auditor` workflows + references + bundled scripts |

## Source Preservation

The legacy long-form content is retained verbatim at:

- `skills/cairo-auditor/references/audit-findings/source-cairo-security-import.md`

This preserves citations and historical guidance while operational logic moves to
workflow-first auditor modules.

## Outcome

- No blocking content gaps found for migration.
- Deletion of `skills/cairo-security` is approved for this cutover.
- Any future uncovered edge case should be added as:
  1. a new vuln-db class and attack vector, and
  2. a matching deterministic eval case.
