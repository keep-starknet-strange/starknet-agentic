use agent_account::interfaces::{
    Call, IAgentAccountDispatcher, IAgentAccountDispatcherTrait, SessionPolicy,
};
use openzeppelin::interfaces::accounts::{
    IPublicKeyDispatcher, IPublicKeyDispatcherTrait, ISRC6_ID,
};
use openzeppelin::interfaces::introspection::{ISRC5Dispatcher, ISRC5DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp, stop_cheat_block_timestamp,
    start_cheat_block_timestamp_global, stop_cheat_block_timestamp_global,
    start_cheat_transaction_version_global,
    start_cheat_signature_global, start_cheat_transaction_hash_global,
    stop_cheat_signature_global, stop_cheat_transaction_hash_global,
};
use snforge_std::signature::stark_curve::{StarkCurveKeyPairImpl, StarkCurveSignerImpl};
use starknet::{ClassHash, ContractAddress};

// ===========================================================================
// Selectors
// ===========================================================================

const SELECTOR_TRANSFER: felt252 =
    0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e;
const SELECTOR_TRANSFER_FROM: felt252 =
    0x41b033f4a31df8067c24d1e9b550a2ce75fd4a29e1147571aacb636ab7a21be;
const SELECTOR_APPROVE: felt252 =
    0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c;

// ===========================================================================
// Helpers (unit-style tests)
// ===========================================================================

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
    let (contract_address, _) = contract.deploy(@array![public_key, 0]).unwrap();
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
        max_calls_per_tx: 0,
        spending_period_secs: 0,
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
        max_calls_per_tx: 0,
        spending_period_secs: 0,
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
// Helpers (protocol-style tests)
// ===========================================================================

fn addr(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

fn owner() -> ContractAddress {
    addr(0x1)
}

fn other() -> ContractAddress {
    addr(0x2)
}

fn token() -> ContractAddress {
    addr(0x123)
}

fn zero() -> ContractAddress {
    addr(0)
}

fn start_protocol_call(account_address: ContractAddress) {
    start_cheat_caller_address(account_address, zero());
}

fn stop_protocol_call(account_address: ContractAddress) {
    stop_cheat_caller_address(account_address);
}

fn default_policy(spending_token: ContractAddress) -> SessionPolicy {
    SessionPolicy {
        valid_after: 0,
        valid_until: 4_102_444_800,
        spending_limit: u256 { low: 1000, high: 0 },
        spending_token,
        allowed_contract: zero(),
        max_calls_per_tx: 0,
        spending_period_secs: 0,
    }
}

fn deploy_account(public_key: felt252) -> (IAgentAccountDispatcher, ContractAddress) {
    deploy_account_with_factory(public_key, zero())
}

fn deploy_account_with_factory(
    public_key: felt252,
    factory: ContractAddress
) -> (IAgentAccountDispatcher, ContractAddress) {
    let contract = declare("AgentAccount").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![public_key, factory.into()]).unwrap();
    (IAgentAccountDispatcher { contract_address }, contract_address)
}

fn deploy_registry(owner_address: ContractAddress) -> ContractAddress {
    let contract = declare("MockRegistry").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![owner_address.into()]).unwrap();
    contract_address
}

// ===========================================================================
// ACCESS CONTROL -- every owner-only method must reject non-self callers
// ===========================================================================

