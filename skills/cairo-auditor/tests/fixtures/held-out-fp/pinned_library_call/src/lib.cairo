// BENIGN. Tempts CONTROLLED-LIBRARY-CALL: a library_call_syscall whose class hash
// is owner-configured and non-zero-guarded, never taken from the caller.
#[starknet::contract]
mod PinnedLibraryCall {
    use core::num::traits::Zero;
    use starknet::{ClassHash, ContractAddress, get_caller_address, library_call_syscall};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        strategy_class: ClassHash,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, strategy_class: ClassHash) {
        assert!(!owner.is_zero(), "owner_zero");
        assert!(!strategy_class.is_zero(), "class_zero");
        self.owner.write(owner);
        self.strategy_class.write(strategy_class);
    }

    #[external(v0)]
    fn set_strategy_class(ref self: ContractState, strategy_class: ClassHash) {
        assert!(get_caller_address() == self.owner.read(), "not_owner");
        assert!(!strategy_class.is_zero(), "class_zero");
        self.strategy_class.write(strategy_class);
    }

    #[external(v0)]
    fn run_strategy(ref self: ContractState, selector: felt252) {
        // Class hash comes from owner-gated storage, not from calldata.
        let class_hash = self.strategy_class.read();
        library_call_syscall(class_hash, selector, array![].span()).unwrap();
    }
}
