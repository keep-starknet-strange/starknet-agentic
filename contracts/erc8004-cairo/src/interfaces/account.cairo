// Interface for account contracts (for signature verification)

#[starknet::interface]
pub trait IAccount<TContractState> {
    fn is_valid_signature(
        self: @TContractState, hash: felt252, signature: Array<felt252>
    ) -> felt252;
}

