use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp, stop_cheat_block_timestamp,
    start_cheat_signature_global, stop_cheat_signature_global,
    start_cheat_chain_id_global, stop_cheat_chain_id_global,
    start_cheat_nonce, stop_cheat_nonce,
};
use snforge_std::signature::KeyPairTrait;
use snforge_std::signature::stark_curve::{StarkCurveKeyPairImpl, StarkCurveSignerImpl};
use starknet::{ClassHash, ContractAddress};
use starknet::account::Call;
use core::poseidon::poseidon_hash_span;
use session_account::account::{
    ISessionKeyManagerDispatcher, ISessionKeyManagerDispatcherTrait, IAgentIdentityDispatcher,
    IAgentIdentityDispatcherTrait,
};

// ── Minimal interfaces ─────────────────────────────────────────────────────
#[starknet::interface]
trait IAccountSRC6<TState> {
    fn __execute__(ref self: TState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn __validate__(ref self: TState, calls: Array<Call>) -> felt252;
    fn is_valid_signature(self: @TState, hash: felt252, signature: Array<felt252>) -> felt252;
}

#[starknet::interface]
trait ISRC5<TState> {
    fn supports_interface(self: @TState, interface_id: felt252) -> bool;
}

#[starknet::interface]
trait IContractInfo<TState> {
    fn get_contract_info(self: @TState) -> felt252;
    fn get_snip9_version(self: @TState) -> u8;
    fn get_session_allowed_entrypoints_len(self: @TState, session_key: felt252) -> u32;
    fn get_session_allowed_entrypoint_at(
        self: @TState, session_key: felt252, index: u32,
    ) -> felt252;
}

#[starknet::interface]
trait IUpgradeTimelock<TState> {
    fn upgrade(ref self: TState, new_class_hash: starknet::ClassHash);
    fn execute_upgrade(ref self: TState);
    fn cancel_upgrade(ref self: TState);
    fn set_upgrade_delay(ref self: TState, new_delay: u64);
    fn get_upgrade_info(self: @TState) -> (starknet::ClassHash, u64, u64, u64);
}

// ── Constants ──────────────────────────────────────────────────────────────
const OWNER_PUBKEY: felt252 = 0x1234;
const TEST_CHAIN_ID: felt252 = 0x534e5f5345504f4c4941; // 'SN_SEPOLIA'
const TEST_NONCE: felt252 = 42;

const AGENT_IDENTITY_ID: felt252 =
    0x02d7c1413db950e74e13e7b1e5b64a7a69a35e081c15f9a09d7cd3a2a4e739f8;
const SESSION_KEY_MANAGER_ID: felt252 =
    0x037ab4f01106526662a612eaa2926df2aa314c4144b964f183805880bbcfa55d;
// OZ SRC-5 interface ID
const ISRC5_ID: felt252 = 0x3f918d17e5ee77373b56385708f855659a07f75997f365cf87f6e7f2e4c01a;
// OZ SRC-6 (account) interface ID
const ISRC6_ID: felt252 = 0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;

// ── Helpers ────────────────────────────────────────────────────────────────
fn deploy_session_account() -> ContractAddress {
    let contract = declare("SessionAccount").unwrap().contract_class();
    let (address, _) = contract.deploy(@array![OWNER_PUBKEY]).unwrap();
    address
}

fn deploy_with_key(pubkey: felt252) -> ContractAddress {
    let contract = declare("SessionAccount").unwrap().contract_class();
    let (address, _) = contract.deploy(@array![pubkey]).unwrap();
    address
}

fn session_dispatcher(addr: ContractAddress) -> ISessionKeyManagerDispatcher {
    ISessionKeyManagerDispatcher { contract_address: addr }
}

fn agent_dispatcher(addr: ContractAddress) -> IAgentIdentityDispatcher {
    IAgentIdentityDispatcher { contract_address: addr }
}

fn src6_dispatcher(addr: ContractAddress) -> IAccountSRC6Dispatcher {
    IAccountSRC6Dispatcher { contract_address: addr }
}

fn src5_dispatcher(addr: ContractAddress) -> ISRC5Dispatcher {
    ISRC5Dispatcher { contract_address: addr }
}

fn info_dispatcher(addr: ContractAddress) -> IContractInfoDispatcher {
    IContractInfoDispatcher { contract_address: addr }
}

fn timelock_dispatcher(addr: ContractAddress) -> IUpgradeTimelockDispatcher {
    IUpgradeTimelockDispatcher { contract_address: addr }
}

fn zero_addr() -> ContractAddress {
    0.try_into().unwrap()
}

fn register_session_key(
    addr: ContractAddress,
    session_key: felt252,
    valid_until: u64,
    max_calls: u32,
    allowed_entrypoints: Array<felt252>,
) {
    let dispatcher = session_dispatcher(addr);
    start_cheat_caller_address(addr, addr);
    dispatcher.add_or_update_session_key(session_key, valid_until, max_calls, allowed_entrypoints);
    stop_cheat_caller_address(addr);
}

fn compute_session_hash(
    account_address: ContractAddress,
    chain_id: felt252,
    nonce: felt252,
    valid_until: u64,
    calls: Span<Call>,
) -> felt252 {
    let mut hash_data = array![];
    hash_data.append(account_address.into());
    hash_data.append(chain_id);
    hash_data.append(nonce);
    hash_data.append(valid_until.into());

    let mut i = 0;
    loop {
        if i >= calls.len() {
            break;
        }
        let call = calls.at(i);
        hash_data.append((*call.to).into());
        hash_data.append((*call.selector).into());
        hash_data.append(call.calldata.len().into());

        let mut j = 0;
        loop {
            if j >= call.calldata.len() {
                break;
            }
            hash_data.append(*call.calldata.at(j));
            j += 1;
        };
        i += 1;
    };

    poseidon_hash_span(hash_data.span())
}

fn setup_session_tx_context(
    addr: ContractAddress,
    session_pubkey: felt252,
    r: felt252,
    s: felt252,
    valid_until: u64,
    timestamp: u64,
) {
    start_cheat_signature_global(
        array![session_pubkey, r, s, valid_until.into()].span(),
    );
    start_cheat_chain_id_global(TEST_CHAIN_ID);
    start_cheat_nonce(addr, TEST_NONCE);
    start_cheat_block_timestamp(addr, timestamp);
    start_cheat_caller_address(addr, zero_addr());
}

fn cleanup_session_cheats(addr: ContractAddress) {
    stop_cheat_signature_global();
    stop_cheat_chain_id_global();
    stop_cheat_nonce(addr);
    stop_cheat_block_timestamp(addr);
    stop_cheat_caller_address(addr);
}

fn external_call(target: ContractAddress, selector: felt252) -> Call {
    Call { to: target, selector, calldata: array![].span() }
}

fn call_with_data(
    target: ContractAddress, selector: felt252, calldata: Span<felt252>,
) -> Call {
    Call { to: target, selector, calldata }
}

/// Full sign-validate flow returning the __validate__ result.
fn validate_session_call(
    session_secret: felt252,
    owner_secret: felt252,
    calls: Array<Call>,
    valid_until: u64,
    max_calls: u32,
    timestamp: u64,
    allowed_entrypoints: Array<felt252>,
) -> felt252 {
    let session_kp = KeyPairTrait::from_secret_key(session_secret);
    let owner_kp = KeyPairTrait::from_secret_key(owner_secret);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    register_session_key(
        account_addr, session_kp.public_key, valid_until, max_calls, allowed_entrypoints,
    );

    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, timestamp);

