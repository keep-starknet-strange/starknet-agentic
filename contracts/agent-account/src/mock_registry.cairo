use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockRegistry<TContractState> {
    fn owner_of(self: @TContractState, token_id: u256) -> ContractAddress;
}

#[starknet::contract]
pub mod MockRegistry {
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::IMockRegistry;

    #[storage]
    struct Storage {
        owner: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
    }

    #[abi(embed_v0)]
    impl MockRegistryImpl of IMockRegistry<ContractState> {
        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            self.owner.read()
        }
    }
}
