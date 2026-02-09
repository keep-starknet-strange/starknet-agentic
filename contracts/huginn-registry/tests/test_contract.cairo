use starknet::ContractAddress;
use snforge_std::{declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address, stop_cheat_caller_address};
use huginn_registry::IHuginnRegistryDispatcher;
use huginn_registry::IHuginnRegistryDispatcherTrait;

fn deploy_contract() -> ContractAddress {
    let contract = declare("HuginnRegistry").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@ArrayTrait::new()).unwrap();
    contract_address
}

#[test]
fn test_register_agent() {
    let contract_address = deploy_contract();
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.register_agent('alpha_agent', "ipfs://metadata");

    let (name, metadata_url) = dispatcher.get_agent(caller);
    assert(name == 'alpha_agent', 'wrong name');
    assert(metadata_url == "ipfs://metadata", 'wrong metadata');

    stop_cheat_caller_address(contract_address);
}

#[test]
fn test_log_thought() {
    let contract_address = deploy_contract();
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.register_agent('thinker', "ipfs://meta");
    dispatcher.log_thought(42_u256);

    stop_cheat_caller_address(contract_address);
}

#[test]
#[should_panic(expected: 'Agent not registered')]
fn test_log_thought_unregistered() {
    let contract_address = deploy_contract();
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x2.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.log_thought(42_u256);
}

#[test]
#[should_panic(expected: 'Verification not implemented')]
fn test_prove_thought_reverts_until_verifier_is_integrated() {
    let contract_address = deploy_contract();
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.register_agent('prover', "ipfs://meta");
    let proof: Array<felt252> = array![1, 2, 3];
    dispatcher.prove_thought(99_u256, proof.span());

    stop_cheat_caller_address(contract_address);
}

#[test]
#[should_panic(expected: 'Agent not registered')]
fn test_prove_thought_unregistered() {
    let contract_address = deploy_contract();
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x3.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    let proof: Array<felt252> = array![1];
    dispatcher.prove_thought(1_u256, proof.span());
}

#[test]
fn test_get_agent_unregistered_returns_zero() {
    let contract_address = deploy_contract();
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let unknown = 0x999.try_into().unwrap();
    let (name, _metadata) = dispatcher.get_agent(unknown);
    assert(name == 0, 'should be zero');
}