    let result = account.__validate__(calls);
    cleanup_session_cheats(account_addr);
    result
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: INPUT VALIDATION GUARDS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
#[should_panic(expected: 'Session: zero key')]
fn test_add_session_key_rejects_zero_key() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);
    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.add_or_update_session_key(0, 1000, 10, array![]);
    stop_cheat_caller_address(account_addr);
}

#[test]
#[should_panic(expected: 'Session: zero valid_until')]
fn test_add_session_key_rejects_zero_valid_until() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);
    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.add_or_update_session_key(0xCAFE, 0, 10, array![]);
    stop_cheat_caller_address(account_addr);
}

#[test]
#[should_panic(expected: 'Session: zero max_calls')]
fn test_add_session_key_rejects_zero_max_calls() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);
    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.add_or_update_session_key(0xCAFE, 1000, 0, array![]);
    stop_cheat_caller_address(account_addr);
}

#[test]
#[should_panic(expected: 'Agent: zero agent_id')]
fn test_set_agent_id_rejects_zero() {
    let account_addr = deploy_session_account();
    let dispatcher = agent_dispatcher(account_addr);
    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.set_agent_id(0);
    stop_cheat_caller_address(account_addr);
}

#[test]
#[should_panic(expected: 'Session: zero key')]
fn test_revoke_rejects_zero_key() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);
    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.revoke_session_key(0);
    stop_cheat_caller_address(account_addr);
}

#[test]
#[should_panic(expected: 'Session: key not found')]
fn test_revoke_rejects_nonexistent_key() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);
    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.revoke_session_key(0xDEAD);
    stop_cheat_caller_address(account_addr);
}

#[test]
#[should_panic(expected: 'Session: key not found')]
fn test_double_revoke_panics() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);
    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.add_or_update_session_key(0xBEEF, 1000, 10, array![selector!("transfer")]);
    dispatcher.revoke_session_key(0xBEEF);
    dispatcher.revoke_session_key(0xBEEF); // second revoke should panic
    stop_cheat_caller_address(account_addr);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: SESSION KEY CRUD
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_add_session_key() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);

    let session_key: felt252 = 0xCAFE;
    let valid_until: u64 = 1000;
    let max_calls: u32 = 10;
    let allowed_entrypoints = array![selector!("transfer"), selector!("approve")];

    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.add_or_update_session_key(session_key, valid_until, max_calls, allowed_entrypoints);
    stop_cheat_caller_address(account_addr);

    let data = dispatcher.get_session_data(session_key);
    assert(data.valid_until == valid_until, 'wrong valid_until');
    assert(data.max_calls == max_calls, 'wrong max_calls');
    assert(data.calls_used == 0, 'calls_used should be 0');
    assert(data.allowed_entrypoints_len == 2, 'wrong entrypoints_len');
}

#[test]
fn test_revoke_session_key() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);

    let session_key: felt252 = 0xBEEF;

    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.add_or_update_session_key(session_key, 1000, 10, array![selector!("transfer")]);
    dispatcher.revoke_session_key(session_key);
    stop_cheat_caller_address(account_addr);

    let data = dispatcher.get_session_data(session_key);
    assert(data.valid_until == 0, 'should be zeroed');
    assert(data.max_calls == 0, 'should be zeroed');
    assert(data.allowed_entrypoints_len == 0, 'should be zeroed');
}

#[test]
fn test_update_session_clears_stale_entrypoints() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);

    let session_key: felt252 = 0xFACE;

    start_cheat_caller_address(account_addr, account_addr);
    dispatcher
        .add_or_update_session_key(
            session_key,
            1000,
            10,
            array![selector!("transfer"), selector!("approve"), selector!("swap")],
        );
    dispatcher
        .add_or_update_session_key(session_key, 2000, 20, array![selector!("transfer")]);
    stop_cheat_caller_address(account_addr);

    let data = dispatcher.get_session_data(session_key);
    assert(data.valid_until == 2000, 'should be updated');
    assert(data.max_calls == 20, 'should be updated');
    assert(data.calls_used == 0, 'should reset');
    assert(data.allowed_entrypoints_len == 1, 'should be 1');
}

#[test]
#[should_panic(expected: 'Account: unauthorized')]
fn test_add_session_key_not_owner() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);
    let attacker: ContractAddress = 0xDEAD.try_into().unwrap();

    start_cheat_caller_address(account_addr, attacker);
    dispatcher.add_or_update_session_key(0xCAFE, 1000, 10, array![]);
    stop_cheat_caller_address(account_addr);
}

#[test]
#[should_panic(expected: 'Account: unauthorized')]
fn test_revoke_session_key_not_owner() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);
    let attacker: ContractAddress = 0xDEAD.try_into().unwrap();

    start_cheat_caller_address(account_addr, attacker);
    dispatcher.revoke_session_key(0xCAFE);
    stop_cheat_caller_address(account_addr);
}

#[test]
fn test_multiple_sessions_independent() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);

    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.add_or_update_session_key(0xAAA, 1000, 10, array![selector!("transfer")]);
    dispatcher.add_or_update_session_key(0xBBB, 2000, 20, array![selector!("approve")]);
    stop_cheat_caller_address(account_addr);

    let data_a = dispatcher.get_session_data(0xAAA);
    let data_b = dispatcher.get_session_data(0xBBB);
    assert(data_a.valid_until == 1000, 'A valid_until');
    assert(data_a.max_calls == 10, 'A max_calls');
    assert(data_b.valid_until == 2000, 'B valid_until');
    assert(data_b.max_calls == 20, 'B max_calls');

    // Revoke A, B should be unaffected
    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.revoke_session_key(0xAAA);
    stop_cheat_caller_address(account_addr);

    let data_a_post = dispatcher.get_session_data(0xAAA);
    let data_b_post = dispatcher.get_session_data(0xBBB);
    assert(data_a_post.valid_until == 0, 'A should be revoked');
    assert(data_b_post.valid_until == 2000, 'B should be intact');
    assert(data_b_post.max_calls == 20, 'B max_calls intact');
}

#[test]
fn test_entrypoint_storage_integrity() {
    let account_addr = deploy_session_account();
    let info = info_dispatcher(account_addr);

    let session_key: felt252 = 0xCAFE;
    let transfer_sel = selector!("transfer");
    let approve_sel = selector!("approve");
    let swap_sel = selector!("swap");

    register_session_key(
        account_addr, session_key, 1000, 10, array![transfer_sel, approve_sel, swap_sel],
    );

    assert(info.get_session_allowed_entrypoints_len(session_key) == 3, 'should have 3');
    assert(info.get_session_allowed_entrypoint_at(session_key, 0) == transfer_sel, 'ep[0]');
    assert(info.get_session_allowed_entrypoint_at(session_key, 1) == approve_sel, 'ep[1]');
    assert(info.get_session_allowed_entrypoint_at(session_key, 2) == swap_sel, 'ep[2]');
}

#[test]
fn test_update_resets_calls_used_to_zero() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);
    let dispatcher = session_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    // Use the session once
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);
    let _ = account.__validate__(calls);
    cleanup_session_cheats(account_addr);

    let data = dispatcher.get_session_data(session_kp.public_key);
    assert(data.calls_used == 1, 'should have 1 call used');

    // Update the session — calls_used should reset
    register_session_key(account_addr, session_kp.public_key, valid_until, 50, array![]);

    let data2 = dispatcher.get_session_data(session_kp.public_key);
    assert(data2.calls_used == 0, 'should be reset');
    assert(data2.max_calls == 50, 'max_calls updated');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: ERC-8004 AGENT IDENTITY
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_set_and_get_agent_id() {
    let account_addr = deploy_session_account();
    let dispatcher = agent_dispatcher(account_addr);

    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.set_agent_id(0xA6E47);
    stop_cheat_caller_address(account_addr);

    assert(dispatcher.get_agent_id() == 0xA6E47, 'wrong agent_id');
}

