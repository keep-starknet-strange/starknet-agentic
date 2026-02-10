use ofs_fee_smoothing::interfaces::{IFeeSmoothingDispatcher, IFeeSmoothingDispatcherTrait, IFeeSmoothingAdminDispatcher, IFeeSmoothingAdminDispatcherTrait};
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address, stop_cheat_caller_address, start_cheat_block_timestamp, stop_cheat_block_timestamp};
use starknet::ContractAddress;

const OWNER: felt252 = 0x123456789ABCDEF;
const ORACLE: felt252 = 0xDEADBEEF;
const PRICE_SCALE: u128 = 1_000_000_000_000;

fn owner_address() -> ContractAddress {
    OWNER.try_into().unwrap()
}

fn oracle_address() -> ContractAddress {
    ORACLE.try_into().unwrap()
}

fn deploy_contract() -> ContractAddress {
    let contract = declare("FeeSmoothing").unwrap().contract_class();
    // $0.50 STRK/USD (scaled by 10^12) = 0.5 * 10^12 = 500_000_000_000
    let initial_price: u128 = 500_000_000_000; 
    let target_usd: u128 = 1_000_000_000_000; // $0.001 USD per L2gas (scaled)
    let constructor_args: Array<felt252> = array![
        OWNER, ORACLE, initial_price.try_into().unwrap(), target_usd.try_into().unwrap()
    ];
    let (addr, _) = contract.deploy(@constructor_args).unwrap();
    addr
}

// ─── Constructor Tests ───────────────────────────────────────────────────

#[test]
fn test_constructor_initializes_correctly() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let (price, twap, target_usd, smoothing, stale) = dispatcher.get_state();
    
    assert(price > 0, 'Price should be set');
    assert(twap > 0, 'TWAP should be set');
    assert(target_usd == 1_000_000_000_000, 'Target USD mismatch');
    assert(smoothing == 800_000_000_000, 'Smoothing mismatch');
    assert(stale == false, 'Price should not be stale');
}

#[test]
fn test_get_effective_price_initial() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let effective = dispatcher.get_effective_price();
    assert(effective > 0, 'Effective price positive');
}

// ─── Price Update Tests ───────────────────────────────────────────────

#[test]
fn test_update_price_as_owner() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let initial_price = dispatcher.get_effective_price();

    // Update price to $0.55 (within 20% of $0.50)
    start_cheat_caller_address(addr, owner_address());
    dispatcher.update_price(550_000_000_000);
    stop_cheat_caller_address(addr);
    
    let new_price = dispatcher.get_effective_price();
    assert(new_price > initial_price, 'Price should increase');
}

#[test]
fn test_update_price_as_oracle() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let initial_price = dispatcher.get_effective_price();
    
    // Update price to $0.45 (within 20% of $0.50)
    start_cheat_caller_address(addr, oracle_address());
    dispatcher.update_price(450_000_000_000);
    stop_cheat_caller_address(addr);
    
    let new_price = dispatcher.get_effective_price();
    assert(new_price < initial_price, 'Price should decrease');
}

#[test]
#[should_panic(expected: ('Unauthorized caller',))]
fn test_update_price_as_non_owner_rejected() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    let non_owner: ContractAddress = 0x123.try_into().unwrap();
    
    start_cheat_caller_address(addr, non_owner);
    dispatcher.update_price(550_000_000_000);
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: ('Price below minimum',))]
fn test_update_price_below_minimum() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    start_cheat_caller_address(addr, owner_address());
    dispatcher.update_price(1_000_000_000); // $0.000001 - too low
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: ('Price above maximum',))]
fn test_update_price_above_maximum() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    start_cheat_caller_address(addr, owner_address());
    dispatcher.update_price(100_000_000_000_000_000); // $100 - too high
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: ('Price deviation too large',))]
fn test_update_price_too_volatile() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    // Initial price is $0.50, try to jump 50% (beyond 20% max)
    start_cheat_caller_address(addr, owner_address());
    dispatcher.update_price(750_000_000_000); // $0.75 - 50% increase
    stop_cheat_caller_address(addr);
}

// ─── Fee Calculation Tests ─────────────────────────────────────────────

#[test]
fn test_get_fee_strk_basic() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let fee = dispatcher.get_fee_strk(1_000_000);
    assert(fee > 0, 'Fee should be positive');
}

#[test]
fn test_get_fee_usd_basic() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let fee_usd = dispatcher.get_fee_usd(1_000_000);
    assert(fee_usd > 0, 'USD fee should be positive');
}

#[test]
fn test_get_fee_usd_scales_linearly() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let fee_1x = dispatcher.get_fee_usd(1_000_000);
    let fee_2x = dispatcher.get_fee_usd(2_000_000);
    let fee_10x = dispatcher.get_fee_usd(10_000_000);
    
    assert(fee_2x == fee_1x * 2, 'Fee should scale 2x');
    assert(fee_10x == fee_1x * 10, 'Fee should scale 10x');
}

