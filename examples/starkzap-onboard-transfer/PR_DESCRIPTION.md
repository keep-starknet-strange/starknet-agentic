# feat(examples): Starkzap onboard + STRK transfer demo

## Summary

Adds a reproducible demo for end-to-end onboarding and STRK transfer on Starknet Sepolia using [Starkzap](https://docs.starknet.io/build/starkzap) (the official Starknet onboarding SDK).

## What it does

- **One command**: `pnpm demo --recipient 0x... --amount 10`
- **Flow**: SDK init → connect wallet (Signer strategy) → `ensureReady` → transfer STRK → `tx.wait()`
- **No seed phrase**, no gas purchase (user-pays or optional sponsored via AVNU)
- **Sepolia + STRK**: faucet gives STRK instantly, no bridging

## Features

| Flag | Description |
|------|-------------|
| `--recipient 0x...` | STRK recipient (or `RECIPIENT_ADDRESS` in .env) |
| `--amount 10` | Amount in STRK |
| `--sponsored` | Gasless via AVNU Paymaster (requires `AVNU_PAYMASTER_API_KEY`) |
| `--address-only` | Print wallet address for funding |
| `--evidence` | Log steps to `demo-evidence.json` for reproducibility |

## Stack

- **Starkzap** — official Starknet onboarding SDK (wraps starknet.js)
- **Signer strategy** — scriptable, headless (Starkzap also supports Privy for social login)
- **AVNU Paymaster** — optional gasless flows

## Files

- `run.ts` — main demo script
- `package.json` — starkzap dependency
- `README.md` — setup and run instructions
- `.env.example` — env template
- `TWEET_TEMPLATE.md` — template for sharing demo evidence

## Verification

```bash
cd examples/starkzap-onboard-transfer
cp .env.example .env
# Edit .env: PRIVATE_KEY (openssl rand -hex 32), RECIPIENT_ADDRESS
# Fund wallet at https://starknet-faucet.vercel.app/
pnpm demo --recipient 0xYourRecipient --amount 10
```
