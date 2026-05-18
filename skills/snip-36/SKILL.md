---
name: snip-36
description: "SNIP-36 virtual block proving on Starknet. Trigger on \"virtual block\", \"SNIP-36\", \"off-chain proof\", \"anonymous vote\", \"heavy computation off-chain\", \"prove a transaction\". Covers Cairo virtual contract, proof server, starknet.js integration, and on-chain verification."
license: Apache-2.0
metadata:
  author: PhilippeR26
  version: 0.1.0
  org: keep-starknet-strange
  source: starknet-agentic
  contributors:
    - PhilippeR26
keywords:
  - snip-36
  - virtual-block
  - stwo-prover
  - proof
  - privacy
  - anonymous-vote
  - cairo
  - starknet
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
user-invocable: true
---


## Overview

SNIP-36 allows executing a single `INVOKE_TXN_V3` off-chain against a reference Starknet block's state, then submitting a stwo-cairo proof on-chain. The proof extends the standard v3 transaction hash by appending a `proof_facts_hash`. Contracts verify this via `get_execution_info_v3_syscall`.

**Core value:** Run arbitrary Cairo logic off-chain (heavy computation, privacy checks, game outcomes, attribute proofs) and commit only the verified result on-chain — without revealing private inputs.

**Spec:** https://community.starknet.io/t/snip-36-in-protocol-proof-verification/116123

**Reference implementation:** https://github.com/starknet-innovation/snip-36-prover-backend

---

## Use Cases

| Application | Virtual computes | L2→L1 message commits | On-chain verifies |
|---|---|---|---|
| Heavy computation | hash / heavy algo on large input | `{ input, result }` | result stored on-chain |
| Age proof | birth_date + secret → age ≥ 18 | `{ nullifier, has_18_years }` | boolean flag recorded |
| Secret whitelist | secret → member check | `{ user_id, is_whitelisted }` | access granted |
| Provable coin flip | `pedersen(seed, player) % 2` | `{ player, seed, bet, outcome, won }` | settlement paid out |
| Anonymous vote | ECDSA sig → voting weight | `{ proposal_id, nullifier, support, weight }` | vote tallied |
| ZKThread / shard | large state transition | `{ old_root, new_root, ... }` | state updated |

---

## Generic 3-Phase Pattern

```text
PHASE 1 — CREATE (off-chain build)
  Build a signed INVOKE_TXN_V3 that calls the virtual function.
  Never broadcast. Includes public_input + private_input in calldata.

PHASE 2 — PROVE (proof server)
  POST { blockNumber, tx } → snip36 prove virtual-os
  Returns { proof, proofFacts, l2ToL1Messages }
  Duration: ~40-50s, ~18 GB RAM

PHASE 3 — VERIFY (on-chain)
  execute(verify_call, { proof, proofFacts })
  Contract reads proof_facts, recomputes message hash, applies state change.
```

---

## Part 1 — Cairo Contract

### Scarb.toml requirements

```toml
[[target.starknet-contract]]
allowed-libfuncs-list.name = "all"   # required for get_execution_info_v3_syscall
```

### Virtual function pattern

```cairo
// Called VIRTUALLY (by proof server). Never call directly on-chain.
// public_input  → included in L2→L1 message (visible to verifier)
// private_input → used in computation but NEVER revealed on-chain
fn create_proof(
    ref self: ContractState,
    public_input: PublicInput,
    private_input: PrivateInput,
) {
    // 1. Compute result using both inputs
    let result = heavy_computation(public_input, private_input);

    // 2. Commit result as L2→L1 message — this becomes the proof output
    let mut payload: Array<felt252> = array![];
    // serialize fields the verifier will need:
    payload.append(public_input.field1);
    payload.append(result);
    send_message_to_l1_syscall(
        to_address: 0,   // unused for SNIP-36 (no L1 delivery)
        payload: payload.span()
    ).unwrap();
}
```

### On-chain verify function pattern

```cairo
// Called ON-CHAIN with proof attached via { proof, proofFacts }.
fn verify_result(
    ref self: ContractState,
    public_message: PublicMessage,  // decoded from l2ToL1Messages[0].payload
) {
    // 1. Read proof_facts committed by SNIP-36
    let info = starknet::syscalls::get_execution_info_v3_syscall()
        .unwrap_syscall().unbox();
    let proof_facts = info.tx_info.unbox().proof_facts;

    // 2. Recompute message hash from the submitted public_message
    let message_hash = compute_message_hash(get_contract_address(), @public_message);

    // 3. Assert proof integrity: proof_facts[8] must equal our hash
    assert(*proof_facts[8] == message_hash, 'Proof message mismatch');

    // 4. Apply state change (nullifier, store result, transfer funds, etc.)
    // ...
}
```

### proof_facts layout