#[test]
#[should_panic(expected: 'Only self')]
fn test_register_non_self_panics() {
    let (agent, addr) = deploy_agent_account();
    start_cheat_caller_address(addr, attacker());
    agent.register_session_key(0x1, permissive_policy());
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: 'Only self')]
fn test_revoke_non_self_panics() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, permissive_policy());

    start_cheat_caller_address(addr, attacker());
    agent.revoke_session_key(0x1);
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: 'Only self')]
fn test_emergency_revoke_non_self_panics() {
    let (agent, addr) = deploy_agent_account();

    start_cheat_caller_address(addr, attacker());
    agent.emergency_revoke_all();
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: 'Only self')]
fn test_use_allowance_non_self_panics() {
    let (agent, addr) = deploy_agent_account();
    register_key(agent, addr, 0x1, restricted_policy());

    start_cheat_caller_address(addr, attacker());
    agent.use_session_key_allowance(0x1, token_addr(), 10);
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: 'Only self')]
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
#[should_panic(expected: 'Session key already active')]
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
        max_calls_per_tx: 0,
        spending_period_secs: 0,
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

    // Spending must be reset -- 80 should work again (not carry over)
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
    agent.use_session_key_allowance(key, token_addr(), 30); // 80 + 30 > 100
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
        max_calls_per_tx: 0,
        spending_period_secs: 0,
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

    // Explicitly at timestamp 0 -- the old bug would reset spending on every
    // call, making the limit inert. The fix (period_start + period_secs <= now)
    // means no reset occurs, so spending accumulates correctly.
    start_cheat_block_timestamp(addr, 0);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(key, token_addr(), 80);
    agent.use_session_key_allowance(key, token_addr(), 30); // 80 + 30 > 100
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// EMERGENCY REVOKE -- bounded gas
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

    // Revoke first key -- should swap with last (0x3)
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

    // Revoke last key -- no swap needed
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

    // Revoke middle key (0x2) -- 0x4 should take its slot
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
fn test_full_session_key_lifecycle() {
    let (agent, addr) = deploy_agent_account();

    // 1. Register key with restrictive policy
    register_key(agent, addr, 0x1, restricted_policy());
    assert_eq!(agent.get_active_session_key_count(), 1);
    assert!(agent.is_session_key_valid(0x1));

    // 2. Validate call -- correct target passes, wrong target fails
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

    // 7. Re-register after emergency -- clean slate
    register_key(agent, addr, 0x1, restricted_policy());
    assert_eq!(agent.get_active_session_key_count(), 1);
    assert!(agent.is_session_key_valid(0x1));

    // 8. Spending fresh after re-registration
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(0x1, token_addr(), 100); // full limit
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// PROTOCOL-LEVEL TESTS (with signature cheats)
// ===========================================================================

#[test]
fn test_register_and_revoke_session_key() {
    let (account, account_address) = deploy_account(0x123);
    let key: felt252 = 0xabc;
    let policy = default_policy(zero());

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(key, policy);
    stop_cheat_caller_address(account_address);

    assert!(account.is_session_key_valid(key), "Session key should be valid");

    start_cheat_caller_address(account_address, account_address);
    account.revoke_session_key(key);
    stop_cheat_caller_address(account_address);

    assert!(!account.is_session_key_valid(key), "Session key should be revoked");
}

#[test]
fn test_emergency_revoke_all() {
    let (account, account_address) = deploy_account(0x123);
    let key1: felt252 = 0x111;
    let key2: felt252 = 0x222;
    let policy = default_policy(zero());

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(key1, policy);
    account.register_session_key(key2, policy);
    account.emergency_revoke_all();
    stop_cheat_caller_address(account_address);

    assert!(!account.is_session_key_valid(key1), "Key1 should be revoked");
    assert!(!account.is_session_key_valid(key2), "Key2 should be revoked");
}

#[test]
fn test_set_agent_id_with_owned_registry() {
    let (account, account_address) = deploy_account(0x123);
    let registry_address = deploy_registry(account_address);

    start_cheat_caller_address(account_address, account_address);
    account.set_agent_id(registry_address, 1);
    stop_cheat_caller_address(account_address);

    let (registry, agent_id) = account.get_agent_id();
    assert(registry == registry_address, 'Registry stored');
    assert(agent_id == 1, 'Agent ID stored');
}

#[test]
#[should_panic(expected: 'Agent ID not owned')]
fn test_set_agent_id_requires_ownership() {
    let (account, account_address) = deploy_account(0x123);
    let registry_address = deploy_registry(other());

    start_cheat_caller_address(account_address, account_address);
    account.set_agent_id(registry_address, 1);
}

#[test]
fn test_init_agent_id_from_factory() {
    let factory = addr(0x777);
    let (account, account_address) = deploy_account_with_factory(0x123, factory);
    let registry_address = deploy_registry(account_address);

    start_cheat_caller_address(account_address, factory);
    account.init_agent_id_from_factory(registry_address, 1);
    stop_cheat_caller_address(account_address);

    let (registry, agent_id) = account.get_agent_id();
    assert(registry == registry_address, 'Registry stored');
    assert(agent_id == 1, 'Agent ID stored');
}

#[test]
#[should_panic(expected: 'Only factory')]
fn test_init_agent_id_from_factory_rejects_non_factory() {
    let factory = addr(0x777);
    let (account, account_address) = deploy_account_with_factory(0x123, factory);
    let registry_address = deploy_registry(account_address);

    start_cheat_caller_address(account_address, other());
    account.init_agent_id_from_factory(registry_address, 1);
}

#[test]
fn test_upgrade_schedule_and_cancel() {
    let (account, account_address) = deploy_account(0x123);
    let new_hash: ClassHash = 0x1234.try_into().unwrap();

    start_cheat_caller_address(account_address, account_address);
    account.schedule_upgrade(new_hash);
    let (pending, _, _, _) = account.get_upgrade_info();
    assert(pending == new_hash, 'Pending hash set');
    account.cancel_upgrade();
    let (pending_after, _, _, _) = account.get_upgrade_info();
    let zero_hash: ClassHash = 0.try_into().unwrap();
    assert(pending_after == zero_hash, 'Pending cleared');
    stop_cheat_caller_address(account_address);
}

#[test]
fn test_supports_isrc6_interface() {
    let (_, account_address) = deploy_account(0x123);
    let src5 = ISRC5Dispatcher { contract_address: account_address };
    let supports_isrc6 = src5.supports_interface(ISRC6_ID);
    assert(supports_isrc6, 'Supports ISRC6');
}

#[test]
#[should_panic(expected: 'Account: invalid caller')]
fn test_execute_rejects_external_caller() {
    let (account, account_address) = deploy_account(0x123);
    let calls: Array<Call> = ArrayTrait::new();

    start_cheat_caller_address(account_address, other());
    start_cheat_transaction_version_global(1);

    let _ = account.__execute__(calls);
}

#[test]
#[should_panic(expected: 'Account: invalid caller')]
fn test_validate_rejects_external_caller() {
    let (account, account_address) = deploy_account(0x123);
    let calls: Array<Call> = ArrayTrait::new();

    start_cheat_caller_address(account_address, other());

    let _ = account.__validate__(calls);
}

#[test]
#[should_panic(expected: 'Account: invalid tx version')]
fn test_validate_rejects_v0_transaction() {
    let (account, account_address) = deploy_account(0x123);
    let calls: Array<Call> = ArrayTrait::new();

    start_protocol_call(account_address);
    start_cheat_transaction_version_global(0);

    let _ = account.__validate__(calls);
}

#[test]
fn test_validate_declare_accepts_owner_sig() {
    let owner_key = StarkCurveKeyPairImpl::from_secret_key(0x321);
    let (account, account_address) = deploy_account(owner_key.public_key);
    let class_hash: felt252 = 0xabc;

    let tx_hash: felt252 = 0xabc123;
    let (r, s) = owner_key.sign(tx_hash).unwrap();
    let signature = array![r, s];

    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);
    start_cheat_transaction_version_global(1);
    start_protocol_call(account_address);

    let result = account.__validate_declare__(class_hash);
    stop_protocol_call(account_address);
    assert(result == 1, 'Declare validated');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
fn test_validate_declare_rejects_invalid_signature() {
    let owner_key = StarkCurveKeyPairImpl::from_secret_key(0x322);
    let bad_key = StarkCurveKeyPairImpl::from_secret_key(0x323);
    let (account, account_address) = deploy_account(owner_key.public_key);
    let class_hash: felt252 = 0xdef;

    let tx_hash: felt252 = 0xabc124;
    let (r, s) = bad_key.sign(tx_hash).unwrap();
    let signature = array![r, s];

    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);
    start_cheat_transaction_version_global(1);
    start_protocol_call(account_address);

    let result = account.__validate_declare__(class_hash);
    stop_protocol_call(account_address);
    assert(result == 0, 'Declare rejected');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
#[should_panic(expected: 'Account: invalid caller')]
fn test_validate_declare_rejects_external_caller() {
    let (account, account_address) = deploy_account(0x123);
    let class_hash: felt252 = 0x456;

    start_cheat_caller_address(account_address, other());

    let _ = account.__validate_declare__(class_hash);
}

#[test]
fn test_validate_deploy_accepts_owner_sig() {
    let owner_key = StarkCurveKeyPairImpl::from_secret_key(0x324);
    let (account, account_address) = deploy_account(owner_key.public_key);
    let class_hash: felt252 = 0xabc555;
    let salt: felt252 = 0x444;

    let tx_hash: felt252 = 0xabc125;
    let (r, s) = owner_key.sign(tx_hash).unwrap();
    let signature = array![r, s];

    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);
    start_cheat_transaction_version_global(1);
    start_protocol_call(account_address);

    let result = account.__validate_deploy__(class_hash, salt, owner_key.public_key, zero());
    stop_protocol_call(account_address);
    assert(result == 1, 'Deploy validated');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
#[should_panic(expected: 'Account: invalid caller')]
fn test_validate_deploy_rejects_external_caller() {
    let (account, account_address) = deploy_account(0x123);
    let class_hash: felt252 = 0x789;
    let salt: felt252 = 0x555;

    start_cheat_caller_address(account_address, other());

    let _ = account.__validate_deploy__(class_hash, salt, 0x123, zero());
}

#[test]
#[should_panic(expected: 'Account: invalid tx version')]
fn test_execute_rejects_v0_transaction() {
    let (account, account_address) = deploy_account(0x123);
    let calls: Array<Call> = ArrayTrait::new();

    start_protocol_call(account_address);
    start_cheat_transaction_version_global(0);

    let _ = account.__execute__(calls);
}

#[test]
#[should_panic(expected: 'Account: too many calls')]
fn test_execute_rejects_large_multicall() {
    let (account, account_address) = deploy_account(0x123);
    let mut calls: Array<Call> = ArrayTrait::new();
    let calldata = array![];
    let mut i: u32 = 0;
    loop {
        if i >= 21 {
            break;
        }
        calls.append(Call { to: token(), selector: 0x1, calldata: calldata.span() });
        i += 1;
    };

    start_protocol_call(account_address);
    start_cheat_transaction_version_global(1);

    let _ = account.__execute__(calls);
}

#[test]
fn test_set_public_key_requires_new_key_proof() {
    let (_, account_address) = deploy_account(0x123);
    let public_key = IPublicKeyDispatcher { contract_address: account_address };
    let new_key_pair = StarkCurveKeyPairImpl::from_secret_key(0x999);

    let tx_hash: felt252 = 0xabc10;
    let (r, s) = new_key_pair.sign(tx_hash).unwrap();

    start_cheat_caller_address(account_address, account_address);
    start_cheat_transaction_hash_global(tx_hash);
    public_key.set_public_key(new_key_pair.public_key, array![r, s].span());
    stop_cheat_caller_address(account_address);
    stop_cheat_transaction_hash_global();

    let stored = public_key.get_public_key();
    assert(stored == new_key_pair.public_key, 'Public key updated');
}

#[test]
#[should_panic(expected: 'Account: invalid key proof')]
fn test_set_public_key_rejects_invalid_proof() {
    let (_, account_address) = deploy_account(0x123);
    let public_key = IPublicKeyDispatcher { contract_address: account_address };
    let new_key_pair = StarkCurveKeyPairImpl::from_secret_key(0x888);

    start_cheat_caller_address(account_address, account_address);
    start_cheat_transaction_hash_global(0xabc11);
    public_key.set_public_key(new_key_pair.public_key, array![0x1, 0x2].span());
}

#[test]
fn test_session_key_spending_within_limit() {
    let (account, account_address) = deploy_account(0x123);
    let session_key_pair = StarkCurveKeyPairImpl::from_secret_key(0x55);
    let session_key = session_key_pair.public_key;
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 4_102_444_800,
        spending_limit: u256 { low: 100, high: 0 },
        spending_token: token(),
        allowed_contract: zero(),
        max_calls_per_tx: 0,
        spending_period_secs: 0,
    };

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(session_key, policy);
    stop_cheat_caller_address(account_address);

    let calldata = array![owner().into(), 60_u128.into(), 0_u128.into()];
    let call = Call { to: token(), selector: SELECTOR_TRANSFER, calldata: calldata.span() };
    let calls = array![call];

    let tx_hash: felt252 = 0xabc1;
    let (r, s) = session_key_pair.sign(tx_hash).unwrap();
    let signature = array![session_key, r, s];
    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);

    start_protocol_call(account_address);
    let result = account.__validate__(calls);
    stop_protocol_call(account_address);
    assert(result == 1, 'Session key validated');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_session_key_spending_exceeds_limit() {
    let (account, account_address) = deploy_account(0x123);
    let session_key_pair = StarkCurveKeyPairImpl::from_secret_key(0x66);
    let session_key = session_key_pair.public_key;
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 4_102_444_800,
        spending_limit: u256 { low: 100, high: 0 },
        spending_token: token(),
        allowed_contract: zero(),
        max_calls_per_tx: 0,
        spending_period_secs: 0,
    };

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(session_key, policy);
    stop_cheat_caller_address(account_address);

    let first_calldata = array![owner().into(), 70_u128.into(), 0_u128.into()];
    let first_call = Call {
        to: token(), selector: SELECTOR_TRANSFER, calldata: first_calldata.span()
    };
    let second_calldata = array![owner().into(), 40_u128.into(), 0_u128.into()];
    let second_call = Call {
        to: token(), selector: SELECTOR_TRANSFER, calldata: second_calldata.span()
    };
    let calls = array![first_call, second_call];

    start_cheat_block_timestamp_global(1);

    let tx_hash: felt252 = 0xabc2;
    let (r, s) = session_key_pair.sign(tx_hash).unwrap();
    let signature = array![session_key, r, s];
    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);

    start_protocol_call(account_address);
    let _ = account.__validate__(calls);
    stop_protocol_call(account_address);

    let first_calldata2 = array![owner().into(), 70_u128.into(), 0_u128.into()];
    let first_call2 = Call {
        to: token(), selector: SELECTOR_TRANSFER, calldata: first_calldata2.span()
    };
    let second_calldata2 = array![owner().into(), 40_u128.into(), 0_u128.into()];
    let second_call2 = Call {
        to: token(), selector: SELECTOR_TRANSFER, calldata: second_calldata2.span()
    };
    let calls2 = array![first_call2, second_call2];

    start_protocol_call(account_address);
    start_cheat_transaction_version_global(1);
    let _ = account.__execute__(calls2);

    stop_cheat_block_timestamp_global();
    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