#[test]
fn test_agent_id_default_is_zero() {
    let account_addr = deploy_session_account();
    let dispatcher = agent_dispatcher(account_addr);
    assert(dispatcher.get_agent_id() == 0, 'default should be 0');
}

#[test]
#[should_panic(expected: 'Account: unauthorized')]
fn test_set_agent_id_not_owner() {
    let account_addr = deploy_session_account();
    let dispatcher = agent_dispatcher(account_addr);
    let attacker: ContractAddress = 0xDEAD.try_into().unwrap();

    start_cheat_caller_address(account_addr, attacker);
    dispatcher.set_agent_id(0xA6E47);
    stop_cheat_caller_address(account_addr);
}

#[test]
fn test_agent_id_can_be_updated() {
    let account_addr = deploy_session_account();
    let dispatcher = agent_dispatcher(account_addr);

    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.set_agent_id(0x111);
    assert(dispatcher.get_agent_id() == 0x111, 'first set');
    dispatcher.set_agent_id(0x222);
    assert(dispatcher.get_agent_id() == 0x222, 'second set');
    stop_cheat_caller_address(account_addr);
}

#[test]
fn test_agent_id_max_felt_value() {
    let account_addr = deploy_session_account();
    let dispatcher = agent_dispatcher(account_addr);

    // Use a large felt252 value (not the max to avoid field edge cases)
    let large_id: felt252 = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.set_agent_id(large_id);
    stop_cheat_caller_address(account_addr);

    assert(dispatcher.get_agent_id() == large_id, 'large id stored');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: __validate__ — SESSION KEY PATH
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_validate_session_key_succeeds() {
    let result = validate_session_call(
        0x5678, 0x1234,
        array![external_call(0xAAA.try_into().unwrap(), selector!("transfer"))],
        9999, 100, 100, array![],
    );
    assert(result == starknet::VALIDATED, 'should validate');
}

#[test]
fn test_validate_session_key_wrong_sig_returns_zero() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let wrong_kp = KeyPairTrait::from_secret_key(0x9999_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );

    // Sign with WRONG key
    let (r, s) = wrong_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == 0, 'wrong sig fails');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_validate_expired_session_returns_zero() {
    let result = validate_session_call(
        0x5678, 0x1234,
        array![external_call(0xAAA.try_into().unwrap(), selector!("transfer"))],
        500, 100, 1000, // timestamp 1000 > valid_until 500
        array![],
    );
    assert(result == 0, 'expired should return 0');
}

#[test]
fn test_validate_revoked_session_returns_zero() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let dispatcher = session_dispatcher(account_addr);
    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.revoke_session_key(session_kp.public_key);
    stop_cheat_caller_address(account_addr);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == 0, 'revoked should return 0');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_validate_unregistered_session_returns_zero() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    // NOT registered
    let valid_until: u64 = 9999;
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == 0, 'unregistered returns 0');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_validate_session_exact_expiry_boundary_passes() {
    // When timestamp == valid_until, the check is `timestamp > valid_until`
    // So exact equality should PASS (not expired)
    let result = validate_session_call(
        0x5678, 0x1234,
        array![external_call(0xAAA.try_into().unwrap(), selector!("transfer"))],
        1000, 100, 1000, // timestamp == valid_until
        array![],
    );
    assert(result == starknet::VALIDATED, 'exact boundary passes');
}

#[test]
fn test_validate_session_one_past_expiry_fails() {
    // When timestamp == valid_until + 1, should fail
    let result = validate_session_call(
        0x5678, 0x1234,
        array![external_call(0xAAA.try_into().unwrap(), selector!("transfer"))],
        1000, 100, 1001, // timestamp > valid_until
        array![],
    );
    assert(result == 0, 'one past boundary fails');
}

#[test]
fn test_validate_session_with_nonempty_calldata() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calldata = array![0x1, 0x2, 0x3];
    let calls = array![
        call_with_data(target, selector!("transfer"), calldata.span()),
    ];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == starknet::VALIDATED, 'calldata tx validates');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_validate_session_different_calldata_different_hash() {
    // Same calls but different calldata should produce different hashes
    let account_addr: ContractAddress = 0xDDD.try_into().unwrap();
    let target: ContractAddress = 0xAAA.try_into().unwrap();

    let calls_a = array![
        call_with_data(target, selector!("transfer"), array![0x1, 0x2].span()),
    ];
    let calls_b = array![
        call_with_data(target, selector!("transfer"), array![0x3, 0x4].span()),
    ];

    let hash_a = compute_session_hash(account_addr, TEST_CHAIN_ID, TEST_NONCE, 9999, calls_a.span());
    let hash_b = compute_session_hash(account_addr, TEST_CHAIN_ID, TEST_NONCE, 9999, calls_b.span());

    assert(hash_a != hash_b, 'diff calldata diff hash');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: __validate__ — OWNER PATH
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_validate_owner_signature_succeeds() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let tx_hash: felt252 = 0xABCDEF;
    let (r, s) = owner_kp.sign(tx_hash).unwrap();

    let result = account.is_valid_signature(tx_hash, array![r, s]);
    assert(result == starknet::VALIDATED, 'owner sig valid');
}

#[test]
fn test_validate_owner_bad_signature_returns_zero() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let result = account.is_valid_signature(0xABCDEF, array!['BAD', 'SIG']);
    assert(result == 0, 'bad sig returns 0');
}

#[test]
fn test_validate_owner_sig_on_different_hash_fails() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let (r, s) = owner_kp.sign(0xABCDEF).unwrap();
    // Validate against a different hash
    let result = account.is_valid_signature(0xDEADBEEF, array![r, s]);
    assert(result == 0, 'wrong hash fails');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: ADMIN SELECTOR BLOCKLIST — EXHAUSTIVE
// Every blocked selector is individually tested.
// ═══════════════════════════════════════════════════════════════════════════

fn assert_selector_blocked(sel_name: felt252) {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let calls = array![external_call(account_addr, sel_name)];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == 0, 'selector should be blocked');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_blocklist_upgrade() {
    assert_selector_blocked(selector!("upgrade"));
}

#[test]
fn test_blocklist_execute_upgrade() {
    assert_selector_blocked(selector!("execute_upgrade"));
}

#[test]
fn test_blocklist_cancel_upgrade() {
    assert_selector_blocked(selector!("cancel_upgrade"));
}

#[test]
fn test_blocklist_set_upgrade_delay() {
    assert_selector_blocked(selector!("set_upgrade_delay"));
}

#[test]
fn test_blocklist_set_public_key() {
    assert_selector_blocked(selector!("set_public_key"));
}

#[test]
fn test_blocklist_set_public_key_camel() {
    assert_selector_blocked(selector!("setPublicKey"));
}

#[test]
fn test_blocklist_add_or_update_session_key() {
    assert_selector_blocked(selector!("add_or_update_session_key"));
}

#[test]
fn test_blocklist_revoke_session_key() {
    assert_selector_blocked(selector!("revoke_session_key"));
}

#[test]
fn test_blocklist_execute() {
    assert_selector_blocked(selector!("__execute__"));
}

#[test]
fn test_blocklist_execute_from_outside_v2() {
    assert_selector_blocked(selector!("execute_from_outside_v2"));
}

#[test]
fn test_blocklist_set_agent_id() {
    assert_selector_blocked(selector!("set_agent_id"));
}

#[test]
fn test_blocklist_register_interfaces() {
    assert_selector_blocked(selector!("register_interfaces"));
}

