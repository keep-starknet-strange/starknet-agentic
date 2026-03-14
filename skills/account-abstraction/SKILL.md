---
name: account-abstraction
description: Starknet account abstraction correctness and security guidance for validate/execute paths, nonces, signatures, and session policies.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"0.1.1","org":"keep-starknet-strange","source":"starknet-agentic"}
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

## starknet.js Example

```ts
import { Account, CallData, RpcProvider } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC! });
const account = new Account(provider, process.env.ACCOUNT_ADDRESS!, process.env.PRIVATE_KEY!);

// Validate preview (debug-only): inspect __validate__ behavior with the current nonce.
const nonce = await account.getNonce();
const call = { contractAddress: process.env.TARGET!, entrypoint: "set_limit", calldata: CallData.compile({ value: 7 }) };
await provider.callContract({
  contractAddress: account.address,
  entrypoint: "__validate__",
  calldata: CallData.compile({ calls: [call], nonce }),
});

// Execute path: real transaction that triggers __execute__ and nonce checks.
const tx = await account.execute([call]);
await provider.waitForTransaction(tx.transaction_hash);
```

## Error Codes and Recovery

| Code | Condition | Recovery |
| --- | --- | --- |
| `AA-001` | `__validate__` is too expensive or stateful | Remove heavy logic from validation; add a test that caps validation steps. |
| `AA-002` | `__execute__` allows blocked selectors/self-calls | Enforce selector filters and self-call checks; add authorized/unauthorized regression tests. |
| `AA-003` | Nonce or domain mismatch causes replay risk | Normalize nonce source/hash domain; add replay and cross-domain tests. |
| `AA-999` | Unexpected runtime panic | Capture calldata + caller context, reproduce in unit tests, then escalate to `cairo-auditor`. |