fn test_session_key_rejects_unapproved_contract() {
    let (account, account_address) = deploy_account(0x123);
    let session_key_pair = StarkCurveKeyPairImpl::from_secret_key(0x77);
    let session_key = session_key_pair.public_key;
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 4_102_444_800,
        spending_limit: u256 { low: 100, high: 0 },
        spending_token: zero(),
        allowed_contract: token(),
        max_calls_per_tx: 0,
        spending_period_secs: 0,
    };

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(session_key, policy);
    stop_cheat_caller_address(account_address);

    let calldata = array![];
    let call = Call { to: other(), selector: 0x1, calldata: calldata.span() };
    let calls = array![call];

    let tx_hash: felt252 = 0xabc4;
    let (r, s) = session_key_pair.sign(tx_hash).unwrap();
    let signature = array![session_key, r, s];
    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);

    start_protocol_call(account_address);
    let result = account.__validate__(calls);
    stop_protocol_call(account_address);
    assert(result == 0, 'Unapproved contract rejected');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
fn test_session_key_enforces_max_calls_per_tx() {
    let (account, account_address) = deploy_account(0x123);
    let session_key_pair = StarkCurveKeyPairImpl::from_secret_key(0x88);
    let session_key = session_key_pair.public_key;
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 4_102_444_800,
        spending_limit: u256 { low: 100, high: 0 },
        spending_token: zero(),
        allowed_contract: zero(),
        max_calls_per_tx: 1,
        spending_period_secs: 0,
    };

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(session_key, policy);
    stop_cheat_caller_address(account_address);

    let calldata = array![];
    let call_one = Call { to: token(), selector: 0x1, calldata: calldata.span() };
    let call_two = Call { to: other(), selector: 0x2, calldata: calldata.span() };
    let calls = array![call_one, call_two];

    let tx_hash: felt252 = 0xabc5;
    let (r, s) = session_key_pair.sign(tx_hash).unwrap();
    let signature = array![session_key, r, s];
    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);

    start_protocol_call(account_address);
    let result = account.__validate__(calls);
    stop_protocol_call(account_address);
    assert(result == 0, 'Max calls enforced');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
