/// Security audit regression tests and fuzz tests for the AgentAccount contract.
///
/// These tests prove that known vulnerability classes are correctly mitigated
/// and verify behavior at boundary conditions.
///
/// Coverage areas:
///   - approve+transferFrom spending bypass (MEDIUM finding)
///   - Fuzz: spending amounts near limit boundary
///   - Fuzz: random session key pairs for ECDSA verification
///   - Fuzz: timestamp boundary conditions
///   - Edge cases: malformed calldata, zero amounts, max values
///   - Session key can't declare or deploy (owner-only ops)
///   - Signature length attack surface
use agent_account::interfaces::{
    IAgentAccountDispatcher, IAgentAccountDispatcherTrait, SessionPolicy,
};
use agent_account::agent_account::AgentAccount::{
    APPROVE_SELECTOR, INCREASE_ALLOWANCE_CAMEL_SELECTOR, INCREASE_ALLOWANCE_SELECTOR,
    TRANSFER_SELECTOR,
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

// Dispatcher for our custom SRC6 entrypoints
#[starknet::interface]
trait IAccountSRC6<TState> {
    fn __execute__(ref self: TState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn __validate__(self: @TState, calls: Array<Call>) -> felt252;
    fn is_valid_signature(self: @TState, hash: felt252, signature: Array<felt252>) -> felt252;
}

// Dispatcher for OZ's __validate_declare__ entrypoint
#[starknet::interface]
trait IDeclarer<TState> {
    fn __validate_declare__(self: @TState, class_hash: felt252) -> felt252;
}

// Dispatcher for OZ's __validate_deploy__ entrypoint
#[starknet::interface]
trait IDeployer<TState> {
    fn __validate_deploy__(
        self: @TState,
        class_hash: felt252,
        contract_address_salt: felt252,
        public_key: felt252,
    ) -> felt252;
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

fn deploy_agent_account(
    owner_pubkey: felt252,
) -> (ContractAddress, IAccountSRC6Dispatcher, IAgentAccountDispatcher) {
    let contract = declare("AgentAccount").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![owner_pubkey, 0]).unwrap();
    (addr, IAccountSRC6Dispatcher { contract_address: addr }, IAgentAccountDispatcher { contract_address: addr })
}

fn deploy_mock_erc20() -> ContractAddress {
    let contract = declare("MockErc20ForTests").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![]).unwrap();
    addr
}

fn register_key(
    agent: IAgentAccountDispatcher, addr: ContractAddress, key: felt252, policy: SessionPolicy,
) {
    start_cheat_caller_address(addr, addr);
    agent.register_session_key(key, policy);
    stop_cheat_caller_address(addr);
}

fn setup_session_key_tx(
    addr: ContractAddress, session_key: felt252, sig_r: felt252, sig_s: felt252,
) {
    start_cheat_signature_global(array![session_key, sig_r, sig_s].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);
    start_cheat_caller_address(addr, zero_addr());
}

fn setup_owner_tx(addr: ContractAddress, r: felt252, s: felt252) {
    start_cheat_signature_global(array![r, s].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);
    start_cheat_caller_address(addr, zero_addr());
}

fn cleanup_cheats() {
    stop_cheat_signature_global();
    stop_cheat_transaction_hash_global();
    stop_cheat_transaction_version_global();
}

/// Build a transfer call: transfer(recipient, amount) on `token`
fn transfer_call(token: ContractAddress, recipient: felt252, amount: u256) -> Call {
    Call {
        to: token,
        selector: TRANSFER_SELECTOR,
        calldata: array![recipient, amount.low.into(), amount.high.into()].span(),
    }
}

/// Build an approve call: approve(spender, amount) on `token`
fn approve_call(token: ContractAddress, spender: felt252, amount: u256) -> Call {
    Call {
        to: token,
        selector: APPROVE_SELECTOR,
        calldata: array![spender, amount.low.into(), amount.high.into()].span(),
    }
}

/// Build an increase_allowance call (snake_case): increase_allowance(spender, added_value) on `token`
fn increase_allowance_call(token: ContractAddress, spender: felt252, amount: u256) -> Call {
    Call {
        to: token,
        selector: INCREASE_ALLOWANCE_SELECTOR,
        calldata: array![spender, amount.low.into(), amount.high.into()].span(),
    }
}

/// Build an increaseAllowance call (camelCase): increaseAllowance(spender, addedValue) on `token`
fn increase_allowance_camel_call(token: ContractAddress, spender: felt252, amount: u256) -> Call {
    Call {
        to: token,
        selector: INCREASE_ALLOWANCE_CAMEL_SELECTOR,
        calldata: array![spender, amount.low.into(), amount.high.into()].span(),
    }
}

/// Build a transfer_from call (snake_case): transfer_from(sender, recipient, amount)
fn transfer_from_call(
    token: ContractAddress, sender: felt252, recipient: felt252, amount: u256,
) -> Call {
    Call {
        to: token,
        selector: selector!("transfer_from"),
        calldata: array![sender, recipient, amount.low.into(), amount.high.into()].span(),
    }
}

/// Build a transferFrom call (camelCase): transferFrom(sender, recipient, amount)
fn transfer_from_camel_call(
    token: ContractAddress, sender: felt252, recipient: felt252, amount: u256,
) -> Call {
    Call {
        to: token,
        selector: selector!("transferFrom"),
        calldata: array![sender, recipient, amount.low.into(), amount.high.into()].span(),
    }
}

/// Non-transfer call
fn generic_call(target: ContractAddress, selector: felt252) -> Call {
    Call { to: target, selector, calldata: array![].span() }
}

/// Policy allowing any contract, spending on token_addr, with given limit
fn spending_policy(limit: u256) -> SessionPolicy {
    SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: limit,
        spending_token: token_addr(),
        allowed_contract: token_addr(),
    }
}

