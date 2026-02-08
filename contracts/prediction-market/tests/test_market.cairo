use prediction_market::interfaces::{
    IPredictionMarketDispatcher, IPredictionMarketDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp_global,
    stop_cheat_block_timestamp_global,
};
use starknet::ContractAddress;

// ============ Test Addresses ============

fn oracle() -> ContractAddress {
    0xAA.try_into().unwrap()
}

fn creator() -> ContractAddress {
    0xBB.try_into().unwrap()
}

fn user_alice() -> ContractAddress {
    0xA11CE.try_into().unwrap()
}

fn user_bob() -> ContractAddress {
    0xB0B.try_into().unwrap()
}

fn user_charlie() -> ContractAddress {
    0xCC.try_into().unwrap()
}

// ============ Helpers ============

fn deploy_token() -> ContractAddress {
    let contract = declare("MockERC20").unwrap().contract_class();
    let (address, _) = contract.deploy(@array![]).unwrap();
    address
}

// Helper to mint tokens and approve the market
fn setup_user_balance(
    token_address: ContractAddress,
    user: ContractAddress,
    market_address: ContractAddress,
    amount: u256,
) {
    let token = prediction_market::interfaces::IERC20Dispatcher {
        contract_address: token_address,
    };

    // Mint tokens to user
    start_cheat_caller_address(token_address, user);
    // Call mint directly via low-level since it's not in the IERC20 interface
    stop_cheat_caller_address(token_address);

    // Use the mock's mint function
    let mock = starknet::syscalls::call_contract_syscall(
        token_address,
        selector!("mint"),
        array![user.into(), amount.low.into(), amount.high.into()].span(),
    )
        .unwrap();

    // Approve market to spend
    start_cheat_caller_address(token_address, user);
    token.approve(market_address, amount);
    stop_cheat_caller_address(token_address);
}

fn deploy_market(
    token_address: ContractAddress, resolution_time: u64, fee_bps: u16,
) -> (IPredictionMarketDispatcher, ContractAddress) {
    let contract = declare("PredictionMarket").unwrap().contract_class();
    let question_hash: felt252 = 0x1234;

    let mut calldata: Array<felt252> = array![];
    calldata.append(question_hash); // question_hash
    calldata.append(resolution_time.into()); // resolution_time
    calldata.append(oracle().into()); // oracle
    calldata.append(creator().into()); // creator
    calldata.append(token_address.into()); // collateral_token
    calldata.append(fee_bps.into()); // fee_bps

    let (address, _) = contract.deploy(@calldata).unwrap();
    (IPredictionMarketDispatcher { contract_address: address }, address)
}

fn deploy_full_setup() -> (IPredictionMarketDispatcher, ContractAddress, ContractAddress) {
    // Set timestamp before deploying (so resolution_time is in the future)
    start_cheat_block_timestamp_global(1000);

    let token_address = deploy_token();
    let resolution_time: u64 = 2000; // in the future
    let fee_bps: u16 = 200; // 2%

    let (market, market_address) = deploy_market(token_address, resolution_time, fee_bps);

    (market, market_address, token_address)
}

// ============ Market Creation Tests ============

#[test]
fn test_market_creation() {
    let (market, _, _) = deploy_full_setup();

    assert_eq!(market.get_status(), 0, "should be OPEN");
    assert_eq!(market.get_total_pool(), 0, "initial pool should be 0");

    let (question_hash, resolution_time, oracle_addr, _token, fee_bps) = market.get_market_info();
    assert_eq!(question_hash, 0x1234, "question hash");
    assert_eq!(resolution_time, 2000, "resolution time");
    assert_eq!(oracle_addr, oracle(), "oracle");
    assert_eq!(fee_bps, 200, "fee bps");
}

#[test]
fn test_market_initial_probs() {
    let (market, _, _) = deploy_full_setup();

    // With no bets, implied probs should be 50/50
    let probs = market.get_implied_probs();
    let (_, prob_0) = *probs.at(0);
    let (_, prob_1) = *probs.at(1);
    let half_scale: u256 = 500_000_000_000_000_000; // 0.5e18
    assert_eq!(prob_0, half_scale, "prob_0 should be 50%");
    assert_eq!(prob_1, half_scale, "prob_1 should be 50%");
}

