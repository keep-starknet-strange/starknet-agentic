// Strict Mock Account for testing wallet-signature domain separation.
// Returns VALID only when signature[0] equals the provided message hash.

#[starknet::contract]
pub mod StrictMockAccount {
    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl IAccountImpl of crate::interfaces::account::IAccount<ContractState> {
        fn is_valid_signature(
            self: @ContractState, hash: felt252, signature: Array<felt252>
        ) -> felt252 {
            if signature.len() == 0 {
                return 0;
            }

            if *signature.at(0) == hash {
                starknet::VALIDATED
            } else {
                0
            }
        }
    }
}
