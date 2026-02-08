#[starknet::contract]
mod ShieldedPool {
    // Import storage traits explicitly!
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        owner: felt252,
        merkle_root: felt252,
        next_index: felt252,
        pool_balance: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState, _owner: felt252) {
        self.owner.write(_owner);
        self.merkle_root.write(0);
        self.next_index.write(0);
        self.pool_balance.write(0);
    }

    #[external(v0)]
    fn deposit(ref self: ContractState, commitment: felt252) {
        assert(commitment != 0, 'Invalid commitment');
        let idx = self.next_index.read();
        self.next_index.write(idx + 1);
    }

    #[external(v0)]
    fn is_nullifier_spent(self: @ContractState, nullifier: felt252) -> felt252 {
        0
    }

    #[external(v0)]
    fn get_merkle_root(self: @ContractState) -> felt252 {
        self.merkle_root.read()
    }

    #[external(v0)]
    fn get_pool_balance(self: @ContractState) -> felt252 {
        self.pool_balance.read()
    }
}
