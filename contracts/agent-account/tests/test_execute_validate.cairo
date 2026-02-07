/// Tests for the custom __validate__ and __execute__ overrides that enforce
/// session key policies at the protocol level (Issue #76).
///
/// These tests use snforge cheat codes to simulate the Starknet protocol
/// calling __validate__ and __execute__ with specific signatures and tx context.
use agent_account::interfaces::{
    IAgentAccountDispatcher, IAgentAccountDispatcherTrait, SessionPolicy,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp, stop_cheat_block_timestamp,
    start_cheat_signature_global, stop_cheat_signature_global,
    start_cheat_transaction_hash_global, stop_cheat_transaction_hash_global,
    start_cheat_transaction_version_global, stop_cheat_transaction_version_global,
};
use snforge_std::signature::KeyPairTrait;
use snforge_std::signature::stark_curve::{StarkCurveKeyPairImpl, StarkCurveSignerImpl};
use starknet::ContractAddress;
use starknet::account::Call;

/// Minimal interface matching our custom SRC6 entrypoints.
/// Needed because we use #[abi(per_item)] instead of implementing the full
/// AccountABI trait, so the OZ AccountABIDispatcher won't find our methods.
#[starknet::interface]
trait IAccountSRC6<TState> {
    fn __execute__(ref self: TState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn __validate__(self: @TState, calls: Array<Call>) -> felt252;
    fn is_valid_signature(self: @TState, hash: felt252, signature: Array<felt252>) -> felt252;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TX_HASH: felt252 = 0xABCDEF123456;
const MIN_TX_VERSION: felt252 = 1;

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

/// Deploys the AgentAccount with the given owner public key.
fn deploy_agent_account(
    owner_pubkey: felt252,
) -> (ContractAddress, IAccountSRC6Dispatcher, IAgentAccountDispatcher) {
    let contract = declare("AgentAccount").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![owner_pubkey, 0]).unwrap();
    let src6_disp = IAccountSRC6Dispatcher { contract_address: addr };
    let agent_disp = IAgentAccountDispatcher { contract_address: addr };
    (addr, src6_disp, agent_disp)
}

/// Permissive policy: any contract, large limit, wide time window.
fn permissive_policy() -> SessionPolicy {
    SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: 1_000_000,
        spending_token: token_addr(),
        allowed_contract: zero_addr(),
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
    }
}

/// Registers a session key (cheats caller to contract itself).
fn register_key(
    agent: IAgentAccountDispatcher, addr: ContractAddress, key: felt252, policy: SessionPolicy,
) {
    start_cheat_caller_address(addr, addr);
    agent.register_session_key(key, policy);
    stop_cheat_caller_address(addr);
}

/// Sets up cheat codes to simulate a protocol call with owner signature.
fn setup_owner_tx_context(addr: ContractAddress, owner_r: felt252, owner_s: felt252) {
    start_cheat_signature_global(array![owner_r, owner_s].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);
    start_cheat_caller_address(addr, zero_addr());
}

/// Sets up cheat codes to simulate a protocol call with session key signature.
fn setup_session_key_tx_context(
    addr: ContractAddress, session_key: felt252, sig_r: felt252, sig_s: felt252,
) {
    start_cheat_signature_global(array![session_key, sig_r, sig_s].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);
    start_cheat_caller_address(addr, zero_addr());
}

fn cleanup_cheats() {
    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
    stop_cheat_transaction_version_global();
}

/// Builds an ERC-20 transfer Call: transfer(recipient, amount)
fn transfer_call(token: ContractAddress, recipient: felt252, amount: u256) -> Call {
    let calldata = array![recipient, amount.low.into(), amount.high.into()];
    Call {
        to: token,
        selector: 0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e,
        calldata: calldata.span(),
    }
}

/// Builds a generic non-transfer Call.
fn generic_call(target: ContractAddress) -> Call {
    Call { to: target, selector: 0x12345, calldata: array![].span() }
}

// ===========================================================================
// __validate__ TESTS
// ===========================================================================

