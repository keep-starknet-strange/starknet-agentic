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

# SNIP-36

## Overview

SNIP-36 allows executing a single `INVOKE_TXN_V3` off-chain against a reference Starknet block's state, then submitting a stwo-cairo proof on-chain. The proof extends the standard v3 transaction hash by appending a `proof_facts_hash`. Contracts verify this via `get_execution_info_v3_syscall`.

**Core value:** Run arbitrary Cairo logic off-chain (heavy computation, privacy checks, game outcomes, attribute proofs) and commit only the verified result on-chain — without revealing private inputs.

**Spec:** https://community.starknet.io/t/snip-36-in-protocol-proof-verification/116123

**Reference implementation:** https://github.com/starknet-innovation/snip-36-prover-backend

---

## Quick Start

1. Review the [operator checklist](references/operator-checklist.md).
2. Add a virtual `create_proof` function that emits one L2->L1 message.
3. Prove an unsigned virtual tx with `snip36 prove virtual-os`.
4. Submit `verify_result` with `{ proof, proofFacts }` and the decoded message.

## When to Use

- The user asks for SNIP-36, virtual block proving, off-chain Starknet proof generation, or proof-backed on-chain verification.
- The workflow needs heavy Cairo computation, privacy-preserving inputs, anonymous voting, secret whitelist checks, or replay-safe nullifier patterns.
- The implementation needs a Cairo virtual function, proof server, starknet.js signing flow, and on-chain `verify_result` contract pattern.

## When NOT to Use

- The user needs a normal Starknet transaction that should be broadcast and fee-estimated through standard RPC.
- The proof cannot run on a backend with native binaries, disk, and about 18 GB RAM.
- The security model requires SNOS-native verification instead of Phase 1 sequencer-side proof verification.

---

## Use Cases

- Heavy computation: prove a large hash or algorithm result, then store only the verified output.
- Private attributes: prove age, whitelist membership, or voting weight with a nullifier and public boolean/result.
- Provable games: commit coin flips, seeds, bets, and outcomes for on-chain settlement.
- ZKThread or shard transitions: prove `{ old_root, new_root, ... }` before updating L2 state.

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

## Part 2 — Proof Server (Node.js + Rust CLI)

### Setup

```bash
git clone https://github.com/starknet-innovation/snip-36-prover-backend
cd snip-36-prover-backend
cargo build --release -p snip36-cli
./target/release/snip36 setup

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
        res.status(400).json({ code: "SNIP36_INVALID_REQUEST", message: "blockNumber or tx is invalid" });
        return;
    }

    const txJsonPath = `./tmp/tx-${Date.now()}.json`;
    const outputBase = `./output/prove-${Date.now()}`;
    const proofPath = `${outputBase}.proof`;
    const proofFactsPath = `${outputBase}.proof_facts`;
    const rawMessagesPath = `${outputBase}.raw_messages.json`;
    const cleanupPaths = [txJsonPath, proofPath, proofFactsPath, rawMessagesPath];
    const args = [
        "prove", "virtual-os",
        "--block-number", String(blockNumber),
        "--tx-json", txJsonPath,
        "--rpc-url", process.env.STARKNET_RPC_URL!,
        "--output", proofPath,
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.flushHeaders();

    let child: ReturnType<typeof spawn> | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let settled = false;
    let timedOut = false;
    const errorDetails = (error: unknown) => error instanceof Error ? error.message : String(error);
    const send = (event: "log" | "done" | "error", data: object) =>
        !settled && res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const cleanup = () => {
        for (const p of cleanupPaths) {
            try {
                if (fs.existsSync(p)) fs.unlinkSync(p);
            } catch (error) {
                send("log", { stream: "cleanup", line: `failed to remove ${p}: ${errorDetails(error)}` });
            }
        }
    };

    const finish = () => {
        if (settled) return;
        if (timeout) clearTimeout(timeout);
        cleanup();
        settled = true;
        res.end();
    };

    try {
        fs.mkdirSync("./tmp", { recursive: true });
        fs.mkdirSync("./output", { recursive: true });
        fs.writeFileSync(txJsonPath, JSON.stringify(tx));
        child = spawn(BINARY, args, { cwd: REPO_CWD, env: process.env });
    } catch (error) {
        send("error", { code: "SNIP36_PROVER_START_FAILED", message: "failed to start snip36", details: errorDetails(error) });
        finish();
        return;
    }

    timeout = setTimeout(() => {
        timedOut = true;
        send("error", { code: "SNIP36_PROVER_TIMEOUT", message: "snip36 timed out", details: "terminated after 10 minutes" });
        child?.kill("SIGTERM");
    }, 10 * 60 * 1000);

    child.on("error", error => {
        send("error", { code: "SNIP36_PROVER_START_FAILED", message: "snip36 process failed", details: errorDetails(error) });
        finish();
    });
    child.stdout.on("data", c => send("log", { stream: "stdout", line: c.toString() }));
    child.stderr.on("data", c => send("log", { stream: "stderr", line: c.toString() }));

    child.on("close", code => {
        if (settled) return;
        try {
            if (timedOut) return;
            if (code !== 0) {
                send("error", { code: "SNIP36_PROVER_EXIT_NON_ZERO", message: "snip36 exited non-zero", details: `exit code ${code}` });
                return;
            }
            if (!fs.existsSync(proofPath) || !fs.existsSync(proofFactsPath)) {
                throw new Error("missing proof or proof_facts artifact");
            }
            const proof = fs.readFileSync(proofPath, "ascii").trim();
            const proofFacts = JSON.parse(fs.readFileSync(proofFactsPath, "ascii"));
            const l2ToL1Messages = fs.existsSync(rawMessagesPath)
                ? JSON.parse(fs.readFileSync(rawMessagesPath, "ascii")).l2_to_l1_messages
                : undefined;
            send("done", { proof, proofFacts, ...(l2ToL1Messages && { l2ToL1Messages }) });
        } catch (error) {
            send("error", { code: "SNIP36_ARTIFACT_READ_FAILED", message: "failed to read proof artifacts", details: errorDetails(error) });
        } finally {
            finish();
        }
    });
});
```

