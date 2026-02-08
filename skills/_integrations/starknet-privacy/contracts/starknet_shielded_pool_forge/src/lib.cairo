// SPDX-License-Identifier: MIT
// Starknet Privacy Pool - ShieldedPool Contract
// Cairo 2.14.0 compatible

#[starknet::contract]
mod ShieldedPool {
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use core::pedersen::PedersenTrait;
    use core::hash::HashStateTrait;

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    const ZERO_COMMITMENT_ERROR: felt252 = 'Invalid: zero commitment';

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    #[storage]
    struct Storage {
        merkle_root: felt252,
        next_index: u32,
        owner: ContractAddress,
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    #[event]
    #[derive(Drop, PartialEq, starknet::Event)]
    enum Event {
        Deposited: Deposited,
        Spent: Spent,
        MerkleRootUpdated: MerkleRootUpdated,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    struct Deposited {
        #[key]
        commitment: felt252,
        #[key]
        index: u32,
        depositor: ContractAddress,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    struct Spent {
        #[key]
        nullifier: felt252,
        #[key]
        new_commitment: felt252,
        spender: ContractAddress,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    struct MerkleRootUpdated {
        #[key]
        old_root: felt252,
        #[key]
        new_root: felt252,
        admin: ContractAddress,
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
        self.merkle_root.write(0);
        self.next_index.write(0);
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // EXTERNAL: DEPOSIT
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    #[external(v0)]
    fn deposit(ref self: ContractState, commitment: felt252) -> u32 {
        assert(commitment != 0, ZERO_COMMITMENT_ERROR);
        let index = self.next_index.read();
        self.next_index.write(index + 1);
        
        self.emit(Event::Deposited(Deposited {
            commitment,
            index,
            depositor: get_caller_address(),
        }));
        
        index
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // EXTERNAL: SPEND
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    #[external(v0)]
    fn spend(
        ref self: ContractState,
        nullifier: felt252,
        new_commitment: felt252,
    ) -> felt252 {
        assert(nullifier != 0, 'Nullifier cannot be zero');
        self.emit(Event::Spent(Spent {
            nullifier,
            new_commitment,
            spender: get_caller_address(),
        }));
        1
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // EXTERNAL: ADMIN
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    #[external(v0)]
    fn set_merkle_root(ref self: ContractState, new_root: felt252) {
        assert(get_caller_address() == self.owner.read(), 'Not owner');
        let old_root = self.merkle_root.read();
        self.merkle_root.write(new_root);
        
        self.emit(Event::MerkleRootUpdated(MerkleRootUpdated {
            old_root,
            new_root,
            admin: get_caller_address(),
        }));
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    #[external(v0)]
    fn get_merkle_root(self: @ContractState) -> felt252 {
        self.merkle_root.read()
    }

    #[external(v0)]
    fn get_next_index(self: @ContractState) -> u32 {
        self.next_index.read()
    }

    #[external(v0)]
    fn get_owner(self: @ContractState) -> ContractAddress {
        self.owner.read()
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // INTERNAL: HASH HELPERS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    fn compute_commitment(value: felt252, secret: felt252, salt: felt252) -> felt252 {
        let mut state = PedersenTrait::new(0);
        state = state.update(value);
        state = state.update(secret);
        state = state.update(salt);
        state.finalize()
    }

    fn compute_nullifier(secret: felt252, salt: felt252) -> felt252 {
        let mut state = PedersenTrait::new(0);
        state = state.update(secret);
        state = state.update(salt);
        state.finalize()
    }
}
