# Cairo Skills Migration Guide

This repository is now the canonical source for Cairo/Starknet skills.

- Canonical repository: `keep-starknet-strange/starknet-agentic`
- Canonical path: `skills/`
- Previous source (`keep-starknet-strange/starknet-skills`) is transition-only and will be archived.

## Skill Mapping

| Previous (`starknet-skills`) | Canonical (`starknet-agentic`) |
| --- | --- |
| `cairo-security` | `skills/cairo-auditor` |
| `cairo-contract-authoring` | `skills/cairo-contract-authoring` |
| `cairo-testing` | `skills/cairo-testing` |
| `cairo-optimization` | `skills/cairo-optimization` |
| `cairo-toolchain` concepts | `skills/cairo-deploy` |
| `account-abstraction` | `skills/account-abstraction` |
| `starknet-network-facts` | `skills/starknet-network-facts` |

## Maintainer Checklist

1. Add or update Cairo skill content only in `starknet-agentic/skills/**`.
2. Do not add new feature content to `starknet-skills`; only deprecation/move notices are allowed.
3. Keep plugin install docs pointing to `keep-starknet-strange/starknet-agentic`.
4. Keep `cairo-auditor` remote version checks pointing to `starknet-agentic/skills/cairo-auditor/VERSION`.
5. Run quality checks before merge:
   - `python3 scripts/quality/validate_marketplace.py`
   - `python3 scripts/skills_manifest.py --check`
   - `python3 scripts/check_cairo_skill_cutover.py`
   - `python3 scripts/quality/check_vulndb_parity.py --cases evals/cases/cairo_auditor_benchmark.jsonl --cases evals/cases/cairo_auditor_realworld_benchmark.jsonl`
6. For PRs touching `skills/**/SKILL.md`, `skills/**/references/**`, `evals/**`, or `datasets/**`, ensure the `Cairo Skills Full Evals` workflow passes.

## Install Path Migration

- Old: `/plugin marketplace add keep-starknet-strange/starknet-skills`
- New: `/plugin marketplace add keep-starknet-strange/starknet-agentic`
- New install: `/plugin install starknet-agentic-skills@keep-starknet-strange-starknet-agentic`

- Old plugin id: `starknet-skills`
- Canonical plugin id in this repo: `starknet-agentic-skills`

## Notes

- Attribution and upstream provenance remain in skill metadata and `THIRD_PARTY.md`.
- Historical benchmark data remains under `evals/` for regression tracking.
