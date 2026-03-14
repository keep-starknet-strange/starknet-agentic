# Build-Side Anti-Pattern Pairs

Build-focused secure/insecure pairs distilled from repeated external contract checks.

## 1) Auth on Mutating Externals

Anti-pattern:

```cairo
#[external(v0)]
fn set_fee(ref self: ContractState, new_fee_bps: u16) {
    self.fee_bps.write(new_fee_bps);
}
```

Secure pattern:

```cairo
fn assert_only_owner(self: @ContractState) {
    let caller = get_caller_address();
    let owner = self.owner.read();
    assert!(caller == owner, "not_owner");
}

#[external(v0)]
fn set_fee(ref self: ContractState, new_fee_bps: u16) {
    assert_only_owner(@self);
    assert!(new_fee_bps <= 10_000_u16, "fee_range");
    self.fee_bps.write(new_fee_bps);
}
```

## 2) Timelock Time Source

Anti-pattern:

```cairo
#[external(v0)]
fn execute_upgrade(ref self: ContractState, now: u64) {
    assert!(now >= self.executable_after.read(), "timelock");
}
```

Secure pattern:

```cairo
use starknet::get_block_timestamp;

#[external(v0)]
fn execute_upgrade(ref self: ContractState) {
    assert_only_owner(@self);
    let now = get_block_timestamp();
    let eta = self.executable_after.read();
    assert!(now >= eta, "timelock");
}
```

## 3) Upgrade Class Hash and ETA Guards

Anti-pattern:

```cairo
#[external(v0)]
fn schedule_upgrade(ref self: ContractState, new_class_hash: felt252, executable_after: u64) {
    self.pending_class_hash.write(new_class_hash);
    self.executable_after.write(executable_after);
}
```

Secure pattern:

```cairo
#[external(v0)]
fn schedule_upgrade(ref self: ContractState, new_class_hash: felt252, executable_after: u64) {
    assert_only_owner(@self);
    assert!(new_class_hash != 0, "class_hash_zero");
    assert!(executable_after > 0_u64, "eta_zero");
    self.pending_class_hash.write(new_class_hash);
    self.executable_after.write(executable_after);
}
```

## 4) Pending Upgrade Reset After Execute

Anti-pattern:

```cairo
#[external(v0)]
fn execute_upgrade(ref self: ContractState) {
    let pending = self.pending_class_hash.read();
    self.active_class_hash.write(pending);
}
```

Secure pattern:

```cairo
#[external(v0)]
fn execute_upgrade(ref self: ContractState) {
    assert_only_owner(@self);
    let pending = self.pending_class_hash.read();
    assert!(pending != 0, "no_pending");
    self.active_class_hash.write(pending);
    self.pending_class_hash.write(0);
    self.executable_after.write(0_u64);
}
```

## 5) Constructor Critical Invariants

Anti-pattern:

```cairo
#[constructor]
fn constructor(ref self: ContractState, owner: ContractAddress, fee_bps: u16) {
    self.owner.write(owner);
    self.fee_bps.write(fee_bps);
}
```

Secure pattern:

```cairo
#[constructor]
fn constructor(ref self: ContractState, owner: ContractAddress, initial_fee_bps: u16) {
    assert!(!owner.is_zero(), "owner_zero");
    assert!(initial_fee_bps <= 10_000_u16, "fee_range");
    self.owner.write(owner);
    self.fee_bps.write(initial_fee_bps);
}
```

## 6) Documented Intentional Public Mutation (rare)

If a mutating external is intentionally public, document the invariant and add a regression test proving the public write cannot escalate privileges.

Required minimum:
- inline rationale comment at the function
- explicit invariant assertion in function body
- test case for abuse attempt
