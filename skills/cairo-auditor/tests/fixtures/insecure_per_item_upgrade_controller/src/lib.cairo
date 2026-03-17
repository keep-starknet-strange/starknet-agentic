#[starknet::interface]
trait IUpgrade<TContractState> {
    fn upgrade(ref self: TContractState, new_class_hash: felt252);
}

#[starknet::contract]
mod InsecurePerItemUpgradeController {
    #[storage]
    struct Storage {
        class_hash: felt252,
    }

    #[abi(per_item)]
    impl UpgradeImpl of super::IUpgrade<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: felt252) {
            self.class_hash.write(new_class_hash);
        }
    }
}
