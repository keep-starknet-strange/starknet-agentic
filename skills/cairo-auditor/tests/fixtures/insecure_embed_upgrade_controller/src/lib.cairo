#[starknet::interface]
trait IUpgrade<TContractState> {
    fn upgrade_now(ref self: TContractState, new_class_hash: felt252);
    fn get_active(self: @TContractState) -> felt252;
}

#[starknet::contract]
mod InsecureEmbedUpgrade {
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        active_class_hash: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, initial_class_hash: felt252) {
        self.owner.write(owner);
        self.active_class_hash.write(initial_class_hash);
    }

    #[abi(embed_v0)]
    impl UpgradeImpl of super::IUpgrade<ContractState> {
        // Intentionally insecure: no owner/timelock/non-zero class-hash guards.
        fn upgrade_now(ref self: ContractState, new_class_hash: felt252) {
            self.active_class_hash.write(new_class_hash);
        }

        fn get_active(self: @ContractState) -> felt252 {
            self.active_class_hash.read()
        }
    }
}
