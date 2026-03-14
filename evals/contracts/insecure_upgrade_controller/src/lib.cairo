fn can_execute(now: u64, eta: u64) -> bool {
    now >= eta
}

#[starknet::contract]
mod InsecureUpgrade {
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

    #[external(v0)]
    // Intentionally insecure: no owner/timelock/non-zero class-hash guards.
    fn upgrade_now(ref self: ContractState, new_class_hash: felt252) {
        self.active_class_hash.write(new_class_hash);
    }

    #[external(v0)]
    fn get_active(self: @ContractState) -> felt252 {
        self.active_class_hash.read()
    }
}

#[cfg(test)]
mod tests {
    use super::can_execute;

    #[test]
    fn can_execute_true() {
        assert!(can_execute(11, 10), "can_execute_true");
    }

    #[test]
    fn can_execute_false() {
        assert!(!can_execute(9, 10), "can_execute_false");
    }
}
