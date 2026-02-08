use prediction_market::interfaces::{
    IAccuracyTrackerDispatcher, IAccuracyTrackerDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

// 1e18
const SCALE: u256 = 1_000_000_000_000_000_000;

// ============ Test Addresses ============

fn owner() -> ContractAddress {
    0x999.try_into().unwrap()
}

fn agent_alpha() -> ContractAddress {
    0xA1.try_into().unwrap()
}

fn agent_beta() -> ContractAddress {
    0xA2.try_into().unwrap()
}

fn agent_gamma() -> ContractAddress {
    0xA3.try_into().unwrap()
}

// ============ Deploy Helper ============

fn deploy_tracker() -> (IAccuracyTrackerDispatcher, ContractAddress) {
    let contract = declare("AccuracyTracker").unwrap().contract_class();
    let (address, _) = contract.deploy(@array![owner().into()]).unwrap();
    (IAccuracyTrackerDispatcher { contract_address: address }, address)
}

// ============ Record Prediction Tests ============

#[test]
fn test_record_prediction() {
    let (tracker, tracker_addr) = deploy_tracker();
    let market_id: u256 = 1;
    let predicted_prob: u256 = 700_000_000_000_000_000; // 0.7

    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(market_id, predicted_prob);
    stop_cheat_caller_address(tracker_addr);

    let stored = tracker.get_prediction(agent_alpha(), market_id);
    assert_eq!(stored, predicted_prob, "prediction should be stored");

    let count = tracker.get_market_predictor_count(market_id);
    assert_eq!(count, 1, "one predictor");

    let predictor = tracker.get_market_predictor(market_id, 0);
    assert_eq!(predictor, agent_alpha(), "first predictor should be alpha");
}

#[test]
fn test_multiple_predictions() {
    let (tracker, tracker_addr) = deploy_tracker();
    let market_id: u256 = 1;

    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(market_id, 700_000_000_000_000_000); // 0.7
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, agent_beta());
    tracker.record_prediction(market_id, 300_000_000_000_000_000); // 0.3
    stop_cheat_caller_address(tracker_addr);

    let count = tracker.get_market_predictor_count(market_id);
    assert_eq!(count, 2, "two predictors");
}

#[test]
#[should_panic(expected: 'already predicted')]
fn test_duplicate_prediction() {
    let (tracker, tracker_addr) = deploy_tracker();
    let market_id: u256 = 1;

    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(market_id, 700_000_000_000_000_000);
    tracker.record_prediction(market_id, 800_000_000_000_000_000); // should fail
}

#[test]
#[should_panic(expected: 'prob must be <= 1e18')]
fn test_prediction_too_high() {
    let (tracker, tracker_addr) = deploy_tracker();

    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(1, SCALE + 1); // > 1.0
}

#[test]
fn test_prediction_zero() {
    let (tracker, tracker_addr) = deploy_tracker();

    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(1, 0); // 0% probability is valid
    stop_cheat_caller_address(tracker_addr);

    assert_eq!(tracker.get_prediction(agent_alpha(), 1), 0, "zero prediction");
}

#[test]
fn test_prediction_max() {
    let (tracker, tracker_addr) = deploy_tracker();

    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(1, SCALE); // 100% probability is valid
    stop_cheat_caller_address(tracker_addr);

    assert_eq!(tracker.get_prediction(agent_alpha(), 1), SCALE, "max prediction");
}

// ============ Brier Score Tests ============

#[test]
fn test_brier_score_perfect_prediction() {
    let (tracker, tracker_addr) = deploy_tracker();
    let market_id: u256 = 1;

    // Agent predicts 100% YES, outcome is YES
    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(market_id, SCALE); // 1.0
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, owner());
    tracker.finalize_market(market_id, 1); // YES
    stop_cheat_caller_address(tracker_addr);

    let (cumulative, count) = tracker.get_brier_score(agent_alpha());
    assert_eq!(cumulative, 0, "perfect prediction = brier 0");
    assert_eq!(count, 1, "one prediction");
}

#[test]
fn test_brier_score_worst_prediction() {
    let (tracker, tracker_addr) = deploy_tracker();
    let market_id: u256 = 1;

    // Agent predicts 0% YES, outcome is YES (worst possible)
    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(market_id, 0); // 0.0
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, owner());
    tracker.finalize_market(market_id, 1); // YES
    stop_cheat_caller_address(tracker_addr);

    let (cumulative, count) = tracker.get_brier_score(agent_alpha());
    // diff = 1e18, brier = (1e18)^2 / 1e18 = 1e18
    assert_eq!(cumulative, SCALE, "worst prediction = brier 1.0");
    assert_eq!(count, 1, "one prediction");
}

#[test]
fn test_brier_score_50_percent() {
    let (tracker, tracker_addr) = deploy_tracker();
    let market_id: u256 = 1;

    // Agent predicts 50%
    let half = SCALE / 2;
    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(market_id, half);
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, owner());
    tracker.finalize_market(market_id, 1); // YES
    stop_cheat_caller_address(tracker_addr);

    let (cumulative, _) = tracker.get_brier_score(agent_alpha());
    // diff = 0.5e18, brier = (0.5e18)^2 / 1e18 = 0.25e18
    let expected: u256 = 250_000_000_000_000_000;
    assert_eq!(cumulative, expected, "50% prediction = brier 0.25");
}

