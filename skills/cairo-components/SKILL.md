---
name: cairo-components
description: Use when composing contracts from reusable components — the Mixin pattern, writing custom components, and OpenZeppelin v3 component library (Ownable, ERC20, ERC721, AccessControl, Upgradeable, Pausable).
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"1.0.0","org":"keep-starknet-strange"}
keywords: [cairo, components, openzeppelin, ownable, erc20, erc721, accesscontrol, upgradeable, pausable, mixin]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Cairo Components

Reusable contract modules and OpenZeppelin v3 patterns for Starknet.

> **Prerequisites:** Familiar with [cairo-language](../cairo-language/) basics and [cairo-contracts](../cairo-contracts/) structure (storage, events, interfaces).

## When to Use

- Composing a contract from OpenZeppelin components (Ownable, ERC20, AccessControl, etc.)
- Writing a custom reusable component with `#[starknet::component]`
- Understanding the Mixin pattern (`embeddable_as` / `#[abi(embed_v0)]`)

**Not for:** Contract structure basics (use cairo-contracts), language fundamentals (use cairo-language), testing (use cairo-testing)

## Scarb.toml Dependencies

```toml
[dependencies]
starknet = ">=2.12.0"
openzeppelin_access = "3.0.0"
openzeppelin_token = "3.0.0"
openzeppelin_upgrades = "3.0.0"
openzeppelin_introspection = "3.0.0"
openzeppelin_security = "3.0.0"
```

