use starknet::ContractAddress;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address, start_mock_call,
    stop_cheat_caller_address, test_address,
};
use huginn_registry::IHuginnRegistryDispatcher;
use huginn_registry::IHuginnRegistryDispatcherTrait;

const VERIFY_SELECTOR: felt252 = selector!("verify");

fn deploy_contract(verifier_address: ContractAddress) -> ContractAddress {
    let contract = declare("HuginnRegistry").unwrap().contract_class();
    let calldata = array![verifier_address.into()];
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    contract_address
}

#[test]
fn test_register_agent() {
    let contract_address = deploy_contract(test_address());
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
    let contract_address = deploy_contract(test_address());
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.register_agent('thinker', "ipfs://meta");
    dispatcher.log_thought(42_u256);

    stop_cheat_caller_address(contract_address);
}

#[test]
fn test_log_thought_same_owner_relog_is_idempotent() {
    let contract_address = deploy_contract(test_address());
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.register_agent('thinker', "ipfs://meta");
    dispatcher.log_thought(7_u256);
    dispatcher.log_thought(7_u256);

    stop_cheat_caller_address(contract_address);
}

#[test]
#[should_panic(expected: 'Thought already claimed')]
fn test_log_thought_different_owner_cannot_claim_same_hash() {
    let contract_address = deploy_contract(test_address());
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let agent_a = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, agent_a);
    dispatcher.register_agent('agent_a', "ipfs://a");
    dispatcher.log_thought(8_u256);
    stop_cheat_caller_address(contract_address);

    let agent_b = 0x2.try_into().unwrap();
    start_cheat_caller_address(contract_address, agent_b);
    dispatcher.register_agent('agent_b', "ipfs://b");
    dispatcher.log_thought(8_u256);
}

#[test]
#[should_panic(expected: 'Agent not registered')]
fn test_log_thought_unregistered() {
    let contract_address = deploy_contract(test_address());
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x2.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.log_thought(42_u256);
}

#[test]
fn test_prove_thought_success_with_valid_verifier_response() {
    let verifier = test_address();
    start_mock_call(verifier, VERIFY_SELECTOR, true);

    let contract_address = deploy_contract(verifier);
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.register_agent('prover', "ipfs://meta");
    dispatcher.log_thought(99_u256);
    let proof: Array<felt252> = array![1, 2, 3];
    dispatcher.prove_thought(99_u256, proof.span());

    let (proof_hash, verified, agent_id) = dispatcher.get_proof(99_u256);
    assert(proof_hash != 0, 'proof hash should be set');
    assert(verified, 'proof should be verified');
    assert(agent_id == caller, 'agent should match prover');

    stop_cheat_caller_address(contract_address);
}

#[test]
#[should_panic(expected: 'Agent not registered')]
fn test_prove_thought_unregistered() {
    let contract_address = deploy_contract(test_address());
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x3.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    let proof: Array<felt252> = array![1];
    dispatcher.prove_thought(1_u256, proof.span());
}

#[test]
#[should_panic(expected: 'Thought not logged')]
fn test_prove_thought_rejects_unlogged_hash() {
    let verifier = test_address();
    start_mock_call(verifier, VERIFY_SELECTOR, true);

    let contract_address = deploy_contract(verifier);
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);
    dispatcher.register_agent('prover', "ipfs://meta");
    let proof: Array<felt252> = array![1, 2, 3];
    dispatcher.prove_thought(77_u256, proof.span());
}

#[test]
#[should_panic(expected: 'Not thought owner')]
fn test_prove_thought_rejects_non_owner_for_logged_thought() {
    let verifier = test_address();
    start_mock_call(verifier, VERIFY_SELECTOR, true);

    let contract_address = deploy_contract(verifier);
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let agent_a = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, agent_a);
    dispatcher.register_agent('agent_a', "ipfs://a");
    dispatcher.log_thought(9_u256);
    stop_cheat_caller_address(contract_address);

    let agent_b = 0x2.try_into().unwrap();
    start_cheat_caller_address(contract_address, agent_b);
    dispatcher.register_agent('agent_b', "ipfs://b");
    let proof: Array<felt252> = array![1, 2, 3];
    dispatcher.prove_thought(9_u256, proof.span());
}

#[test]
#[should_panic(expected: 'Empty proof')]
fn test_prove_thought_rejects_empty_proof() {
    let verifier = test_address();
    start_mock_call(verifier, VERIFY_SELECTOR, true);

    let contract_address = deploy_contract(verifier);
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.register_agent('prover', "ipfs://meta");
    dispatcher.log_thought(99_u256);
    let proof: Array<felt252> = array![];
    dispatcher.prove_thought(99_u256, proof.span());
}

#[test]
#[should_panic(expected: 'Invalid proof')]
fn test_prove_thought_reverts_when_verifier_returns_false() {
    let verifier = test_address();
    start_mock_call(verifier, VERIFY_SELECTOR, false);

    let contract_address = deploy_contract(verifier);
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.register_agent('prover', "ipfs://meta");
    dispatcher.log_thought(99_u256);
    let proof: Array<felt252> = array![1, 2, 3];
    dispatcher.prove_thought(99_u256, proof.span());
}

#[test]
#[should_panic(expected: 'ENTRYPOINT_NOT_FOUND')]
fn test_prove_thought_reverts_when_verifier_call_reverts() {
    // No mocked call means test_address() has no `verify` entrypoint.
    // The verifier dispatcher call should revert deterministically.
    let verifier = test_address();
    let contract_address = deploy_contract(verifier);
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.register_agent('prover', "ipfs://meta");
    dispatcher.log_thought(99_u256);
    let proof: Array<felt252> = array![1, 2, 3];
    dispatcher.prove_thought(99_u256, proof.span());
}

#[test]
#[should_panic(expected: 'Proof already submitted')]
fn test_prove_thought_rejects_replay_for_same_thought_hash() {
    let verifier = test_address();
    start_mock_call(verifier, VERIFY_SELECTOR, true);

    let contract_address = deploy_contract(verifier);
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let caller = 0x1.try_into().unwrap();
    start_cheat_caller_address(contract_address, caller);

    dispatcher.register_agent('prover', "ipfs://meta");
    dispatcher.log_thought(99_u256);
    let proof: Array<felt252> = array![1, 2, 3];
    dispatcher.prove_thought(99_u256, proof.span());
    dispatcher.prove_thought(99_u256, proof.span());
}

#[test]
fn test_get_agent_unregistered_returns_zero() {
    let contract_address = deploy_contract(test_address());
    let dispatcher = IHuginnRegistryDispatcher { contract_address };

    let unknown = 0x999.try_into().unwrap();
    let (name, _metadata) = dispatcher.get_agent(unknown);
    assert(name == 0, 'should be zero');
}