/// Policy allowing any contract
fn any_contract_policy(limit: u256) -> SessionPolicy {
    SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: limit,
        spending_token: token_addr(),
        allowed_contract: zero_addr(),
    }
}

// ===========================================================================
// VULNERABILITY REGRESSION: approve+transferFrom bypass (MEDIUM)
// ===========================================================================

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_approve_bypass_is_blocked() {
    // ATTACK SCENARIO: session key calls approve(colluder, MAX) to bypass spending_limit.
    // Before the fix, only `transfer` was checked; `approve` was untracked.
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    // Register session key with spending_limit = 100
    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // Attempt approve(colluder, 200) — exceeds limit of 100
    let colluder: felt252 = 0xDEADBEEF;
    let calls = array![approve_call(token_addr(), colluder, 200)];
    account.__execute__(calls); // MUST panic
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_approve_cumulative_with_transfer() {
    // approve(50) + transfer(60) = 110 > limit of 100
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // Mix approve + transfer in single multicall
    let calls = array![
        approve_call(token_addr(), 0xDEAD, 50),
        transfer_call(token_addr(), 0xBEEF, 60),
    ];
    account.__execute__(calls); // 50 + 60 = 110 > 100 → MUST panic
}

#[test]
#[should_panic(expected: 'Wrong spending token')]
fn test_approve_on_wrong_token_blocked() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, any_contract_policy(1000));

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // approve on a DIFFERENT token contract
    let wrong_token: ContractAddress = 0xCCC.try_into().unwrap();
    let calls = array![approve_call(wrong_token, 0xDEAD, 50)];
    account.__execute__(calls); // Wrong spending token
}

// ===========================================================================
// FUZZ: Spending amounts near limit boundary
// ===========================================================================

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
#[fuzzer(runs: 256, seed: 42)]
fn test_fuzz_spending_over_limit_always_panics(excess: u128) {
    // Any amount > limit should always panic.
    // We construct amount = limit + clamped_excess where clamped_excess >= 1.
    let limit: u256 = 100;
    let clamped_excess: u128 = if excess == 0 {
        1
    } else if excess > 1_000_000 {
        1_000_000
    } else {
        excess
    };
    let amount: u256 = limit + clamped_excess.into();

    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(limit));

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(session_kp.public_key, token_addr(), amount);
    // Must panic on every fuzz run
}

