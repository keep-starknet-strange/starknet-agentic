use agent_account::interfaces::{
    IAgentAccountDispatcher, IAgentAccountDispatcherTrait, SessionPolicy,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp, stop_cheat_block_timestamp,
};
use starknet::ContractAddress;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn zero_addr() -> ContractAddress {
    0.try_into().unwrap()
}

fn token_addr() -> ContractAddress {
    0xAAA.try_into().unwrap()
}

fn other_token_addr() -> ContractAddress {
    0xDDD.try_into().unwrap()
}

fn allowed_target() -> ContractAddress {
    0xBBB.try_into().unwrap()
}

fn other_target() -> ContractAddress {
    0xCCC.try_into().unwrap()
}

fn attacker() -> ContractAddress {
    0xEEE.try_into().unwrap()
}

fn deploy_agent_account() -> (IAgentAccountDispatcher, ContractAddress) {
    let contract = declare("AgentAccount").unwrap().contract_class();
    let public_key: felt252 = 0x1234;
    let (contract_address, _) = contract.deploy(@array![public_key]).unwrap();
    let dispatcher = IAgentAccountDispatcher { contract_address };
    (dispatcher, contract_address)
}

/// Permissive policy: any contract, large limit, wide time window.
fn permissive_policy() -> SessionPolicy {
    SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: 1_000_000,
        spending_token: token_addr(),
        allowed_contract: zero_addr(), // any contract
        max_calls_per_tx: 100,
    }
}

/// Restrictive policy: single allowed contract, small spending limit.
fn restricted_policy() -> SessionPolicy {
    SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: 100,
        spending_token: token_addr(),
        allowed_contract: allowed_target(),
        max_calls_per_tx: 5,
    }
}

/// Helper: register a session key (cheats caller to contract itself).
fn register_key(
    dispatcher: IAgentAccountDispatcher,
    addr: ContractAddress,
    key: felt252,
    policy: SessionPolicy,
) {
    start_cheat_caller_address(addr, addr);
    dispatcher.register_session_key(key, policy);
    stop_cheat_caller_address(addr);
}

/// Helper: revoke a session key (cheats caller to contract itself).
fn revoke_key(
    dispatcher: IAgentAccountDispatcher,
    addr: ContractAddress,
    key: felt252,
) {
    start_cheat_caller_address(addr, addr);
    dispatcher.revoke_session_key(key);
    stop_cheat_caller_address(addr);
}

// ===========================================================================
// ACCESS CONTROL — every owner-only method must reject non-self callers
// ===========================================================================

#[test]
#[should_panic(expected: 'Account: unauthorized')]
fn test_register_non_self_panics() {
    let (agent, addr) = deploy_agent_account();
    start_cheat_caller_address(addr, attacker());
    agent.register_session_key(0x1, permissive_policy());
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: 'Account: unauthorized')]
fn test_revoke_non_self_panics() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, permissive_policy());

    start_cheat_caller_address(addr, attacker());
    agent.revoke_session_key(0x1);
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: 'Account: unauthorized')]
fn test_emergency_revoke_non_self_panics() {
    let (agent, addr) = deploy_agent_account();

    start_cheat_caller_address(addr, attacker());
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: 'Account: unauthorized')]
fn test_use_allowance_non_self_panics() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, restricted_policy());

    start_cheat_caller_address(addr, attacker());
    agent.use_session_key_allowance(0x1, token_addr(), 10);
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: 'Account: unauthorized')]
fn test_set_agent_id_non_self_panics() {
    let (agent, addr) = deploy_agent_account();

    start_cheat_caller_address(addr, attacker());
    agent.set_agent_id(zero_addr(), 1);
    stop_cheat_caller_address(addr);
}

// ===========================================================================
// FINDING: Double-registration guard
// ===========================================================================

#[test]
#[should_panic(expected: 'Key already registered')]
fn test_double_registration_panics() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, permissive_policy());

    // Second registration of same key must fail
    register_key(agent, addr, 0x1, permissive_policy());
}

#[test]
fn test_re_register_after_revoke_succeeds() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, permissive_policy());
    revoke_key(agent, addr, 0x1);

    // After explicit revoke, re-registration is allowed
    register_key(agent, addr, 0x1, restricted_policy());
    assert!(agent.is_session_key_valid(0x1));
    assert_eq!(agent.get_active_session_key_count(), 1);
}

