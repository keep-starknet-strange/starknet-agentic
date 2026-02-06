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
    validation_registry.validation_request(agent_id, "ipfs://req", request_hash);
    stop_cheat_caller_address(validation_address);

    let first = raw_first % 3;
    let second = raw_second % 3;

    start_cheat_caller_address(validation_address, validator());
    validation_registry.validation_response(agent_id, request_hash, first, "", 0, "");
    validation_registry.validation_response(agent_id, request_hash, second, "", 0, "");
    stop_cheat_caller_address(validation_address);

    let (resp, _, _, has_response) = validation_registry
        .get_validation_status(validator(), agent_id, request_hash);

    assert_eq!(resp, second);
    assert(has_response, 'response missing');
}

#[test]
#[fuzzer(runs: 64)]
fn fuzz_validation_status_nonexistent_defaults(random_agent_id: u256, random_hash: u256) {
    let (_, validation_registry, _, _) = deploy_contracts();

    let (resp, timestamp, response_hash, has_response) = validation_registry
        .get_validation_status(validator(), random_agent_id, random_hash);

    assert_eq!(resp, 0);
    assert_eq!(timestamp, 0);
    assert_eq!(response_hash, 0);
    assert(!has_response, 'no response');
}
