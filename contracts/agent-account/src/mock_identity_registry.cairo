use core::byte_array::ByteArray;
use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockIdentityRegistry<TContractState> {
    fn register_with_token_uri(ref self: TContractState, token_uri: ByteArray) -> u256;
    fn register(ref self: TContractState) -> u256;
    fn owner_of(self: @TContractState, token_id: u256) -> ContractAddress;
    fn transfer_from(ref self: TContractState, from: ContractAddress, to: ContractAddress, token_id: u256);
}

#[starknet::contract]
pub mod MockIdentityRegistry {
    use core::byte_array::ByteArray;
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        Map,
        StorageMapReadAccess, StorageMapWriteAccess,
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use super::IMockIdentityRegistry;

    #[storage]
    struct Storage {
        next_id: u256,
        owners: Map<u256, ContractAddress>,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.next_id.write(1);
    }

    #[abi(embed_v0)]
    impl MockIdentityRegistryImpl of IMockIdentityRegistry<ContractState> {
        fn register_with_token_uri(ref self: ContractState, token_uri: ByteArray) -> u256 {
            let _ = token_uri;
            self._mint(get_caller_address())
        }

        fn register(ref self: ContractState) -> u256 {
            self._mint(get_caller_address())
        }

        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            self.owners.read(token_id)
        }

        fn transfer_from(
            ref self: ContractState,
            from: ContractAddress,
            to: ContractAddress,
            token_id: u256,
        ) {
            let caller = get_caller_address();
            assert(caller == from, 'Not authorized');
            assert(self.owners.read(token_id) == from, 'Not owner');
            self.owners.write(token_id, to);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _mint(ref self: ContractState, to: ContractAddress) -> u256 {
            let next_id = self.next_id.read();
            self.next_id.write(next_id + 1);
            self.owners.write(next_id, to);
            next_id
        }
    }
}
