#[starknet::contract]
pub mod MockTarget {
    #[storage]
    struct Storage {}

    #[external(v0)]
    fn execute(self: @ContractState, data: felt252) {}
}
