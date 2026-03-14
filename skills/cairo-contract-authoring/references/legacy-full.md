---
name: cairo-contract-authoring-legacy-full
description: Comprehensive reference for Cairo contract structure, components, and security hardening patterns.
---

# Cairo Contract Authoring

Reference for writing Cairo smart contracts on Starknet. Covers structure, storage, events, interfaces, components, and OpenZeppelin v3 patterns.

> **Optimization:** After your contract compiles and tests pass, use [cairo-optimization](../../cairo-optimization/SKILL.md) as a separate pass.

## When to Use

- Writing a new Starknet smart contract from scratch
- Adding storage, events, or interfaces to an existing contract
- Using OpenZeppelin components (Ownable, ERC20, ERC721, AccessControl, Upgradeable)
- Implementing the component pattern with `embeddable_as`
- Structuring a multi-contract project with Scarb

## When NOT to Use

**Not for:** Gas optimization (use cairo-optimization), testing (use cairo-testing), deployment (use cairo-deploy)

## Audit-Derived Patterns

Before finalizing implementation for security-sensitive logic, cross-check:

- `../../../datasets/distilled/fix-patterns/`
- `../../../datasets/distilled/vuln-cards/`

## Upgrade/Auth Hardening Rules

### Timelock Time Source

Never accept `now` as a user argument for timelock checks.

```cairo
// BAD
fn execute_upgrade(ref self: ContractState, now: u64) {
    assert!(now >= self.executable_after.read(), "timelock");
}

// GOOD
use starknet::get_block_timestamp;

fn execute_upgrade(ref self: ContractState) {
    let now = get_block_timestamp();
    assert!(now >= self.executable_after.read(), "timelock");
}
```

### State Mutation Access Posture

For every storage-mutating `#[external(v0)]` function, declare the posture explicitly:

- guarded path (`assert_only_owner` / role check), or
- intentionally public path with an inline comment justifying public mutability.

Silent implicit posture is not acceptable in security-sensitive modules.

### Non-Zero Upgrade Hash Guard

Reject zero class hash in both schedule and immediate-upgrade flows:

```cairo
assert!(new_class_hash != 0, "class_hash_zero");
```

## Recommended Scarb.toml

Use these versions for new projects (as of March 2026):

```toml
[package]
name = "my_contract"
version = "0.1.0"
edition = "2024_07"

[dependencies]
starknet = "^2.16.0"
openzeppelin_access = "3.0.0"
openzeppelin_introspection = "3.0.0"
openzeppelin_token = "3.0.0"
openzeppelin_upgrades = "3.0.0"
openzeppelin_security = "3.0.0"

[dev-dependencies]
snforge_std = "0.57.0"

[cairo]
sierra-replace-ids = true

[[target.starknet-contract]]

[tool.scarb]
allow-prebuilt-plugins = ["snforge_std"]
```

> **Version pinning:** This template targets Scarb **2.16.x** with `starknet = "^2.16.0"` and `snforge_std = "0.57.0"`. If you use an older toolchain, pin compatible versions from the release matrix before production use. Check [scarbs.dev](https://scarbs.dev) for updates.

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

## Components (OpenZeppelin v3 Pattern)

Components are reusable contract modules. This is the standard pattern in Cairo / OZ v3:

### Using a Component

The **Mixin pattern** is the most common approach in OZ v3 — it exposes all standard interface methods (e.g., `balance_of`, `transfer`, `approve`) in a single `impl` block:

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

#### Component Wiring Checklist

1. Add the `use` import for each component.
2. Register each component with `component!(...)`.
3. Embed external ABI impls with `#[abi(embed_v0)]`.
4. Add internal impl aliases for internal-only calls.
5. Add `#[substorage(v0)]` fields in `Storage`.
6. Add `#[flat]` variants in `Event`.
7. Call each required `.initializer(...)` in constructor.

If `MixinImpl` is not embedded, selectors are not exposed in the contract ABI.

### Writing a Component

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

## Common OpenZeppelin Components

### Scarb.toml Dependencies

```toml
[dependencies]
starknet = "^2.16.0"
openzeppelin_access = "3.0.0"
openzeppelin_token = "3.0.0"
openzeppelin_upgrades = "3.0.0"
openzeppelin_introspection = "3.0.0"
openzeppelin_security = "3.0.0"
```

> **Note:** OZ packages are on the [Scarb registry](https://scarbs.dev). No git tags needed. Check `scarbs.dev` for the latest version.

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

## Cross-Contract Calls (Dispatchers)

Use compiler-generated dispatchers from an interface trait:

```cairo
#[starknet::interface]
trait ITokenContract<TContractState> {
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn transfer(ref self: TContractState, to: ContractAddress, amount: u256);
}

use super::{ITokenContractDispatcher, ITokenContractDispatcherTrait};

fn check_balance(token_address: ContractAddress, account: ContractAddress) -> u256 {
    let token = ITokenContractDispatcher { contract_address: token_address };
    token.balance_of(account)
}
```

- `IFooDispatcher` for external calls (`ref self`).
- `IFooLibraryDispatcher` for library/delegate-style calls.

## OpenZeppelin Hardening Checks

1. Map each embedded component to externally reachable selectors.
2. Verify owner/role checks on every privileged selector.
3. Verify initializer/upgrade selectors are unauthorized for non-admins.
4. Validate substorage layout compatibility before upgrades.
5. Add regression tests for unauthorized upgrade/initializer paths.

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

### Pausable

```cairo
use openzeppelin_security::pausable::PausableComponent;

component!(path: PausableComponent, storage: pausable, event: PausableEvent);

// In functions:
self.pausable.assert_not_paused();
```

### Constructor Validation

```cairo
#[constructor]
fn constructor(ref self: ContractState, owner: ContractAddress) {
    assert(!owner.is_zero(), 'Owner cannot be zero');
    self.ownable.initializer(owner);
}
```