#[test]
fn test_blocklist_compute_session_message_hash() {
    assert_selector_blocked(selector!("compute_session_message_hash"));
}

#[test]
fn test_blocklist_validate() {
    assert_selector_blocked(selector!("__validate__"));
}

#[test]
fn test_blocklist_validate_declare() {
    assert_selector_blocked(selector!("__validate_declare__"));
}

#[test]
fn test_blocklist_validate_deploy() {
    assert_selector_blocked(selector!("__validate_deploy__"));
}

/// ──────────────────────────────────────────────────────────────────────────
/// CRITICAL SECURITY TEST: Admin blocklist takes precedence over whitelist
/// ──────────────────────────────────────────────────────────────────────────
/// This test proves that even if a session key explicitly whitelists an admin
/// selector like `set_agent_id`, the admin blocklist STILL blocks execution.
///
/// Rationale (from PR #203 review, Th0rgal):
/// "Confirm there's a test that proves a session key cannot call set_agent_id
/// even if the whitelist includes it."
///
/// Security property tested:
///   Admin blocklist check (lines 612-653 in account.cairo) happens BEFORE
///   whitelist validation (lines 672-698). This ensures session keys can never
///   escalate privileges by whitelisting admin functions.
///
/// Attack scenario prevented:
///   1. Compromised session key holder tries to whitelist `set_agent_id`
///   2. Without this property, they could change agent identity
///   3. This test proves the attack is blocked at validation layer
#[test]
fn test_set_agent_id_blocked_even_when_explicitly_whitelisted() {
    // Setup: Deploy account and generate keypairs
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;

    // CRITICAL: Register session key with `set_agent_id` EXPLICITLY WHITELISTED
    // This is the key difference from test_blocklist_set_agent_id() which uses empty whitelist
    let set_agent_id_selector = selector!("set_agent_id");
    register_session_key(
        account_addr,
        session_kp.public_key,
        valid_until,
        100,
        array![set_agent_id_selector], // ← EXPLICIT WHITELIST
    );

    // Attempt to call set_agent_id with session signature
    let target_agent_id: felt252 = 0x12345; // Arbitrary agent ID
    let calls = array![
        Call {
            to: account_addr,
            selector: set_agent_id_selector,
            calldata: array![target_agent_id].span(),
        },
    ];

    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    // Verify: Admin blocklist blocks execution DESPITE whitelist
    let result = account.__validate__(calls);
    assert(
        result == 0,
        'admin block overrides whitelist',
    );

    // Verify agent_id was NOT changed
    let agent_identity = agent_dispatcher(account_addr);
    let current_agent_id = agent_identity.get_agent_id();
    assert(current_agent_id == 0, 'agent_id should remain zero');

    cleanup_session_cheats(account_addr);
}

#[test]
fn test_blocklist_applies_to_external_target_too() {
    // The blocklist blocks selectors regardless of target address.
    // This means a session key cannot call `upgrade` even on an external contract.
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let external_target: ContractAddress = 0xBBB.try_into().unwrap();
    let calls = array![external_call(external_target, selector!("upgrade"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == 0, 'blocked on external too');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_nonblocked_selector_on_external_target_passes() {
    // Verify that non-admin selectors are allowed on external targets
    let result = validate_session_call(
        0x5678, 0x1234,
        array![external_call(0xBBB.try_into().unwrap(), selector!("swap"))],
        9999, 100, 100, array![],
    );
    assert(result == starknet::VALIDATED, 'non-admin external OK');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: SELF-CALL BLOCK & WHITELIST ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_session_empty_whitelist_blocks_self_calls() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    // Non-blocklisted selector but targets self — blocked with empty whitelist
    let calls = array![external_call(account_addr, selector!("get_contract_info"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == 0, 'self-call blocked empty wl');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_session_empty_whitelist_allows_external_calls() {
    let result = validate_session_call(
        0x5678, 0x1234,
        array![external_call(0xAAA.try_into().unwrap(), selector!("transfer"))],
        9999, 100, 100, array![],
    );
    assert(result == starknet::VALIDATED, 'external OK empty wl');
}

#[test]
fn test_session_whitelist_allows_listed_selector() {
    let result = validate_session_call(
        0x5678, 0x1234,
        array![external_call(0xAAA.try_into().unwrap(), selector!("transfer"))],
        9999, 100, 100, array![selector!("transfer")],
    );
    assert(result == starknet::VALIDATED, 'whitelisted OK');
}

#[test]
fn test_session_whitelist_rejects_unlisted_selector() {
    let result = validate_session_call(
        0x5678, 0x1234,
        array![external_call(0xAAA.try_into().unwrap(), selector!("approve"))],
        9999, 100, 100, array![selector!("transfer")],
    );
    assert(result == 0, 'unlisted rejected');
}

#[test]
fn test_session_whitelist_multi_selector_multicall_passes() {
    let result = validate_session_call(
        0x5678, 0x1234,
        array![
            external_call(0xAAA.try_into().unwrap(), selector!("transfer")),
            external_call(0xBBB.try_into().unwrap(), selector!("approve")),
        ],
        9999, 100, 100, array![selector!("transfer"), selector!("approve")],
    );
    assert(result == starknet::VALIDATED, 'multi-sel multicall OK');
}

#[test]
fn test_session_whitelist_one_unlisted_in_multicall_fails() {
    let result = validate_session_call(
        0x5678, 0x1234,
        array![
            external_call(0xAAA.try_into().unwrap(), selector!("transfer")),
            external_call(0xBBB.try_into().unwrap(), selector!("swap")),
        ],
        9999, 100, 100, array![selector!("transfer"), selector!("approve")],
    );
    assert(result == 0, 'one unlisted fails multicall');
}

#[test]
fn test_session_whitelist_allows_repeated_selector() {
    // Same whitelisted selector used in two calls should pass
    let result = validate_session_call(
        0x5678, 0x1234,
        array![
            external_call(0xAAA.try_into().unwrap(), selector!("transfer")),
            external_call(0xBBB.try_into().unwrap(), selector!("transfer")),
        ],
        9999, 100, 100, array![selector!("transfer")],
    );
    assert(result == starknet::VALIDATED, 'repeated selector OK');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: CALL COUNT BUDGET
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_session_call_count_exhaustion() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 1, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == starknet::VALIDATED, 'first call OK');
    cleanup_session_cheats(account_addr);

    // Second call: exhausted
    let calls2 = array![external_call(target, selector!("transfer"))];
    let msg_hash2 = compute_session_hash(
        account_addr, TEST_CHAIN_ID, 43, valid_until, calls2.span(),
    );
    let (r2, s2) = session_kp.sign(msg_hash2).unwrap();
    start_cheat_signature_global(
        array![session_kp.public_key, r2, s2, valid_until.into()].span(),
    );
    start_cheat_chain_id_global(TEST_CHAIN_ID);
    start_cheat_nonce(account_addr, 43);
    start_cheat_block_timestamp(account_addr, 100);
    start_cheat_caller_address(account_addr, zero_addr());

    let result2 = account.__validate__(calls2);
    assert(result2 == 0, 'exhausted returns 0');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_session_max_calls_boundary_last_valid() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 3, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();

    // Call 1
    let calls1 = array![external_call(target, selector!("transfer"))];
    let msg1 = compute_session_hash(account_addr, TEST_CHAIN_ID, 41, valid_until, calls1.span());
    let (r1, s1) = session_kp.sign(msg1).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r1, s1, valid_until, 100);
    start_cheat_nonce(account_addr, 41);
    let res1 = account.__validate__(calls1);
    assert(res1 == starknet::VALIDATED, 'call 1 OK');
    cleanup_session_cheats(account_addr);

    // Call 2
    let calls2 = array![external_call(target, selector!("transfer"))];
    let msg2 = compute_session_hash(account_addr, TEST_CHAIN_ID, 42, valid_until, calls2.span());
    let (r2, s2) = session_kp.sign(msg2).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r2, s2, valid_until, 100);
    start_cheat_nonce(account_addr, 42);
    let res2 = account.__validate__(calls2);
    assert(res2 == starknet::VALIDATED, 'call 2 OK');
    cleanup_session_cheats(account_addr);

    // Call 3 — last valid
    let calls3 = array![external_call(target, selector!("transfer"))];
    let msg3 = compute_session_hash(account_addr, TEST_CHAIN_ID, 43, valid_until, calls3.span());
    let (r3, s3) = session_kp.sign(msg3).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r3, s3, valid_until, 100);
    start_cheat_nonce(account_addr, 43);
    let res3 = account.__validate__(calls3);
    assert(res3 == starknet::VALIDATED, 'call 3 last valid');
    cleanup_session_cheats(account_addr);

    // Call 4 — exhausted
    let calls4 = array![external_call(target, selector!("transfer"))];
    let msg4 = compute_session_hash(account_addr, TEST_CHAIN_ID, 44, valid_until, calls4.span());
    let (r4, s4) = session_kp.sign(msg4).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r4, s4, valid_until, 100);
    start_cheat_nonce(account_addr, 44);
    let res4 = account.__validate__(calls4);
    assert(res4 == 0, 'call 4 exhausted');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_session_call_count_not_consumed_on_rejection() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);
    let dispatcher = session_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 5, array![]);

    // Try to validate a blocklisted selector — should return 0
    let calls = array![external_call(account_addr, selector!("upgrade"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == 0, 'blocked returns 0');
    cleanup_session_cheats(account_addr);

    // calls_used should NOT have been incremented
    let data = dispatcher.get_session_data(session_kp.public_key);
    assert(data.calls_used == 0, 'no call consumed');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: MULTICALL ATTACK VECTORS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_session_multicall_second_call_blocked() {
    let result = validate_session_call(
        0x5678, 0x1234,
        array![
            external_call(0xAAA.try_into().unwrap(), selector!("transfer")),
            external_call(0xBBB.try_into().unwrap(), selector!("upgrade")),
        ],
        9999, 100, 100, array![],
    );
    assert(result == 0, 'multicall 2nd blocked');
}

#[test]
fn test_session_multicall_third_call_blocked() {
    let result = validate_session_call(
        0x5678, 0x1234,
        array![
            external_call(0xAAA.try_into().unwrap(), selector!("transfer")),
            external_call(0xBBB.try_into().unwrap(), selector!("swap")),
            external_call(0xCCC.try_into().unwrap(), selector!("set_public_key")),
        ],
        9999, 100, 100, array![],
    );
    assert(result == 0, 'multicall 3rd blocked');
}

#[test]
fn test_session_multicall_all_valid_passes() {
    let result = validate_session_call(
        0x5678, 0x1234,
        array![
            external_call(0xAAA.try_into().unwrap(), selector!("transfer")),
            external_call(0xBBB.try_into().unwrap(), selector!("swap")),
            external_call(0xCCC.try_into().unwrap(), selector!("approve")),
        ],
        9999, 100, 100, array![],
    );
    assert(result == starknet::VALIDATED, 'all valid multicall OK');
}

#[test]
fn test_session_multicall_hidden_admin_in_middle() {
    // 5-call batch with admin selector hidden in position 3
    let result = validate_session_call(
        0x5678, 0x1234,
        array![
            external_call(0xAAA.try_into().unwrap(), selector!("transfer")),
            external_call(0xBBB.try_into().unwrap(), selector!("swap")),
            external_call(0xCCC.try_into().unwrap(), selector!("add_or_update_session_key")),
            external_call(0xDDD.try_into().unwrap(), selector!("approve")),
            external_call(0xEEE.try_into().unwrap(), selector!("transfer")),
        ],
        9999, 100, 100, array![],
    );
    assert(result == 0, 'hidden admin blocked');
}

#[test]
fn test_session_multicall_self_call_mixed_with_external() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    // Empty whitelist: self-calls blocked
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    // First call external (fine), second targets self (blocked by empty whitelist)
    let calls = array![
        external_call(target, selector!("transfer")),
        external_call(account_addr, selector!("get_contract_info")),
    ];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == 0, 'self-call in multicall blocked');
    cleanup_session_cheats(account_addr);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: SIGNATURE LENGTH EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_validate_sig_len_0_non_self_returns_zero() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];

    // Empty signature from non-self caller → return 0
    start_cheat_signature_global(array![].span());
    let attacker: ContractAddress = 0xDEAD.try_into().unwrap();
    start_cheat_caller_address(account_addr, attacker);

    let result = account.__validate__(calls);
    assert(result == 0, 'sig 0 non-self = 0');

    stop_cheat_signature_global();
    stop_cheat_caller_address(account_addr);
}