```text
index: [0,  1,  2,                   3,  4,            5,          6,              7,          8,             ...]
value: [0,  0,  virtual_OS_prog_hash, 0,  block_number, block_hash, OS_config_hash, n_messages, msg_hash_0,    msg_hash_1, ...]
```

- `[7]` = number of L2→L1 messages emitted (usually 1)
- `[8]` = Poseidon hash of first message (checked against recomputed hash)

### Message hash computation (Cairo)

```cairo
fn compute_message_hash(contract_addr: ContractAddress, msg: @PublicMessage) -> felt252 {
    let mut payload: Array<felt252> = array![];
    (*msg).serialize(ref payload);
    let mut data: Array<felt252> = array![
        contract_addr.into(),
        0_felt252,
        payload.len().into(),
    ];
    for f in payload.span() { data.append(*f); }
    poseidon_hash_span(data.span())
}
```

### Nullifier pattern (for replay protection)

```cairo
const NULLIFIER_DOMAIN: felt252 = 'my_app_nullifier_v1';

fn compute_nullifier(unique_id: felt252, secret: Span<felt252>) -> felt252 {
    let secret_hash = poseidon_hash_span(secret);
    poseidon_hash_span(array![NULLIFIER_DOMAIN, unique_id, secret_hash].span())
}
```

TypeScript equivalent (must match exactly):

```typescript
const NULLIFIER_DOMAIN = shortString.encodeShortString("my_app_nullifier_v1");

function computeNullifier(uniqueId: string, secret: string[]): string {
    const secretHash = hash.computePoseidonHashOnElements(secret);
    return hash.computePoseidonHashOnElements([NULLIFIER_DOMAIN, uniqueId, secretHash]);
}
```

### Test helpers (snforge)

```cairo
fn build_proof_facts(message_hash: felt252) -> Array<felt252> {
    array![0, 0, 0, 0, 0, 0, 0, 1, message_hash]
    //                           ↑           ↑
    //                    n_messages    hash at [8]
}

// Inject in test
start_cheat_proof_facts(contract_addr, build_proof_facts(msg_hash).span());
contract.verify_result(public_message);
stop_cheat_proof_facts(contract_addr);
```

---

## Part 2 — Proof Server (Node.js + Rust CLI)

### Setup

```bash
# Clone and build
git clone https://github.com/starknet-innovation/snip-36-prover-backend
cd snip-36-prover-backend
cargo build --release -p snip36-cli

# Download deps (~10 GB, ~20 min, needs Rust nightly-2025-07-14)
./target/release/snip36 setup

# Configure
cp .env.example .env
# STARKNET_RPC_URL=...      (v0.8+ JSON-RPC, e.g. Alchemy)
# STARKNET_ACCOUNT_ADDRESS=...
# STARKNET_PRIVATE_KEY=...
# STARKNET_GATEWAY_URL=https://alpha-sepolia.starknet.io
```

### Express server

```typescript
// src/index.ts
import express from "express";
import { ensureBuilt } from "./build";
import { proveRouter } from "./prove";

ensureBuilt();
const app = express();
app.use(express.json());
app.use(proveRouter);
app.listen(Number(process.env.PORT ?? 3030));
```

### POST /prove — SSE streaming endpoint

```typescript
// src/prove.ts
proveRouter.post("/prove", (req, res) => {
    const { blockNumber, tx } = req.body ?? {};
    if (!Number.isInteger(blockNumber) || blockNumber < 0 || typeof tx !== "object" || tx == null) {
        res.status(400).json({ code: "INVALID_REQUEST", message: "blockNumber or tx is invalid" });
        return;
    }

    const txJsonPath = `./tmp/tx-${Date.now()}.json`;
    fs.writeFileSync(txJsonPath, JSON.stringify(tx));

    const outputBase = `./output/prove-${Date.now()}`;
    const args = [
        "prove", "virtual-os",
        "--block-number", String(blockNumber),
        "--tx-json", txJsonPath,
        "--rpc-url", process.env.STARKNET_RPC_URL!,
        "--output", `${outputBase}.proof`,
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.flushHeaders();

    const send = (event: "log" | "done" | "error", data: object) =>
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const child = spawn(BINARY, args, { cwd: REPO_CWD, env: process.env });
    child.stdout.on("data", c => send("log", { stream: "stdout", line: c.toString() }));
    child.stderr.on("data", c => send("log", { stream: "stderr", line: c.toString() }));

    child.on("close", code => {
        try {
            if (code !== 0) {
                send("error", { code: "PROVER_EXIT_NON_ZERO", message: "snip36 exited non-zero" });
                return;
            }
            const proof = fs.readFileSync(`${outputBase}.proof`, "ascii").trim();
            const proofFacts = JSON.parse(fs.readFileSync(`${outputBase}.proof_facts`, "ascii"));
            const rawPath = `${outputBase}.raw_messages.json`;
            const l2ToL1Messages = fs.existsSync(rawPath)
                ? JSON.parse(fs.readFileSync(rawPath, "ascii")).l2_to_l1_messages
                : undefined;
            send("done", { proof, proofFacts, ...(l2ToL1Messages && { l2ToL1Messages }) });
        } catch {
            send("error", { code: "ARTIFACT_READ_FAILED", message: "failed to read proof artifacts" });
        } finally {
            [txJsonPath, `${outputBase}.proof`, `${outputBase}.proof_facts`, `${outputBase}.raw_messages.json`]
                .forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
            res.end();
        }
    });
});
```

