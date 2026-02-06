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

fn allowed_target() -> ContractAddress {
    0xBBB.try_into().unwrap()
}

fn other_target() -> ContractAddress {
    0xCCC.try_into().unwrap()
}

fn deploy_agent_account() -> (IAgentAccountDispatcher, ContractAddress) {
    let contract = declare("AgentAccount").unwrap().contract_class();
    let public_key: felt252 = 0x1234;
    let (contract_address, _) = contract.deploy(@array![public_key]).unwrap();
    let dispatcher = IAgentAccountDispatcher { contract_address };
    (dispatcher, contract_address)
}

/// Helper: create a permissive policy (any contract, large limit, wide time window).
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

/// Helper: create a restrictive policy pinned to a single allowed contract.
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
// FINDING 1: Policy enforcement tests
// ===========================================================================

#[test]
fn test_validate_call_any_contract_allowed() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, permissive_policy());

    // Policy has allowed_contract = 0 → any target should pass
    assert!(agent.validate_session_key_call(key, allowed_target()));
    assert!(agent.validate_session_key_call(key, other_target()));
}

#[test]
fn test_validate_call_restricted_contract_allowed() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, restricted_policy());

    // Policy pins allowed_contract → only that target passes
    assert!(agent.validate_session_key_call(key, allowed_target()));
}

#[test]
fn test_validate_call_restricted_contract_rejected() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, restricted_policy());

    // Wrong target → must return false
    assert!(!agent.validate_session_key_call(key, other_target()));
}

#[test]
fn test_validate_call_expired_key() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, permissive_policy());

    // Advance time past valid_until
    start_cheat_block_timestamp(addr, 1_000_000);
    assert!(!agent.validate_session_key_call(key, allowed_target()));
    stop_cheat_block_timestamp(addr);
}

#[test]
fn test_validate_call_not_yet_valid() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    let policy = SessionPolicy {
        valid_after: 100,
        valid_until: 999_999,
        spending_limit: 1_000_000,
        spending_token: token_addr(),
        allowed_contract: zero_addr(),
        max_calls_per_tx: 100,
    };

    register_key(agent, addr, key, policy);

    // Default timestamp is 0, which is < valid_after(100)
    assert!(!agent.validate_session_key_call(key, allowed_target()));
}

#[test]
fn test_validate_call_revoked_key() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, permissive_policy());
    assert!(agent.validate_session_key_call(key, allowed_target()));

    revoke_key(agent, addr, key);
    assert!(!agent.validate_session_key_call(key, allowed_target()));
}

#[test]
fn test_spending_limit_within_budget() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, restricted_policy()); // limit = 100

    start_cheat_block_timestamp(addr, 1000);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 50);
    agent.use_session_key_allowance(key, token_addr(), 50); // exactly at limit
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_spending_limit_exceeded() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, restricted_policy()); // limit = 100

    // Use a non-zero timestamp so the period-start tracking works correctly
    start_cheat_block_timestamp(addr, 1000);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 80);
    agent.use_session_key_allowance(key, token_addr(), 30); // 80 + 30 > 100 → panic
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
fn test_spending_limit_resets_after_period() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x1;

    register_key(agent, addr, key, restricted_policy()); // limit = 100

    // Spend 80 at t=0
    start_cheat_caller_address(addr, addr);
    start_cheat_block_timestamp(addr, 1);
    agent.use_session_key_allowance(key, token_addr(), 80);
    stop_cheat_block_timestamp(addr);

    // Advance past 24h period (86400s), spending should reset
    start_cheat_block_timestamp(addr, 86402);
    agent.use_session_key_allowance(key, token_addr(), 80); // OK — new period
    stop_cheat_block_timestamp(addr);
    stop_cheat_caller_address(addr);
}