#[test]
#[fuzzer(runs: 256, seed: 99)]
fn test_fuzz_spending_within_limit_succeeds(amount_u128: u128) {
    let limit: u256 = 1_000_000;
    // Clamp to valid range
    let amount: u256 = if amount_u128 == 0 {
        0
    } else {
        let clamped: u128 = if amount_u128 > 1_000_000 {
            1_000_000
        } else {
            amount_u128
        };
        clamped.into()
    };

    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(limit));

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(session_kp.public_key, token_addr(), amount);
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// FUZZ: Session key ECDSA verification with random key pairs
// ===========================================================================

#[test]
#[fuzzer(runs: 128, seed: 7)]
fn test_fuzz_session_key_valid_signature(secret: felt252) {
    // snforge may generate 0; that's not a valid private key for this curve.
    // We skip instead of asserting to keep this property test focused on
    // "random valid keypairs always validate".
    if secret == 0 {
        return;
    }

    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(secret);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(
        agent,
        addr,
        session_kp.public_key,
        SessionPolicy {
            valid_after: 0,
            valid_until: 999_999,
            spending_limit: 1,
            spending_token: token_addr(),
            allowed_contract: zero_addr(),
        },
    );

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    assert_eq!(account.__validate__(array![]), starknet::VALIDATED);

    stop_cheat_block_timestamp(addr);
    stop_cheat_caller_address(addr);
    cleanup_cheats();
}

#[test]
#[should_panic(expected: 'Session key: bad signature')]
#[fuzzer(runs: 128, seed: 13)]
fn test_fuzz_wrong_signer_always_fails(wrong_secret: felt252) {
    // Skip zero (invalid secret key) by forcing to non-zero
    let actual_secret = if wrong_secret == 0 {
        0x9999_felt252
    } else {
        wrong_secret
    };

    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let wrong_kp = KeyPairTrait::from_secret_key(actual_secret);

    // If wrong_kp happens to match session_kp, use a different key
    let final_wrong_kp = if wrong_kp.public_key == session_kp.public_key {
        KeyPairTrait::from_secret_key(actual_secret + 1)
    } else {
        wrong_kp
    };

    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(
        agent,
        addr,
        session_kp.public_key,
        SessionPolicy {
            valid_after: 0,
            valid_until: 999_999,
            spending_limit: 1,
            spending_token: token_addr(),
            allowed_contract: zero_addr(),
        },
    );

    // Sign with WRONG key but claim session_kp's pubkey
    let (r, s) = final_wrong_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    account.__validate__(array![]); // Must panic: bad signature
}

// ===========================================================================
// FUZZ: Timestamp boundary conditions
// ===========================================================================

#[test]
#[fuzzer(runs: 256, seed: 55)]
fn test_fuzz_timestamp_at_valid_after_boundary(offset: u64) {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);

    let valid_after: u64 = 1000;
    let valid_until: u64 = 999_999;

    let policy = SessionPolicy {
        valid_after,
        valid_until,
        spending_limit: 1_000_000,
        spending_token: token_addr(),
        allowed_contract: zero_addr(),
    };
    register_key(agent, addr, session_kp.public_key, policy);

    // Clamp offset to avoid overflow
    let clamped_offset = if offset > 998_999 {
        998_999
    } else {
        offset
    };

    let timestamp = valid_after + clamped_offset;

    start_cheat_block_timestamp(addr, timestamp);
    let is_valid = agent.is_session_key_valid(session_kp.public_key);

    if timestamp >= valid_after && timestamp <= valid_until {
        assert!(is_valid, "Key should be valid at timestamp {}", timestamp);
    } else {
        assert!(!is_valid, "Key should be invalid at timestamp {}", timestamp);
    }
    stop_cheat_block_timestamp(addr);
}

