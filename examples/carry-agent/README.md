# Carry Agent Demo

Deterministic carry monitor for `starknet-agentic`.

This example fetches Extended market + funding data, applies a policy-first basis/carry decision engine, and writes a machine-readable artifact.

It supports two modes:

- `dry-run` (default): decision-only, no execution.
- `execute`: mock hedged entry path with safety rails (no real orders).

## What it proves

1. Production-style strategy gating (`ENTER` / `HOLD` / `EXIT` / `PAUSE`) with explicit reason codes.
2. Defensive parsing against live Extended response envelopes (`status/data`, compact funding keys).
3. Safe default behavior: monitor-only (no order execution).

## Setup

```bash
pnpm install
cp examples/carry-agent/.env.example examples/carry-agent/.env
```

Optional for user-specific fee tier:

```env
EXTENDED_API_KEY=...
```

## Run

```bash
pnpm --filter @starknet-agentic/carry-agent-demo run run
```

Execute mode with safety rails:

```bash
pnpm --filter @starknet-agentic/carry-agent-demo run run:execute
```

Output:

- structured JSON logs to stdout
- artifact JSON in `examples/carry-agent/artifacts/`

## Test

```bash
pnpm --filter @starknet-agentic/carry-agent-demo test
pnpm --filter @starknet-agentic/carry-agent-demo typecheck
```

## Safety notes

- The current `execute` path is mock-only and exists to verify safety logic end-to-end.
- Hard rails enforced before/through execute mode:
  - max notional cap (`CARRY_MAX_NOTIONAL_USD`)
  - stale-data block (`CARRY_MAX_DATA_AGE_MS`)
  - legging timeout + spot neutralization (`CARRY_LEGGING_TIMEOUT_MS`)
  - unhedged-cap neutralization (`CARRY_MAX_UNHEDGED_NOTIONAL_USD`)
  - dead-man switch hook (`CARRY_DEADMAN_SWITCH_*`)
- Never commit `.env` or API keys.