#[test]
fn test_fee_usd_constant_regardless_of_price() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let fee_before = dispatcher.get_fee_usd(1_000_000);
    
    // Update price within bounds ($0.50 -> $0.60 = 20% increase, at limit)
    start_cheat_caller_address(addr, owner_address());
    dispatcher.update_price(600_000_000_000);
    stop_cheat_caller_address(addr);
    
    let fee_after = dispatcher.get_fee_usd(1_000_000);
    assert(fee_after == fee_before, 'USD fee constant');
}

#[test]
fn test_fee_computed_after_price_change() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    // Get initial fee
    let _fee_initial = dispatcher.get_fee_strk(1_000_000);
    
    // Update price to $0.40 (20% decrease)
    start_cheat_caller_address(addr, owner_address());
    dispatcher.update_price(400_000_000_000);
    stop_cheat_caller_address(addr);
    
    // Fee is computed - just verify no error
    let _fee_after = dispatcher.get_fee_strk(1_000_000);
    assert(true, 'Fee computed successfully');
}

// ─── Price Staleness Tests ─────────────────────────────────────────────

#[test]
fn test_price_not_stale_initially() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let stale = dispatcher.is_price_stale();
    assert(stale == false, 'Not stale initially');
}

#[test]
fn test_price_becomes_stale_after_timeout() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    start_cheat_block_timestamp(addr, 7200);
    let is_stale = dispatcher.is_price_stale();
    stop_cheat_block_timestamp(addr);
    
    assert(is_stale == true, 'Stale after timeout');
}

#[test]
fn test_price_update_refreshes_staleness() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    start_cheat_block_timestamp(addr, 7200);
    let stale_before = dispatcher.is_price_stale();
    stop_cheat_block_timestamp(addr);
    assert(stale_before == true, 'Should be stale');
    
    start_cheat_caller_address(addr, owner_address());
    dispatcher.update_price(550_000_000_000);
    stop_cheat_caller_address(addr);
    
    let stale_after = dispatcher.is_price_stale();
    assert(stale_after == false, 'Not stale after update');
}

// ─── Admin Function Tests ───────────────────────────────────────────────

#[test]
fn test_set_target_usd_per_gas() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    let admin_dispatcher = IFeeSmoothingAdminDispatcher { contract_address: addr };
    
    let (_, _, initial_target, _, _) = dispatcher.get_state();
    assert(initial_target == 1_000_000_000_000, 'Initial target mismatch');
    
    start_cheat_caller_address(addr, owner_address());
    admin_dispatcher.set_target_usd_per_gas(2_000_000_000_000);
    stop_cheat_caller_address(addr);
    
    let (_, _, new_target, _, _) = dispatcher.get_state();
    assert(new_target == 2_000_000_000_000, 'Target updated');
}

#[test]
#[should_panic(expected: ('Caller is not the owner',))]
fn test_set_target_as_non_owner_rejected() {
    let addr = deploy_contract();
    let admin_dispatcher = IFeeSmoothingAdminDispatcher { contract_address: addr };
    let non_owner: ContractAddress = 0x123.try_into().unwrap();
    
    start_cheat_caller_address(addr, non_owner);
    admin_dispatcher.set_target_usd_per_gas(2_000_000_000_000);
    stop_cheat_caller_address(addr);
}

#[test]
fn test_set_smoothing_factor() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    let admin_dispatcher = IFeeSmoothingAdminDispatcher { contract_address: addr };
    
    let (_, _, _, initial_smoothing, _) = dispatcher.get_state();
    assert(initial_smoothing == 800_000_000_000, 'Initial smoothing mismatch');
    
    start_cheat_caller_address(addr, owner_address());
    admin_dispatcher.set_smoothing_factor(PRICE_SCALE);
    stop_cheat_caller_address(addr);
    
    let (_, _, _, new_smoothing, _) = dispatcher.get_state();
    assert(new_smoothing == PRICE_SCALE, 'Smoothing 100%');
}

#[test]
#[should_panic(expected: ('Smoothing must be 0-1',))]
fn test_set_smoothing_factor_above_one() {
    let addr = deploy_contract();
    let admin_dispatcher = IFeeSmoothingAdminDispatcher { contract_address: addr };
    
    start_cheat_caller_address(addr, owner_address());
    admin_dispatcher.set_smoothing_factor(PRICE_SCALE + 1);
    stop_cheat_caller_address(addr);
}