// ===========================================================================
// FINDING: Double-revoke guard
// ===========================================================================

#[test]
#[should_panic(expected: 'Key not in active list')]
fn test_double_revoke_panics() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, permissive_policy());
    revoke_key(agent, addr, 0x1);

    // Second revoke of same key must fail
    revoke_key(agent, addr, 0x1);
}

#[test]
#[should_panic(expected: 'Key not in active list')]
fn test_revoke_unregistered_key_panics() {
    let (agent, addr) = deploy_agent_account();

    start_cheat_caller_address(addr, addr);
    agent.revoke_session_key(0xDEAD);
    stop_cheat_caller_address(addr);
}

// ===========================================================================
// FINDING: Expired key spending rejection
// ===========================================================================

#[test]
#[should_panic(expected: 'Session key not valid')]
fn test_spending_on_expired_key_panics() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, permissive_policy()); // valid_until = 999_999

    // Advance time past expiry
    start_cheat_block_timestamp(addr, 1_000_000);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 1); // must panic
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
#[should_panic(expected: 'Session key not valid')]
fn test_spending_on_revoked_key_panics() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, permissive_policy());
    revoke_key(agent, addr, key);

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 1); // must panic
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
#[should_panic(expected: 'Session key not valid')]
fn test_spending_before_valid_after_panics() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    let policy = SessionPolicy {
        valid_after: 500,
        valid_until: 999_999,
        spending_limit: 1_000_000,
        spending_token: token_addr(),
        allowed_contract: zero_addr(),
        max_calls_per_tx: 100,
    };
    register_key(agent, addr, key, policy);

    // Timestamp 100 < valid_after 500
    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 1);
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// FINDING: Wrong token rejection
// ===========================================================================

#[test]
#[should_panic(expected: 'Wrong spending token')]
fn test_spending_wrong_token_panics() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, restricted_policy()); // spending_token = token_addr()

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, other_token_addr(), 10); // wrong token
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
fn test_spending_correct_token_succeeds() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, restricted_policy()); // spending_token = token_addr()

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 10); // correct token
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// FINDING: Stale spending state cleared on re-registration
// ===========================================================================

#[test]
fn test_re_register_resets_spending_state() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, restricted_policy()); // limit = 100

    // Spend 80
    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 80);
    stop_cheat_caller_address(addr);

    // Revoke
    start_cheat_caller_address(addr, addr);
    agent.revoke_session_key(key);
    stop_cheat_caller_address(addr);

    // Re-register with same policy
    register_key(agent, addr, key, restricted_policy()); // limit = 100

    // Spending must be reset — 80 should work again (not carry over)
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 80); // must succeed
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_re_register_spending_fresh_limit_enforced() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, restricted_policy()); // limit = 100

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 80);
    stop_cheat_caller_address(addr);

    // Revoke & re-register
    revoke_key(agent, addr, key);
    register_key(agent, addr, key, restricted_policy());

    // Spend 80 again (fresh), then 30 more should exceed the new limit
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 80);
    agent.use_session_key_allowance(key, token_addr(), 30); // 80 + 30 > 100 → panic
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// POLICY ENFORCEMENT: validate_session_key_call
// ===========================================================================

#[test]
fn test_validate_call_any_contract_allowed() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, permissive_policy());

    assert!(agent.validate_session_key_call(0x1, allowed_target()));
    assert!(agent.validate_session_key_call(0x1, other_target()));
}

#[test]
fn test_validate_call_restricted_contract_allowed() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, restricted_policy());
    assert!(agent.validate_session_key_call(0x1, allowed_target()));
}

#[test]
fn test_validate_call_restricted_contract_rejected() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, restricted_policy());
    assert!(!agent.validate_session_key_call(0x1, other_target()));
}

#[test]
fn test_validate_call_expired_key() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, permissive_policy());

    start_cheat_block_timestamp(addr, 1_000_000);
    assert!(!agent.validate_session_key_call(0x1, allowed_target()));
    stop_cheat_block_timestamp(addr);
}

