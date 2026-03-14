fn can_execute(now: u64, eta: u64) -> bool {
    now >= eta
}

#[starknet::contract]
mod TimelockedUpgrade {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        active_class_hash: felt252,
        pending_class_hash: felt252,
        executable_after: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, initial_class_hash: felt252) {
        assert!(!owner.is_zero(), "owner_zero");
        assert!(initial_class_hash != 0, "class_hash_zero");
        self.owner.write(owner);
        self.active_class_hash.write(initial_class_hash);
        self.pending_class_hash.write(0);
        self.executable_after.write(0_u64);
    }

    fn assert_only_owner(self: @ContractState) {
        let caller = get_caller_address();
        let owner = self.owner.read();
        assert!(caller == owner, "not_owner");
    }

    #[external(v0)]
    fn schedule_upgrade(ref self: ContractState, new_class_hash: felt252, executable_after: u64) {
        assert_only_owner(@self);
        assert!(new_class_hash != 0, "class_hash_zero");
        assert!(executable_after > 0_u64, "eta_zero");
        self.pending_class_hash.write(new_class_hash);
        self.executable_after.write(executable_after);
    }

    #[external(v0)]
    fn execute_upgrade(ref self: ContractState) {
        assert_only_owner(@self);
        let now = get_block_timestamp();
        let eta = self.executable_after.read();
        assert!(now >= eta, "timelock");
        let pending = self.pending_class_hash.read();
        assert!(pending != 0, "no_pending");
        self.active_class_hash.write(pending);
        self.pending_class_hash.write(0);
        self.executable_after.write(0_u64);
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
