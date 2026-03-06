---
name: cairo-contracts
description: Use when writing Cairo smart contracts on Starknet — contract structure, storage, events, interfaces, project layout, and common patterns.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"1.0.0","org":"keep-starknet-strange"}
keywords: [cairo, contracts, starknet, storage, events, interfaces, constructor, reentrancy]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Cairo Contracts

Reference for writing Cairo smart contracts on Starknet.
Covers structure, storage, events, interfaces, and common patterns.

> **Related skills:**
> - [cairo-language](../cairo-language/) — Cairo type system, ownership, traits, generics, modules
> - [cairo-components](../cairo-components/) — Component pattern, OpenZeppelin v3 (Ownable, ERC20, AccessControl, etc.)
> - [cairo-optimization](../cairo-optimization/) — Post-test gas optimization pass

## When to Use

- Writing a new Starknet smart contract from scratch
- Adding storage, events, or interfaces to an existing contract
- Structuring a multi-contract project with Scarb

**Not for:** Language basics (use cairo-language), components/OZ (use cairo-components), testing (use cairo-testing), deployment (use cairo-deploy), optimization (use cairo-optimization), Dojo contracts (use [Dojo book skills](https://github.com/dojoengine/book/tree/main/skills))

## Quick Reference

- New contract: define interface first, then `#[starknet::contract]` module.
- Storage writes: use `ref self: ContractState`; reads use `self: @ContractState`.
- Events: keep indexed fields minimal (`#[key]`) and stable.
- External integrations: use dispatchers from interface traits.
- Constructor safety: validate non-zero addresses and invariants at deploy time.
- Reentrancy-sensitive flows: guard state-changing external call paths.
- Cross-team compatibility: keep ABI names/selectors stable once published.

## starknet.js Patterns (v9)

Use these snippets when integrating Cairo contracts from app/runtime code.

```typescript
import { Account, Contract, RpcProvider, cairo } from "starknet";

const provider = await RpcProvider.create({
  nodeUrl: process.env.RPC_URL!,
});

const account = new Account({
  provider,
  address: process.env.ACCOUNT_ADDRESS!,
  signer: process.env.PRIVATE_KEY!,
  cairoVersion: "1",
});

const contract = new Contract({
  abi,
  address: process.env.CONTRACT_ADDRESS!,
  providerOrAccount: account,
});

// View call (read-only)
const balance = await contract.call("get_balance", [account.address]);

// Write call (transaction)
const tx = await account.execute([
  {
    contractAddress: process.env.CONTRACT_ADDRESS!,
    entrypoint: "transfer",
    calldata: cairo.tuple(account.address, cairo.uint256(1n)),
  },
]);
await provider.waitForTransaction(tx.transaction_hash);
```

```typescript
// Declare + deploy class hash flow
const declareResult = await account.declare({
  contract: compiledSierra,
  casm: compiledCasm,
});

const deployResult = await account.deployContract({
  classHash: declareResult.class_hash,
  constructorCalldata: [process.env.OWNER_ADDRESS!],
});

await provider.waitForTransaction(deployResult.transaction_hash);
```

## Error Codes & Recovery

| Error Class | Typical Signal | Immediate Recovery |
| --- | --- | --- |
| `ACCOUNT_NOT_DEPLOYED` | account validation fails before invoke | Deploy/fund account first; re-run with correct network and chain ID. |
| `ENTRYPOINT_NOT_FOUND` | selector/ABI mismatch | Regenerate ABI, verify entrypoint spelling and versioned interface alignment. |
| `CLASS_HASH_NOT_DECLARED` | deploy fails on unknown class hash | Declare class on target network first, then deploy with returned hash. |
| `TRANSACTION_REVERTED` | receipt execution status reverted | Re-run locally with same calldata, inspect contract assertions and preconditions. |
| `INSUFFICIENT_FEE_BALANCE` | fee transfer/estimation failure | Fund fee token (ETH/STRK as configured), then re-estimate and retry. |
| `RPC_TIMEOUT_OR_429` | request timeout / rate limit | Retry with backoff, use stable RPC provider, reduce concurrent requests. |

## Contract Structure

Every Starknet contract follows this skeleton:

```cairo
#[starknet::contract]
mod MyContract {
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        balance: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Transfer: Transfer,
    }

    #[derive(Drop, starknet::Event)]
    struct Transfer {
        #[key]
        from: ContractAddress,
        #[key]
        to: ContractAddress,
        amount: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
    }

    #[abi(embed_v0)]
    impl MyContractImpl of super::IMyContract<ContractState> {
        fn get_balance(self: @ContractState) -> u256 {
            self.balance.read()
        }

        fn transfer(ref self: ContractState, to: ContractAddress, amount: u256) {
            // implementation
        }
    }
}
```

## Interfaces

Define interfaces outside the contract module. Use `#[starknet::interface]`:

```cairo
#[starknet::interface]
trait IMyContract<TContractState> {
    fn get_balance(self: @TContractState) -> u256;
    fn transfer(ref self: TContractState, to: ContractAddress, amount: u256);
}
```

- `self: @TContractState` — read-only (view function)
- `ref self: TContractState` — read-write (external function)

## Storage

### Basic Types

```cairo
#[storage]
struct Storage {
    value: felt252,           // single felt
    counter: u128,            // unsigned integer
    owner: ContractAddress,   // address
    is_active: bool,          // boolean
}
```

### Maps

```cairo
use starknet::storage::Map;

#[storage]
struct Storage {
    balances: Map<ContractAddress, u256>,
    allowances: Map<(ContractAddress, ContractAddress), u256>,
}

// Usage:
fn get_balance(self: @ContractState, account: ContractAddress) -> u256 {
    self.balances.read(account)
}

fn set_allowance(ref self: ContractState, owner: ContractAddress, spender: ContractAddress, amount: u256) {
    self.allowances.write((owner, spender), amount);
}
```

### Composite Key Maps (Nested Map Alternative)

Prefer composite key tuples over nested Maps:

```cairo
use starknet::storage::Map;

#[storage]
struct Storage {
    // Map<(owner, spender), amount> — preferred over nested Map
    allowances: Map<(ContractAddress, ContractAddress), u256>,
}

// Usage:
let amount = self.allowances.entry((owner, spender)).read();
self.allowances.entry((owner, spender)).write(new_amount);
```

## Events

```cairo
#[event]
#[derive(Drop, starknet::Event)]
enum Event {
    Transfer: Transfer,
    Approval: Approval,
}

#[derive(Drop, starknet::Event)]
struct Transfer {
    #[key]    // indexed — used for filtering
    from: ContractAddress,
    #[key]
    to: ContractAddress,
    amount: u256,  // not indexed — stored in data
}

// Emit:
self.emit(Transfer { from, to, amount });
```

## Project Structure

```text
my-project/
  Scarb.toml
  src/
    lib.cairo          # mod declarations
    contract.cairo     # main contract
    interfaces.cairo   # trait definitions
    components/
      mod.cairo
      my_component.cairo
  tests/
    test_contract.cairo
```

### lib.cairo

```cairo
mod contract;
mod interfaces;
mod components;
```

## Common Patterns

### Reentrancy Guard

```cairo
#[storage]
struct Storage {
    entered: bool,
}

fn _enter(ref self: ContractState) {
    assert(!self.entered.read(), 'ReentrancyGuard: reentrant');
    self.entered.write(true);
}

fn _exit(ref self: ContractState) {
    self.entered.write(false);
}
```

### Constructor Validation

```cairo
#[constructor]
fn constructor(ref self: ContractState, owner: ContractAddress) {
    assert(!owner.is_zero(), 'Owner cannot be zero');
    self.ownable.initializer(owner);
}
```

## Cross-Contract Calls (Dispatchers)

To call another contract, generate a dispatcher from its interface trait:

```cairo
// Given an interface:
#[starknet::interface]
trait ITokenContract<TContractState> {
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn transfer(ref self: TContractState, to: ContractAddress, amount: u256);
}

// The compiler auto-generates ITokenContractDispatcher and ITokenContractDispatcherTrait.
// Use them to call the remote contract:
use super::{ITokenContractDispatcher, ITokenContractDispatcherTrait};

fn check_balance(token_address: ContractAddress, account: ContractAddress) -> u256 {
    let token = ITokenContractDispatcher { contract_address: token_address };
    token.balance_of(account)
}
```

- `IFooDispatcher` — for external calls that can modify state (`ref self`)
- `IFooLibraryDispatcher` — for library/delegate calls (runs callee code in caller's context)

> **Components:** For Ownable, Pausable, AccessControl, ERC20, Upgradeable, and the Mixin pattern, see [cairo-components](../cairo-components/).
