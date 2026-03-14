---
name: starknet-agentic-skills
description: Routes Starknet skill invocations to focused modules for contract authoring, testing, optimization, deployment, and audit workflows.
---

# Starknet Agentic Skills Router

Use this file to choose the smallest relevant module.

## Start Here

- For contract security review: [cairo-auditor](skills/cairo-auditor/SKILL.md)
- For writing new contracts: [cairo-contract-authoring](skills/cairo-contract-authoring/SKILL.md)
- For testing and fuzzing: [cairo-testing](skills/cairo-testing/SKILL.md)
- For gas/perf optimization: [cairo-optimization](skills/cairo-optimization/SKILL.md)
- For build/declare/deploy/release operations: [cairo-deploy](skills/cairo-deploy/SKILL.md)
- For account abstraction rules and risks: [account-abstraction](skills/account-abstraction/SKILL.md)
- For Starknet network constraints: [starknet-network-facts](skills/starknet-network-facts/SKILL.md)

## Routing Policy

- Prefer one module first.
- Add a second module only when blocked.
- Keep context narrow and evidence-based.

## Recommended Build-to-Audit Flow

For new contract work, use this sequence:

1. [cairo-contract-authoring](skills/cairo-contract-authoring/SKILL.md)
2. [cairo-testing](skills/cairo-testing/SKILL.md)
3. [cairo-optimization](skills/cairo-optimization/SKILL.md) (if performance matters)
4. [cairo-auditor](skills/cairo-auditor/SKILL.md)
