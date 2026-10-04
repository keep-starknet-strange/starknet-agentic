// BENIGN. Tempts L1-HANDLER-UNCHECKED-FROM: an l1_handler that mints.
// Safe because from_address is asserted against the configured L1 bridge.
#[starknet::contract]
mod GuardedL1Handler {
    use core::num::traits::Zero;
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        l1_bridge: felt252,
        total_minted: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, l1_bridge: felt252) {
        assert!(!owner.is_zero(), "owner_zero");
        assert!(l1_bridge != 0, "bridge_zero");
        self.owner.write(owner);
        self.l1_bridge.write(l1_bridge);
    }

    #[l1_handler]
    fn handle_deposit(ref self: ContractState, from_address: felt252, amount: u256) {
        // The guard the detector must see before flagging.
        assert!(from_address == self.l1_bridge.read(), "invalid_l1_sender");
        let current = self.total_minted.read();
        self.total_minted.write(current + amount);
    }
}