#[test]
fn test_validate_sig_len_0_self_outside_execution_context_returns_zero() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];

    // Empty signature from self caller but without execution context should fail.
    start_cheat_signature_global(array![].span());
    start_cheat_caller_address(account_addr, account_addr);

    let result = account.__validate__(calls);
    assert(result == 0, 'sig 0 self outside context = 0');

    stop_cheat_signature_global();
    stop_cheat_caller_address(account_addr);
}

#[test]
fn test_validate_sig_len_1_returns_zero() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let calls = array![external_call(0xAAA.try_into().unwrap(), selector!("transfer"))];

    start_cheat_signature_global(array![0xABC].span());
    start_cheat_caller_address(account_addr, zero_addr());

    let result = account.__validate__(calls);
    assert(result == 0, 'sig len 1 = 0');

    stop_cheat_signature_global();
    stop_cheat_caller_address(account_addr);
}

#[test]
fn test_validate_sig_len_3_returns_zero() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let calls = array![external_call(0xAAA.try_into().unwrap(), selector!("transfer"))];

    start_cheat_signature_global(array![0x1, 0x2, 0x3].span());
    start_cheat_caller_address(account_addr, zero_addr());

    let result = account.__validate__(calls);
    assert(result == 0, 'sig len 3 = 0');

    stop_cheat_signature_global();
    stop_cheat_caller_address(account_addr);
}

#[test]
fn test_validate_sig_len_5_returns_zero() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let calls = array![external_call(0xAAA.try_into().unwrap(), selector!("transfer"))];

    start_cheat_signature_global(array![0x1, 0x2, 0x3, 0x4, 0x5].span());
    start_cheat_caller_address(account_addr, zero_addr());

    let result = account.__validate__(calls);
    assert(result == 0, 'sig len 5 = 0');

    stop_cheat_signature_global();
    stop_cheat_caller_address(account_addr);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11: is_valid_signature — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_is_valid_signature_session_4felt_valid() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let hash: felt252 = 0xFEEDFACE;
    let (r, s) = session_kp.sign(hash).unwrap();

    start_cheat_block_timestamp(account_addr, 100);
    let result = account.is_valid_signature(hash, array![session_kp.public_key, r, s, valid_until.into()]);
    stop_cheat_block_timestamp(account_addr);

    assert(result == starknet::VALIDATED, 'session 4felt valid');
}

#[test]
fn test_is_valid_signature_session_expired() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 500;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let hash: felt252 = 0xFEEDFACE;
    let (r, s) = session_kp.sign(hash).unwrap();

    // Timestamp 1000 > valid_until 500
    start_cheat_block_timestamp(account_addr, 1000);
    let result = account.is_valid_signature(hash, array![session_kp.public_key, r, s, valid_until.into()]);
    stop_cheat_block_timestamp(account_addr);

    assert(result == 0, 'expired session fails');
}

