# Controller Calls (Spike)

Demonstrates the non-custodial integration path: MCP builds unsigned calls,
an external signer (Cartridge Controller, hardware wallet, multisig) executes.

Related: [#189](https://github.com/keep-starknet-strange/starknet-agentic/issues/189)

## Architecture

```
Agent (MCP client)
  │
  ▼
starknet_build_calls          ← call builder, no signing
  │
  ▼
calls.json                    ← portable, unsigned
  │
  ▼
External signer               ← Controller SessionAccount, multisig, etc.
  │
  ▼
Starknet
```

## 1. Build calls via MCP

Use the `starknet_build_calls` tool to compose validated, unsigned calls:

```json
{
  "name": "starknet_build_calls",
  "arguments": {
    "calls": [
      {
        "contractAddress": "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        "entrypoint": "transfer",
        "calldata": ["0x123", "0x0", "0x64", "0x0"]
      }
    ]
  }
}
```

Response:

```json
{
  "calls": [
    {
      "contractAddress": "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      "entrypoint": "transfer",
      "calldata": ["0x123", "0x0", "0x64", "0x0"]
    }
  ],
  "callCount": 1,
  "note": "Unsigned calls. Pass to account.execute(calls) or write to calls.json for external signing."
}
```

## 2. Write calls.json

Save the `calls` array to a file:

```bash
echo '<MCP response>' | jq '.calls' > calls.json
```

## 3. Execute with Cartridge Controller (Node.js)

```ts
import { SessionAccount } from "@cartridge/controller/node";
import calls from "./calls.json" assert { type: "json" };

const account = new SessionAccount(provider, sessionConfig);
const { transaction_hash } = await account.execute(calls);
```

See `run.mjs` for a runnable script.

## 4. Execute with starknet.js directly

```ts
import { Account, RpcProvider } from "starknet";
import calls from "./calls.json" assert { type: "json" };

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });
const account = new Account(provider, address, privateKey);
const { transaction_hash } = await account.execute(calls);
```

## Wire format

The `calls.json` schema is starknet.js `Call[]`:

```ts
interface Call {
  contractAddress: string;  // 0x-prefixed felt
  entrypoint: string;       // function name
  calldata: string[];       // array of 0x-prefixed felt strings
}
```

This is directly compatible with:
- `starknet.js` `Account.execute()`
- `@cartridge/controller` `SessionAccount.execute()`
- Any signer that accepts starknet.js `Call[]`

## Failure modes

| Scenario | Behavior |
|----------|----------|
| Invalid contract address | `starknet_build_calls` rejects before output |
| Invalid calldata felt | `starknet_build_calls` rejects before output |
| No active session | Controller throws at `execute()` time |
| Policy rejection | Controller throws if call doesn't match session policy |
| Execution revert | RPC returns revert reason after submission |

## Spike conclusion

**GO** -- the `Call[]` wire format is identical between starknet.js and
Cartridge Controller. No format translation needed. MCP builds calls,
Controller executes. The split is clean.

Open questions for Cartridge team remain in [#189](https://github.com/keep-starknet-strange/starknet-agentic/issues/189).