> **Note:** OZ packages are on the [Scarb registry](https://scarbs.dev). No git tags needed. Check `scarbs.dev` for the latest version.

## Using a Component (Mixin Pattern)

The Mixin pattern exposes all standard interface methods in a single `impl` block.
This is the standard approach in OZ v3:

```cairo
#[starknet::contract]
mod MyToken {
    use openzeppelin_access::ownable::OwnableComponent;
    use openzeppelin_token::erc20::{ERC20Component, ERC20HooksEmptyImpl};

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: ERC20Component, storage: erc20, event: ERC20Event);

    // Embed external implementations (makes functions callable from outside)
    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;

    // Internal implementations (for use inside the contract)
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        ERC20Event: ERC20Component::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
        self.erc20.initializer("MyToken", "MTK");
    }
}
```

### Checklist for Adding a Component

1. `use` the component module
2. `component!(path: ..., storage: ..., event: ...)`
3. `#[abi(embed_v0)] impl ... = Component::MixinImpl<ContractState>` (external)
4. `impl ... = Component::InternalImpl<ContractState>` (internal)
5. Add `#[substorage(v0)]` field in `Storage`
6. Add `#[flat]` variant in `Event` enum
7. Call `.initializer(...)` in constructor

> **Important:** Component functions are **not exposed** in your contract's ABI unless you wire them in with `#[abi(embed_v0)]`.
> If you add an ERC721 component but skip the `ERC721MixinImpl` embed, functions like `symbol()`, `token_uri()`, and `balance_of()` will not be callable.
> The `MixinImpl` bundles all standard interface methods — always prefer it over embedding individual sub-impls.

## Writing a Custom Component

```cairo
#[starknet::component]
mod MyComponent {
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        value: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        ValueChanged: ValueChanged,
    }

    #[derive(Drop, starknet::Event)]
    struct ValueChanged {
        new_value: u256,
    }

    #[embeddable_as(MyComponentImpl)]
    impl MyComponent<
        TContractState, +HasComponent<TContractState>
    > of super::IMyComponent<ComponentState<TContractState>> {
        fn get_value(self: @ComponentState<TContractState>) -> u256 {
            self.value.read()
        }

        fn set_value(ref self: ComponentState<TContractState>, new_value: u256) {
            self.value.write(new_value);
            self.emit(ValueChanged { new_value });
        }
    }
}
```

Key differences from a contract:
- `#[starknet::component]` instead of `#[starknet::contract]`
- `#[embeddable_as(Name)]` instead of `#[abi(embed_v0)]`
- `ComponentState<TContractState>` instead of `ContractState`
- `+HasComponent<TContractState>` trait bound required

## OpenZeppelin Components Reference

### Ownable

```cairo
use openzeppelin_access::ownable::OwnableComponent;

component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

#[abi(embed_v0)]
impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

// In constructor:
self.ownable.initializer(owner);

// In functions:
self.ownable.assert_only_owner();
```

### Upgradeable

```cairo
use openzeppelin_upgrades::UpgradeableComponent;
use openzeppelin_upgrades::interface::IUpgradeable;

component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

#[abi(embed_v0)]
impl UpgradeableImpl of IUpgradeable<ContractState> {
    fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
        self.ownable.assert_only_owner();
        self.upgradeable.upgrade(new_class_hash);
    }
}
```

### ERC20

```cairo
use openzeppelin_token::erc20::{ERC20Component, ERC20HooksEmptyImpl};

component!(path: ERC20Component, storage: erc20, event: ERC20Event);

#[abi(embed_v0)]
impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;
impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

// In constructor:
self.erc20.initializer("TokenName", "TKN");
self.erc20.mint(recipient, initial_supply);
```

### AccessControl

```cairo
use openzeppelin_access::accesscontrol::AccessControlComponent;
use openzeppelin_access::accesscontrol::DEFAULT_ADMIN_ROLE;

component!(path: AccessControlComponent, storage: access_control, event: AccessControlEvent);

#[abi(embed_v0)]
impl AccessControlMixinImpl = AccessControlComponent::AccessControlMixinImpl<ContractState>;
impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;

const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");

// In constructor:
self.access_control.initializer();
self.access_control._grant_role(DEFAULT_ADMIN_ROLE, admin);
self.access_control._grant_role(MINTER_ROLE, minter);

// In functions:
self.access_control.assert_only_role(MINTER_ROLE);
```

### Pausable

```cairo
use openzeppelin_security::pausable::PausableComponent;

component!(path: PausableComponent, storage: pausable, event: PausableEvent);

#[abi(embed_v0)]
impl PausableMixinImpl = PausableComponent::PausableMixinImpl<ContractState>;
impl PausableInternalImpl = PausableComponent::InternalImpl<ContractState>;

// In constructor — no initializer needed

// In functions:
self.pausable.assert_not_paused();

// Owner pauses/unpauses:
self.pausable.pause();
self.pausable.unpause();
```

## Quick Reference

| Component | Initializer | Key Methods |
|-----------|-------------|-------------|
| Ownable | `initializer(owner)` | `assert_only_owner()`, `transfer_ownership()` |
| ERC20 | `initializer(name, symbol)` | `transfer()`, `approve()`, `balance_of()`, `mint()`, `burn()` |
| ERC721 | `initializer(base_uri)` | `mint()`, `transfer_from()`, `owner_of()`, `token_uri()` |
| AccessControl | `initializer()` | `grant_role()`, `revoke_role()`, `assert_only_role()` |
| Upgradeable | — | `upgrade(class_hash)` |
| Pausable | — | `pause()`, `unpause()`, `assert_not_paused()` |

### Component Checklist

- [ ] Add dependency to `Scarb.toml`
- [ ] Import component module
- [ ] Declare `component!` macro
- [ ] Add `#[abi(embed_v0)]` impl for external interface
- [ ] Add internal impl for `InternalImpl`
- [ ] Add `#[substorage(v0)]` storage field
- [ ] Add `#[flat]` event variant
- [ ] Call initializer in constructor

## Error Codes

| Error | Cause | Fix |
|-------|-------|-----|
| `Component not bound` | Missing `HasComponent` trait | Add `+HasComponent<TContractState>` to impl |
| `Function not exposed` | Missing `#[abi(embed_v0)]` | Add embed attribute for MixinImpl |
| `Storage not found` | Missing `#[substorage(v0)]` | Add substorage attribute to storage field |
| `Event not emitted` | Missing `#[flat]` | Add `#[flat]` to Event enum variant |
| `Initializer already called` | Double initialization | Ensure initializer called once in constructor |
| `Not an embeddable` | Wrong attribute | Use `#[embeddable_as(Name)]` for components |

### Troubleshooting

**"Entry point not found"**
- Component functions require `#[abi(embed_v0)]` to be in the contract's ABI
- Add the MixinImpl line to expose all component methods

**"Storage attribute not found"**
- Storage fields for components need `#[substorage(v0)]`
- Without this, the component cannot access its storage

## starknet.js Patterns

Interacting with component-based contracts from JavaScript/TypeScript:

### Ownable Contract

```typescript
import { Account, Contract, json, Provider, RpcProvider } from 'starknet';

// Connect to an Ownable contract
async function callOwnableFunction(
  account: Account,
  contractAddress: string,
  functionName: string,
  calldata: any[]
) {
  const response = await account.execute({
    contractAddress,
    entrypoint: functionName,
    calldata,
  });
  return account.waitForTransaction(response.transaction_hash);
}

// Check owner
async function getOwner(contractAddress: string, provider: RpcProvider) {
  const { owner } = await provider.callContract({
    contractAddress,
    entrypoint: 'owner',
  });
  return owner;
}
```

### ERC20 Token

```typescript
import { Account, Contract, RpcProvider } from 'starknet';

// ERC20 interface for type-safe calls
const erc20Abi = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'contractaddress' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'balance_of',
    type: 'function',
    inputs: [{ name: 'account', type: 'contractaddress' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'from', type: 'contractaddress' },
      { name: 'to', type: 'contractaddress' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
];

// Transfer tokens (uses uint256 for amount)
async function transferTokens(
  account: Account,
  tokenAddress: string,
  to: string,
  amount: bigint
) {
  const contract = new Contract(erc20Abi, tokenAddress, account);
  
  // Convert to uint256 (low, high)
  const amountUint256 = { low: amount & BigInt(0xFFFFFFFFFFFFFFFFFFFFFFFFn), high: amount >> 64n };
  
  await contract.transfer(to, amountUint256);
}

// Check balance
async function getBalance(tokenAddress: string, account: string, provider: RpcProvider) {
  const contract = new Contract(erc20Abi, tokenAddress, provider);
  const { balance } = await contract.balance_of(account);
  // Convert from uint256 to bigint
  return balance.high * BigInt(0x10000000000000000) + balance.low;
}
```

### Pausable Contract

```typescript
// Check if contract is paused
async function isPaused(contractAddress: string, provider: RpcProvider) {
  const { paused } = await provider.callContract({
    contractAddress,
    entrypoint: 'paused',
  });
  return paused === 1n;
}

// Pause (owner only)
async function pauseContract(account: Account, contractAddress: string) {
  const response = await account.execute({
    contractAddress,
    entrypoint: 'pause',
    calldata: [],
  });
  return account.waitForTransaction(response.transaction_hash);
}
```

### AccessControl Contract

```typescript
// Grant role (admin only)
async function grantRole(
  account: Account,
  contractAddress: string,
  role: string, // bytes32 role identifier
  user: string
) {
  // Convert role string to felt252 (hex string without 0x prefix)
  const roleFelt = role.startsWith('0x') ? role.slice(2) : role;
  
  const response = await account.execute({
    contractAddress,
    entrypoint: 'grant_role',
    calldata: [roleFelt, user],
  });
  return account.waitForTransaction(response.transaction_hash);
}

// Check has role
async function hasRole(
  contractAddress: string,
  role: string,
  user: string,
  provider: RpcProvider
) {
  const roleFelt = role.startsWith('0x') ? role.slice(2) : role;
  const { has_role } = await provider.callContract({
    contractAddress,
    entrypoint: 'has_role',
    calldata: [roleFelt, user],
  });
  return has_role === 1n;
}
```

### Upgradeable Contract

```typescript
// Upgrade contract (owner only)
async function upgradeContract(
  account: Account,
  proxyAddress: string,
  newClassHash: string
) {
  const response = await account.execute({
    contractAddress: proxyAddress,
    entrypoint: 'upgrade',
    calldata: [newClassHash],
  });
  return account.waitForTransaction(response.transaction_hash);
}

// Get current implementation
async function getImplementation(contractAddress: string, provider: RpcProvider) {
  const { implementation } = await provider.callContract({
    contractAddress,
    entrypoint: 'implementation',
  });
  return implementation;
}
```