// ============ Betting Tests ============

#[test]
fn test_single_bet() {
    let (market, market_address, token_address) = deploy_full_setup();

    let bet_amount: u256 = 1000;
    setup_user_balance(token_address, user_alice(), market_address, bet_amount);

    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, bet_amount); // bet YES
    stop_cheat_caller_address(market_address);

    assert_eq!(market.get_total_pool(), bet_amount, "total pool");
    assert_eq!(market.get_bet(user_alice(), 1), bet_amount, "alice bet on YES");
    assert_eq!(market.get_bet(user_alice(), 0), 0, "alice no bet on NO");
}

#[test]
fn test_multiple_bets_implied_probs() {
    let (market, market_address, token_address) = deploy_full_setup();

    // Alice bets 3000 on YES (outcome 1)
    setup_user_balance(token_address, user_alice(), market_address, 3000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 3000);
    stop_cheat_caller_address(market_address);

    // Bob bets 1000 on NO (outcome 0)
    setup_user_balance(token_address, user_bob(), market_address, 1000);
    start_cheat_caller_address(market_address, user_bob());
    market.bet(0, 1000);
    stop_cheat_caller_address(market_address);

    assert_eq!(market.get_total_pool(), 4000, "total pool");

    // Implied probs: YES = 3000/4000 = 75%, NO = 1000/4000 = 25%
    let probs = market.get_implied_probs();
    let (_, prob_0) = *probs.at(0); // NO
    let (_, prob_1) = *probs.at(1); // YES

    let expected_no: u256 = 250_000_000_000_000_000; // 0.25e18
    let expected_yes: u256 = 750_000_000_000_000_000; // 0.75e18
    assert_eq!(prob_0, expected_no, "NO prob should be 25%");
    assert_eq!(prob_1, expected_yes, "YES prob should be 75%");
}

#[test]
fn test_multiple_bets_same_user() {
    let (market, market_address, token_address) = deploy_full_setup();

    // Alice bets twice on YES
    setup_user_balance(token_address, user_alice(), market_address, 2000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 500);
    market.bet(1, 500);
    stop_cheat_caller_address(market_address);

    assert_eq!(market.get_bet(user_alice(), 1), 1000, "cumulative bet");
}

// ============ Bet Validation Tests ============

#[test]
#[should_panic(expected: 'invalid outcome')]
fn test_bet_invalid_outcome() {
    let (market, market_address, token_address) = deploy_full_setup();
    setup_user_balance(token_address, user_alice(), market_address, 1000);

    start_cheat_caller_address(market_address, user_alice());
    market.bet(2, 1000); // invalid: only 0 or 1
}

#[test]
#[should_panic(expected: 'amount must be positive')]
fn test_bet_zero_amount() {
    let (market, market_address, _) = deploy_full_setup();

    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 0);
}

#[test]
#[should_panic(expected: 'betting period ended')]
fn test_bet_after_resolution_time() {
    let (market, market_address, token_address) = deploy_full_setup();
    setup_user_balance(token_address, user_alice(), market_address, 1000);

    // Advance time past resolution
    start_cheat_block_timestamp_global(3000);

    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 1000);
}

// ============ Resolution Tests ============

#[test]
fn test_resolve_market() {
    let (market, market_address, _) = deploy_full_setup();

    // Advance time to resolution
    start_cheat_block_timestamp_global(2000);

    start_cheat_caller_address(market_address, oracle());
    market.resolve(1); // YES wins
    stop_cheat_caller_address(market_address);

    assert_eq!(market.get_status(), 2, "should be RESOLVED");
    assert_eq!(market.get_winning_outcome(), 1, "YES should win");
}

#[test]
#[should_panic(expected: 'only oracle can resolve')]
fn test_resolve_non_oracle() {
    let (market, market_address, _) = deploy_full_setup();

    start_cheat_block_timestamp_global(2000);

    start_cheat_caller_address(market_address, user_alice());
    market.resolve(1);
}

