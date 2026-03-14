# Cairo Skills Migration (Canonical in `starknet-agentic`)

This document records the migration outcome from `starknet-skills` into
`starknet-agentic` and the operating model after cutover.

## Scope

- Canonical Cairo skill source is now `keep-starknet-strange/starknet-agentic`.
- Legacy `starknet-skills` is deprecation-only and should not receive new
  feature content.

## Canonical Cairo Skill Set

- `cairo-auditor`
- `cairo-contract-authoring`
- `cairo-testing`
- `cairo-optimization`
- `cairo-deploy`
- `account-abstraction`
- `starknet-network-facts`

## Legacy to Canonical Mapping

| Legacy (`starknet-skills`) | Canonical (`starknet-agentic`) |
| --- | --- |
| `cairo-auditor` | `skills/cairo-auditor` |
| `cairo-contract-authoring` | `skills/cairo-contract-authoring` |
| `cairo-testing` | `skills/cairo-testing` |
| `cairo-optimization` | `skills/cairo-optimization` |
| `cairo-toolchain` | `skills/cairo-deploy` |
| `account-abstraction` | `skills/account-abstraction` |
| `starknet-network-facts` | `skills/starknet-network-facts` |

## Cutover Rules

- Do not reintroduce `cairo-security` or `cairo-contracts` as top-level skills.
- Keep routing stable via root `SKILL.md`, `llms.txt`, and
  `skills/manifest.json`.
- Preserve the `cairo-security` migration gap-diff reference in:
  `skills/cairo-auditor/references/audit-findings/cairo-security-gap-diff.md`.
- Run migration guards on any Cairo-skill refactor:
  - `python3 scripts/check_cairo_skill_cutover.py`
  - `python3 scripts/skills_manifest.py --check`
  - `python3 scripts/quick_validate_skill.py <cairo skill dirs...>`

## Plugin Identity

- Canonical bundle id: `starknet-agentic-skills`
- Marketplace slug: `keep-starknet-strange/starknet-agentic`

Install:

```bash
/plugin marketplace add keep-starknet-strange/starknet-agentic
/plugin install starknet-agentic-skills@keep-starknet-strange-starknet-agentic
```

