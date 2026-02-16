use agent_account::interfaces::{IAgentAccountDispatcher, IAgentAccountDispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

fn attacker() -> ContractAddress {
    0xEEE.try_into().unwrap()
}

fn deploy_agent_account() -> (IAgentAccountDispatcher, ContractAddress) {
    let contract = declare("AgentAccount").unwrap().contract_class();
    let public_key: felt252 = 0x1234;
    let (contract_address, _) = contract.deploy(@array![public_key, 0]).unwrap();
    (IAgentAccountDispatcher { contract_address }, contract_address)
}

#[test]
#[should_panic(expected: 'Account: unauthorized')]
fn test_set_upgrade_delay_non_self_panics() {
    let (agent, addr) = deploy_agent_account();
    start_cheat_caller_address(addr, attacker());
    agent.set_upgrade_delay(3600);
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: 'Upgrade delay too small')]
fn test_set_upgrade_delay_zero_panics() {
    let (agent, addr) = deploy_agent_account();
    start_cheat_caller_address(addr, addr);
    agent.set_upgrade_delay(0);
    stop_cheat_caller_address(addr);
}

#[test]
fn test_set_upgrade_delay_updates_value() {
    let (agent, addr) = deploy_agent_account();
    start_cheat_caller_address(addr, addr);
    agent.set_upgrade_delay(3600);
    stop_cheat_caller_address(addr);

    let (_pending, _scheduled_at, delay, _now) = agent.get_upgrade_info();
    assert_eq!(delay, 3600);
}

#[test]
#[should_panic(expected: 'Upgrade delay too small')]
fn test_set_upgrade_delay_below_minimum_panics() {
    let (agent, addr) = deploy_agent_account();
    start_cheat_caller_address(addr, addr);
    agent.set_upgrade_delay(3599);
    stop_cheat_caller_address(addr);
}