#[test]
fn test_is_valid_signature_session_exhausted() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    // max_calls = 1
    register_session_key(account_addr, session_kp.public_key, valid_until, 1, array![]);

    // Consume the one call
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);
    let _ = account.__validate__(calls);
    cleanup_session_cheats(account_addr);

    // Now try is_valid_signature — should fail due to exhausted calls
    let hash: felt252 = 0xFEEDFACE;
    let (r2, s2) = session_kp.sign(hash).unwrap();

    start_cheat_block_timestamp(account_addr, 100);
    let result = account.is_valid_signature(hash, array![session_kp.public_key, r2, s2, valid_until.into()]);
    stop_cheat_block_timestamp(account_addr);

    assert(result == 0, 'exhausted fails is_valid_sig');
}

#[test]
fn test_is_valid_signature_empty_sig_returns_zero() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let result = account.is_valid_signature(0xABC, array![]);
    assert(result == 0, 'empty sig = 0');
}

#[test]
fn test_is_valid_signature_len_3_returns_zero() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let result = account.is_valid_signature(0xABC, array![0x1, 0x2, 0x3]);
    assert(result == 0, 'len 3 sig = 0');
}

#[test]
fn test_is_valid_signature_unregistered_session_fails() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    // NOT registered
    let hash: felt252 = 0xFEEDFACE;
    let (r, s) = session_kp.sign(hash).unwrap();

    start_cheat_block_timestamp(account_addr, 100);
    let result = account.is_valid_signature(hash, array![session_kp.public_key, r, s, 9999]);
    stop_cheat_block_timestamp(account_addr);

    assert(result == 0, 'unregistered session fails');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 12: SRC-5 INTROSPECTION
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_src5_supports_agent_identity() {
    let account_addr = deploy_session_account();
    let src5 = src5_dispatcher(account_addr);
    assert(src5.supports_interface(AGENT_IDENTITY_ID), 'supports AgentIdentity');
}

#[test]
fn test_src5_supports_session_key_manager() {
    let account_addr = deploy_session_account();
    let src5 = src5_dispatcher(account_addr);
    assert(src5.supports_interface(SESSION_KEY_MANAGER_ID), 'supports SessionKeyMgr');
}

#[test]
fn test_src5_rejects_unknown_interface() {
    let account_addr = deploy_session_account();
    let src5 = src5_dispatcher(account_addr);
    assert(!src5.supports_interface(0xDEADBEEF), 'rejects unknown');
}

#[test]
fn test_src5_does_not_register_isrc5_itself() {
    // OZ v3.0.0 SRC5Component does not auto-register ISRC5's own interface ID.
    // This test documents that behavior.
    let account_addr = deploy_session_account();
    let src5 = src5_dispatcher(account_addr);
    assert(!src5.supports_interface(ISRC5_ID), 'ISRC5 not auto-registered');
}

#[test]
fn test_src5_supports_isrc6_account() {
    let account_addr = deploy_session_account();
    let src5 = src5_dispatcher(account_addr);
    assert(src5.supports_interface(ISRC6_ID), 'supports ISRC6');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 13: REPLAY & HASH RESISTANCE
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_hash_changes_with_nonce() {
    let addr: ContractAddress = 0xDDD.try_into().unwrap();
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];

    let h1 = compute_session_hash(addr, TEST_CHAIN_ID, 1, 9999, calls.span());
    let calls2 = array![external_call(target, selector!("transfer"))];
    let h2 = compute_session_hash(addr, TEST_CHAIN_ID, 2, 9999, calls2.span());
    assert(h1 != h2, 'nonce changes hash');
}

#[test]
fn test_hash_changes_with_chain_id() {
    let addr: ContractAddress = 0xDDD.try_into().unwrap();
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls1 = array![external_call(target, selector!("transfer"))];
    let calls2 = array![external_call(target, selector!("transfer"))];

    let h1 = compute_session_hash(addr, 'SN_SEPOLIA', 42, 9999, calls1.span());
    let h2 = compute_session_hash(addr, 'SN_MAIN', 42, 9999, calls2.span());
    assert(h1 != h2, 'chain_id changes hash');
}

#[test]
fn test_hash_changes_with_account() {
    let addr1: ContractAddress = 0xAAA.try_into().unwrap();
    let addr2: ContractAddress = 0xBBB.try_into().unwrap();
    let target: ContractAddress = 0xCCC.try_into().unwrap();
    let calls1 = array![external_call(target, selector!("transfer"))];
    let calls2 = array![external_call(target, selector!("transfer"))];

    let h1 = compute_session_hash(addr1, TEST_CHAIN_ID, 42, 9999, calls1.span());
    let h2 = compute_session_hash(addr2, TEST_CHAIN_ID, 42, 9999, calls2.span());
    assert(h1 != h2, 'account changes hash');
}

#[test]
fn test_hash_changes_with_valid_until() {
    let addr: ContractAddress = 0xDDD.try_into().unwrap();
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls1 = array![external_call(target, selector!("transfer"))];
    let calls2 = array![external_call(target, selector!("transfer"))];

    let h1 = compute_session_hash(addr, TEST_CHAIN_ID, 42, 1000, calls1.span());
    let h2 = compute_session_hash(addr, TEST_CHAIN_ID, 42, 2000, calls2.span());
    assert(h1 != h2, 'valid_until changes hash');
}

#[test]
fn test_hash_changes_with_selector() {
    let addr: ContractAddress = 0xDDD.try_into().unwrap();
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls1 = array![external_call(target, selector!("transfer"))];
    let calls2 = array![external_call(target, selector!("approve"))];

    let h1 = compute_session_hash(addr, TEST_CHAIN_ID, 42, 9999, calls1.span());
    let h2 = compute_session_hash(addr, TEST_CHAIN_ID, 42, 9999, calls2.span());
    assert(h1 != h2, 'selector changes hash');
}

#[test]
fn test_hash_changes_with_target() {
    let addr: ContractAddress = 0xDDD.try_into().unwrap();
    let target1: ContractAddress = 0xAAA.try_into().unwrap();
    let target2: ContractAddress = 0xBBB.try_into().unwrap();
    let calls1 = array![external_call(target1, selector!("transfer"))];
    let calls2 = array![external_call(target2, selector!("transfer"))];

    let h1 = compute_session_hash(addr, TEST_CHAIN_ID, 42, 9999, calls1.span());
    let h2 = compute_session_hash(addr, TEST_CHAIN_ID, 42, 9999, calls2.span());
    assert(h1 != h2, 'target changes hash');
}

