// ============================================================================
// QUANTUM VAULT INTERFACE
// ============================================================================

use starknet::ContractAddress;

#[starknet::interface]
pub trait IQuantumVault<TState> {
    // Time-Lock Functions
    fn create_time_lock(
        ref self: TState,
        to: ContractAddress,
        selector: felt252,
        calldata_hash: felt252,
        delay_seconds: u64
    ) -> felt252;
    
    fn execute_time_lock(ref self: TState, lock_id: felt252);
    fn cancel_time_lock(ref self: TState, lock_id: felt252);
    
    // View Functions
    fn get_time_lock(
        self: @TState, 
        lock_id: felt252
    ) -> (ContractAddress, felt252, u64, felt252);
    
    fn get_lock_count(self: @TState) -> felt252;
    fn is_lock_expired(self: @TState, lock_id: felt252) -> bool;
}

// ============================================================================
// QUANTUM VAULT CONTRACT
// ============================================================================

#[starknet::contract]
mod QuantumVault {
    use starknet::{ContractAddress, get_block_timestamp};
    use starknet::storage::*;
    use starknet::SyscallResultTrait;
    use openzeppelin::access::ownable::OwnableComponent;

    // ─── Constants ───────────────────────────────────────────────────────
    const MIN_DELAY: u64 = 300;      // 5 minutes
    const MAX_DELAY: u64 = 2592000;  // 30 days

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
    }

    #[derive(Drop, starknet::Event)]
    struct TimeLockCreated {
        lock_id: felt252,
        to: ContractAddress,
        selector: felt252,
        unlock_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct TimeLockExecuted {
        lock_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct TimeLockCancelled {
        lock_id: felt252,
    }

    // ─── Constructor ────────────────────────────────────────────────────
    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
    }

    // ─── External Functions ─────────────────────────────────────────────
    #[abi(embed_v0)]
    impl QuantumVaultImpl of super::IQuantumVault<ContractState> {

        fn create_time_lock(
            ref self: ContractState,
            to: ContractAddress,
            selector: felt252,
            calldata_hash: felt252,
            delay_seconds: u64
        ) -> felt252 {
            self.ownable.assert_only_owner();
            assert(delay_seconds >= MIN_DELAY, 'Delay too short');
            assert(delay_seconds <= MAX_DELAY, 'Delay too long');
            
            let unlock_at = get_block_timestamp() + delay_seconds;
            let lock_id = self.lock_count.read() + 1;
            
            self.lock_to.write(lock_id, to);
            self.lock_selector.write(lock_id, selector);
            self.lock_calldata.write(lock_id, calldata_hash);
            self.lock_unlock_at.write(lock_id, unlock_at);
            self.lock_status.write(lock_id, 0);  // Pending
            self.lock_count.write(lock_id);
            
            self.emit(TimeLockCreated { lock_id, to, selector, unlock_at });
            
            lock_id
        }

        fn execute_time_lock(ref self: ContractState, lock_id: felt252) {
            self.ownable.assert_only_owner();
            
            let status = self.lock_status.read(lock_id);
            assert(status == 0, 'Not pending');
            assert(get_block_timestamp() >= self.lock_unlock_at.read(lock_id), 'Not unlocked yet');
            
            // Execute the actual call
            let to = self.lock_to.read(lock_id);
            let selector = self.lock_selector.read(lock_id);
            let calldata_hash = self.lock_calldata.read(lock_id);
            
            // Real call_contract_syscall
            let calldata = array![calldata_hash].span();
            let _ = starknet::syscalls::call_contract_syscall(to, selector, calldata)
                .unwrap_syscall();
            
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
            get_block_timestamp() >= self.lock_unlock_at.read(lock_id)
        }
    }
}
