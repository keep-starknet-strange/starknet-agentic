// BENIGN. Tempts USE-AFTER-POP-FRONT and UNENFORCED-VIEW: a span is drained in a
// loop, and a read-only view sits beside a mutating path.
#[starknet::contract]
mod SafeSpanAndView {
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        total: u256,
    }

    // The span owns its cursor; no cached length is reused after popping.
    fn sum_amounts(mut amounts: Span<u256>) -> u256 {
        let mut total: u256 = 0;
        loop {
            match amounts.pop_front() {
                Option::Some(value) => { total = total + *value; },
                Option::None => { break; },
            };
        };
        total
    }

    #[external(v0)]
    fn record_batch(ref self: ContractState, amounts: Span<u256>) {
        let added = sum_amounts(amounts);
        self.total.write(self.total.read() + added);
    }

    // Genuinely read-only: takes a snapshot of state and writes nothing.
    #[external(v0)]
    fn get_total(self: @ContractState) -> u256 {
        self.total.read()
    }
}
