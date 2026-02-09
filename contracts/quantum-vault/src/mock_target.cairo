#[starknet::contract]
pub mod MockTarget {
    #[storage]
    struct Storage {
        last_data: felt252,
    }

    #[external(v0)]
    fn execute(ref self: ContractState, data: felt252) {
        self.last_data.write(data);
    }
}
