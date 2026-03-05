---
name: cairo-contracts
description: Use when writing Cairo smart contracts on Starknet — contract structure, storage, events, interfaces, components, OpenZeppelin v3 patterns, and common contract templates.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"1.0.0","org":"keep-starknet-strange"}
keywords: [cairo, contracts, starknet, openzeppelin, components, storage, events, interfaces, erc20, erc721]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Cairo Contracts

Reference for writing Cairo smart contracts on Starknet. Covers structure, storage, events, interfaces, components, and OpenZeppelin v3 patterns.

> **Optimization:** After your contract compiles and tests pass, use the [cairo-optimization](../cairo-optimization/) skill as a separate pass.

## When to Use

- Writing a new Starknet smart contract from scratch
- Adding storage, events, or interfaces to an existing contract
- Using OpenZeppelin components (Ownable, ERC20, ERC721, AccessControl, Upgradeable)
- Implementing the component pattern with `embeddable_as`
- Structuring a multi-contract project with Scarb

**Not for:** Gas optimization (use cairo-optimization), testing (use cairo-testing), deployment (use cairo-deploy)

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
starknet = ">=2.12.0"
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

## Quick Reference

### Contract Anatomy

| Section | Attribute | Purpose |
|---------|----------|---------|
| Storage | `#[storage]` | Persistent state |
| Events | `#[event]` | Emit logs |
| Constructor | `#[constructor]` | Initialize |
| External | `#[abi(embed_v0)]` | Public entry points |
| Internal | (no attribute) | Internal logic |

### Storage Types

| Type | Syntax | Notes |
|------|--------|-------|
| Single | `value: T` | Direct read/write |
| Map | `Map<K, V>` | Key-value lookup |
| Composite | `Map<(K1, K2), V>` | Multi-key lookup |

### Entry Points

- `#[constructor]` — deploy-time initialization
- `#[abi(embed_v0)]` — external callable functions
- `#[l1_handler]` — handle messages from L1

### Common Imports

```cairo
use starknet::ContractAddress;
use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
use starknet::storage::Map;
```

### Key Patterns

- **View function**: `self: @ContractState` — read-only
- **External function**: `ref self: ContractState` — can modify state
- **Event emission**: `self.emit(EventName { ... })`
- **Access control**: Use OpenZeppelin components (Ownable, AccessControl)

## Error Codes

| Error | Cause | Fix |
|-------|-------|-----|
| `Entry point not found` | Function not marked `#[abi(embed_v0)]` | Add the attribute to make it public |
| `Storage not initialized` | Reading uninitialized storage | Initialize in constructor or provide defaults |
| `Zero address` | Using `ContractAddress::zero()` | Validate with `assert(!addr.is_zero(), ...)` |
| `Insufficient balance` | Transfer exceeds balance | Check balance before transfer |
| `Unauthorized` | Missing access control | Use Ownable/AccessControl component |
| `Reentrancy detected` | Reentrant call detected | Implement reentrancy guard |
| `Paused` | Contract is paused | Unpause via owner |
| `Safe math overflow` | Integer overflow | Use checked arithmetic |

### Troubleshooting

**"Error: Transaction reverted"**
- Check error message in the transaction receipt
- Use `starknet-debug` or block explorer to see revert reason

**"Assertion failed"**
- Usually means validation failed (zero address, insufficient balance, etc.)
- Check the error message string for the specific assertion

**"Call to uninitialized contract"**
- Contract not deployed or wrong address
- Verify contract address is correct

**"Class hash not found"**
- Contract class not declared on the network
- Declare the class first with `sncast declare`

## starknet.js Examples

Interacting with Starknet contracts from JavaScript/TypeScript:

### Setup Provider and Account

```typescript
import { Account, Provider, RpcProvider, EcdsaPowerSigner } from 'starknet';

// Connect to Starknet mainnet/testnet
const provider = new RpcProvider({
  nodeUrl: 'https://starknet-mainnet.infura.io/v3/YOUR_API_KEY',
});

// Or use a local network
const localProvider = new RpcProvider({
  nodeUrl: 'http://localhost:5050/rpc',
});

// Create account from private key
const account = new Account(
  provider,
  '0xYOUR_ACCOUNT_ADDRESS',
  new EcdsaPowerSigner() // or use other signers
);
```

### Deploy Contract

```typescript
import { Account, Contract, json } from 'starknet';

// Compile with starknet-compile to get class hash
const classHash = '0x123...'; // from compilation

// Declare and deploy
const { address } = await account.deployContract({
  classHash,
  constructorCalldata: ['0xowner_address', 'TokenName', 'TKN'],
});
```

### Call View Function

```typescript
// Read-only call (doesn't cost gas)
const { balance } = await provider.callContract({
  contractAddress: '0xTOKEN_ADDRESS',
  entrypoint: 'balance_of',
  calldata: ['0xUSER_ADDRESS'],
});

// balance is returned as uint256: { low: ..., high: ... }
const balanceBigInt = balance.high * BigInt(0x10000000000000000) + balance.low;
```

### Execute External Function

```typescript
// Write operation (costs gas)
const response = await account.execute({
  contractAddress: '0xTOKEN_ADDRESS',
  entrypoint: 'transfer',
  calldata: [
    '0xRECIPIENT_ADDRESS',  // to
    '1000000',             // amount (low)
    '0',                   // amount (high) - for uint256
  ],
});

await provider.waitForTransaction(response.transaction_hash);
```

### Handle Events

```typescript
// Get events from transaction receipt
const receipt = await provider.getTransactionReceipt(txHash);

const transferEvents = receipt.events.filter(
  (event) => event.from === contractAddress && event.keys[0] === transferEventKey
);

// Decode event data
// Transfer(from, to, amount) - keys[0] is selector, data contains the values
```

### Estimate Fees

```typescript
const estimate = await account.estimateFee({
  type: 'INVOKE_FUNCTION',
  payload: {
    contractAddress: '0x...',
    entrypoint: 'transfer',
    calldata: [...],
  },
});

console.log(`Estimated fee: ${estimate.overall_fee} wei`);
```

### Multi-Call (Batching)

```typescript
import { Call } from 'starknet';

// Batch multiple calls in one transaction
const calls = [
  {
    contractAddress: tokenAddress,
    entrypoint: 'transfer',
    calldata: [to1, amount1Low, amount1High],
  },
  {
    contractAddress: tokenAddress,
    entrypoint: 'transfer',
    calldata: [to2, amount2Low, amount2High],
  },
];

const response = await account.execute(calls);
```

### Using Contract Class

```typescript
// Load compiled artifact
const artifact = json.parse(fs.readFileSync('./artifact.json', 'utf8'));

// Create typed contract instance
const contract = new Contract(
  artifact.abi,
  contractAddress,
  account
);

// Call with type safety
await contract.transfer(toAddress, { low: amount, high: 0n });
```