### Output artifacts and env

The CLI emits `*.proof` (base64 stwo proof), `*.proof_facts` (JSON hex felt252s), and optional `*.raw_messages.json` with `l2_to_l1_messages`.

Required env: `STARKNET_RPC_URL`, `STARKNET_ACCOUNT_ADDRESS`, `STARKNET_PRIVATE_KEY`, `STARKNET_GATEWAY_URL`, `STARKNET_CHAIN_ID`, and `PORT`.

## Part 3 — Starknet.js Integration

### SSE client

```typescript
// requestProof.ts
type ProveResult = { proof: string; proofFacts: BigNumberish[]; l2ToL1Messages?: { payload: BigNumberish[] }[] };

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
            if (event === "done") result = data;
            if (event === "error") throw Object.assign(new Error(data.message), { code: data.code, details: data.details });
        }
    }
    if (!result) throw new Error("No proof result");
    return result;
}
```

### Virtual transaction build + proof orchestration

```typescript
// server-side only: private inputs and signing keys must never reach the browser.
async function proveAndVerify(publicInput: unknown, privateInput: unknown): Promise<string> {
    const provider = new RpcProvider({ nodeUrl: process.env.RPC_URL! });
    const account = new Account({
        provider,
        address: process.env.ACCOUNT_ADDRESS!,
        signer: process.env.PRIVATE_KEY!,
    });
    const contract = new Contract({ abi, address: CONTRACT_ADDRESS, providerOrAccount: account });

    // 1. Build virtual call (never broadcast)
    const call = contract.populate("create_proof", { public_input: publicInput, private_input: privateInput });

    // 2. Must set resourceBounds manually; fee estimation would expose private calldata.
    const prices = await provider.getGasPrices();
    const M = 2n;
    const resourceBounds = {
        l2_gas:     { max_amount: 0x279fc0n * M, max_price_per_unit: prices.l2GasPrice * M },
        l1_gas:     { max_amount: 0xbd2an * M,   max_price_per_unit: prices.l1GasPrice * M },
        l1_data_gas:{ max_amount: 0xc0n * M,     max_price_per_unit: prices.l1DataGasPrice * M },
    };

    // 3. Requires the proof-enabled starknet.js fork, not standard starknet.js.
    const tx: INVOKE_TXN_V3 = await account.getSignedTransaction(call, { resourceBounds });
    const blockNumber = await provider.getBlockNumber();
    const proofResult = await requestProof(blockNumber, tx);

    const cd = new CallData(abi);
    const publicMessage = cd.decodeParameters(
        "my_contract::PublicMessage",
        proofResult.l2ToL1Messages![0].payload as string[]
    );

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

### Frontend boundaries

- Browser: collect public inputs, optionally request a wallet signature, and poll for the final transaction hash.
- Server: keep `RPC_URL`, `ACCOUNT_ADDRESS`, `PRIVATE_KEY`, `PROOF_SERVER_URL`, `getSignedTransaction()`, and `/prove` calls off the client.
- RPC proxy: route browser RPC through a server endpoint if the provider key is sensitive.

Only expose `NEXT_PUBLIC_CONTRACT_ADDRESS` or other non-secret addresses to the browser.

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

## Error Codes & Recovery

| Code | Name | Source / symbol | Recovery |
|---|---|---|---|
| `SNIP36_INVALID_REQUEST` | `invalid_request` | HTTP `/prove` before CLI spawn | Validate inputs before calling `/prove`; `blockNumber` must be a non-negative integer and `tx` must be a complete `INVOKE_TXN_V3` object |
| `SNIP36_PROVER_START_FAILED` | `prover_start_failed` | HTTP `/prove`, `spawn(BINARY, args)` or temp file setup | Confirm the `snip36` binary path, `REPO_CWD`, `./tmp`, and `./output` permissions; inspect proof server logs for the included `details` field |
| `SNIP36_PROVER_TIMEOUT` | `proof_generation_timeout` | HTTP `/prove`, long-running `snip36 prove virtual-os` | Retry on a dedicated backend; verify the host has ~18 GB RAM, available CPU, and no stuck prior prover process |
| `SNIP36_PROVER_EXIT_NON_ZERO` | `proof_generation_failed` | CLI flow: `snip36 prove virtual-os` | Check stderr logs, `STARKNET_RPC_URL`, `STARKNET_CHAIN_ID`, block availability, and whether the virtual transaction uses unsupported calldata or libfuncs |
| `SNIP36_ARTIFACT_READ_FAILED` | `artifact_read_failed` | HTTP `/prove` reading `.proof`, `.proof_facts`, or `.raw_messages.json` | Check disk space and output permissions; verify the CLI wrote both `proofPath` and `proofFactsPath` before the server cleaned temporary files |
| `SNIP36_FEE_ESTIMATION_SENSITIVE` | `fee_estimation_sensitive` | JS `getSignedTransaction` orchestration | Do not call fee estimation for a virtual transaction; set `resourceBounds` manually from `provider.getGasPrices()` before signing |
| `SNIP36_STALE_BLOCK_NUMBER` | `stale_block_number` | JS `provider.getBlockNumber()` and HTTP `/prove` | Fetch `provider.getBlockNumber()` immediately before `getSignedTransaction()` and retry with a recent finalized block |
| `SNIP36_PROOF_FACTS_MISSING` | `proof_facts_missing` | Cairo `verify_result`, `get_execution_info_v3_syscall()` | Ensure the on-chain `account.execute(verifyCall, { proof, proofFacts })` includes both fields and uses the starknet.js proof hash extension |
| `SNIP36_MESSAGE_HASH_MISMATCH` | `proof_message_mismatch` | Cairo `verify_result`, `proof_facts[8]` check | Compare the `create_proof` L2->L1 payload with the `public_message` passed to `verify_result`; check serialization order and `compute_message_hash` inputs |
| `SNIP36_NULLIFIER_MISMATCH` | `nullifier_mismatch` | Cairo `compute_nullifier`, TS `computeNullifier` | Verify the domain string, short-string encoding, field order, and Poseidon hash chain match exactly across Cairo and TypeScript |
| `SNIP36_REUSED_NULLIFIER` | `reused_nullifier` | Cairo `verify_result` state update, optional `read_result()` | Abort submission, call `read_result()` or the nullifier storage view, and surface a replay/conflict error to the user |
| `SNIP36_RPC_CHAIN_MISMATCH` | `rpc_chain_mismatch` | CLI/HTTP env: `STARKNET_RPC_URL`, `STARKNET_GATEWAY_URL`, `STARKNET_CHAIN_ID` | Align RPC, gateway, and account network; rebuild the virtual transaction after correcting environment variables |

---

## Quick Reference

```text
Contract: create_proof(public, private) -> emit L2->L1 message
Contract: verify_result(public_msg) -> check proof_facts[8] and apply state
Optional: read_result() -> query stored result/nullifier
Facts:    proof_facts[7] = n_messages; proof_facts[8] = poseidon(contract, 0, len, payload)
CLI:      snip36 prove virtual-os --block-number N --tx-json tx.json --rpc-url URL --output out.proof
HTTP:     POST /prove { blockNumber, tx } -> SSE log* then done|error
JS:       getSignedTransaction(call, { resourceBounds }) then execute(verifyCall, { proof, proofFacts })
```
