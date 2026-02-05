use agent_account::interfaces::{
    Call, IAgentAccountDispatcher, IAgentAccountDispatcherTrait, SessionPolicy,
};
use openzeppelin::account::interface::{
    IPublicKeyDispatcher, IPublicKeyDispatcherTrait, ISRC6_ID,
};
use openzeppelin::introspection::interface::{ISRC5Dispatcher, ISRC5DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    start_cheat_block_timestamp_global, stop_cheat_block_timestamp_global,
    start_cheat_transaction_version_global,
    start_cheat_signature_global, start_cheat_transaction_hash_global,
    stop_cheat_caller_address, stop_cheat_signature_global, stop_cheat_transaction_hash_global,
};
use snforge_std::signature::stark_curve::{StarkCurveKeyPairImpl, StarkCurveSignerImpl};
use starknet::{ClassHash, ContractAddress};

const SELECTOR_TRANSFER: felt252 =
    0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e;
const SELECTOR_TRANSFER_FROM: felt252 =
    0x41b033f4a31df8067c24d1e9b550a2ce75fd4a29e1147571aacb636ab7a21be;
const SELECTOR_APPROVE: felt252 =
    0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c;

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
    let contract = declare("AgentAccount").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![public_key]).unwrap();
    (IAgentAccountDispatcher { contract_address }, contract_address)
}

fn deploy_registry(owner_address: ContractAddress) -> ContractAddress {
    let contract = declare("MockRegistry").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![owner_address.into()]).unwrap();
    contract_address
}

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
fn test_set_spending_limit_updates_policy() {
    let (account, account_address) = deploy_account(0x123);
    let key: felt252 = 0xbeef;
    let policy = default_policy(token());

    start_cheat_caller_address(account_address, account_address);
    account.register_session_key(key, policy);
    account.set_spending_limit(
        token(),
        u256 { low: 5000, high: 0 },
        7200
    );
    stop_cheat_caller_address(account_address);

    let updated = account.get_session_key_policy(key);
    assert(
        updated.spending_limit == u256 { low: 5000, high: 0 },
        'Limit updated'
    );
    assert(updated.spending_period_secs == 7200, 'Period updated');
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
fn test_upgrade_schedule_and_cancel() {
    let (account, account_address) = deploy_account(0x123);
    let new_hash: ClassHash = 0x1234.try_into().unwrap();

    start_cheat_caller_address(account_address, account_address);
    account.schedule_upgrade(new_hash);
    let (pending, _, _, _) = account.get_upgrade_info();
    assert(pending == new_hash, 'Pending hash set');
    account.cancel_upgrade();
    let (pending_after, _, _, _) = account.get_upgrade_info();
    let zero: ClassHash = 0.try_into().unwrap();
    assert(pending_after == zero, 'Pending cleared');
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
fn test_session_key_approve_uses_correct_offset() {
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
    assert(result == 1, 'Approve validated');

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
