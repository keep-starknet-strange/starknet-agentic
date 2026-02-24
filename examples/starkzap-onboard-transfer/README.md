# Starkzap Demo: Gasless Onboard + STRK Transfer (Sepolia)

**Showy demo**: End-to-end gasless onboarding and STRK transfer on Sepolia — no private key handling by user, no gas purchase, one command.

## Flow

1. **SDK init** on Sepolia (with optional AVNU paymaster for sponsored mode)
2. **Connect wallet** via Signer strategy (or Privy in full demo)
3. **`wallet.ensureReady({ deploy: "if_needed" })`** — sponsored deploy when paymaster configured
4. **`wallet.transfer(STRK, [...], { feeMode: "sponsored" })`** — gasless transfer
5. **`tx.wait()`** — finality confirmation

## Why Sepolia + STRK?

- **STRK from faucet** — [starknet-faucet.vercel.app](https://starknet-faucet.vercel.app/) gives STRK instantly
- **No bridging** — skip testnet USDC sourcing
- **One token, one network** — zero setup friction for reproduction

## Prerequisites

- Node.js 20+
- A test private key (generate: `openssl rand -hex 32`)
- For **sponsored** mode: [AVNU Paymaster API key](https://portal.avnu.fi/)

## Setup

```bash
cd examples/starkzap-onboard-transfer
cp .env.example .env
# Edit .env with PRIVATE_KEY, RECIPIENT_ADDRESS, and optionally AVNU_PAYMASTER_API_KEY
```

## Run

```bash
# User-pays (needs STRK in wallet for gas)
pnpm demo --recipient 0xYourRecipientAddress --amount 10

# Sponsored (gasless — requires AVNU_PAYMASTER_API_KEY)
pnpm demo --recipient 0xYourRecipientAddress --amount 10 --sponsored
```

## Env Vars

| Var | Required | Description |
|-----|----------|-------------|
| `PRIVATE_KEY` | Yes | Test signer (0x-prefixed hex) |
| `RECIPIENT_ADDRESS` | Yes* | STRK recipient (*or pass `--recipient`) |
| `AVNU_PAYMASTER_API_KEY` | For sponsored | From [portal.avnu.fi](https://portal.avnu.fi/) |
| `STARKNET_RPC_URL` | No | Default: PublicNode Sepolia |

## Get Test STRK

1. Run once to get your wallet address
2. Visit [starknet-faucet.vercel.app](https://starknet-faucet.vercel.app/)
3. Paste address, request STRK
4. Re-run the demo

## Full Demo (Privy + Social Login)

For the full "social login → wallet → transfer" flow, see the [Starkzap Privy integration](https://docs.starknet.io/build/starkzap/integrations/privy). This example uses the Signer strategy for a reproducible, scriptable demo.
