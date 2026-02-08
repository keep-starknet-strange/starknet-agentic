// SPDX-License-Identifier: MIT
// Starknet Shielded Pool Interface

trait IShieldedPoolTrait<TContractState> {
    fn deposit(ref self: TContractState, commitment: felt252) -> felt252;
    fn transfer(
        ref self: TContractState,
        nullifier: felt252,
        old_commitment: felt252,
        new_commitment: felt252,
        merkle_proof: Array<felt252>,
        encrypted_data: felt252
    ) -> felt252;
    fn withdraw(
        ref self: TContractState,
        nullifier: felt252,
        commitment: felt252,
        merkle_proof: Array<felt252>,
        amount: felt252,
        recipient: starknet::ContractAddress
    ) -> felt252;
    fn is_nullifier_spent(self: @TContractState, nullifier: felt252) -> felt252;
    fn get_pool_balance(self: @TContractState) -> felt252;
    fn get_merkle_root(self: @TContractState) -> felt252;
    fn update_merkle_root(ref self: TContractState, new_root: felt252);
}
