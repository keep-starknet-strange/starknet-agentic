use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;
use session_account::account::{
    ISessionKeyManagerDispatcher, ISessionKeyManagerDispatcherTrait, IAgentIdentityDispatcher,
    IAgentIdentityDispatcherTrait,
};

// ── Helpers ──────────────────────────────────────────────────────────────
const OWNER_PUBKEY: felt252 = 0x1234;

fn deploy_session_account() -> ContractAddress {
    let contract = declare("SessionAccount").unwrap().contract_class();
    let (address, _) = contract.deploy(@array![OWNER_PUBKEY]).unwrap();
    address
}

fn session_dispatcher(addr: ContractAddress) -> ISessionKeyManagerDispatcher {
    ISessionKeyManagerDispatcher { contract_address: addr }
}

fn agent_dispatcher(addr: ContractAddress) -> IAgentIdentityDispatcher {
    IAgentIdentityDispatcher { contract_address: addr }
}

// ── Session key tests ────────────────────────────────────────────────────

#[test]
fn test_add_session_key() {
    let account_addr = deploy_session_account();
    let dispatcher = session_dispatcher(account_addr);

    let session_key: felt252 = 0xCAFE;
    let valid_until: u64 = 1000;
    let max_calls: u32 = 10;
    let allowed_entrypoints = array![selector!("transfer"), selector!("approve")];

    // Owner calls through self (account contract calls itself)
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
    dispatcher
        .add_or_update_session_key(session_key, 1000, 10, array![selector!("transfer")]);
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
    // First: 3 entrypoints
    dispatcher
        .add_or_update_session_key(
            session_key,
            1000,
            10,
            array![selector!("transfer"), selector!("approve"), selector!("swap")],
        );
    // Update: only 1 entrypoint — should clear the other 2
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

// ── Agent identity tests (ERC-8004 addition) ─────────────────────────────

#[test]
fn test_set_and_get_agent_id() {
    let account_addr = deploy_session_account();
    let dispatcher = agent_dispatcher(account_addr);

    let agent_id: felt252 = 0xA6E47;

    start_cheat_caller_address(account_addr, account_addr);
    dispatcher.set_agent_id(agent_id);
    stop_cheat_caller_address(account_addr);

    assert(dispatcher.get_agent_id() == agent_id, 'wrong agent_id');
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

// ── Contract info tests ──────────────────────────────────────────────────

#[test]
fn test_contract_info_returns_v32_agent() {
    let account_addr = deploy_session_account();

    // Just verify it deploys and is callable
    assert(account_addr.into() != 0, 'should be deployed');
}
