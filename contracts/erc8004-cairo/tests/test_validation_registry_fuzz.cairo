use erc8004::interfaces::identity_registry::{
    IIdentityRegistryDispatcher, IIdentityRegistryDispatcherTrait,
};
use erc8004::interfaces::validation_registry::{
    IValidationRegistryDispatcher, IValidationRegistryDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

fn owner() -> ContractAddress {
    0x999.try_into().unwrap()
}

fn agent_owner() -> ContractAddress {
    0xA11CE.try_into().unwrap()
}

fn validator() -> ContractAddress {
    0xB0B.try_into().unwrap()
}

fn validator2() -> ContractAddress {
    0xC0C.try_into().unwrap()
}

fn deploy_contracts() -> (
    IIdentityRegistryDispatcher, IValidationRegistryDispatcher, ContractAddress, ContractAddress,
) {
    let identity_contract = declare("IdentityRegistry").unwrap().contract_class();
    let (identity_address, _) = identity_contract.deploy(@array![owner().into()]).unwrap();
    let identity_registry = IIdentityRegistryDispatcher { contract_address: identity_address };

    let validation_contract = declare("ValidationRegistry").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append(owner().into());
    calldata.append(identity_address.into());
    let (validation_address, _) = validation_contract.deploy(@calldata).unwrap();
    let validation_registry = IValidationRegistryDispatcher {
        contract_address: validation_address,
    };

    (identity_registry, validation_registry, identity_address, validation_address)
}

#[test]
#[fuzzer(runs: 64)]
fn fuzz_validation_same_responder_can_update(raw_first: u8, raw_second: u8) {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let request_hash: u256 = 0x1111;
    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, "ipfs://req", request_hash);
    stop_cheat_caller_address(validation_address);

    let first = raw_first % 101;
    let second = raw_second % 101;

    start_cheat_caller_address(validation_address, validator());
    validation_registry.validation_response(request_hash, first, "", 0, "");
    validation_registry.validation_response(request_hash, second, "", 0, "");
    stop_cheat_caller_address(validation_address);

    let (_, _, resp, _, _, _) = validation_registry.get_validation_status(request_hash);

    assert_eq!(resp, second);
}

#[test]
#[fuzzer(runs: 64)]
fn fuzz_validation_status_pending_defaults(random_hash_seed: u256) {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // avoid zero to keep generated hash distinguishable from sentinel values
    let random_hash = if random_hash_seed == 0 { 1 } else { random_hash_seed };

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, "ipfs://req", random_hash);
    stop_cheat_caller_address(validation_address);

    let (stored_validator, stored_agent_id, resp, response_hash, tag, timestamp) = validation_registry
        .get_validation_status(random_hash);

    assert_eq!(stored_validator, validator());
    assert_eq!(stored_agent_id, agent_id);
    assert_eq!(resp, 0);
    assert_eq!(response_hash, 0);
    assert_eq!(tag, "");
    assert_eq!(timestamp, 0);
}

#[test]
#[should_panic(expected: 'Not validator')]
#[fuzzer(runs: 64)]
fn fuzz_validation_wrong_responder_always_reverts(raw_score: u8) {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let request_hash: u256 = 0x2222;
    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, "ipfs://req", request_hash);
    stop_cheat_caller_address(validation_address);

    let score = raw_score % 101;
    start_cheat_caller_address(validation_address, validator2());
    validation_registry.validation_response(request_hash, score, "", 0, "");
    stop_cheat_caller_address(validation_address);

    // unreachable
}

#[test]
#[should_panic(expected: 'Not authorized')]
#[fuzzer(runs: 64)]
fn fuzz_validation_request_non_owner_or_operator_reverts(random_hash_seed: u256) {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let request_hash = if random_hash_seed == 0 { 1 } else { random_hash_seed };

    // validator() is neither owner nor approved operator for agent_id.
    start_cheat_caller_address(validation_address, validator());
    validation_registry.validation_request(validator2(), agent_id, "ipfs://req", request_hash);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[fuzzer(runs: 64)]
fn fuzz_validation_summary_filter_isolates_validator(raw_score_a: u8, raw_score_b: u8) {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let score_a = raw_score_a % 101;
    let score_b = raw_score_b % 101;

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, "ipfs://req1", 0xAAA1);
    validation_registry.validation_request(validator2(), agent_id, "ipfs://req2", 0xAAA2);
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator());
    validation_registry.validation_response(0xAAA1, score_a, "", 0, "");
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator2());
    validation_registry.validation_response(0xAAA2, score_b, "", 0, "");
    stop_cheat_caller_address(validation_address);

    let (count_a, avg_a) = validation_registry.get_summary(agent_id, array![validator()].span(), "");
    assert_eq!(count_a, 1);
    assert_eq!(avg_a, score_a);
}
