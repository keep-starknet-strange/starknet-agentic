---
name: cairo-contract-authoring-readme
description: User-facing guide for the cairo-contract-authoring skill workflow and security rules.
---

# cairo-contract-authoring

Write Cairo smart contracts on Starknet — correct, secure, and component-ready from the start.

<p>
  <img alt="mode new" src="https://img.shields.io/badge/mode-new-0969da" />
  <img alt="mode modify" src="https://img.shields.io/badge/mode-modify-0969da" />
  <img alt="mode component" src="https://img.shields.io/badge/mode-component-0969da" />
  <img alt="security rules" src="https://img.shields.io/badge/security%20rules-5-2ea043" />
  <img alt="OZ components" src="https://img.shields.io/badge/OZ%20components-supported-2ea043" />
</p>

Built for:

- **Cairo devs** starting a new Starknet contract
- **Teams** composing OpenZeppelin components (Ownable, ERC20, ERC721, AccessControl, Upgradeable)
- **Anyone** modifying storage, events, or interfaces on existing contracts

## Usage

```bash
# Full contract scaffold
/cairo-contract-authoring

# Specific requests
/cairo-contract-authoring "ERC20 token with owner-only minting and upgradeable"
/cairo-contract-authoring "add AccessControl to my existing contract"
/cairo-contract-authoring "modify storage to add a whitelist mapping"
```

## How it works

The skill orchestrates a **4-turn workflow**:

| Turn | What happens |
|------|-------------|
| **1. Understand** | Classify mode (new / modify / component), read existing code, load references |
| **2. Plan** | Output interface, storage, components, events, and security posture. Wait for confirmation. |
| **3. Implement** | Write code with mandatory security rules, wire OZ components, verify with `scarb build` |
| **4. Verify** | Re-check every external function's access posture, run tests, suggest next steps |

## Security rules (always enforced)

| # | Rule |
|---|------|
| 1 | Every storage-mutating external has explicit access posture: **guarded** or **documented-public** |
| 2 | Constructor validates all critical addresses are non-zero |
| 3 | Upgrade flows reject zero class hash |
| 4 | Timelock checks read from `get_block_timestamp()`, never from caller arguments |
| 5 | Anti-pattern/secure-pattern pairs enforced — the anti-pattern is never written |

## Structure

```text
cairo-contract-authoring/
  SKILL.md                          # 4-turn orchestration
  references/
    language.md                     # Cairo language fundamentals (320 lines)
    legacy-full.md                  # Contract patterns + OZ components (493 lines)
    anti-pattern-pairs.md           # 6 secure/insecure code pairs (140 lines)
    audit-handoff.md                # Post-authoring audit flow
  workflows/
    default.md                      # 5-phase workflow reference
```

## Recommended flow

```text
cairo-contract-authoring  →  cairo-testing  →  cairo-auditor
         write                   test              audit
```

## References

- Skill policy: [SKILL.md](SKILL.md)
- Workflow: [workflows/default.md](workflows/default.md)
- Language fundamentals: [references/language.md](references/language.md)
- Contract patterns: [references/legacy-full.md](references/legacy-full.md)
- Anti-patterns: [references/anti-pattern-pairs.md](references/anti-pattern-pairs.md)