// ===========================================================================
// FINDING 2: emergency_revoke_all bounded gas tests
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
    assert_eq!(agent.get_active_session_key_count(), 3);

    start_cheat_caller_address(addr, addr);
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);

    // Counter must be 0 — subsequent emergency_revoke_all costs O(0)
    assert_eq!(agent.get_active_session_key_count(), 0);
}

#[test]
fn test_emergency_revoke_all_actually_revokes() {
    let (agent, addr) = deploy_agent_account();

    register_key(agent, addr, 0x1, permissive_policy());
    register_key(agent, addr, 0x2, permissive_policy());
    register_key(agent, addr, 0x3, permissive_policy());

    // All keys valid before revoke
    assert!(agent.is_session_key_valid(0x1));
    assert!(agent.is_session_key_valid(0x2));
    assert!(agent.is_session_key_valid(0x3));

    start_cheat_caller_address(addr, addr);
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);

    // All keys must be invalid after emergency revoke
    assert!(!agent.is_session_key_valid(0x1));
    assert!(!agent.is_session_key_valid(0x2));
    assert!(!agent.is_session_key_valid(0x3));
}

#[test]
fn test_emergency_bounded_after_churn() {
    let (agent, addr) = deploy_agent_account();

    // Register 5 keys
    register_key(agent, addr, 0x1, permissive_policy());
    register_key(agent, addr, 0x2, permissive_policy());
    register_key(agent, addr, 0x3, permissive_policy());
    register_key(agent, addr, 0x4, permissive_policy());
    register_key(agent, addr, 0x5, permissive_policy());
    assert_eq!(agent.get_active_session_key_count(), 5);

    // Revoke 3 individually
    revoke_key(agent, addr, 0x1);
    revoke_key(agent, addr, 0x3);
    revoke_key(agent, addr, 0x5);
    assert_eq!(agent.get_active_session_key_count(), 2);

    // emergency_revoke_all only iterates 2 active keys (not 5 historical)
    start_cheat_caller_address(addr, addr);
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);

    assert_eq!(agent.get_active_session_key_count(), 0);

    // Verify the remaining keys are also revoked
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

    assert_eq!(agent.get_active_session_key_count(), 0);

    // New registrations should work after emergency revoke
    register_key(agent, addr, 0xA, permissive_policy());
    assert_eq!(agent.get_active_session_key_count(), 1);
    assert!(agent.is_session_key_valid(0xA));
}

#[test]
fn test_emergency_revoke_no_op_when_empty() {
    let (agent, addr) = deploy_agent_account();

    // Emergency revoke on empty state should succeed (O(0))
    start_cheat_caller_address(addr, addr);
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);

    assert_eq!(agent.get_active_session_key_count(), 0);
}

// ===========================================================================
// General session key lifecycle tests
// ===========================================================================

#[test]
fn test_register_and_get_policy() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x42;
    let policy = restricted_policy();

    register_key(agent, addr, key, policy);

    let stored = agent.get_session_key_policy(key);
    assert_eq!(stored.valid_after, policy.valid_after);
    assert_eq!(stored.valid_until, policy.valid_until);
    assert_eq!(stored.spending_limit, policy.spending_limit);
    assert_eq!(stored.max_calls_per_tx, policy.max_calls_per_tx);
}

#[test]
fn test_is_session_key_valid_lifecycle() {
    let (agent, addr) = deploy_agent_account();
    let key: felt252 = 0x42;

    // Not registered → invalid
    assert!(!agent.is_session_key_valid(key));

    // Registered → valid
    register_key(agent, addr, key, permissive_policy());
    assert!(agent.is_session_key_valid(key));

    // Revoked → invalid
    revoke_key(agent, addr, key);
    assert!(!agent.is_session_key_valid(key));
}

#[test]
#[should_panic(expected: 'Key not in active list')]
fn test_revoke_unregistered_key_panics() {
    let (agent, addr) = deploy_agent_account();

    start_cheat_caller_address(addr, addr);
    agent.revoke_session_key(0xDEAD);
    stop_cheat_caller_address(addr);
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