#[test]
fn test_validate_call_not_yet_valid() {
    let (agent, addr) = deploy_agent_account();
    let policy = SessionPolicy {
        valid_after: 100,
        valid_until: 999_999,
        spending_limit: 1_000_000,
        spending_token: token_addr(),
        allowed_contract: zero_addr(),
        max_calls_per_tx: 100,
    };
    register_key(agent, addr, 0x1, policy);
    assert!(!agent.validate_session_key_call(0x1, allowed_target()));
}

#[test]
fn test_validate_call_revoked_key() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, permissive_policy());
    assert!(agent.validate_session_key_call(0x1, allowed_target()));

    revoke_key(agent, addr, 0x1);
    assert!(!agent.validate_session_key_call(0x1, allowed_target()));
}

#[test]
fn test_validate_call_unregistered_key() {
    let (agent, _) = deploy_agent_account();
    assert!(!agent.validate_session_key_call(0xDEAD, allowed_target()));
}

// ===========================================================================
// SPENDING LIMIT ENFORCEMENT
// ===========================================================================

#[test]
fn test_spending_limit_within_budget() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, restricted_policy()); // limit = 100

    start_cheat_block_timestamp(addr, 1000);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(0x1, token_addr(), 50);
    agent.use_session_key_allowance(0x1, token_addr(), 50); // exactly at limit
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_spending_limit_exceeded() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, restricted_policy()); // limit = 100

    start_cheat_block_timestamp(addr, 1000);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(0x1, token_addr(), 80);
    agent.use_session_key_allowance(0x1, token_addr(), 30); // 80 + 30 > 100
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
fn test_spending_limit_resets_after_period() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, restricted_policy());

    start_cheat_caller_address(addr, addr);
    start_cheat_block_timestamp(addr, 100_000);
    agent.use_session_key_allowance(0x1, token_addr(), 80);
    stop_cheat_block_timestamp(addr);

    // Advance past 24h period (86400s)
    start_cheat_block_timestamp(addr, 186_401);
    agent.use_session_key_allowance(0x1, token_addr(), 80); // new period
    stop_cheat_block_timestamp(addr);
    stop_cheat_caller_address(addr);
}

#[test]
fn test_spending_zero_amount_succeeds() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, restricted_policy());

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(0x1, token_addr(), 0); // edge case: zero
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// REGRESSION: timestamp-0 period reset (defense-in-depth)
// ===========================================================================

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_spending_limit_enforced_at_timestamp_zero() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, restricted_policy()); // limit = 100

    // Explicitly at timestamp 0 — the old bug would reset spending on every
    // call, making the limit inert. The fix (period_start + 86400 <= now)
    // means no reset occurs, so spending accumulates correctly.
    start_cheat_block_timestamp(addr, 0);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 80);
    agent.use_session_key_allowance(key, token_addr(), 30); // 80 + 30 > 100 → must panic
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// EMERGENCY REVOKE — bounded gas
// ===========================================================================

#[test]
fn test_active_count_tracks_registrations() {
    let (agent, addr) = deploy_agent_account();
    assert_eq!(agent.get_active_session_key_count(), 0);

    register_key(agent, addr, 0x1, permissive_policy());
    assert_eq!(agent.get_active_session_key_count(), 1);

    register_key(agent, addr, 0x2, permissive_policy());
    assert_eq!(agent.get_active_session_key_count(), 2);

    register_key(agent, addr, 0x3, permissive_policy());
    assert_eq!(agent.get_active_session_key_count(), 3);
}

#[test]
fn test_revoke_decrements_active_count() {
    let (agent, addr) = deploy_agent_account();

    register_key(agent, addr, 0x1, permissive_policy());
    register_key(agent, addr, 0x2, permissive_policy());
    register_key(agent, addr, 0x3, permissive_policy());
    assert_eq!(agent.get_active_session_key_count(), 3);

    revoke_key(agent, addr, 0x2);
    assert_eq!(agent.get_active_session_key_count(), 2);

    revoke_key(agent, addr, 0x1);
    assert_eq!(agent.get_active_session_key_count(), 1);

    revoke_key(agent, addr, 0x3);
    assert_eq!(agent.get_active_session_key_count(), 0);
}

#[test]
fn test_emergency_revoke_all_resets_counter() {
    let (agent, addr) = deploy_agent_account();

    register_key(agent, addr, 0x1, permissive_policy());
    register_key(agent, addr, 0x2, permissive_policy());
    register_key(agent, addr, 0x3, permissive_policy());

    start_cheat_caller_address(addr, addr);
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);

    assert_eq!(agent.get_active_session_key_count(), 0);
}

