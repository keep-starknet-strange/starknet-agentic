// Simple Mock Account for Testing
// This contract always returns 'VALID' for any signature verification
// Use ONLY for testing - NOT for production

#[starknet::contract]
pub mod SimpleMockAccount {
    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl IAccountImpl of crate::interfaces::account::IAccount<ContractState> {
        fn is_valid_signature(
            self: @ContractState, hash: felt252, signature: Array<felt252>
        ) -> felt252 {
            // Always return 'VALID' - this is a mock for testing only
            starknet::VALIDATED
        }
    }
}

