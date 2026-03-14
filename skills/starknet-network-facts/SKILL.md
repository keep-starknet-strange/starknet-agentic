---
name: starknet-network-facts
description: Starknet network-level constraints and protocol facts that impact contract safety and agent reasoning.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"0.1.1","org":"keep-starknet-strange","source":"starknet-skills"}
keywords: [starknet, network, fees, tx-version, sequencer, inclusion]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Starknet Network Facts

## When to Use

- Reasoning about chain behavior assumptions in contract logic.
- Validating time, fee, and transaction-version dependencies.

## When NOT to Use

- Contract implementation details unrelated to chain behavior.

## Quick Start

1. Identify assumptions in code about tx versions, fee tokens, and timing.
2. Verify assumptions against current network behavior before release.
3. Add tests for boundary behavior tied to block timing or tx metadata.

## Core Focus

- transaction version expectations
- fee token and bounds assumptions
- block-time-sensitive logic
- sequencer and inclusion model implications

## Workflow

- Main network-facts workflow: [default workflow](workflows/default.md)

## References

- Module index: [references index](references/README.md)