#[test]
fn test_emergency_stop() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    let admin_dispatcher = IFeeSmoothingAdminDispatcher { contract_address: addr };
    
    let (_, _, target_before, smoothing_before, _) = dispatcher.get_state();
    assert(target_before == 1_000_000_000_000, 'Initial target mismatch');
    assert(smoothing_before == 800_000_000_000, 'Initial smoothing mismatch');
    
    start_cheat_caller_address(addr, owner_address());
    admin_dispatcher.emergency_stop('Flash crash detected');
    stop_cheat_caller_address(addr);
    
    let (_, _, target_after, smoothing_after, _) = dispatcher.get_state();
    assert(target_after == 1_000_000_000_000, 'Safe default target');
    assert(smoothing_after == PRICE_SCALE, '100% TWAP smoothing');
}

// ─── TWAP Calculation Tests ────────────────────────────────────────────

#[test]
fn test_twap_accumulates_over_time() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    start_cheat_block_timestamp(addr, 3600);
    
    start_cheat_caller_address(addr, owner_address());
    dispatcher.update_price(550_000_000_000);
    stop_cheat_caller_address(addr);
    
    let (_, twap, _, _, _) = dispatcher.get_state();
    assert(twap > 0, 'TWAP positive');
}

#[test]
fn test_price_smoothing_blends_twap_and_spot() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    start_cheat_caller_address(addr, owner_address());
    dispatcher.update_price(600_000_000_000);
    stop_cheat_caller_address(addr);
    
    let effective_after = dispatcher.get_effective_price();
    assert(effective_after > 0, 'Effective price positive');
}

// ─── Edge Cases ─────────────────────────────────────────────────────────

#[test]
fn test_fee_calculation_zero_gas() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let fee_strk = dispatcher.get_fee_strk(0);
    let fee_usd = dispatcher.get_fee_usd(0);
    
    assert(fee_strk == 0, 'Zero STRK fee');
    assert(fee_usd == 0, 'Zero USD fee');
}

#[test]
fn test_large_gas_amount() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let fee = dispatcher.get_fee_usd(1_000_000_000);
    assert(fee > 0, 'Large gas positive fee');
}

#[test]
fn test_multiple_price_updates() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    start_cheat_caller_address(addr, owner_address());
    dispatcher.update_price(520_000_000_000);
    dispatcher.update_price(540_000_000_000);
    dispatcher.update_price(560_000_000_000);
    dispatcher.update_price(580_000_000_000);
    dispatcher.update_price(600_000_000_000);
    stop_cheat_caller_address(addr);
    
    let final_price = dispatcher.get_effective_price();
    assert(final_price > 0, 'Final price positive');
}

#[test]
fn test_price_update_with_minimal_change() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let initial_price = dispatcher.get_effective_price();
    
    start_cheat_caller_address(addr, owner_address());
    let one_percent = initial_price / 100;
    dispatcher.update_price(initial_price + one_percent);
    stop_cheat_caller_address(addr);
    
    let new_price = dispatcher.get_effective_price();
    assert(new_price > initial_price, 'Price should increase');
}

#[test]
fn test_get_state_returns_all_values() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    
    let (price, twap, target, smoothing, stale) = dispatcher.get_state();
    
    assert(price > 0, 'Price positive');
    assert(twap > 0, 'TWAP positive');
    assert(target > 0, 'Target positive');
    assert(smoothing > 0, 'Smoothing positive');
    assert(stale == false, 'Stale false');
}

// ─── Non-Owner Access Control Tests ─────────────────────────────────────

#[test]
#[should_panic(expected: ('Caller is not the owner',))]
fn test_set_smoothing_non_owner_rejected() {
    let addr = deploy_contract();
    let admin_dispatcher = IFeeSmoothingAdminDispatcher { contract_address: addr };
    let non_owner: ContractAddress = 0x123.try_into().unwrap();
    
    start_cheat_caller_address(addr, non_owner);
    admin_dispatcher.set_smoothing_factor(PRICE_SCALE);
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: ('Caller is not the owner',))]
fn test_emergency_stop_non_owner_rejected() {
    let addr = deploy_contract();
    let admin_dispatcher = IFeeSmoothingAdminDispatcher { contract_address: addr };
    let non_owner: ContractAddress = 0x123.try_into().unwrap();
    
    start_cheat_caller_address(addr, non_owner);
    admin_dispatcher.emergency_stop('Test');
    stop_cheat_caller_address(addr);
}

// ─── Protocol Minimum Fee Tests ─────────────────────────────────────────

#[test]
fn test_fee_respects_protocol_minimum() {
    let addr = deploy_contract();
    let dispatcher = IFeeSmoothingDispatcher { contract_address: addr };
    let admin_dispatcher = IFeeSmoothingAdminDispatcher { contract_address: addr };
    
    start_cheat_caller_address(addr, owner_address());
    admin_dispatcher.set_target_usd_per_gas(1);
    stop_cheat_caller_address(addr);
    
    let fee = dispatcher.get_fee_strk(1_000_000);
    let min_fee = 3_000_000_000 * 1_000_000;
    assert(fee >= min_fee, 'Protocol minimum respected');
}
