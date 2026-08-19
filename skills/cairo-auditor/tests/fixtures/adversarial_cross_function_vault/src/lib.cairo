#[starknet::contract]
mod CrossFunctionVault {
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        operator: ContractAddress,
        pending_withdrawal: LegacyMap<ContractAddress, u256>,
    }

    #[abi(embed_v0)]
    impl VaultImpl of super::IVault<ContractState> {
        fn request_withdrawal(ref self: ContractState, amount: u256) {
            assert!(get_caller_address() != 0, 'CALLER_REQUIRED');
            self.pending_withdrawal.write(get_caller_address(), amount);
        }

        fn execute_withdrawal(ref self: ContractState, beneficiary: ContractAddress) {
            assert!(get_caller_address() == self.operator.read(), 'NOT_OPERATOR');
            let amount = self.pending_withdrawal.read(beneficiary);
            self._payout(beneficiary, amount);
            self.pending_withdrawal.write(beneficiary, 0);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _payout(ref self: ContractState, beneficiary: ContractAddress, amount: u256) {
            self.asset_dispatcher.read().transfer(beneficiary, amount);
        }
    }
}
