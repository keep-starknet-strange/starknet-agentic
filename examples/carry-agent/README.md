# Carry Agent Demo

Deterministic carry monitor for `starknet-agentic`.

This example fetches Extended market + funding data, applies a policy-first basis/carry decision engine, and writes a machine-readable artifact.

It supports two modes:

- `dry-run` (default): decision-only, no execution.
- `execute`: hedged-entry execution path with safety rails.

## What it proves

1. Production-style strategy gating (`ENTER` / `HOLD` / `EXIT` / `PAUSE`) with explicit reason codes.
2. Defensive parsing against live Extended response envelopes (`status/data`, compact funding keys).
3. Safe default behavior: monitor-only (no order execution).

## Setup

From the repository root:

```bash
pnpm install
cp examples/carry-agent/.env.example examples/carry-agent/.env
```

Optional for user-specific fee tier:

```env
EXTENDED_API_KEY=...
```

For real perp execution in `mcp_spot` mode, install the official Extended Python SDK once:

```bash
python3 -m venv examples/carry-agent/.venv
source examples/carry-agent/.venv/bin/activate
pip install x10-python-trading-starknet==0.0.17
```

## Run

From the repository root:

```bash
pnpm --filter @starknetfoundation/starknet-agentic-carry-agent-demo run run
```

Execute mode with safety rails:

```bash
pnpm --filter @starknetfoundation/starknet-agentic-carry-agent-demo run run:execute
```

Spot execution through MCP (Starknet tool surface):

From the repository root:

```bash
# build MCP server once
pnpm --filter @starknetfoundation/starknet-agentic-mcp-server build

# run carry agent with spot execution delegated to MCP starknet_swap
CARRY_RUN_MODE=execute \
CARRY_EXECUTION_SURFACE=mcp_spot \
CARRY_EXTENDED_PYTHON_BIN=examples/carry-agent/.venv/bin/python \
STARKNET_RPC_URL=https://starknet-sepolia-rpc.publicnode.com \
STARKNET_ACCOUNT_ADDRESS=0x... \
STARKNET_PRIVATE_KEY=0x... \
pnpm --filter @starknetfoundation/starknet-agentic-carry-agent-demo run run
```

Output:

- structured JSON logs to stdout
- artifact JSON in `examples/carry-agent/artifacts/`

## Test

From the repository root:

```bash
pnpm --filter @starknetfoundation/starknet-agentic-carry-agent-demo test
pnpm --filter @starknetfoundation/starknet-agentic-carry-agent-demo typecheck
```

## Safety notes

- `CARRY_EXECUTION_SURFACE=mock` runs both legs in mock mode.
- `CARRY_EXECUTION_SURFACE=mcp_spot` executes the spot leg via MCP (`starknet_swap`) and executes the perp hedge on Extended via Python SDK signing.
- `mcp_spot` execute mode requires: `EXTENDED_API_KEY`, `EXTENDED_PUBLIC_KEY`, `EXTENDED_PRIVATE_KEY`, `EXTENDED_VAULT_NUMBER`, `STARKNET_RPC_URL`, `STARKNET_ACCOUNT_ADDRESS`, `STARKNET_PRIVATE_KEY`.
- Hard rails enforced before/through execute mode:
  - max notional cap (`CARRY_MAX_NOTIONAL_USD`)
  - stale-data block (`CARRY_MAX_DATA_AGE_MS`)
  - legging timeout + spot neutralization (`CARRY_LEGGING_TIMEOUT_MS`)
  - unhedged-cap neutralization (`CARRY_MAX_UNHEDGED_NOTIONAL_USD`)
  - dead-man switch hook (`CARRY_DEADMAN_SWITCH_*`)
- Never commit `.env` or API keys.