#[test]
fn test_validate_owner_signature_succeeds() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, account, _) = deploy_agent_account(owner_kp.public_key);

    let (r, s) = owner_kp.sign(TX_HASH).unwrap();
    setup_owner_tx_context(addr, r, s);

    let result = account.__validate__(array![]);
    assert_eq!(result, starknet::VALIDATED);

    stop_cheat_caller_address(addr);
    cleanup_cheats();
}

#[test]
#[should_panic(expected: 'Account: invalid signature')]
fn test_validate_owner_bad_signature_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, account, _) = deploy_agent_account(owner_kp.public_key);

    // Sign with wrong hash
    let (r, s) = owner_kp.sign(TX_HASH + 1).unwrap();
    setup_owner_tx_context(addr, r, s);

    account.__validate__(array![]);
}

#[test]
fn test_validate_session_key_signature_succeeds() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, permissive_policy());

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, session_kp.public_key, r, s);

    start_cheat_block_timestamp(addr, 100);
    let result = account.__validate__(array![]);
    assert_eq!(result, starknet::VALIDATED);

    stop_cheat_block_timestamp(addr);
    stop_cheat_caller_address(addr);
    cleanup_cheats();
}

#[test]
#[should_panic(expected: 'Session key: bad signature')]
fn test_validate_session_key_wrong_signature_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let wrong_kp = KeyPairTrait::from_secret_key(0x9999_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, permissive_policy());

    // Sign with WRONG private key but claim to be session_kp
    let (r, s) = wrong_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, session_kp.public_key, r, s);

    start_cheat_block_timestamp(addr, 100);
    account.__validate__(array![]);
}

#[test]
#[should_panic(expected: 'Session key not valid')]
fn test_validate_session_key_not_registered_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let unregistered_kp = KeyPairTrait::from_secret_key(0xAAAA_felt252);
    let (addr, account, _) = deploy_agent_account(owner_kp.public_key);

    let (r, s) = unregistered_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, unregistered_kp.public_key, r, s);

    account.__validate__(array![]);
}

#[test]
#[should_panic(expected: 'Session key not valid')]
fn test_validate_expired_session_key_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, permissive_policy());

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, session_kp.public_key, r, s);

    start_cheat_block_timestamp(addr, 1_000_000); // past valid_until
    account.__validate__(array![]);
}

#[test]
#[should_panic(expected: 'Session key not valid')]
fn test_validate_revoked_session_key_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, permissive_policy());

    // Revoke the key
    start_cheat_caller_address(addr, addr);
    agent.revoke_session_key(session_kp.public_key);
    stop_cheat_caller_address(addr);

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, session_kp.public_key, r, s);

    start_cheat_block_timestamp(addr, 100);
    account.__validate__(array![]);
}

#[test]
#[should_panic(expected: 'Account: invalid sig length')]
fn test_validate_invalid_signature_length_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, account, _) = deploy_agent_account(owner_kp.public_key);

    start_cheat_signature_global(array![0x1].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);
    start_cheat_caller_address(addr, zero_addr());

    account.__validate__(array![]);
}

#[test]
#[should_panic(expected: 'Account: invalid sig length')]
fn test_validate_empty_signature_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, account, _) = deploy_agent_account(owner_kp.public_key);

    start_cheat_signature_global(array![].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);
    start_cheat_caller_address(addr, zero_addr());

    account.__validate__(array![]);
}

// ===========================================================================
// __execute__ TESTS — Owner path (no restrictions)
// ===========================================================================

#[test]
fn test_execute_owner_no_restrictions() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, account, _) = deploy_agent_account(owner_kp.public_key);

    let (r, s) = owner_kp.sign(TX_HASH).unwrap();
    setup_owner_tx_context(addr, r, s);

    // Owner can execute with zero calls — no policy check at all
    let results = account.__execute__(array![]);
    assert_eq!(results.len(), 0);

    stop_cheat_caller_address(addr);
    cleanup_cheats();
}

// ===========================================================================
// __execute__ TESTS — Session key policy enforcement
// ===========================================================================

#[test]
fn test_execute_session_key_empty_calls_succeeds() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, restricted_policy());

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    let results = account.__execute__(array![]);
    assert_eq!(results.len(), 0);

    stop_cheat_block_timestamp(addr);
    stop_cheat_caller_address(addr);
    cleanup_cheats();
}

