// ============================================================================
// QUANTUM VAULT CONTRACT
// ============================================================================

use super::interfaces::IQuantumVault;
use core::num::traits::Zero;
use starknet::{ContractAddress, get_block_timestamp};
use starknet::storage::*;
use starknet::SyscallResultTrait;
use openzeppelin::access::ownable::OwnableComponent;

// ─── Constants ───────────────────────────────────────────────────────
const MIN_DELAY: u64 = 300;        // 5 minutes minimum
const MAX_DELAY: u64 = 2592000;    // 30 days maximum
const GRACE_PERIOD: u64 = 86400;   // 24 hours grace period after expiry

// ─── Components ─────────────────────────────────────────────────────
component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

// Ownable embed (exposes owner, pending_owner, transfer_ownership, accept_ownership)
#[abi(embed_v0)]
impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;

impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

// ─── Storage ─────────────────────────────────────────────────────────
#[storage]
struct Storage {
    #[substorage(v0)]
    ownable: OwnableComponent::Storage,
    // Reentrancy guard
    executing: bool,
    // Time-lock storage
    lock_to: Map<felt252, ContractAddress>,
    lock_selector: Map<felt252, felt252>,
    lock_calldata: Map<felt252, felt252>,
    lock_unlock_at: Map<felt252, u64>,
    lock_status: Map<felt252, felt252>,  // 0=Pending, 1=Executed, 2=Cancelled
    lock_count: felt252,
}

// ─── Events ──────────────────────────────────────────────────────────
#[event]
#[derive(Drop, starknet::Event)]
enum Event {
    #[flat]
    OwnableEvent: OwnableComponent::Event,
    TimeLockCreated: TimeLockCreated,
    TimeLockExecuted: TimeLockExecuted,
    TimeLockCancelled: TimeLockCancelled,
    LockExpired: LockExpired,
}

#[derive(Drop, starknet::Event)]
struct TimeLockCreated {
    lock_id: felt252,
    to: ContractAddress,
    selector: felt252,
    unlock_at: u64,
    expires_at: u64,
}

#[derive(Drop, starknet::Event)]
struct TimeLockExecuted {
    lock_id: felt252,
}

#[derive(Drop, starknet::Event)]
struct TimeLockCancelled {
    lock_id: felt252,
}

#[derive(Drop, starknet::Event)]
struct LockExpired {
    lock_id: felt252,
    expires_at: u64,
}

// ─── Constructor ────────────────────────────────────────────────────
#[constructor]
fn constructor(ref self: ContractState, owner: ContractAddress) {
    self.ownable.initializer(owner);
    self.executing.write(false);
}

// ─── External Functions ─────────────────────────────────────────────
#[abi(embed_v0)]
impl QuantumVaultImpl of IQuantumVault<ContractState> {

    /// Creates a time-locked transaction proposal.
    /// @param to Target contract address
    /// @param selector Function selector to call
    /// @param calldata_hash Hash of the calldata (hash-commitment scheme)
    /// @param delay_seconds Delay before execution (minimum 300 seconds)
    /// @return lock_id The unique ID of the created time lock
    fn create_time_lock(
        ref self: ContractState,
        to: ContractAddress,
        selector: felt252,
        calldata_hash: felt252,
        delay_seconds: u64
    ) -> felt252 {
        self.ownable.assert_only_owner();
        
        // Zero-address validation
        assert(to != Zeroable::zero(), 'Zero target address');
        
        // Delay bounds
        assert(delay_seconds >= MIN_DELAY, 'Delay too short');
        assert(delay_seconds <= MAX_DELAY, 'Delay too long');
        
        let unlock_at = get_block_timestamp() + delay_seconds;
        let expires_at = unlock_at + GRACE_PERIOD;
        let lock_id = self.lock_count.read() + 1;
        
        // Storage writes
        self.lock_to.write(lock_id, to);
        self.lock_selector.write(lock_id, selector);
        self.lock_calldata.write(lock_id, calldata_hash);
        self.lock_unlock_at.write(lock_id, unlock_at);
        self.lock_status.write(lock_id, 0);  // Pending
        self.lock_count.write(lock_id);
        
        // Emit event with expiry info
        self.emit(TimeLockCreated { lock_id, to, selector, unlock_at, expires_at });
        
        lock_id
    }

    fn execute_time_lock(ref self: ContractState, lock_id: felt252) {
        self.ownable.assert_only_owner();
        
        // Reentrancy guard
        assert(!self.executing.read(), 'Already executing');
        self.executing.write(true);
        
        let status = self.lock_status.read(lock_id);
        assert(status == 0, 'Not pending');
        
        let now = get_block_timestamp();
        let unlock_at = self.lock_unlock_at.read(lock_id);
        let expires_at = unlock_at + GRACE_PERIOD;
        
        // Time checks
        assert(now >= unlock_at, 'Not unlocked yet');
        assert(now <= expires_at, 'Grace period expired');
        
        // Emit expiry event
        self.emit(LockExpired { lock_id, expires_at });
        
        // Execute the actual call
        let to = self.lock_to.read(lock_id);
        let selector = self.lock_selector.read(lock_id);
        let calldata_hash = self.lock_calldata.read(lock_id);
        
        // NOTE: This contract uses a HASH-COMMITMENT scheme for calldata.
        // The target contract should expect the original calldata hash as its single argument
        // and verify that the provided data matches the committed hash.
        // Example: target function should be: fn execute_with_proof(data: felt252, proof: felt252)
        // For full calldata storage, modify lock_calldata to use a Span<felt252> instead.
        let calldata = array![calldata_hash].span();
        let _ = starknet::syscalls::call_contract_syscall(to, selector, calldata)
            .unwrap_syscall();
        
        // Update status AFTER successful execution
        self.executing.write(false);
        self.emit(TimeLockExecuted { lock_id });
        self.lock_status.write(lock_id, 1);  // Executed
    }

    fn cancel_time_lock(ref self: ContractState, lock_id: felt252) {
        self.ownable.assert_only_owner();
        
        let status = self.lock_status.read(lock_id);
        assert(status == 0, 'Not pending');
        
        self.lock_status.write(lock_id, 2);  // Cancelled
        self.emit(TimeLockCancelled { lock_id });
    }

    fn get_time_lock(
        self: @ContractState, 
        lock_id: felt252
    ) -> (ContractAddress, felt252, u64, felt252) {
        (
            self.lock_to.read(lock_id),
            self.lock_selector.read(lock_id),
            self.lock_unlock_at.read(lock_id),
            self.lock_status.read(lock_id)
        )
    }

    fn get_lock_count(self: @ContractState) -> felt252 {
        self.lock_count.read()
    }

    fn is_lock_expired(self: @ContractState, lock_id: felt252) -> bool {
        let unlock_at = self.lock_unlock_at.read(lock_id);
        let expires_at = unlock_at + GRACE_PERIOD;
        get_block_timestamp() >= expires_at
    }
}