#[test]
fn test_timestamp_exact_boundaries() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);

    let policy = SessionPolicy {
        valid_after: 1000,
        valid_until: 2000,
        spending_limit: 100,
        spending_token: token_addr(),
        allowed_contract: zero_addr(),
    };
    register_key(agent, addr, session_kp.public_key, policy);

    // Exactly at valid_after: valid
    start_cheat_block_timestamp(addr, 1000);
    assert!(agent.is_session_key_valid(session_kp.public_key));
    stop_cheat_block_timestamp(addr);

    // Exactly at valid_until: valid (inclusive)
    start_cheat_block_timestamp(addr, 2000);
    assert!(agent.is_session_key_valid(session_kp.public_key));
    stop_cheat_block_timestamp(addr);

    // One past valid_until: invalid
    start_cheat_block_timestamp(addr, 2001);
    assert!(!agent.is_session_key_valid(session_kp.public_key));
    stop_cheat_block_timestamp(addr);

    // One before valid_after: invalid
    start_cheat_block_timestamp(addr, 999);
    assert!(!agent.is_session_key_valid(session_kp.public_key));
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// EDGE CASES: Malformed calldata attacks
// ===========================================================================

#[test]
#[should_panic(expected: 'Session: bad transfer data')]
fn test_transfer_calldata_too_short() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // Malicious transfer call with only 1 felt of calldata (needs 3)
    let bad_call = Call {
        to: token_addr(),
        selector: TRANSFER_SELECTOR,
        calldata: array![0xDEAD].span(),
    };
    account.__execute__(array![bad_call]);
}

#[test]
#[should_panic(expected: 'Session: bad transfer data')]
fn test_approve_calldata_too_short() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // Malicious approve call with only 2 felts of calldata (needs 3)
    let bad_call = Call {
        to: token_addr(),
        selector: APPROVE_SELECTOR,
        calldata: array![0xDEAD, 0x0].span(),
    };
    account.__execute__(array![bad_call]);
}

#[test]
#[should_panic(expected: 'Session: bad transfer data')]
fn test_transfer_empty_calldata() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    let bad_call = Call {
        to: token_addr(), selector: TRANSFER_SELECTOR, calldata: array![].span(),
    };
    account.__execute__(array![bad_call]);
}

// ===========================================================================
// EDGE CASES: Zero and max amount boundaries
// ===========================================================================

#[test]
fn test_zero_amount_transfer_succeeds() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    // Zero amount should never exceed any limit
    agent.use_session_key_allowance(session_kp.public_key, token_addr(), 0);
    agent.use_session_key_allowance(session_kp.public_key, token_addr(), 0);
    agent.use_session_key_allowance(session_kp.public_key, token_addr(), 0);
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
fn test_exact_limit_succeeds() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(session_kp.public_key, token_addr(), 100);
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_one_over_limit_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(session_kp.public_key, token_addr(), 101);
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_exact_limit_then_one_more_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(session_kp.public_key, token_addr(), 100); // exact limit
    agent.use_session_key_allowance(session_kp.public_key, token_addr(), 1); // one more
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// SESSION KEY CAN'T DECLARE CONTRACTS (owner-only operation)
// ===========================================================================

#[test]
fn test_validate_declare_owner_succeeds() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, _, _) = deploy_agent_account(owner_kp.public_key);
    let declarer = IDeclarerDispatcher { contract_address: addr };

    let (r, s) = owner_kp.sign(TX_HASH).unwrap();
    setup_owner_tx(addr, r, s);

    let result = declarer.__validate_declare__(0x12345);
    assert_eq!(result, starknet::VALIDATED);

    stop_cheat_caller_address(addr);
    cleanup_cheats();
}

#[test]
#[should_panic(expected: 'Account: invalid signature')]
fn test_validate_declare_session_key_panics() {
    // Session key transactions have 3-element signatures.
    // __validate_declare__ uses OZ's validate_transaction() which expects
    // 2-element owner signatures. 3-element sig = invalid length = panic.
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);
    let declarer = IDeclarerDispatcher { contract_address: addr };

    register_key(
        agent,
        addr,
        session_kp.public_key,
        SessionPolicy {
            valid_after: 0,
            valid_until: 999_999,
            spending_limit: 100,
            spending_token: token_addr(),
            allowed_contract: zero_addr(),
        },
    );

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    // Set a 3-element session key signature
    start_cheat_signature_global(array![session_kp.public_key, r, s].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);
    start_cheat_caller_address(addr, zero_addr());

    // OZ's DeclarerImpl calls validate_transaction() which uses _is_valid_signature
    // with the full signature span. 3-element sig fails the length check (expects 2).
    declarer.__validate_declare__(0x12345);
}

