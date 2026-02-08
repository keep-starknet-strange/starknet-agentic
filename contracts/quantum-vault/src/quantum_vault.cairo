#[starknet::contract]
pub mod QuantumVault {
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use starknet::storage::*;

    const MIN_DELAY: u64 = 300;
    const MAX_DELAY: u64 = 2592000;

    #[storage]
    struct Storage {
        lock_to: Map<felt252, ContractAddress>,
        lock_selector: Map<felt252, felt252>,
        lock_calldata: Map<felt252, felt252>,
        lock_unlock_at: Map<felt252, u64>,
        lock_executed: Map<felt252, bool>,
        lock_count: felt252,
        owner: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        TimeLockCreated: TimeLockCreated,
        TimeLockExecuted: TimeLockExecuted,
        TimeLockExtended: TimeLockExtended,
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
    struct TimeLockExtended {
        lock_id: felt252,
        new_unlock_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct TimeLockCancelled {
        lock_id: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
    }

    #[external(v0)]
    fn create_time_lock(
        ref self: ContractState,
        to: ContractAddress,
        selector: felt252,
        calldata_hash: felt252,
        delay_seconds: u64
    ) -> felt252 {
        let caller = get_caller_address();
        assert(caller == self.owner.read(), 'Not owner');
        assert(delay_seconds >= MIN_DELAY, 'Delay too short');
        assert(delay_seconds <= MAX_DELAY, 'Delay too long');
        
        let unlock_at = get_block_timestamp() + delay_seconds;
        let lock_id = self.lock_count.read() + 1;
        
        self.lock_to.write(lock_id, to);
        self.lock_selector.write(lock_id, selector);
        self.lock_calldata.write(lock_id, calldata_hash);
        self.lock_unlock_at.write(lock_id, unlock_at);
        self.lock_executed.write(lock_id, false);
        self.lock_count.write(lock_id);
        
        self.emit(TimeLockCreated { lock_id, to, selector, unlock_at });
        
        lock_id
    }

    #[external(v0)]
    fn execute_time_lock(ref self: ContractState, lock_id: felt252) {
        let caller = get_caller_address();
        assert(caller == self.owner.read(), 'Not owner');
        assert(!self.lock_executed.read(lock_id), 'Already executed');
        assert(get_block_timestamp() >= self.lock_unlock_at.read(lock_id), 'Not unlocked yet');
        
        self.lock_executed.write(lock_id, true);
        self.emit(TimeLockExecuted { lock_id });
    }

    #[external(v0)]
    fn extend_time_lock(ref self: ContractState, lock_id: felt252, additional_seconds: u64) {
        let caller = get_caller_address();
        assert(caller == self.owner.read(), 'Not owner');
        assert(!self.lock_executed.read(lock_id), 'Already executed');
        
        let new_unlock_at = self.lock_unlock_at.read(lock_id) + additional_seconds;
        assert(new_unlock_at <= get_block_timestamp() + MAX_DELAY, 'Exceeds max delay');
        
        self.lock_unlock_at.write(lock_id, new_unlock_at);
        self.emit(TimeLockExtended { lock_id, new_unlock_at });
    }

    #[external(v0)]
    fn cancel_time_lock(ref self: ContractState, lock_id: felt252) {
        let caller = get_caller_address();
        assert(caller == self.owner.read(), 'Not owner');
        assert(!self.lock_executed.read(lock_id), 'Already executed');
        
        self.lock_executed.write(lock_id, true);
        self.emit(TimeLockCancelled { lock_id });
    }

    #[external(v0)]
    fn get_time_lock(self: @ContractState, lock_id: felt252) -> (ContractAddress, felt252, u64, bool) {
        (
            self.lock_to.read(lock_id),
            self.lock_selector.read(lock_id),
            self.lock_unlock_at.read(lock_id),
            self.lock_executed.read(lock_id)
        )
    }

    #[external(v0)]
    fn get_lock_count(self: @ContractState) -> felt252 {
        self.lock_count.read()
    }

    #[external(v0)]
    fn is_expired(self: @ContractState, unlock_at: u64) -> bool {
        get_block_timestamp() >= unlock_at
    }
}