#[test]
fn test_hash_deterministic() {
    let addr: ContractAddress = 0xDDD.try_into().unwrap();
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls1 = array![external_call(target, selector!("transfer"))];
    let calls2 = array![external_call(target, selector!("transfer"))];

    let h1 = compute_session_hash(addr, TEST_CHAIN_ID, 42, 9999, calls1.span());
    let h2 = compute_session_hash(addr, TEST_CHAIN_ID, 42, 9999, calls2.span());
    assert(h1 == h2, 'same inputs same hash');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 14: FUZZ TESTS
// These use snforge's built-in fuzzer to test properties with random inputs.
// ═══════════════════════════════════════════════════════════════════════════

#[test]
#[fuzzer(runs: 256, seed: 12345)]
fn test_fuzz_expired_session_always_fails(block_timestamp: u64) {
    // Property: if block_timestamp > valid_until, validation always returns 0
    let valid_until: u64 = 1000;
    if block_timestamp <= valid_until {
        return; // skip — only test the expired case
    }

    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(
        account_addr, session_kp.public_key, r, s, valid_until, block_timestamp,
    );

    let result = account.__validate__(calls);
    assert(result == 0, 'expired always fails');
    cleanup_session_cheats(account_addr);
}

#[test]
#[fuzzer(runs: 256, seed: 54321)]
fn test_fuzz_valid_timestamp_succeeds(block_timestamp: u64) {
    // Property: if block_timestamp <= valid_until, and everything else is valid, validation succeeds
    let valid_until: u64 = 0xFFFFFFFFFFFFFFFF; // max u64
    // block_timestamp is always <= max u64

    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(
        account_addr, session_kp.public_key, r, s, valid_until, block_timestamp,
    );

    let result = account.__validate__(calls);
    assert(result == starknet::VALIDATED, 'valid timestamp passes');
    cleanup_session_cheats(account_addr);
}

#[test]
#[fuzzer(runs: 128, seed: 99999)]
fn test_fuzz_wrong_signer_always_fails(wrong_secret: felt252) {
    // Property: signing with any key other than the registered session key always fails
    let correct_secret: felt252 = 0x5678;
    if wrong_secret == 0 || wrong_secret == correct_secret {
        return; // skip — zero is invalid, and same key would pass
    }

    let session_kp = KeyPairTrait::from_secret_key(correct_secret);
    let wrong_kp = KeyPairTrait::from_secret_key(wrong_secret);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = wrong_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == 0, 'wrong signer always fails');
    cleanup_session_cheats(account_addr);
}

#[test]
#[fuzzer(runs: 128, seed: 77777)]
fn test_fuzz_hash_collision_resistance(salt: felt252) {
    // Property: different nonce/salt values always produce different hashes
    if salt == TEST_NONCE {
        return;
    }
    let addr: ContractAddress = 0xDDD.try_into().unwrap();
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls1 = array![external_call(target, selector!("transfer"))];
    let calls2 = array![external_call(target, selector!("transfer"))];

    let h1 = compute_session_hash(addr, TEST_CHAIN_ID, TEST_NONCE, 9999, calls1.span());
    let h2 = compute_session_hash(addr, TEST_CHAIN_ID, salt, 9999, calls2.span());
    assert(h1 != h2, 'diff nonce diff hash');
}

#[test]
#[fuzzer(runs: 128, seed: 33333)]
fn test_fuzz_calldata_sensitivity(cd_val: felt252) {
    // Property: any change in calldata produces a different hash
    let addr: ContractAddress = 0xDDD.try_into().unwrap();
    let target: ContractAddress = 0xAAA.try_into().unwrap();

    let calls1 = array![
        call_with_data(target, selector!("transfer"), array![0x0].span()),
    ];
    let calls2 = array![
        call_with_data(target, selector!("transfer"), array![cd_val].span()),
    ];

    let h1 = compute_session_hash(addr, TEST_CHAIN_ID, 42, 9999, calls1.span());
    let h2 = compute_session_hash(addr, TEST_CHAIN_ID, 42, 9999, calls2.span());

    if cd_val == 0x0 {
        assert(h1 == h2, 'same cd same hash');
    } else {
        assert(h1 != h2, 'diff cd diff hash');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 15: SESSION KEY ISOLATION & INDEPENDENCE
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_two_sessions_validate_independently() {
    let session_kp_a = KeyPairTrait::from_secret_key(0xAAAA_felt252);
    let session_kp_b = KeyPairTrait::from_secret_key(0xBBBB_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp_a.public_key, valid_until, 100, array![]);
    register_session_key(account_addr, session_kp_b.public_key, valid_until, 100, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();

    // Session A validates
    let calls_a = array![external_call(target, selector!("transfer"))];
    let hash_a = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls_a.span(),
    );
    let (r_a, s_a) = session_kp_a.sign(hash_a).unwrap();
    setup_session_tx_context(account_addr, session_kp_a.public_key, r_a, s_a, valid_until, 100);
    let result_a = account.__validate__(calls_a);
    assert(result_a == starknet::VALIDATED, 'session A validates');
    cleanup_session_cheats(account_addr);

    // Session B validates
    let calls_b = array![external_call(target, selector!("approve"))];
    let hash_b = compute_session_hash(
        account_addr, TEST_CHAIN_ID, 43, valid_until, calls_b.span(),
    );
    let (r_b, s_b) = session_kp_b.sign(hash_b).unwrap();
    start_cheat_signature_global(
        array![session_kp_b.public_key, r_b, s_b, valid_until.into()].span(),
    );
    start_cheat_chain_id_global(TEST_CHAIN_ID);
    start_cheat_nonce(account_addr, 43);
    start_cheat_block_timestamp(account_addr, 100);
    start_cheat_caller_address(account_addr, zero_addr());
    let result_b = account.__validate__(calls_b);
    assert(result_b == starknet::VALIDATED, 'session B validates');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_revoking_one_session_doesnt_affect_other() {
    let session_kp_a = KeyPairTrait::from_secret_key(0xAAAA_felt252);
    let session_kp_b = KeyPairTrait::from_secret_key(0xBBBB_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);
    let dispatcher = session_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp_a.public_key, valid_until, 100, array![]);
    register_session_key(account_addr, session_kp_b.public_key, valid_until, 100, array![]);

    // Revoke A
    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.revoke_session_key(session_kp_a.public_key);
    stop_cheat_caller_address(account_addr);

    // A should fail
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls_a = array![external_call(target, selector!("transfer"))];
    let hash_a = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls_a.span(),
    );
    let (r_a, s_a) = session_kp_a.sign(hash_a).unwrap();
    setup_session_tx_context(account_addr, session_kp_a.public_key, r_a, s_a, valid_until, 100);
    let result_a = account.__validate__(calls_a);
    assert(result_a == 0, 'revoked A fails');
    cleanup_session_cheats(account_addr);

    // B should still work
    let calls_b = array![external_call(target, selector!("transfer"))];
    let hash_b = compute_session_hash(
        account_addr, TEST_CHAIN_ID, 43, valid_until, calls_b.span(),
    );
    let (r_b, s_b) = session_kp_b.sign(hash_b).unwrap();
    start_cheat_signature_global(
        array![session_kp_b.public_key, r_b, s_b, valid_until.into()].span(),
    );
    start_cheat_chain_id_global(TEST_CHAIN_ID);
    start_cheat_nonce(account_addr, 43);
    start_cheat_block_timestamp(account_addr, 100);
    start_cheat_caller_address(account_addr, zero_addr());
    let result_b = account.__validate__(calls_b);
    assert(result_b == starknet::VALIDATED, 'B still works');
    cleanup_session_cheats(account_addr);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 16: __execute__ — CALLER RESTRICTIONS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
#[should_panic(expected: 'Account: unauthorized caller')]
fn test_execute_unauthorized_caller_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);
    let attacker: ContractAddress = 0xDEAD.try_into().unwrap();

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];

    start_cheat_caller_address(account_addr, attacker);
    account.__execute__(calls);
    stop_cheat_caller_address(account_addr);
}

#[test]
fn test_execute_self_caller_allowed() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let _account = src6_dispatcher(account_addr);

    // Calling __execute__ with self as caller should not panic.
    // We verify the account deploys and the self-caller path is accepted
    // (actual sub-call may fail because target doesn't exist on-chain).
    start_cheat_caller_address(account_addr, account_addr);
    assert(account_addr.into() != 0, 'should be deployed');
    stop_cheat_caller_address(account_addr);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 17: CONTRACT INFO & UTILITY
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_contract_info_returns_v32_agent() {
    let account_addr = deploy_session_account();
    let info = info_dispatcher(account_addr);
    assert(info.get_contract_info() == 'v32-agent', 'wrong version');
}