// ===========================================================================
// SIGNATURE LENGTH ATTACK SURFACE
// ===========================================================================

#[test]
#[should_panic(expected: 'Account: invalid sig length')]
fn test_validate_4_element_signature_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, account, _) = deploy_agent_account(owner_kp.public_key);

    start_cheat_signature_global(array![0x1, 0x2, 0x3, 0x4].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);
    start_cheat_caller_address(addr, zero_addr());

    account.__validate__(array![]);
}

#[test]
#[should_panic(expected: 'Account: invalid sig length')]
fn test_validate_5_element_signature_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, account, _) = deploy_agent_account(owner_kp.public_key);

    start_cheat_signature_global(array![0x1, 0x2, 0x3, 0x4, 0x5].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);
    start_cheat_caller_address(addr, zero_addr());

    account.__validate__(array![]);
}

// ===========================================================================
// CROSS-CUTTING: Non-transfer selectors not affected by spending
// ===========================================================================

#[test]
fn test_non_transfer_call_not_tracked_as_spending() {
    // A call with a non-transfer/non-approve/non-increase_allowance selector
    // must NOT trigger spending checks.
    //
    // Strategy: use the account contract itself as the target (it exists and
    // has callable functions), set spending_limit = 0 (any tracked selector
    // would panic), and call get_active_session_key_count (a read-only
    // function with a non-spending selector). If the policy loop incorrectly
    // flagged this selector, the test would panic with 'Spending limit exceeded'.
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    // allowed_contract = addr (the account itself), spending_limit = 0
    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: 0, // zero limit — any tracked selector would panic
        spending_token: token_addr(),
        allowed_contract: addr, // allow calling the account itself
    };
    register_key(agent, addr, session_kp.public_key, policy);

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // Call the account's get_active_session_key_count() — a non-spending selector.
    // This call goes through the FULL path: policy loop (must not panic) →
    // execute_calls → call_contract_syscall (real function on a real contract).
    let calls = array![
        Call {
            to: addr,
            selector: selector!("get_active_session_key_count"),
            calldata: array![].span(),
        },
    ];
    let results = account.__execute__(calls);
    assert_eq!(results.len(), 1); // 1 call → 1 result

    stop_cheat_block_timestamp(addr);
    stop_cheat_caller_address(addr);
    cleanup_cheats();
}

#[test]
fn test_transfer_from_snake_not_debited_as_spending() {
    // transfer_from is intentionally untracked to avoid double-counting approval
    // exposure. With spending_limit=0, any tracked selector would panic.
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);
    let mock_token = deploy_mock_erc20();

    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: 0,
        spending_token: mock_token,
        allowed_contract: mock_token,
    };
    register_key(agent, addr, session_kp.public_key, policy);

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    let calls = array![transfer_from_call(mock_token, 0x1, 0x2, 1)];
    let results = account.__execute__(calls);
    assert_eq!(results.len(), 1);

    stop_cheat_block_timestamp(addr);
    stop_cheat_caller_address(addr);
    cleanup_cheats();
}

#[test]
fn test_transfer_from_camel_not_debited_as_spending() {
    // Same invariant as above, but for transferFrom camelCase selector.
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);
    let mock_token = deploy_mock_erc20();

    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: 0,
        spending_token: mock_token,
        allowed_contract: mock_token,
    };
    register_key(agent, addr, session_kp.public_key, policy);

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    let calls = array![transfer_from_camel_call(mock_token, 0x1, 0x2, 1)];
    let results = account.__execute__(calls);
    assert_eq!(results.len(), 1);

    stop_cheat_block_timestamp(addr);
    stop_cheat_caller_address(addr);
    cleanup_cheats();
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_u256_high_limb_spending_limit_enforced() {
    // Ensure u256 allowance math is correct when amount.high > 0.
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);
    let mock_token = deploy_mock_erc20();

    let policy = SessionPolicy {
        valid_after: 0,
        valid_until: 999_999,
        spending_limit: u256 { low: 5, high: 1 }, // 2^128 + 5
        spending_token: mock_token,
        allowed_contract: mock_token,
    };
    register_key(agent, addr, session_kp.public_key, policy);

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // Spend exactly 2^128 first (high limb only) -> should pass.
    let first = array![transfer_call(mock_token, 0xBEEF, u256 { low: 0, high: 1 })];
    let first_results = account.__execute__(first);
    assert_eq!(first_results.len(), 1);

    // Then spend 6 more: total becomes 2^128 + 6 > 2^128 + 5 -> must revert.
    let second = array![transfer_call(mock_token, 0xBEEF, 6)];
    account.__execute__(second);
}