fn test_session_key_requires_spending_calldata() {
    let (account, account_address) = deploy_account(0x123);
    let session_key_pair = StarkCurveKeyPairImpl::from_secret_key(0x99);
    let session_key = session_key_pair.public_key;
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 4_102_444_800,
        spending_limit: u256 { low: 100, high: 0 },
        spending_token: token(),
        allowed_contract: zero(),
        max_calls_per_tx: 0,
        spending_period_secs: 0,
    };

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(session_key, policy);
    stop_cheat_caller_address(account_address);

    let calldata = array![owner().into(), 1_u128.into()];
    let call = Call { to: token(), selector: SELECTOR_TRANSFER, calldata: calldata.span() };
    let calls = array![call];

    let tx_hash: felt252 = 0xabc6;
    let (r, s) = session_key_pair.sign(tx_hash).unwrap();
    let signature = array![session_key, r, s];
    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);

    start_protocol_call(account_address);
    let result = account.__validate__(calls);
    stop_protocol_call(account_address);
    assert(result == 0, 'Spending calldata required');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
fn test_session_key_rejects_unknown_selector_on_spending_token() {
    let (account, account_address) = deploy_account(0x123);
    let session_key_pair = StarkCurveKeyPairImpl::from_secret_key(0xaa);
    let session_key = session_key_pair.public_key;
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 4_102_444_800,
        spending_limit: u256 { low: 1000, high: 0 },
        spending_token: token(),
        allowed_contract: zero(),
        max_calls_per_tx: 0,
        spending_period_secs: 0,
    };

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(session_key, policy);
    stop_cheat_caller_address(account_address);

    let calldata = array![owner().into(), 10_u128.into(), 0_u128.into()];
    let unknown_selector: felt252 = 0xdeadbeef;
    let call = Call { to: token(), selector: unknown_selector, calldata: calldata.span() };
    let calls = array![call];

    let tx_hash: felt252 = 0xabc7;
    let (r, s) = session_key_pair.sign(tx_hash).unwrap();
    let signature = array![session_key, r, s];
    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);

    start_protocol_call(account_address);
    let result = account.__validate__(calls);
    stop_protocol_call(account_address);
    assert(result == 0, 'Unknown selector rejected');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