### Output artifacts

| File | Content |
|---|---|
| `*.proof` | Base64 stwo proof (zstd-compressed) |
| `*.proof_facts` | JSON array of hex felt252s |
| `*.raw_messages.json` | `{ l2_to_l1_messages: [{ from_address, payload[], to_address }] }` |

### Proof server env vars

```env
STARKNET_RPC_URL=...              # v0.8+ endpoint
STARKNET_ACCOUNT_ADDRESS=0x...   # signs the virtual tx
STARKNET_PRIVATE_KEY=0x...
STARKNET_GATEWAY_URL=https://alpha-sepolia.starknet.io
STARKNET_CHAIN_ID=SN_SEPOLIA     # must match RPC + gateway
PORT=3030
```

---

## Part 3 — Starknet.js Integration

### SSE client

```typescript
// requestProof.ts
export type ProveResult = {
    proof: string;
    proofFacts: BigNumberish[];
    l2ToL1Messages?: { from_address: BigNumberish; payload: BigNumberish[]; to_address: BigNumberish; }[];
};

export async function requestProof(blockNumber: number, tx: INVOKE_TXN_V3): Promise<ProveResult> {
    const res = await fetch(`${process.env.PROOF_SERVER_URL ?? "http://localhost:3030"}/prove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockNumber, tx }),
    });

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let result: ProveResult | undefined;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const msg of parts) {
            const event = msg.match(/^event: (\w+)/)?.[1];
            const data = JSON.parse(msg.match(/^data: (.+)$/m)?.[1] ?? "null");
            if (event === "done")  result = data;
            if (event === "error") throw new Error(data.message);
        }
    }
    if (!result) throw new Error("No proof result");
    return result;
}
```

### Virtual transaction build + proof orchestration

```typescript
// orchestrate.ts  (server-side only — private key must never reach browser)
async function proveAndVerify(
    publicInput: unknown,
    privateInput: unknown,
): Promise<string> {    // returns transaction_hash
    const provider = new RpcProvider({ nodeUrl: process.env.RPC_URL! });
    const account = new Account({
        provider,
        address: process.env.ACCOUNT_ADDRESS!,
        signer: process.env.PRIVATE_KEY!,
    });
    const contract = new Contract({ abi, address: CONTRACT_ADDRESS, providerOrAccount: account });

    // 1. Build virtual call (never broadcast)
    const call = contract.populate("create_proof", { public_input: publicInput, private_input: privateInput });

    // 2. ⚠️ Must set resourceBounds manually — fee estimation is impossible for a virtual tx
    const prices = await provider.getGasPrices();
    const M = 2n;
    const resourceBounds = {
        l2_gas:     { max_amount: 0x279fc0n * M, max_price_per_unit: prices.l2GasPrice * M },
        l1_gas:     { max_amount: 0xbd2an * M,   max_price_per_unit: prices.l1GasPrice * M },
        l1_data_gas:{ max_amount: 0xc0n * M,     max_price_per_unit: prices.l1DataGasPrice * M },
    };

    // 3. Sign without broadcasting
    // ⚠️ getSignedTransaction() requires the starknet.js fork:
    //    "starknet-proof": "github:PhilippeR26/starknet.js#buildExecute"
    //    (aliased starknetFork in DAPPs — NOT in standard starknet.js)
    const tx: INVOKE_TXN_V3 = await account.getSignedTransaction(call, { resourceBounds });
    const blockNumber = await provider.getBlockNumber();

    // 4. Prove (40-50s)
    const proofResult = await requestProof(blockNumber, tx);

    // 5. Decode public message from L2→L1 payload
    const cd = new CallData(abi);
    const publicMessage = cd.decodeParameters(
        "my_contract::PublicMessage",
        proofResult.l2ToL1Messages![0].payload as string[]
    );

    // 6. Submit on-chain with proof
    const verifyCall = contract.populate("verify_result", { public_message: publicMessage });
    const { transaction_hash } = await account.execute(verifyCall, {
        proof: proofResult.proof,
        proofFacts: proofResult.proofFacts,
    } as any);

    return transaction_hash;
}
```

### SNIP-36 transaction hash extension

```text
Standard v3: poseidon(INVOKE, version, sender, tip_rb_hash, paymaster_hash,
                      chain_id, nonce, da_mode, acct_deploy_hash, calldata_hash)

