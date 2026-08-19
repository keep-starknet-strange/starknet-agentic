#[starknet::contract]
mod FeeConfig {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        fee_bps: u16,
    }

    #[abi(embed_v0)]
    impl FeeConfigImpl of super::IFeeConfig<ContractState> {
        fn set_fee(ref self: ContractState, fee_bps: u16) {
            assert!(get_caller_address() == self.owner.read(), "only owner");
            self.fee_bps.write(fee_bps);
        }
    }
}