fn test_session_key_blocks_approve_on_spending_token() {
    let (account, account_address) = deploy_account(0x123);
    let session_key_pair = StarkCurveKeyPairImpl::from_secret_key(0xbb);
    let session_key = session_key_pair.public_key;
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 4_102_444_800,
        spending_limit: u256 { low: 500, high: 0 },
        spending_token: token(),
        allowed_contract: zero(),
        max_calls_per_tx: 0,
        spending_period_secs: 0,
    };

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(session_key, policy);
    stop_cheat_caller_address(account_address);

    // Approve on the spending token should be blocked -- approvals create
    // open-ended allowances that bypass per-period spending limits.
    let calldata = array![other().into(), 200_u128.into(), 0_u128.into()];
    let call = Call { to: token(), selector: SELECTOR_APPROVE, calldata: calldata.span() };
    let calls = array![call];

    let tx_hash: felt252 = 0xabc8;
    let (r, s) = session_key_pair.sign(tx_hash).unwrap();
    let signature = array![session_key, r, s];
    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);

    start_protocol_call(account_address);
    let result = account.__validate__(calls);
    stop_protocol_call(account_address);
    assert(result == 0, 'Approve on spending blocked');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
fn test_session_key_allows_approve_on_non_spending_token() {
    let (account, account_address) = deploy_account(0x123);
    let session_key_pair = StarkCurveKeyPairImpl::from_secret_key(0xbc);
    let session_key = session_key_pair.public_key;
    // spending_token is zero (no spending tracking), so approve on any contract is fine
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 4_102_444_800,
        spending_limit: u256 { low: 500, high: 0 },
        spending_token: zero(),
        allowed_contract: zero(),
        max_calls_per_tx: 0,
        spending_period_secs: 0,
    };

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(session_key, policy);
    stop_cheat_caller_address(account_address);

    let calldata = array![other().into(), 200_u128.into(), 0_u128.into()];
    let call = Call { to: token(), selector: SELECTOR_APPROVE, calldata: calldata.span() };
    let calls = array![call];

    let tx_hash: felt252 = 0xabc80;
    let (r, s) = session_key_pair.sign(tx_hash).unwrap();
    let signature = array![session_key, r, s];
    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);

    start_protocol_call(account_address);
    let result = account.__validate__(calls);
    stop_protocol_call(account_address);
    assert(result == 1, 'Approve on non-spending OK');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}

