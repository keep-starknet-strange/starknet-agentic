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

```
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

> **Components:** For Ownable, Pausable, AccessControl, ERC20, Upgradeable, and the Mixin pattern, see [cairo-components](../cairo-components/).
