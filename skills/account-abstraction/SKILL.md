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

## starknet.js Examples

```ts
import { Account, RpcProvider } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC! });
const account = new Account(
  provider,
  process.env.ACCOUNT_ADDRESS!,
  process.env.ACCOUNT_PRIVATE_KEY!
);

// Validate-oriented read/check flow (non-state-changing path)
const nonce = await provider.getNonceForAddress(process.env.ACCOUNT_ADDRESS!);
await provider.callContract({
  contractAddress: process.env.ACCOUNT_ADDRESS!,
  entrypoint: "__validate__",
  calldata: [/* tx fields + signature payload */],
});

// Execute flow (state-changing)
const tx = await account.execute({
  contractAddress: process.env.ACCOUNT_ADDRESS!,
  entrypoint: "__execute__",
  calldata: [/* call array + calldata */],
});
await provider.waitForTransaction(tx.transaction_hash);
```

## Error Codes

| Code | Condition | Recovery |
| --- | --- | --- |
| `AA-001` | `__validate__` performs heavy/stateful logic | Move expensive logic out of validate path; add boundedness tests and gas/resource assertions. |
| `AA-002` | `__execute__` allows forbidden selectors/self-calls | Tighten allow/deny policy checks and add explicit self-call block tests. |
| `AA-003` | Nonce/domain separation mismatch | Recompute signing domain, verify nonce source, and add replay regression tests. |
| `AA-004` | Session-key policy bypass | Constrain target/selector/token/amount windows and add unauthorized-path tests. |
| `AA-005` | Unexpected runtime failure in account flow | Reproduce with minimal case, capture calldata/signature/nonce evidence, and escalate to `cairo-auditor` for targeted triage. |

## Core Focus

- `__validate__` constraints and DoS resistance.
- `__execute__` policy enforcement correctness.
- Replay protection and domain separation.
- Privileged selector and self-call protection.

## Workflow

- Main account-abstraction workflow: [default workflow](workflows/default.md)

## References

- Module index: [references index](references/README.md)
