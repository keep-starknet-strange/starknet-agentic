#[starknet::contract]
mod GuardedUpgradeWithoutTimelock {
    use starknet::get_caller_address;

    #[storage]
    struct Storage {
        class_hash: felt252,
        owner: starknet::ContractAddress,
    }

    #[external(v0)]
    fn upgrade(ref self: ContractState, new_class_hash: felt252) {
        self.assert_only_owner();
        assert!(new_class_hash != 0, 'zero class hash');
        self.class_hash.write(new_class_hash);
    }

    fn assert_only_owner(ref self: ContractState) {
        let caller = get_caller_address();
        let owner = self.owner.read();
        assert!(caller == owner, 'not owner');
    }
}
