// BENIGN. Tempts FELT252-UNSAFE-ARITHMETIC: felt252 appears throughout, but only
// for selectors and hashes. Every quantity uses a bounded integer that traps.
#[starknet::contract]
mod FeltSelectorsBoundedMath {
    use core::poseidon::poseidon_hash_span;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        domain_tag: felt252,
        balance: u256,
        counter: u128,
    }

    #[constructor]
    fn constructor(ref self: ContractState, domain_tag: felt252) {
        self.domain_tag.write(domain_tag);
    }

    // felt252 used as an identifier, never as a quantity.
    fn commitment(self: @ContractState, nonce: felt252) -> felt252 {
        let tag = self.domain_tag.read();
        poseidon_hash_span(array![tag, nonce].span())
    }

    #[external(v0)]
    fn deposit(ref self: ContractState, amount: u256) {
        // u256 addition traps on overflow; this is the safe path.
        let current = self.balance.read();
        self.balance.write(current + amount);
        self.counter.write(self.counter.read() + 1_u128);
    }

    #[external(v0)]
    fn withdraw(ref self: ContractState, amount: u256) {
        let current = self.balance.read();
        assert!(current >= amount, "insufficient_balance");
        self.balance.write(current - amount);
    }
}
