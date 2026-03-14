---
name: account-abstraction
description: Starknet account abstraction correctness and security guidance for validate/execute paths, nonces, signatures, and session policies.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"0.1.2","org":"keep-starknet-strange","source":"starknet-agentic","migrated_from":"starknet-skills"}
keywords: [starknet, account-abstraction, signatures, nonces, session-keys, policy]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Account Abstraction

## When to Use

- Reviewing account contract validation and execution paths.
- Designing session-key policy boundaries.
- Validating nonce and signature semantics.

## When NOT to Use

- General contract authoring not involving account semantics.

## Quick Start

1. Confirm `__validate__` enforces lightweight, bounded checks.
2. Confirm `__execute__` enforces policy and selector boundaries.
3. Verify replay protections (nonce/domain separation) for all signature paths.
4. Add regression tests for each fixed session-key or policy finding.
5. Run `cairo-auditor` for final AA/security pass before merge.

## Core Focus

- `__validate__` constraints and DoS resistance.
- `__execute__` policy enforcement correctness.
- Replay protection and domain separation.
- Privileged selector and self-call protection.

## Workflow

- Main account-abstraction workflow: [default workflow](workflows/default.md)

## References

- Module index: [references index](references/README.md)