#[test]
#[should_panic(expected: 'resolution time not reached')]
fn test_resolve_too_early() {
    let (market, market_address, _) = deploy_full_setup();

    // Don't advance time
    start_cheat_caller_address(market_address, oracle());
    market.resolve(1);
}

#[test]
#[should_panic(expected: 'invalid outcome')]
fn test_resolve_invalid_outcome() {
    let (market, market_address, _) = deploy_full_setup();

    start_cheat_block_timestamp_global(2000);

    start_cheat_caller_address(market_address, oracle());
    market.resolve(5);
}

// ============ Claim Tests ============

#[test]
fn test_claim_winner() {
    let (market, market_address, token_address) = deploy_full_setup();

    // Alice bets 3000 on YES
    setup_user_balance(token_address, user_alice(), market_address, 3000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 3000);
    stop_cheat_caller_address(market_address);

    // Bob bets 1000 on NO
    setup_user_balance(token_address, user_bob(), market_address, 1000);
    start_cheat_caller_address(market_address, user_bob());
    market.bet(0, 1000);
    stop_cheat_caller_address(market_address);

    // Resolve: YES wins
    start_cheat_block_timestamp_global(2000);
    start_cheat_caller_address(market_address, oracle());
    market.resolve(1);
    stop_cheat_caller_address(market_address);

    // Alice claims — she is the only YES bettor
    // Payout = 3000 * 4000 * (10000 - 200) / (3000 * 10000) = 3920
    start_cheat_caller_address(market_address, user_alice());
    let payout = market.claim();
    stop_cheat_caller_address(market_address);

    assert_eq!(payout, 3920, "alice should get 3920");
}

#[test]
fn test_claim_split_winners() {
    let (market, market_address, token_address) = deploy_full_setup();

    // Alice and Charlie both bet on YES
    setup_user_balance(token_address, user_alice(), market_address, 2000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 2000);
    stop_cheat_caller_address(market_address);

    setup_user_balance(token_address, user_charlie(), market_address, 1000);
    start_cheat_caller_address(market_address, user_charlie());
    market.bet(1, 1000);
    stop_cheat_caller_address(market_address);

    // Bob bets on NO
    setup_user_balance(token_address, user_bob(), market_address, 1000);
    start_cheat_caller_address(market_address, user_bob());
    market.bet(0, 1000);
    stop_cheat_caller_address(market_address);

    // Total: YES=3000, NO=1000, Total=4000
    // Resolve: YES wins
    start_cheat_block_timestamp_global(2000);
    start_cheat_caller_address(market_address, oracle());
    market.resolve(1);
    stop_cheat_caller_address(market_address);

    // Alice: 2000 * 4000 * 9800 / (3000 * 10000) = 2613.33 → 2613 (truncated)
    start_cheat_caller_address(market_address, user_alice());
    let alice_payout = market.claim();
    stop_cheat_caller_address(market_address);

    // Charlie: 1000 * 4000 * 9800 / (3000 * 10000) = 1306.66 → 1306 (truncated)
    start_cheat_caller_address(market_address, user_charlie());
    let charlie_payout = market.claim();
    stop_cheat_caller_address(market_address);

    assert_eq!(alice_payout, 2613, "alice payout");
    assert_eq!(charlie_payout, 1306, "charlie payout");
}

#[test]
#[should_panic(expected: 'already claimed')]
fn test_double_claim() {
    let (market, market_address, token_address) = deploy_full_setup();

    setup_user_balance(token_address, user_alice(), market_address, 1000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 1000);
    stop_cheat_caller_address(market_address);

    start_cheat_block_timestamp_global(2000);
    start_cheat_caller_address(market_address, oracle());
    market.resolve(1);
    stop_cheat_caller_address(market_address);

    start_cheat_caller_address(market_address, user_alice());
    market.claim(); // first claim
    market.claim(); // second claim should fail
}

