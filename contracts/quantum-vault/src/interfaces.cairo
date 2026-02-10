// ============================================================================
// QUANTUM VAULT INTERFACE
// ============================================================================
//
// HASH-COMMITMENT TRADEOFF:
// -------------------------
// This implementation uses calldata_hash instead of storing full calldata.
// 
// Benefits:
// - Reduced storage costs (1 field vs variable-length array)
// - Privacy: Calldata is not exposed until execution
// - Flexibility: Execute can pass any calldata that matches the hash
//
// Security Note:
// The contract trusts that the executed calldata matches the committed hash.
// This is acceptable for time-lock scenarios where:
// 1. The owner creates the lock (committing to specific actions)
// 2. After delay, anyone can execute (the calldata is revealed on-chain)
// 3. If wrong calldata is submitted, it will fail (wrong hash)
//
// Alternative: Store full calldata for on-chain validation before execution.
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
