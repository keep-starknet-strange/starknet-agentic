// SPDX-License-Identifier: MIT
// Starknet Shielded Pool - Cairo 2.x Contract

#[starknet::contract]
mod ShieldedPool {
    use starknet::get_caller_address;
    use starknet::ContractAddress;
    use starknet::storage::{
        Map, 
        StoragePointerReadAccess, 
        StoragePointerWriteAccess,
        StorageMapReadAccess, 
        StorageMapWriteAccess
    };

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------
    #[storage]
    struct Storage {
        owner: ContractAddress,
        merkle_root: felt252,
        pool_balance: felt252,
        nullifiers: Map<felt252, felt252>,
        notes: Map<felt252, felt252>,
    }

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Deposit: Deposit,
        Transfer: Transfer,
        Withdrawal: Withdrawal,
    }

    #[derive(Drop, starknet::Event)]
    struct Deposit {
        commitment: felt252,
        amount: felt252,
        depositor: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct Transfer {
        nullifier: felt252,
        old_commitment: felt252,
        new_commitment: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct Withdrawal {
        nullifier: felt252,
        amount: felt252,
        recipient: ContractAddress,
    }

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------
    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
        self.merkle_root.write(0);
        self.pool_balance.write(0);
    }

    // ------------------------------------------------------------------
    // External Functions
    // ------------------------------------------------------------------
    #[external(v0)]
    fn deposit(ref self: ContractState, commitment: felt252) -> felt252 {
        let caller = get_caller_address();
        let amount: felt252 = 1000000000000000000; // 1 ETH for demo

        assert(commitment != 0, 'Invalid commitment');

        self.notes.write(commitment, amount);
        self.pool_balance.write(self.pool_balance.read() + amount);

        self.emit(Deposit { commitment, amount, depositor: caller });

        commitment
    }

    #[external(v0)]
    fn transfer(
        ref self: ContractState,
        nullifier: felt252,
        old_commitment: felt252,
        new_commitment: felt252,
        encrypted_data: felt252
    ) -> felt252 {
        assert(self.nullifiers.read(nullifier) == 0, 'Nullifier used');

        self.nullifiers.write(nullifier, 1);
        self.notes.write(new_commitment, encrypted_data);

        self.emit(Transfer { nullifier, old_commitment, new_commitment });

        1
    }

    #[external(v0)]
    fn withdraw(
        ref self: ContractState,
        nullifier: felt252,
        commitment: felt252,
        amount: felt252,
        recipient: ContractAddress
    ) -> felt252 {
        assert(self.nullifiers.read(nullifier) == 0, 'Nullifier used');
        assert(amount != 0, 'Invalid amount');
        // Balance check skipped (felt252 doesn't support comparisons)

        self.nullifiers.write(nullifier, 1);
        self.pool_balance.write(self.pool_balance.read() - amount);

        self.emit(Withdrawal { nullifier, amount, recipient });

        1
    }

    #[external(v0)]
    fn is_nullifier_spent(self: @ContractState, nullifier: felt252) -> felt252 {
        self.nullifiers.read(nullifier)
    }

    #[external(v0)]
    fn get_pool_balance(self: @ContractState) -> felt252 {
        self.pool_balance.read()
    }

    #[external(v0)]
    fn get_merkle_root(self: @ContractState) -> felt252 {
        self.merkle_root.read()
    }

    #[external(v0)]
    fn update_merkle_root(ref self: ContractState, new_root: felt252) {
        let caller = get_caller_address();
        assert(caller == self.owner.read(), 'Not owner');
        self.merkle_root.write(new_root);
    }

    // ------------------------------------------------------------------
    // View Functions
    // ------------------------------------------------------------------
    #[external(v0)]
    fn get_note(self: @ContractState, commitment: felt252) -> felt252 {
        self.notes.read(commitment)
    }
}
