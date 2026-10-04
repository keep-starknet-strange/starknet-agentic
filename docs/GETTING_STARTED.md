# Getting Started with Starknet Agentic

This is the entry point for new users. Pick the path that matches what you want to do:

| Goal | Start here |
|---|---|
| Use Starknet skills in Claude Code, Codex, or another agent host | [Skills Quickstart](./SKILLS_QUICKSTART.md) |
| Scaffold a new agent project | `npx @starknetfoundation/create-starknet-agent@latest` ([README](../packages/create-starknet-agent/README.md)) |
| Give an MCP client (Claude Desktop, Cursor, ...) Starknet tools | [MCP server README](../packages/starknet-mcp-server/README.md) |
| Build from source, run examples, or contribute | [Build from source](#build-from-source) below |

## Build from Source

### Prerequisites

- Node.js 24+ (see [`.nvmrc`](../.nvmrc)) and pnpm via corepack (`corepack enable`; version pinned in root `package.json`)
- A Starknet Sepolia account with some STRK for fees ([faucet](https://starknet-faucet.vercel.app/))
- Basic familiarity with TypeScript

### 1. Clone and install

```bash
git clone https://github.com/keep-starknet-strange/starknet-agentic.git
cd starknet-agentic
pnpm install
pnpm build
```

### 2. Configure environment

```bash
cp .env.example .env
```

`.env.example` uses mainnet endpoints. For Sepolia, set:

```env
STARKNET_RPC_URL=https://starknet-sepolia.g.alchemy.com/v2/YOUR_KEY
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_PRIVATE_KEY=0x...   # local development only; never commit

# Optional: avnu for swaps and paymaster
AVNU_BASE_URL=https://sepolia.api.avnu.fi
AVNU_PAYMASTER_URL=https://sepolia.paymaster.avnu.fi
```

Direct private keys are for local development. Production runtimes should use the proxy signer boundary (`STARKNET_SIGNER_MODE=proxy`, see [`security/SIGNER_API_SPEC.md`](./security/SIGNER_API_SPEC.md)).

<details>
<summary>Where to get an account</summary>

- **Dedicated agent account (recommended):** [`examples/onboard-agent`](../examples/onboard-agent/README.md) deploys an agent account through `AgentAccountFactory` and registers its ERC-8004 identity in one command.
- **Starknet Foundry:** `sncast account create` then `sncast account deploy` (see the account setup section of the [`cairo-deploy` skill](../skills/cairo-deploy/SKILL.md)).
- **Browser wallet:** export the private key of a Sepolia account from your wallet's settings. Use a throwaway account, not one holding real funds.

</details>

### 3. Run a first example

Minimal end-to-end check (RPC read + a 0-value self-transfer). Configure `examples/hello-agent/.env` as described in its [README](../examples/hello-agent/README.md), then:

```bash
pnpm demo:hello-agent
```

Or check a balance with the wallet skill scripts (they read exported variables or a `.env` in `skills/starknet-wallet/`):

```bash
cd skills/starknet-wallet
npm install
set -a; source ../../.env; set +a
npm run check-balance            # TOKEN=STRK npm run check-balance for STRK
```

---

## What You Can Build

### Wallet agent

```typescript
import { RpcProvider, Account } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });

const account = new Account({
  provider,
  address: process.env.STARKNET_ACCOUNT_ADDRESS!,
  signer: process.env.STARKNET_PRIVATE_KEY!,
});
```

Batch balance checks: `skills/starknet-wallet/scripts/check-balances.ts` or the `starknet_get_balances` MCP tool.

### DeFi agent

```typescript
import { getQuotes, executeSwap } from "@avnu/avnu-sdk";

// Best quote for swapping 1 ETH to STRK
const quotes = await getQuotes({
  sellTokenAddress: ETH_ADDRESS,
  buyTokenAddress: STRK_ADDRESS,
  sellAmount: BigInt(1e18),
  takerAddress: account.address,
});

const result = await executeSwap({
  provider: account,
  quote: quotes[0],
  slippage: 0.01, // 1%
  executeApprove: true,
});

console.log(`Swap complete: ${result.transactionHash}`);
```

Full example: [`examples/defi-agent/`](../examples/defi-agent/README.md).

### Identity agent (ERC-8004)

The MCP server exposes `starknet_register_agent`, `starknet_set_agent_metadata`, and `starknet_get_agent_metadata` when `ERC8004_IDENTITY_REGISTRY_ADDRESS` is set. To call the registry directly:

```typescript
import { Contract, hash } from "starknet";

const identityRegistry = new Contract({
  abi: IdentityRegistryABI,
  address: IDENTITY_REGISTRY_ADDRESS, // see docs/DEPLOYMENT_TRUTH_SHEET.md
  providerOrAccount: account,
});

// Mint the agent identity NFT
const { transaction_hash } = await identityRegistry.register();
const receipt = await provider.waitForTransaction(transaction_hash);

// Read the new agent id from the Registered event: keys = [selector, agent_id.low, agent_id.high]
const registeredSelector = BigInt(hash.getSelectorFromName("Registered"));
const event = (receipt as { events?: { from_address: string; keys: string[] }[] }).events?.find(
  (e) =>
    BigInt(e.from_address) === BigInt(IDENTITY_REGISTRY_ADDRESS) &&
    BigInt(e.keys[0]) === registeredSelector
);
if (!event) throw new Error("Registered event not found");
const agentId = BigInt(event.keys[1]) + (BigInt(event.keys[2]) << 128n);

await identityRegistry.set_metadata(agentId, "agentName", "My Trading Bot");
await identityRegistry.set_metadata(agentId, "capabilities", "swap,arbitrage");
```

More patterns: [`skills/starknet-identity/`](../skills/starknet-identity/SKILL.md).

---

## Using MCP Tools

```bash
pnpm --filter @starknetfoundation/starknet-agentic-mcp-server build
node packages/starknet-mcp-server/dist/index.js
```

Client configuration (Claude Desktop and others), signer modes, and the current tool list are in the [MCP server README](../packages/starknet-mcp-server/README.md).

---

## Common Patterns

### Error handling

```typescript
try {
  const result = await transfer(recipient, "ETH", "1.0");
  console.log("Transfer successful:", result.transactionHash);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("INSUFFICIENT_BALANCE")) {
    console.error("Not enough tokens");
  } else if (message.includes("INVALID_NONCE")) {
    console.error("Nonce mismatch - fetch a fresh nonce and retry the transfer");
  } else {
    console.error("Transfer failed:", message);
  }
}
```

### Multicall instead of separate transactions

```typescript
// Bad: two transactions
await account.execute({ contractAddress: token, entrypoint: "approve", ... });
await account.execute({ contractAddress: router, entrypoint: "swap", ... });

// Good: one multicall transaction
await account.execute([
  { contractAddress: token, entrypoint: "approve", ... },
  { contractAddress: router, entrypoint: "swap", ... },
]);
```

### Gasless transactions

```typescript
// Pay gas in USDC through the avnu paymaster
const result = await mcpClient.callTool({
  name: "starknet_transfer",
  arguments: {
    recipient: "0x...",
    token: "STRK",
    amount: "100",
    gasfree: true,
    gasToken: "USDC",
  },
});
```

---

## FAQs

<details>
<summary><b>Can I use this on mainnet?</b></summary>

Yes. Point `STARKNET_RPC_URL` at a mainnet endpoint and use mainnet credentials, ideally behind the proxy signer. Start on Sepolia with small amounts first.

</details>

<details>
<summary><b>What does it cost to run an agent?</b></summary>

Reads are free. Writes pay a transaction fee in STRK, or in a paymaster-supported token in gasless mode. Use `starknet_estimate_fee` (or `account.estimateInvokeFee`) before sending.

</details>

<details>
<summary><b>Is this production-ready?</b></summary>

The ERC-8004 registries are deployed on mainnet ([`DEPLOYMENT_TRUTH_SHEET.md`](./DEPLOYMENT_TRUTH_SHEET.md)). Launch gates and open items are tracked in [`security/LAUNCH_READINESS_TRACKER.md`](./security/LAUNCH_READINESS_TRACKER.md). Examples are reference implementations: review and test them before using real funds.

</details>

<details>
<summary><b>How do I debug issues?</b></summary>

1. Check the [Troubleshooting Guide](./TROUBLESHOOTING.md) (skill install issues: [`skills/TROUBLESHOOTING.md`](../skills/TROUBLESHOOTING.md))
2. Enable debug logging: `export DEBUG=starknet:*`
3. Verify the RPC endpoint responds (see Quick Diagnostics in the troubleshooting guide)
4. Check the account has enough balance for fees

</details>

<details>
<summary><b>Can my agent execute transactions autonomously?</b></summary>

Yes. Use **session keys** to grant pre-approved permissions:

1. Create a session key with spending limits
2. The agent uses the session key for autonomous operations
3. The owner can revoke it at any time

See [`contracts/agent-account`](../contracts/agent-account/README.md) and the [E2E guide](./E2E_TESTING_GUIDE.md#part-b-sessionaccount-spending-policy).

</details>

---

## Security Best Practices

- Never commit private keys or `.env` files
- Use the proxy signer boundary in production
- Start on Sepolia with small amounts
- Set spending limits on session keys
- Monitor agent activity regularly
- Use hardware wallets for large amounts

---

## Next Steps

- [Skills catalog](../skills/README.md): reusable agent capabilities
- [MCP server README](../packages/starknet-mcp-server/README.md): available tools and configuration
- [DeFi agent example](../examples/defi-agent/README.md)
- [Architecture spec](./SPECIFICATION.md)
- Questions and bugs: [GitHub Issues](https://github.com/keep-starknet-strange/starknet-agentic/issues) and [Discussions](https://github.com/keep-starknet-strange/starknet-agentic/discussions)
