# Technical Tweet: Starkzap Gasless Onboard + STRK Transfer

Use this template after running the demo with `--evidence`. Fill in the values from `demo-evidence.json`.

---

## Tweet (thread)

**1/ End-to-end gasless onboarding + STRK transfer on Starknet Sepolia — one command, no seed phrase, no gas purchase.**

Demo flow:
- SDK init → connect wallet → ensureReady (sponsored deploy) → transfer STRK → tx.wait()

All on free testnet tokens from the faucet.

**2/ Flow evidence:**

```
[1/4] Wallet address: <address>
[2/4] Account deployed (sponsored)
[3/4] STRK balance: <balance>
[4/4] Transfer: <amount> STRK → <recipient>
Tx: <explorer_url>
```

**3/ Why Sepolia + STRK?**
- Faucet gives STRK instantly (starknet-faucet.vercel.app)
- No bridging, no obscure testnet USDC
- One token, one network, zero setup friction

**4/ Reproduce:**
```bash
cd starknet-agentic/examples/starkzap-onboard-transfer
pnpm demo --recipient 0x... --amount 10 --evidence
```

Uses @starkzap SDK + AVNU Paymaster. Full magic: social login → wallet → transfer in one agent command.

---

## Evidence checklist (from demo-evidence.json)

- [ ] `step: "wallet_ready"` — address
- [ ] `step: "account_deployed"` — deploy tx (if first run)
- [ ] `step: "balance_check"` — balance before transfer
- [ ] `step: "transfer_submitted"` — txHash, explorerUrl
- [ ] `step: "transfer_confirmed"` — finality

## Explorer links

- Sepolia Starkscan: https://sepolia.starkscan.co/
- Voyager: https://sepolia.voyager.online/