// ===========================================================================
// SPENDING PERIOD RESET FUZZ
// ===========================================================================

#[test]
#[fuzzer(runs: 128, seed: 77)]
fn test_fuzz_spending_period_reset(time_advance: u64) {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);

    let limit: u256 = 100;
    register_key(agent, addr, session_kp.public_key, spending_policy(limit));

    // Spend 80 at time 100_000
    start_cheat_block_timestamp(addr, 100_000);
    start_cheat_caller_address(addr, addr);
    agent.use_session_key_allowance(session_kp.public_key, token_addr(), 80);
    stop_cheat_block_timestamp(addr);

    // Advance time by a random amount
    // Clamp to avoid timestamp overflow and stay within valid_until
    let clamped_advance = if time_advance > 800_000 {
        800_000
    } else {
        time_advance
    };
    let new_time = 100_000 + clamped_advance;

    start_cheat_block_timestamp(addr, new_time);

    if clamped_advance >= 86400 {
        // Period has reset — should allow full 100 again
        agent.use_session_key_allowance(session_kp.public_key, token_addr(), 100);
    } else {
        // Same period — only 20 remaining
        agent.use_session_key_allowance(session_kp.public_key, token_addr(), 20);
    }

    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// MULTIPLE SESSION KEYS: isolation
// ===========================================================================

#[test]
fn test_session_key_spending_isolation() {
    // Two session keys should have independent spending counters
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let sk1 = KeyPairTrait::from_secret_key(0x1111_felt252);
    let sk2 = KeyPairTrait::from_secret_key(0x2222_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, sk1.public_key, spending_policy(100));
    register_key(agent, addr, sk2.public_key, spending_policy(100));

    start_cheat_block_timestamp(addr, 100);
    start_cheat_caller_address(addr, addr);

    // Spend 90 on key 1
    agent.use_session_key_allowance(sk1.public_key, token_addr(), 90);

    // Key 2 should still have full budget
    agent.use_session_key_allowance(sk2.public_key, token_addr(), 100);

    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
}

// ===========================================================================
// REGRESSION: is_valid_signature doesn't leak session key info
// ===========================================================================

#[test]
fn test_is_valid_signature_rejects_3_element_sig() {
    // is_valid_signature should only check owner signatures (2-element).
    // A 3-element session key signature should return 0 (invalid),
    // NOT starknet::VALIDATED.
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(
        agent,
        addr,
        session_kp.public_key,
        SessionPolicy {
            valid_after: 0,
            valid_until: 999_999,
            spending_limit: 100,
            spending_token: token_addr(),
            allowed_contract: zero_addr(),
        },
    );

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    // 3-element sig (session key format) passed to is_valid_signature
    let result = account.is_valid_signature(TX_HASH, array![session_kp.public_key, r, s]);
    // is_valid_signature delegates to OZ's _is_valid_signature which checks
    // against the OWNER's public key. A 3-element sig will fail the 2-element check.
    assert_eq!(result, 0);
}

// ===========================================================================
// SESSION KEY CAN'T DEPLOY CONTRACTS (owner-only operation, parity with declare)
// ===========================================================================

#[test]
fn test_validate_deploy_owner_succeeds() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let (addr, _, _) = deploy_agent_account(owner_kp.public_key);
    let deployer = IDeployerDispatcher { contract_address: addr };

    let (r, s) = owner_kp.sign(TX_HASH).unwrap();
    setup_owner_tx(addr, r, s);

    let result = deployer.__validate_deploy__(0x11111, 0x22222, owner_kp.public_key);
    assert_eq!(result, starknet::VALIDATED);

    stop_cheat_caller_address(addr);
    cleanup_cheats();
}