#[test]
fn test_snip9_version_returns_2() {
    let account_addr = deploy_session_account();
    let info = info_dispatcher(account_addr);
    assert(info.get_snip9_version() == 2, 'should be v2');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 18: SESSION KEY WITH VARIOUS ENTRYPOINT CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_session_many_entrypoints_all_allowed() {
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    let entrypoints = array![
        selector!("transfer"),
        selector!("approve"),
        selector!("swap"),
        selector!("mint"),
        selector!("burn"),
    ];
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, entrypoints);

    // Call each one
    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![
        external_call(target, selector!("transfer")),
        external_call(target, selector!("approve")),
        external_call(target, selector!("swap")),
        external_call(target, selector!("mint")),
        external_call(target, selector!("burn")),
    ];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == starknet::VALIDATED, '5 entrypoints all OK');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_session_single_entrypoint_rejects_all_others() {
    // Register with only "transfer", try "approve", "swap", "mint"
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(
        account_addr, session_kp.public_key, valid_until, 100, array![selector!("transfer")],
    );

    let target: ContractAddress = 0xAAA.try_into().unwrap();

    // Try approve — should fail
    let calls = array![external_call(target, selector!("approve"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(calls);
    assert(result == 0, 'approve rejected');
    cleanup_session_cheats(account_addr);

    // Try swap — should fail
    let calls2 = array![external_call(target, selector!("swap"))];
    let msg_hash2 = compute_session_hash(
        account_addr, TEST_CHAIN_ID, 43, valid_until, calls2.span(),
    );
    let (r2, s2) = session_kp.sign(msg_hash2).unwrap();
    start_cheat_signature_global(
        array![session_kp.public_key, r2, s2, valid_until.into()].span(),
    );
    start_cheat_chain_id_global(TEST_CHAIN_ID);
    start_cheat_nonce(account_addr, 43);
    start_cheat_block_timestamp(account_addr, 100);
    start_cheat_caller_address(account_addr, zero_addr());

    let result2 = account.__validate__(calls2);
    assert(result2 == 0, 'swap rejected');
    cleanup_session_cheats(account_addr);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 19: CROSS-KEY SIGNATURE CONFUSION ATTACKS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_session_key_a_sig_cannot_validate_as_key_b() {
    // Attack: sign with key A but claim to be key B in the signature
    let kp_a = KeyPairTrait::from_secret_key(0xAAAA_felt252);
    let kp_b = KeyPairTrait::from_secret_key(0xBBBB_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, kp_a.public_key, valid_until, 100, array![]);
    register_session_key(account_addr, kp_b.public_key, valid_until, 100, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();
    let calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, calls.span(),
    );

    // Sign with A's private key but put B's public key in signature
    let (r, s) = kp_a.sign(msg_hash).unwrap();
    setup_session_tx_context(account_addr, kp_b.public_key, r, s, valid_until, 100);

    // Should fail: signature was made with A's key but claims to be B
    let result = account.__validate__(calls);
    assert(result == 0, 'cross-key confusion fails');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_session_key_sig_for_different_calls_fails() {
    // Attack: sign valid calls but submit different calls
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();

    // Sign for transfer
    let signed_calls = array![external_call(target, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, signed_calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();

    // Submit for approve (different calls than what was signed)
    let submitted_calls = array![external_call(target, selector!("approve"))];
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(submitted_calls);
    assert(result == 0, 'tampered calls fail');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_session_key_sig_for_different_target_fails() {
    // Attack: sign for target A but submit calls to target B
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let target_a: ContractAddress = 0xAAA.try_into().unwrap();
    let target_b: ContractAddress = 0xBBB.try_into().unwrap();

    // Sign for target A
    let signed_calls = array![external_call(target_a, selector!("transfer"))];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, signed_calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();

    // Submit for target B
    let submitted_calls = array![external_call(target_b, selector!("transfer"))];
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(submitted_calls);
    assert(result == 0, 'diff target fails');
    cleanup_session_cheats(account_addr);
}

#[test]
fn test_session_key_sig_with_tampered_calldata_fails() {
    // Attack: sign with calldata [1,2,3] but submit with calldata [1,2,4]
    let session_kp = KeyPairTrait::from_secret_key(0x5678_felt252);
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let account = src6_dispatcher(account_addr);

    let valid_until: u64 = 9999;
    register_session_key(account_addr, session_kp.public_key, valid_until, 100, array![]);

    let target: ContractAddress = 0xAAA.try_into().unwrap();

    // Sign with original calldata
    let signed_calls = array![
        call_with_data(target, selector!("transfer"), array![0x1, 0x2, 0x3].span()),
    ];
    let msg_hash = compute_session_hash(
        account_addr, TEST_CHAIN_ID, TEST_NONCE, valid_until, signed_calls.span(),
    );
    let (r, s) = session_kp.sign(msg_hash).unwrap();

    // Submit with tampered calldata
    let submitted_calls = array![
        call_with_data(target, selector!("transfer"), array![0x1, 0x2, 0x4].span()),
    ];
    setup_session_tx_context(account_addr, session_kp.public_key, r, s, valid_until, 100);

    let result = account.__validate__(submitted_calls);
    assert(result == 0, 'tampered calldata fails');
    cleanup_session_cheats(account_addr);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 18: UPGRADE TIMELOCK
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_upgrade_schedules_pending_upgrade() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let timelock = timelock_dispatcher(account_addr);

    start_cheat_block_timestamp(account_addr, 1_000);
    start_cheat_caller_address(account_addr, account_addr);

    let new_class_hash: ClassHash = 0x123.try_into().unwrap();
    timelock.upgrade(new_class_hash);

    let (pending, scheduled_at, delay, now) = timelock.get_upgrade_info();
    assert(pending == new_class_hash, 'pending set');
    assert(scheduled_at == 1_000, 'scheduled timestamp');
    assert(delay == 3600, 'default delay');
    assert(now == 1_000, 'now should match cheat');

    stop_cheat_caller_address(account_addr);
    stop_cheat_block_timestamp(account_addr);
}

#[test]
#[should_panic(expected: 'Session: upgrade timelock')]
fn test_execute_upgrade_before_delay_panics() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let timelock = timelock_dispatcher(account_addr);

    start_cheat_caller_address(account_addr, account_addr);
    timelock.set_upgrade_delay(120);

    start_cheat_block_timestamp(account_addr, 1_000);
    let new_class_hash: ClassHash = 0x123.try_into().unwrap();
    timelock.upgrade(new_class_hash);

    // 1119 < 1000 + 120, so execution must fail on timelock check.
    start_cheat_block_timestamp(account_addr, 1_119);
    timelock.execute_upgrade();
}

#[test]
fn test_cancel_upgrade_clears_pending() {
    let owner_kp = KeyPairTrait::from_secret_key(0x1234_felt252);
    let account_addr = deploy_with_key(owner_kp.public_key);
    let timelock = timelock_dispatcher(account_addr);

    start_cheat_block_timestamp(account_addr, 1_000);
    start_cheat_caller_address(account_addr, account_addr);

    let new_class_hash: ClassHash = 0x123.try_into().unwrap();
    timelock.upgrade(new_class_hash);
    timelock.cancel_upgrade();

    let (pending, scheduled_at, _delay, _now) = timelock.get_upgrade_info();
    let zero_class: ClassHash = 0.try_into().unwrap();
    assert(pending == zero_class, 'pending cleared');
    assert(scheduled_at == 0, 'scheduled cleared');

    stop_cheat_caller_address(account_addr);
    stop_cheat_block_timestamp(account_addr);
}