#[test]
#[should_panic(expected: 'Session: contract not allowed')]
fn test_execute_session_key_disallowed_contract_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    // Restrict to allowed_target only
    register_key(agent, addr, session_kp.public_key, restricted_policy());

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // Call a different target — must panic
    let calls = array![generic_call(other_target())];
    account.__execute__(calls);
}

#[test]
#[should_panic(expected: 'Session: contract not allowed')]
fn test_execute_session_key_multicall_second_target_disallowed_panics() {
    // Off-by-one guard: first call matches allowed target, second does not.
    // The policy loop must inspect all calls and fail on call[1].
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, restricted_policy());

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    let calls = array![generic_call(allowed_target()), generic_call(other_target())];
    account.__execute__(calls);
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_execute_session_key_transfer_exceeds_spending_limit() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    // spending_limit = 100, spending_token = token_addr(), allowed_contract = token_addr()
    // (the token contract IS the allowed contract for this transfer scenario)
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: 100,
        spending_token: token_addr(),
        allowed_contract: token_addr(), // allow calls to the token contract
    };
    register_key(agent, addr, session_kp.public_key, policy);

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // Transfer 150 tokens on the token contract — exceeds limit of 100
    let calls = array![transfer_call(token_addr(), 0xDEAD, 150)];
    account.__execute__(calls);
}

#[test]
#[should_panic(expected: 'Wrong spending token')]
fn test_execute_session_key_transfer_wrong_token_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    // spending_token = token_addr() (0xAAA), allowed_contract = zero (any)
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: 1000,
        spending_token: token_addr(),
        allowed_contract: zero_addr(),
    };
    register_key(agent, addr, session_kp.public_key, policy);

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // Transfer on the WRONG token contract (other_target = 0xCCC != 0xAAA)
    let calls = array![transfer_call(other_target(), 0xDEAD, 50)];
    account.__execute__(calls);
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_execute_session_key_multicall_cumulative_spending() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: 100,
        spending_token: token_addr(),
        allowed_contract: zero_addr(),
    };
    register_key(agent, addr, session_kp.public_key, policy);

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx_context(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // Two transfers: 60 + 60 = 120 > 100 — must panic on the second
    let calls = array![
        transfer_call(token_addr(), 0xDEAD, 60), transfer_call(token_addr(), 0xBEEF, 60),
    ];
    account.__execute__(calls);
}

// ===========================================================================
// __execute__ TESTS — Security invariants
// ===========================================================================

#[test]
#[should_panic(expected: 'Account: invalid caller')]
fn test_execute_rejects_non_protocol_caller() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, account, _) = deploy_agent_account(owner_kp.public_key);

    let (r, s) = owner_kp.sign(TX_HASH).unwrap();
    start_cheat_signature_global(array![r, s].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);

    // caller is NOT zero — simulates a contract calling __execute__
    let attacker: ContractAddress = 0xEEE.try_into().unwrap();
    start_cheat_caller_address(addr, attacker);

    account.__execute__(array![]);
}

#[test]
#[should_panic(expected: 'Account: invalid tx version')]
fn test_execute_rejects_v0_transaction() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, account, _) = deploy_agent_account(owner_kp.public_key);

    let (r, s) = owner_kp.sign(TX_HASH).unwrap();
    start_cheat_signature_global(array![r, s].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(0); // v0 — must be rejected
    start_cheat_caller_address(addr, zero_addr());

    account.__execute__(array![]);
}

// ===========================================================================
// is_valid_signature TESTS
// ===========================================================================

#[test]
fn test_is_valid_signature_owner() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (_, account, _) = deploy_agent_account(owner_kp.public_key);

    let (r, s) = owner_kp.sign(TX_HASH).unwrap();
    let result = account.is_valid_signature(TX_HASH, array![r, s]);
    assert_eq!(result, starknet::VALIDATED);
}

#[test]
fn test_is_valid_signature_rejects_bad_sig() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (_, account, _) = deploy_agent_account(owner_kp.public_key);

    let result = account.is_valid_signature(TX_HASH, array!['BAD', 'SIG']);
    assert_eq!(result, 0);
}
