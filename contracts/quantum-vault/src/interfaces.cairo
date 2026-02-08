use starknet::{ContractAddress};

#[derive(Drop, Serde)]
pub enum LockStatus {
    Pending: (),
    Executed: (),
    Cancelled: (),
}

#[derive(Drop, Serde)]
pub struct TimeLock {
    pub to: ContractAddress,
    pub selector: felt252,
    pub calldata: Span<felt252>,
    pub unlock_at: u64,
    pub status: LockStatus,
}

#[starknet::interface]
pub trait IQuantumVault<TContractState> {
    fn create_time_lock(
        ref self: TContractState,
        to: ContractAddress,
        selector: felt252,
        calldata: Span<felt252>,
        delay_seconds: u64
    ) -> felt252;
    
    fn execute_time_lock(ref self: TContractState, lock_id: felt252);
    fn cancel_time_lock(ref self: TContractState, lock_id: felt252);
    
    fn get_time_lock(self: @TContractState, lock_id: felt252) -> TimeLock;
    fn get_lock_count(self: @TContractState) -> felt252;
}