#[test]
fn test_emergency_revoke_all_actually_revokes() {
    let (agent, addr) = deploy_agent_account();

    register_key(agent, addr, 0x1, permissive_policy());
    register_key(agent, addr, 0x2, permissive_policy());
    register_key(agent, addr, 0x3, permissive_policy());

    assert!(agent.is_session_key_valid(0x1));
    assert!(agent.is_session_key_valid(0x2));
    assert!(agent.is_session_key_valid(0x3));

    start_cheat_caller_address(addr, addr);
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);

    assert!(!agent.is_session_key_valid(0x1));
    assert!(!agent.is_session_key_valid(0x2));
    assert!(!agent.is_session_key_valid(0x3));
}

#[test]
fn test_emergency_bounded_after_churn() {
    let (agent, addr) = deploy_agent_account();

    register_key(agent, addr, 0x1, permissive_policy());
    register_key(agent, addr, 0x2, permissive_policy());
    register_key(agent, addr, 0x3, permissive_policy());
    register_key(agent, addr, 0x4, permissive_policy());
    register_key(agent, addr, 0x5, permissive_policy());
    assert_eq!(agent.get_active_session_key_count(), 5);

    revoke_key(agent, addr, 0x1);
    revoke_key(agent, addr, 0x3);
    revoke_key(agent, addr, 0x5);
    assert_eq!(agent.get_active_session_key_count(), 2);

    start_cheat_caller_address(addr, addr);
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);

    assert_eq!(agent.get_active_session_key_count(), 0);
    assert!(!agent.is_session_key_valid(0x2));
    assert!(!agent.is_session_key_valid(0x4));
}

#[test]
fn test_register_after_emergency_revoke() {
    let (agent, addr) = deploy_agent_account();

    register_key(agent, addr, 0x1, permissive_policy());
    register_key(agent, addr, 0x2, permissive_policy());

    start_cheat_caller_address(addr, addr);
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);

    // Re-registration after emergency revoke must work
    register_key(agent, addr, 0xA, permissive_policy());
    assert_eq!(agent.get_active_session_key_count(), 1);
    assert!(agent.is_session_key_valid(0xA));
}

#[test]
fn test_emergency_revoke_no_op_when_empty() {
    let (agent, addr) = deploy_agent_account();

    start_cheat_caller_address(addr, addr);
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);

    assert_eq!(agent.get_active_session_key_count(), 0);
}

// ===========================================================================
// SWAP-AND-REMOVE EDGE CASES
// ===========================================================================

#[test]
fn test_revoke_only_active_key() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, permissive_policy());
    assert_eq!(agent.get_active_session_key_count(), 1);

    revoke_key(agent, addr, 0x1);
    assert_eq!(agent.get_active_session_key_count(), 0);
    assert!(!agent.is_session_key_valid(0x1));
}

#[test]
fn test_revoke_first_key_swaps_correctly() {
    let (agent, addr) = deploy_agent_account();

    register_key(agent, addr, 0x1, permissive_policy());
    register_key(agent, addr, 0x2, permissive_policy());
    register_key(agent, addr, 0x3, permissive_policy());

    // Revoke first key — should swap with last (0x3)
    revoke_key(agent, addr, 0x1);

    assert_eq!(agent.get_active_session_key_count(), 2);
    assert!(!agent.is_session_key_valid(0x1));
    assert!(agent.is_session_key_valid(0x2));
    assert!(agent.is_session_key_valid(0x3));

    // Remaining keys should still be individually revokable
    revoke_key(agent, addr, 0x3);
    assert_eq!(agent.get_active_session_key_count(), 1);

    revoke_key(agent, addr, 0x2);
    assert_eq!(agent.get_active_session_key_count(), 0);
}

#[test]
fn test_revoke_last_key_no_swap() {
    let (agent, addr) = deploy_agent_account();

    register_key(agent, addr, 0x1, permissive_policy());
    register_key(agent, addr, 0x2, permissive_policy());

    // Revoke last key — no swap needed
    revoke_key(agent, addr, 0x2);
    assert_eq!(agent.get_active_session_key_count(), 1);
    assert!(agent.is_session_key_valid(0x1));
}

