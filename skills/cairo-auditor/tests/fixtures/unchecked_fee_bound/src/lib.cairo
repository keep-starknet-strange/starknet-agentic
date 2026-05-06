#[starknet::contract]
mod FeeConfig {
    #[storage]
    struct Storage {
        fee_bps: u16,
    }

    #[abi(embed_v0)]
    impl FeeConfigImpl of super::IFeeConfig<ContractState> {
        fn set_fee(ref self: ContractState, fee_bps: u16) {
            self.ownable.assert_only_owner();
            self.fee_bps.write(fee_bps);
        }
    }
}