SNIP-36:     poseidon(INVOKE, version, sender, tip_rb_hash, paymaster_hash,
                      chain_id, nonce, da_mode, acct_deploy_hash, calldata_hash,
                      proof_facts_hash)    ← appended only when proof_facts present
```

`account.execute(call, { proof, proofFacts })` handles the hash extension automatically in starknet.js.

---

## Part 4 — Frontend Architecture (Next.js)

```text
BROWSER                          NEXT.JS SERVER             PROOF SERVER
─────────────────────────────── ──────────────────────────  ────────────
1. Collect user inputs (public)
2. Optionally sign with wallet
   (private inputs hidden)
3. Server Action ──────────────►
                                4. getSignedTransaction()
                                   (virtual tx, not broadcast)
                                5. POST /prove ────────────►
                                                            6. snip36 CLI
                                                            ◄─ SSE done
                                7. decode payload
                                8. execute(verify, {proof})
                                ◄── tx_hash ────────────────
4. poll / display result
```

### RPC proxy (hides API key)

```typescript
// app/api/rpc/route.ts
export async function POST(request: Request) {
    const body = await request.json();
    const res = await fetch(process.env.RPC_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return Response.json(await res.json());
}
```

### Next.js env split

```env
# .env.local
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...   # browser-safe

RPC_URL=https://...                  # server-only
ACCOUNT_ADDRESS=0x...                # server-only
PRIVATE_KEY=0x...                    # server-only
PROOF_SERVER_URL=http://localhost:3030  # server-only
```

---

## Critical Pitfalls

| Pitfall | Fix |
|---|---|
| Fee estimation on virtual tx | Estimating fees online would send the full calldata (including private inputs) to the RPC node — exposing secrets. Set `resourceBounds` manually at 2× current gas prices instead |
| Proof generation in browser | The proving backend requires ~18 GB RAM and a native Rust binary — impossible in a browser. The proof server call must go through a backend. On-chain submission can be done from the browser (wallet) if the RPC key is not sensitive, or from the backend to hide a dedicated account private key |
| Missing `allowed-libfuncs-list.name = "all"` | `get_execution_info_v3_syscall` requires it |
| Proof server resources | ~18 GB RAM, 40-50s per proof, ~10 GB disk for deps |
| L2→L1 `to_address` for SNIP-36 | Set to `0` or any felt — no actual L1 message is sent |
| Nullifier domain mismatch between Cairo and TS | Must use identical domain string and identical hash chain |
| Wrong `blockNumber` sent to proof server | Use `provider.getBlockNumber()` right before `getSignedTransaction` |
| Re-using a nullifier | Contract must check and revert; compute nullifier locally first to fail fast |
| Security caveat (Phase 1) | Proofs are verified by sequencer only, not by SNOS — degraded security vs native Starknet |
| Proof pricing | 130 L2gas/byte (125 propagation + 5 storage) + 10M L2gas base overhead |

---

## Error Handling

| Error | Source | Recovery |
|---|---|---|
| `INVALID_REQUEST` | `/prove` handler (our example) — bad `blockNumber` or missing `tx` | Validate inputs before calling `/prove`; `blockNumber` must be a non-negative integer, `tx` must be an `INVOKE_TXN_V3` object |
| `PROVER_EXIT_NON_ZERO` | `/prove` handler (our example) — `snip36` CLI exited with non-zero code | Check proof server stderr logs; verify `--rpc-url` is reachable and `--block-number` is a recent finalized block |
| `ARTIFACT_READ_FAILED` | `/prove` handler (our example) — `.proof` or `.proof_facts` file unreadable after CLI success | Check disk space on the proof server (~10 GB needed); verify `--output` path is writable |
| `'Proof message mismatch'` | Cairo `verify_result` assert — `proof_facts[8]` does not match recomputed message hash | The `public_message` passed to `verify_result` does not match what `create_proof` emitted; check payload serialization order and field list |

---

## Quick Reference

```text
Three functions per contract:
  create_proof(public, private) → emits L2→L1 msg via send_message_to_l1_syscall
  verify_result(public_msg)     → reads proof_facts, checks hash, applies state
  (optional) read_result()      → query stored result

proof_facts[7] = n_messages
proof_facts[8] = poseidon(contract_addr, 0, payload_len, ...payload)

CLI:   snip36 prove virtual-os --block-number N --tx-json tx.json --rpc-url URL --output out.proof
HTTP:  POST /prove { blockNumber, tx: INVOKE_TXN_V3 } → SSE: log* then done|error
JS:    account.getSignedTransaction(call, { resourceBounds })  ← build, never broadcast
JS:    account.execute(verifyCall, { proof, proofFacts })      ← submit with proof
```
