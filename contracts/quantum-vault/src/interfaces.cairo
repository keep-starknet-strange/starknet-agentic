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