#[test]
#[should_panic(expected: 'no winning bet')]
fn test_claim_loser() {
    let (market, market_address, token_address) = deploy_full_setup();

    setup_user_balance(token_address, user_alice(), market_address, 1000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(0, 1000); // bet NO
    stop_cheat_caller_address(market_address);

    setup_user_balance(token_address, user_bob(), market_address, 1000);
    start_cheat_caller_address(market_address, user_bob());
    market.bet(1, 1000);
    stop_cheat_caller_address(market_address);

    start_cheat_block_timestamp_global(2000);
    start_cheat_caller_address(market_address, oracle());
    market.resolve(1); // YES wins
    stop_cheat_caller_address(market_address);

    // Alice bet NO but YES won
    start_cheat_caller_address(market_address, user_alice());
    market.claim();
}

#[test]
#[should_panic(expected: 'market not resolved')]
fn test_claim_before_resolution() {
    let (market, market_address, token_address) = deploy_full_setup();

    setup_user_balance(token_address, user_alice(), market_address, 1000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 1000);
    stop_cheat_caller_address(market_address);

    start_cheat_caller_address(market_address, user_alice());
    market.claim();
}

// ============ Full Lifecycle Test ============

#[test]
fn test_full_lifecycle() {
    let (market, market_address, token_address) = deploy_full_setup();

    // 1. Place bets
    setup_user_balance(token_address, user_alice(), market_address, 5000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 5000); // YES
    stop_cheat_caller_address(market_address);

    setup_user_balance(token_address, user_bob(), market_address, 5000);
    start_cheat_caller_address(market_address, user_bob());
    market.bet(0, 5000); // NO
    stop_cheat_caller_address(market_address);

    // 2. Verify state
    assert_eq!(market.get_total_pool(), 10000, "total pool");
    assert_eq!(market.get_status(), 0, "still OPEN");

    // 3. Resolve
    start_cheat_block_timestamp_global(2000);
    start_cheat_caller_address(market_address, oracle());
    market.resolve(0); // NO wins
    stop_cheat_caller_address(market_address);

    assert_eq!(market.get_status(), 2, "RESOLVED");

    // 4. Bob claims (he bet NO)
    // Payout = 5000 * 10000 * 9800 / (5000 * 10000) = 9800
    start_cheat_caller_address(market_address, user_bob());
    let payout = market.claim();
    stop_cheat_caller_address(market_address);

    assert_eq!(payout, 9800, "bob payout with 2% fee");
}

// ============ Edge Cases ============

#[test]
fn test_no_fee_market() {
    start_cheat_block_timestamp_global(1000);
    let token_address = deploy_token();
    let (market, market_address) = deploy_market(token_address, 2000, 0); // 0% fee

    setup_user_balance(token_address, user_alice(), market_address, 3000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 3000);
    stop_cheat_caller_address(market_address);

    setup_user_balance(token_address, user_bob(), market_address, 1000);
    start_cheat_caller_address(market_address, user_bob());
    market.bet(0, 1000);
    stop_cheat_caller_address(market_address);

    start_cheat_block_timestamp_global(2000);
    start_cheat_caller_address(market_address, oracle());
    market.resolve(1);
    stop_cheat_caller_address(market_address);

    // No fee: payout = 3000 * 4000 / 3000 = 4000 (entire pool)
    start_cheat_caller_address(market_address, user_alice());
    let payout = market.claim();
    stop_cheat_caller_address(market_address);

    assert_eq!(payout, 4000, "no-fee payout should be full pool");
}

#[test]
#[should_panic(expected: 'market not open')]
fn test_bet_after_resolution() {
    let (market, market_address, token_address) = deploy_full_setup();

    // Resolve first
    start_cheat_block_timestamp_global(2000);
    start_cheat_caller_address(market_address, oracle());
    market.resolve(1);
    stop_cheat_caller_address(market_address);

    // Try to bet after resolution
    setup_user_balance(token_address, user_alice(), market_address, 1000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 1000);
}

// ============ Additional Hardening Tests ============

#[test]
#[should_panic(expected: 'market not open')]
fn test_resolve_twice() {
    let (market, market_address, _) = deploy_full_setup();

    start_cheat_block_timestamp_global(2000);

    start_cheat_caller_address(market_address, oracle());
    market.resolve(1);
    market.resolve(0); // should fail
}

#[test]
fn test_pools_after_bets() {
    let (market, market_address, token_address) = deploy_full_setup();

    // Multiple bets on both sides
    setup_user_balance(token_address, user_alice(), market_address, 5000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 3000); // YES
    market.bet(0, 2000); // Also bets NO
    stop_cheat_caller_address(market_address);

    let pools = market.get_pools();
    let (_, no_pool) = *pools.at(0);
    let (_, yes_pool) = *pools.at(1);

    assert_eq!(no_pool, 2000, "NO pool");
    assert_eq!(yes_pool, 3000, "YES pool");
    assert_eq!(market.get_total_pool(), 5000, "total pool");
}

#[test]
fn test_both_sides_bet_user() {
    // A user betting on both sides should be able to claim the winning side
    let (market, market_address, token_address) = deploy_full_setup();

    setup_user_balance(token_address, user_alice(), market_address, 3000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 2000); // YES
    market.bet(0, 1000); // NO
    stop_cheat_caller_address(market_address);

    // Resolve YES wins
    start_cheat_block_timestamp_global(2000);
    start_cheat_caller_address(market_address, oracle());
    market.resolve(1);
    stop_cheat_caller_address(market_address);

    // Alice can claim her YES bet
    // Payout = 2000 * 3000 * 9800 / (2000 * 10000) = 2940
    start_cheat_caller_address(market_address, user_alice());
    let payout = market.claim();
    stop_cheat_caller_address(market_address);

    assert_eq!(payout, 2940, "payout from YES side");
}

#[test]
fn test_single_sided_market() {
    // Only bets on one side — winner gets everything minus fee
    let (market, market_address, token_address) = deploy_full_setup();

    setup_user_balance(token_address, user_alice(), market_address, 1000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 1000);
    stop_cheat_caller_address(market_address);

    // No bets on NO side. Resolve YES wins.
    start_cheat_block_timestamp_global(2000);
    start_cheat_caller_address(market_address, oracle());
    market.resolve(1);
    stop_cheat_caller_address(market_address);

    // Payout = 1000 * 1000 * 9800 / (1000 * 10000) = 980
    start_cheat_caller_address(market_address, user_alice());
    let payout = market.claim();
    stop_cheat_caller_address(market_address);

    assert_eq!(payout, 980, "single side with fee");
}

#[test]
fn test_max_fee_market() {
    // 10% fee (1000 bps = max)
    start_cheat_block_timestamp_global(1000);
    let token_address = deploy_token();
    let (market, market_address) = deploy_market(token_address, 2000, 1000);

    setup_user_balance(token_address, user_alice(), market_address, 5000);
    start_cheat_caller_address(market_address, user_alice());
    market.bet(1, 5000);
    stop_cheat_caller_address(market_address);

    setup_user_balance(token_address, user_bob(), market_address, 5000);
    start_cheat_caller_address(market_address, user_bob());
    market.bet(0, 5000);
    stop_cheat_caller_address(market_address);

    start_cheat_block_timestamp_global(2000);
    start_cheat_caller_address(market_address, oracle());
    market.resolve(1);
    stop_cheat_caller_address(market_address);

    // Payout = 5000 * 10000 * 9000 / (5000 * 10000) = 9000
    start_cheat_caller_address(market_address, user_alice());
    let payout = market.claim();
    stop_cheat_caller_address(market_address);

    assert_eq!(payout, 9000, "10% fee payout");
}

#[test]
#[should_panic(expected: 'fee_bps too high')]
fn test_fee_too_high() {
    start_cheat_block_timestamp_global(1000);
    let token_address = deploy_token();
    deploy_market(token_address, 2000, 1001); // > 10%
}

#[test]
fn test_market_info_matches_constructor() {
    let (market, _, _) = deploy_full_setup();

    let (question_hash, resolution_time, oracle_addr, _token, fee_bps) = market.get_market_info();
    assert_eq!(question_hash, 0x1234, "question");
    assert_eq!(resolution_time, 2000, "time");
    assert_eq!(oracle_addr, oracle(), "oracle");
    assert_eq!(fee_bps, 200, "fee");
}