#[test]
fn test_invalid_signature_does_not_consume_spending() {
    let (account, account_address) = deploy_account(0x123);
    let session_key_pair = StarkCurveKeyPairImpl::from_secret_key(0xcc);
    let session_key = session_key_pair.public_key;
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 4_102_444_800,
        spending_limit: u256 { low: 100, high: 0 },
        spending_token: token(),
        allowed_contract: zero(),
        max_calls_per_tx: 0,
        spending_period_secs: 0,
    };

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(session_key, policy);
    stop_cheat_caller_address(account_address);

    let calldata = array![owner().into(), 80_u128.into(), 0_u128.into()];
    let call = Call { to: token(), selector: SELECTOR_TRANSFER, calldata: calldata.span() };
    let calls = array![call];

    let tx_hash: felt252 = 0xabc9;
    let fake_r: felt252 = 0x1111;
    let fake_s: felt252 = 0x2222;
    let signature = array![session_key, fake_r, fake_s];
    start_cheat_signature_global(signature.span());
    start_cheat_transaction_hash_global(tx_hash);

    start_protocol_call(account_address);
    let result = account.__validate__(calls);
    stop_protocol_call(account_address);
    assert(result == 0, 'Bad sig rejected');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();

    let calldata2 = array![owner().into(), 100_u128.into(), 0_u128.into()];
    let call2 = Call { to: token(), selector: SELECTOR_TRANSFER, calldata: calldata2.span() };
    let calls2 = array![call2];

    let tx_hash2: felt252 = 0xabca;
    let (r2, s2) = session_key_pair.sign(tx_hash2).unwrap();
    let signature2 = array![session_key, r2, s2];
    start_cheat_signature_global(signature2.span());
    start_cheat_transaction_hash_global(tx_hash2);

    start_protocol_call(account_address);
    let result2 = account.__validate__(calls2);
    stop_protocol_call(account_address);
    assert(result2 == 1, 'Full limit still available');

    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
}