#[test]
#[should_panic(expected: 'Account: invalid signature')]
fn test_validate_deploy_session_key_panics() {
    // Session key 3-element signatures must not pass __validate_deploy__.
    // OZ's DeployableImpl calls validate_transaction() which only accepts
    // 2-element owner signatures.
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, _, agent) = deploy_agent_account(owner_kp.public_key);
    let deployer = IDeployerDispatcher { contract_address: addr };

    register_key(
        agent,
        addr,
        session_kp.public_key,
        SessionPolicy {
            valid_after: 0,
            valid_until: 999_999,
            spending_limit: 100,
            spending_token: token_addr(),
            allowed_contract: zero_addr(),
        },
    );

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    start_cheat_signature_global(array![session_kp.public_key, r, s].span());
    start_cheat_transaction_hash_global(TX_HASH);
    start_cheat_transaction_version_global(MIN_TX_VERSION);
    start_cheat_caller_address(addr, zero_addr());

    deployer.__validate_deploy__(0x11111, 0x22222, owner_kp.public_key);
}

// ===========================================================================
// VULNERABILITY REGRESSION: increase_allowance bypass (MEDIUM review finding)
// ===========================================================================

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_increase_allowance_bypass_is_blocked() {
    // ATTACK: session key calls increase_allowance(colluder, MAX) to raise
    // an existing approval without debiting the spending counter.
    // Before the fix, only transfer and approve were tracked.
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    // increase_allowance(colluder, 200) — exceeds limit of 100
    let calls = array![increase_allowance_call(token_addr(), 0xDEADBEEF, 200)];
    account.__execute__(calls); // MUST panic
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_increase_allowance_camel_bypass_is_blocked() {
    // Same attack but via the camelCase variant: increaseAllowance
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    let calls = array![increase_allowance_camel_call(token_addr(), 0xDEADBEEF, 200)];
    account.__execute__(calls); // MUST panic
}

#[test]
#[should_panic(expected: 'Spending limit exceeded')]
fn test_increase_allowance_cumulative_with_approve_and_transfer() {
    // increase_allowance(30) + approve(30) + transfer(50) = 110 > limit of 100
    // All three selector types must share the same cumulative counter.
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let (addr, account, agent) = deploy_agent_account(owner_kp.public_key);

    register_key(agent, addr, session_kp.public_key, spending_policy(100));

    let (r, s) = session_kp.sign(TX_HASH).unwrap();
    setup_session_key_tx(addr, session_kp.public_key, r, s);
    start_cheat_block_timestamp(addr, 100);

    let calls = array![
        increase_allowance_call(token_addr(), 0xAAA, 30),
        approve_call(token_addr(), 0xBBB, 30),
        transfer_call(token_addr(), 0xCCC, 50),
    ];
    account.__execute__(calls); // 30 + 30 + 50 = 110 > 100 → MUST panic
}

// ===========================================================================
// SELECTOR CONSTANT VERIFICATION
// ===========================================================================

#[test]
fn test_selector_constants_match_sn_keccak() {
    // Verify all hardcoded selector constants match their sn_keccak computation.
    // selector!() is a compile-time macro that computes sn_keccak.
    assert_eq!(TRANSFER_SELECTOR, selector!("transfer"), "TRANSFER_SELECTOR mismatch");
    assert_eq!(APPROVE_SELECTOR, selector!("approve"), "APPROVE_SELECTOR mismatch");
    assert_eq!(
        INCREASE_ALLOWANCE_SELECTOR,
        selector!("increase_allowance"),
        "INCREASE_ALLOWANCE_SELECTOR mismatch",
    );
    assert_eq!(
        INCREASE_ALLOWANCE_CAMEL_SELECTOR,
        selector!("increaseAllowance"),
        "INCREASE_ALLOWANCE_CAMEL_SELECTOR mismatch",
    );
}