#[test]
fn test_revoke_middle_key_swap_integrity() {
    let (agent, addr) = deploy_agent_account();

    register_key(agent, addr, 0x1, permissive_policy());
    register_key(agent, addr, 0x2, permissive_policy());
    register_key(agent, addr, 0x3, permissive_policy());
    register_key(agent, addr, 0x4, permissive_policy());

    // Revoke middle key (0x2) — 0x4 should take its slot
    revoke_key(agent, addr, 0x2);
    assert_eq!(agent.get_active_session_key_count(), 3);

    // Now revoke 0x4 (which moved to 0x2's old slot)
    revoke_key(agent, addr, 0x4);
    assert_eq!(agent.get_active_session_key_count(), 2);

    // 0x1 and 0x3 should still be valid and revokable
    assert!(agent.is_session_key_valid(0x1));
    assert!(agent.is_session_key_valid(0x3));
    revoke_key(agent, addr, 0x1);
    revoke_key(agent, addr, 0x3);
    assert_eq!(agent.get_active_session_key_count(), 0);
}

// ===========================================================================
// GENERAL LIFECYCLE
// ===========================================================================

#[test]
fn test_register_and_get_policy() {
    let (agent, addr) = deploy_agent_account();
    let policy = restricted_policy();
    register_key(agent, addr, 0x42, policy);

    let stored = agent.get_session_key_policy(0x42);
    assert_eq!(stored.valid_after, policy.valid_after);
    assert_eq!(stored.valid_until, policy.valid_until);
    assert_eq!(stored.spending_limit, policy.spending_limit);
    assert_eq!(stored.max_calls_per_tx, policy.max_calls_per_tx);
}

#[test]
fn test_is_session_key_valid_lifecycle() {
    let (agent, addr) = deploy_agent_account();
    assert!(!agent.is_session_key_valid(0x42));

    register_key(agent, addr, 0x42, permissive_policy());
    assert!(agent.is_session_key_valid(0x42));

    revoke_key(agent, addr, 0x42);
    assert!(!agent.is_session_key_valid(0x42));
}

#[test]
fn test_agent_identity() {
    let (agent, addr) = deploy_agent_account();
    let registry: ContractAddress = 0x999.try_into().unwrap();
    let id: u256 = 42;

    start_cheat_caller_address(addr, addr);
    agent.set_agent_id(registry, id);
    stop_cheat_caller_address(addr);

    let (stored_registry, stored_id) = agent.get_agent_id();
    assert_eq!(stored_registry, registry);
    assert_eq!(stored_id, id);
}

// ===========================================================================
// INTEGRATION: full lifecycle scenario
// ===========================================================================

#[test]
fn test_full_session_key_lifecycle() {
    let (agent, addr) = deploy_agent_account();

    // 1. Register key with restrictive policy
    register_key(agent, addr, 0x1, restricted_policy());
    assert_eq!(agent.get_active_session_key_count(), 1);
    assert!(agent.is_session_key_valid(0x1));

    // 2. Validate call — correct target passes, wrong target fails
    assert!(agent.validate_session_key_call(0x1, allowed_target()));
    assert!(!agent.validate_session_key_call(0x1, other_target()));

    // 3. Use spending allowance
    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(0x1, token_addr(), 50);
    agent.use_session_key_allowance(0x1, token_addr(), 40);
    stop_cheat_caller_address(addr);

    // 4. Register a second key
    register_key(agent, addr, 0x2, permissive_policy());
    assert_eq!(agent.get_active_session_key_count(), 2);

    // 5. Revoke first key
    revoke_key(agent, addr, 0x1);
    assert_eq!(agent.get_active_session_key_count(), 1);
    assert!(!agent.is_session_key_valid(0x1));
    assert!(agent.is_session_key_valid(0x2));

    // 6. Emergency revoke remaining
    start_cheat_caller_address(addr, addr);
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);

    assert_eq!(agent.get_active_session_key_count(), 0);
    assert!(!agent.is_session_key_valid(0x2));

    // 7. Re-register after emergency — clean slate
    register_key(agent, addr, 0x1, restricted_policy());
    assert_eq!(agent.get_active_session_key_count(), 1);
    assert!(agent.is_session_key_valid(0x1));

    // 8. Spending fresh after re-registration
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(0x1, token_addr(), 100); // full limit
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}
