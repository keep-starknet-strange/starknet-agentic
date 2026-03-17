#[starknet::contract]
mod CallerReadWithoutAuth {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        last_caller: ContractAddress,
        critical_value: felt252,
    }

    #[external(v0)]
    // Intentionally insecure: caller is read for bookkeeping but never authorized.
    fn set_value(ref self: ContractState, new_value: felt252) {
        let caller = get_caller_address();
        self.last_caller.write(caller);
        self.critical_value.write(new_value);
    }

    #[external(v0)]
    fn get_value(self: @ContractState) -> felt252 {
        self.critical_value.read()
    }
}