#[test]
fn test_brier_score_70_percent_yes_wins() {
    let (tracker, tracker_addr) = deploy_tracker();
    let market_id: u256 = 1;

    // Agent predicts 70% YES, outcome = YES
    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(market_id, 700_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, owner());
    tracker.finalize_market(market_id, 1);
    stop_cheat_caller_address(tracker_addr);

    let (cumulative, _) = tracker.get_brier_score(agent_alpha());
    // diff = 0.3e18, brier = (0.3e18)^2 / 1e18 = 0.09e18
    let expected: u256 = 90_000_000_000_000_000;
    assert_eq!(cumulative, expected, "70% on YES win = brier 0.09");
}

#[test]
fn test_brier_score_cumulative() {
    let (tracker, tracker_addr) = deploy_tracker();

    // Market 1: predict 80% YES, outcome YES → brier = 0.04
    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(1, 800_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, owner());
    tracker.finalize_market(1, 1);
    stop_cheat_caller_address(tracker_addr);

    // Market 2: predict 60% YES, outcome NO → brier = 0.36
    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(2, 600_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, owner());
    tracker.finalize_market(2, 0);
    stop_cheat_caller_address(tracker_addr);

    let (cumulative, count) = tracker.get_brier_score(agent_alpha());
    // 0.04e18 + 0.36e18 = 0.40e18
    let expected: u256 = 400_000_000_000_000_000;
    assert_eq!(cumulative, expected, "cumulative brier");
    assert_eq!(count, 2, "two predictions");
}

// ============ Finalization Tests ============

#[test]
#[should_panic(expected: 'already finalized')]
fn test_double_finalization() {
    let (tracker, tracker_addr) = deploy_tracker();

    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(1, 500_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, owner());
    tracker.finalize_market(1, 1);
    tracker.finalize_market(1, 1); // should fail
}

#[test]
#[should_panic(expected: 'market already finalized')]
fn test_predict_after_finalization() {
    let (tracker, tracker_addr) = deploy_tracker();

    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(1, 500_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, owner());
    tracker.finalize_market(1, 1);
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, agent_beta());
    tracker.record_prediction(1, 600_000_000_000_000_000); // should fail
}

#[test]
fn test_finalized_flag() {
    let (tracker, tracker_addr) = deploy_tracker();

    assert!(!tracker.is_finalized(1), "not finalized initially");

    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(1, 500_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, owner());
    tracker.finalize_market(1, 0);
    stop_cheat_caller_address(tracker_addr);

    assert!(tracker.is_finalized(1), "should be finalized");
}

// ============ Weighted Probability Tests ============

#[test]
fn test_weighted_probability_no_predictors() {
    let (tracker, _) = deploy_tracker();

    let weighted = tracker.get_weighted_probability(1);
    assert_eq!(weighted, SCALE / 2, "default 50% with no predictors");
}

#[test]
fn test_weighted_probability_single_new_agent() {
    let (tracker, tracker_addr) = deploy_tracker();

    // New agent with no history predicts 70%
    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(1, 700_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    let weighted = tracker.get_weighted_probability(1);
    assert_eq!(weighted, 700_000_000_000_000_000, "single agent = their prediction");
}

#[test]
fn test_weighted_probability_equal_agents() {
    let (tracker, tracker_addr) = deploy_tracker();

    // Two new agents (equal weight) predict differently
    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(1, 800_000_000_000_000_000); // 0.8
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, agent_beta());
    tracker.record_prediction(1, 400_000_000_000_000_000); // 0.4
    stop_cheat_caller_address(tracker_addr);

    let weighted = tracker.get_weighted_probability(1);
    // Equal weights → simple average = (0.8 + 0.4) / 2 = 0.6
    assert_eq!(weighted, 600_000_000_000_000_000, "equal weight average");
}

#[test]
fn test_weighted_probability_different_accuracy() {
    let (tracker, tracker_addr) = deploy_tracker();

    // Setup: Give alpha a good track record, beta a bad one

    // Market 0: alpha predicts 90% YES (outcome YES) → brier = 0.01
    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(0, 900_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    // Market 0: beta predicts 20% YES (outcome YES) → brier = 0.64
    start_cheat_caller_address(tracker_addr, agent_beta());
    tracker.record_prediction(0, 200_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, owner());
    tracker.finalize_market(0, 1); // YES
    stop_cheat_caller_address(tracker_addr);

    // Now new market 1: alpha predicts 70%, beta predicts 30%
    start_cheat_caller_address(tracker_addr, agent_alpha());
    tracker.record_prediction(1, 700_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    start_cheat_caller_address(tracker_addr, agent_beta());
    tracker.record_prediction(1, 300_000_000_000_000_000);
    stop_cheat_caller_address(tracker_addr);

    let weighted = tracker.get_weighted_probability(1);
    // Alpha (brier 0.01) should have much higher weight than beta (brier 0.64)
    // alpha weight = 1e36 / 0.01e18 = 100e18
    // beta weight = 1e36 / 0.64e18 = 1.5625e18
    // weighted = (100e18 * 0.7 + 1.5625e18 * 0.3) / (100e18 + 1.5625e18)
    // ≈ 70e18 + 0.46875e18) / 101.5625e18 ≈ 0.6938...

    // The weighted prob should be much closer to alpha's 0.7 than beta's 0.3
    assert!(weighted > 600_000_000_000_000_000, "weighted should be > 0.6");
    assert!(weighted < 750_000_000_000_000_000, "weighted should be < 0.75");
}
