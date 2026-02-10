#[starknet::interface]
pub trait IFeeSmoothing<TContractState> {
    // Price management
    fn update_price(ref self: TContractState, new_price: u128);
    
    // Fee calculation
    fn get_fee_strk(self: @TContractState, gas_amount: u128) -> u128;
    fn get_fee_usd(self: @TContractState, gas_amount: u128) -> u128;
    
    // Price queries
    fn get_effective_price(self: @TContractState) -> u128;
    fn is_price_stale(self: @TContractState) -> bool;
    fn get_state(self: @TContractState) -> (u128, u128, u128, u128, bool);
}

#[starknet::interface]
pub trait IFeeSmoothingAdmin<TContractState> {
    fn set_target_usd_per_gas(ref self: TContractState, new_target: u128);
    fn set_smoothing_factor(ref self: TContractState, new_smoothing: u128);
    fn set_max_deviation(ref self: TContractState, new_max: u128);
    fn emergency_stop(ref self: TContractState, reason: felt252);
}
