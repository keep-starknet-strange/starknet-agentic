use erc8004::interfaces::identity_registry::{
    IIdentityRegistryDispatcher, IIdentityRegistryDispatcherTrait,
};
use erc8004::interfaces::validation_registry::{
    IValidationRegistryDispatcher, IValidationRegistryDispatcherTrait,
};
use erc8004::version::contract_version;
use openzeppelin::interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

// Test addresses
fn agent_owner() -> ContractAddress {
    0x1.try_into().unwrap()
}

fn validator() -> ContractAddress {
    0x2.try_into().unwrap()
}

fn validator2() -> ContractAddress {
    0x3.try_into().unwrap()
}

// Contract owner for upgrades
fn owner() -> ContractAddress {
    0x999.try_into().unwrap()
}

// Deploy contracts
fn deploy_contracts() -> (
    IIdentityRegistryDispatcher, IValidationRegistryDispatcher, ContractAddress, ContractAddress,
) {
    // Deploy IdentityRegistry with owner
    let identity_contract = declare("IdentityRegistry").unwrap().contract_class();
    let (identity_address, _) = identity_contract.deploy(@array![owner().into()]).unwrap();
    let identity_registry = IIdentityRegistryDispatcher { contract_address: identity_address };

    // Deploy ValidationRegistry with owner and IdentityRegistry address
    let validation_contract = declare("ValidationRegistry").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append(owner().into()); // owner
    calldata.append(identity_address.into()); // identity_registry
    let (validation_address, _) = validation_contract.deploy(@calldata).unwrap();
    let validation_registry = IValidationRegistryDispatcher {
        contract_address: validation_address,
    };

    (identity_registry, validation_registry, identity_address, validation_address)
}

// Helper function to create and respond to validation
fn create_and_respond_validation(
    validation_registry: IValidationRegistryDispatcher,
    validation_address: ContractAddress,
    agent_id: u256,
    validator_addr: ContractAddress,
    response: u8,
    request_hash: u256,
) {
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let tag: ByteArray = "hard-finality";

    // Agent owner creates request
    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator_addr, agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // Validator responds
    start_cheat_caller_address(validation_address, validator_addr);
    validation_registry.validation_response(request_hash, response, response_uri, 0, tag);
    stop_cheat_caller_address(validation_address);
}

// Helper function with custom tag
fn create_and_respond_validation_with_tag(
    validation_registry: IValidationRegistryDispatcher,
    validation_address: ContractAddress,
    agent_id: u256,
    validator_addr: ContractAddress,
    response: u8,
    request_hash: u256,
    tag: ByteArray,
) {
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator_addr, agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator_addr);
    validation_registry.validation_response(request_hash, response, response_uri, 0, tag);
    stop_cheat_caller_address(validation_address);
}

fn create_validation_requests_only(
    validation_registry: IValidationRegistryDispatcher,
    validation_address: ContractAddress,
    agent_id: u256,
    validator_addr: ContractAddress,
    count: u64,
) {
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    start_cheat_caller_address(validation_address, agent_owner());
    let mut i: u64 = 0;
    while i < count {
        let request_hash: u256 = (i + 1).into();
        validation_registry
            .validation_request(validator_addr, agent_id, request_uri.clone(), request_hash);
        i += 1;
    };
    stop_cheat_caller_address(validation_address);
}

// ============ Validation Request Tests ============

#[test]
fn test_get_version() {
    let (_, validation_registry, _, _) = deploy_contracts();
    let version = validation_registry.get_version();
    assert_eq!(version, contract_version());
}

#[test]
fn test_get_summary_allows_ceiling_boundary() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_validation_requests_only(
        validation_registry, validation_address, agent_id, validator(), 900,
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, "");
    assert_eq!(count, 0);
    assert_eq!(avg_response, 0);
}

#[test]
fn test_get_summary_allows_one_below_ceiling() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_validation_requests_only(
        validation_registry, validation_address, agent_id, validator(), 899,
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, "");
    assert_eq!(count, 0);
    assert_eq!(avg_response, 0);
}

#[test]
#[should_panic(expected: 'Use get_summary_paginated')]
fn test_get_summary_rejects_over_ceiling() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_validation_requests_only(
        validation_registry, validation_address, agent_id, validator(), 901,
    );

    let empty_validators = array![].span();
    let _ = validation_registry.get_summary(agent_id, empty_validators, "");
}

#[test]
#[should_panic(expected: 'Use paginated list')]
fn test_get_agent_validations_rejects_over_ceiling() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_validation_requests_only(
        validation_registry, validation_address, agent_id, validator(), 901,
    );

    let _ = validation_registry.get_agent_validations(agent_id);
}

#[test]
fn test_get_agent_validations_allows_ceiling_boundary() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_validation_requests_only(
        validation_registry, validation_address, agent_id, validator(), 900,
    );

    let validations = validation_registry.get_agent_validations(agent_id);
    assert_eq!(validations.len(), 900);
}

#[test]
#[should_panic(expected: 'Use paginated list')]
fn test_get_validator_requests_rejects_over_ceiling() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_validation_requests_only(
        validation_registry, validation_address, agent_id, validator(), 901,
    );

    let _ = validation_registry.get_validator_requests(validator());
}

#[test]
fn test_get_validator_requests_allows_ceiling_boundary() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_validation_requests_only(
        validation_registry, validation_address, agent_id, validator(), 900,
    );

    let requests = validation_registry.get_validator_requests(validator());
    assert_eq!(requests.len(), 900);
}

#[test]
fn test_validation_request_success() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    // Register agent
    start_cheat_caller_address(identity_address, agent_owner());
    let token_uri: ByteArray = "ipfs://QmTest/agent.json";
    let agent_id = identity_registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(identity_address);

    // Create validation request
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    let request_hash: u256 = 0x1234;
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), request_hash);
    stop_cheat_caller_address(validation_address);

    // Verify request was stored
    let (stored_validator, stored_agent_id, stored_uri, _timestamp) = validation_registry
        .get_request(request_hash);
    assert_eq!(stored_validator, validator());
    assert_eq!(stored_agent_id, agent_id);
    assert_eq!(stored_uri, request_uri);

    // Verify tracking arrays
    let agent_validations = validation_registry.get_agent_validations(agent_id);
    assert_eq!(agent_validations.len(), 1);
    assert_eq!(*agent_validations[0], request_hash);

    let validator_requests = validation_registry.get_validator_requests(validator());
    assert_eq!(validator_requests.len(), 1);
    assert_eq!(*validator_requests[0], request_hash);
}

#[test]
fn test_validation_request_auto_generate_hash() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, 0); // Hash = 0 means auto-generate
    stop_cheat_caller_address(validation_address);

    // Hash should be auto-generated
    let agent_validations = validation_registry.get_agent_validations(agent_id);
    assert_eq!(agent_validations.len(), 1);
    assert!(*agent_validations[0] != 0, "Hash should be auto-generated");
}

#[test]
fn test_validation_request_multiple_requests() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let hash1: u256 = 0x1111;
    let hash2: u256 = 0x2222;
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(validator(), agent_id, request_uri, hash2);
    stop_cheat_caller_address(validation_address);

    let agent_validations = validation_registry.get_agent_validations(agent_id);
    assert_eq!(agent_validations.len(), 2);
}

#[test]
#[should_panic(expected: 'Empty request URI')]
fn test_validation_request_empty_uri_reverts() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, "", 0x1234);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Invalid validator')]
fn test_validation_request_zero_validator_reverts() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let zero_addr: ContractAddress = 0.try_into().unwrap();
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(zero_addr, agent_id, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Agent does not exist')]
fn test_validation_request_nonexistent_agent_reverts() {
    let (_, validation_registry, _, validation_address) = deploy_contracts();

    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), 999, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Not authorized')]
fn test_validation_request_not_owner_reverts() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Validator tries to create request (not the owner)
    start_cheat_caller_address(validation_address, validator());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);
}

#[test]
fn test_validation_request_approved_operator_success() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();
    let erc721 = IERC721Dispatcher { contract_address: identity_address };

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Approve operator
    start_cheat_caller_address(identity_address, agent_owner());
    erc721.approve(validator(), agent_id);
    stop_cheat_caller_address(identity_address);

    // Approved operator can make validation request
    start_cheat_caller_address(validation_address, validator());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);

    let (stored_validator, _, _, _) = validation_registry.get_request(0x1234);
    assert_eq!(stored_validator, validator());
}

#[test]
fn test_validation_request_approved_for_all_success() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();
    let erc721 = IERC721Dispatcher { contract_address: identity_address };

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Set approval for all
    start_cheat_caller_address(identity_address, agent_owner());
    erc721.set_approval_for_all(validator(), true);
    stop_cheat_caller_address(identity_address);

    // Operator can make validation request
    start_cheat_caller_address(validation_address, validator());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);

    let (stored_validator, _, _, _) = validation_registry.get_request(0x1234);
    assert_eq!(stored_validator, validator());
}

// ============ Validation Response Tests ============

#[test]
fn test_validation_response_success() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create request first
    let request_hash: u256 = 0x1234;
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // Provide response (100 = fully valid)
    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let response_hash: u256 = 0x5678;
    let tag: ByteArray = "hard-finality";
    validation_registry
        .validation_response(request_hash, 100, response_uri, response_hash, tag.clone());
    stop_cheat_caller_address(validation_address);

    // Verify response was stored
    let (
        stored_validator,
        stored_agent_id,
        response,
        stored_response_hash,
        stored_tag,
        _last_update,
    ) = validation_registry
        .get_validation_status(request_hash);
    assert_eq!(stored_validator, validator());
    assert_eq!(stored_agent_id, agent_id);
    assert_eq!(response, 100);
    // Note: last_update is 0 in tests as get_block_timestamp() returns 0 in snforge by default
    assert_eq!(stored_response_hash, response_hash);
    assert_eq!(stored_tag, tag);
}

#[test]
#[should_panic(expected: 'Response already submitted')]
fn test_validation_response_second_submit_reverts() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create request
    let request_hash: u256 = 0x1234;
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // First response (20 = low confidence)
    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let tag1: ByteArray = "soft-finality";
    validation_registry.validation_response(request_hash, 20, response_uri.clone(), 0, tag1);
    stop_cheat_caller_address(validation_address);

    let (_, _, response1, _, _, _) = validation_registry.get_validation_status(request_hash);
    assert_eq!(response1, 20);

    // Second response must revert (immutable response policy)
    start_cheat_caller_address(validation_address, validator());
    let tag2: ByteArray = "hard-finality";
    validation_registry.validation_response(request_hash, 80, response_uri, 0, tag2);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Response must be 0-100')]
fn test_validation_response_invalid_response_reverts() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let request_hash: u256 = 0x1234;
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let tag: ByteArray = "";
    // Response 101 is invalid (must be 0-100)
    validation_registry.validation_response(request_hash, 101, response_uri, 0, tag);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Not validator')]
fn test_validation_response_wrong_validator_reverts() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let request_hash: u256 = 0x1234;
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // validator2 was not designated in the request
    start_cheat_caller_address(validation_address, validator2());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    validation_registry.validation_response(request_hash, 100, response_uri, 0, "");
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Request not found')]
fn test_validation_response_request_not_found_reverts() {
    let (_, validation_registry, _, validation_address) = deploy_contracts();

    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let tag: ByteArray = "";
    validation_registry.validation_response(0x9999, 1, response_uri, 0, tag);
    stop_cheat_caller_address(validation_address);
}

#[test]
fn test_validation_response_empty_response_uri() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let request_hash: u256 = 0x1234;
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // Empty response URI is allowed
    start_cheat_caller_address(validation_address, validator());
    let tag: ByteArray = "";
    validation_registry.validation_response(request_hash, 100, "", 0, tag.clone());
    stop_cheat_caller_address(validation_address);

    let (_, _, response, _, stored_tag, _) = validation_registry.get_validation_status(request_hash);
    assert_eq!(response, 100);
    assert_eq!(stored_tag, tag);
}

// ============ Aggregation Tests ============

#[test]
fn test_get_summary_no_filters() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create validations: 100 and 0
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 100, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator2(), 0, 0x2222, "",
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, "");

    assert_eq!(count, 2);
    assert_eq!(avg_response, 50);
}

#[test]
fn test_get_summary_filter_by_validator() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 100, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator2(), 0, 0x2222, "",
    );

    let validators_filter = array![validator()].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, validators_filter, "");

    assert_eq!(count, 1);
    assert_eq!(avg_response, 100);
}

#[test]
fn test_get_summary_filter_by_tag() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let tag1: ByteArray = "zkml";
    let tag2: ByteArray = "tee";

    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 100, 0x1111, tag1.clone(),
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator2(), 0, 0x2222, tag2,
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, tag1);

    assert_eq!(count, 1);
    assert_eq!(avg_response, 100);
}

#[test]
fn test_get_summary_excludes_unresponded() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create validation but don't respond
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, 0x1111);
    stop_cheat_caller_address(validation_address);

    // Create and respond to another
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator2(), 80, 0x2222, "",
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, "");

    assert_eq!(count, 1);
    assert_eq!(avg_response, 80);
}

#[test]
fn test_get_summary_paginated_window() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 10, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 20, 0x2222, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 30, 0x3333, "",
    );

    let empty_validators = array![].span();
    let (count, avg_response, truncated) = validation_registry.get_summary_paginated(
        agent_id, empty_validators, "", 1, 1,
    );

    assert_eq!(count, 1);
    assert_eq!(avg_response, 20);
    assert(truncated, 'Expected truncated');
}

#[test]
fn test_get_summary_paginated_full_window_not_truncated() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 10, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 20, 0x2222, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 30, 0x3333, "",
    );

    let empty_validators = array![].span();
    let (count, avg_response, truncated) = validation_registry.get_summary_paginated(
        agent_id, empty_validators, "", 0, 10,
    );

    assert_eq!(count, 3);
    assert_eq!(avg_response, 20);
    assert(!truncated, 'Expected full window');
}

// ============ Read Function Tests ============

#[test]
fn test_get_agent_validations_returns_all_requests() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let hash1: u256 = 0x1111;
    let hash2: u256 = 0x2222;
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(validator(), agent_id, request_uri, hash2);
    stop_cheat_caller_address(validation_address);

    let validations = validation_registry.get_agent_validations(agent_id);
    assert_eq!(validations.len(), 2);
    assert_eq!(*validations[0], hash1);
    assert_eq!(*validations[1], hash2);
}

#[test]
fn test_get_agent_validations_paginated_returns_slices_and_truncation() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    let hash1: u256 = 0x1111;
    let hash2: u256 = 0x2222;
    let hash3: u256 = 0x3333;

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash2);
    validation_registry.validation_request(validator(), agent_id, request_uri, hash3);
    stop_cheat_caller_address(validation_address);

    let (page1, truncated1) = validation_registry.get_agent_validations_paginated(agent_id, 0, 2);
    assert_eq!(page1.len(), 2);
    assert_eq!(*page1[0], hash1);
    assert_eq!(*page1[1], hash2);
    assert(truncated1, 'truncated');

    let (page2, truncated2) = validation_registry.get_agent_validations_paginated(agent_id, 2, 2);
    assert_eq!(page2.len(), 1);
    assert_eq!(*page2[0], hash3);
    assert(!truncated2, 'not truncated');

    let (page3, truncated3) = validation_registry.get_agent_validations_paginated(agent_id, 10, 2);
    assert_eq!(page3.len(), 0);
    assert(!truncated3, 'not truncated');
}

#[test]
#[should_panic(expected: 'limit too large')]
fn test_get_agent_validations_paginated_rejects_over_limit() {
    let (identity_registry, validation_registry, identity_address, _) = deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let _ = validation_registry.get_agent_validations_paginated(agent_id, 0, 257);
}

#[test]
fn test_get_validator_requests_returns_all_requests() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let hash1: u256 = 0x1111;
    let hash2: u256 = 0x2222;
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";

    // Agent owner creates requests
    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(validator(), agent_id, request_uri, hash2);
    stop_cheat_caller_address(validation_address);

    // Requests are stored under the designated validator
    let requests = validation_registry.get_validator_requests(validator());
    assert_eq!(requests.len(), 2);
    assert_eq!(*requests[0], hash1);
    assert_eq!(*requests[1], hash2);
}

#[test]
fn test_get_validator_requests_paginated_returns_slices_and_truncation() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    let hash1: u256 = 0x1111;
    let hash2: u256 = 0x2222;
    let hash3: u256 = 0x3333;

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash2);
    validation_registry.validation_request(validator(), agent_id, request_uri, hash3);
    stop_cheat_caller_address(validation_address);

    let (page1, truncated1) = validation_registry.get_validator_requests_paginated(validator(), 0, 2);
    assert_eq!(page1.len(), 2);
    assert_eq!(*page1[0], hash1);
    assert_eq!(*page1[1], hash2);
    assert(truncated1, 'truncated');

    let (page2, truncated2) = validation_registry.get_validator_requests_paginated(validator(), 2, 2);
    assert_eq!(page2.len(), 1);
    assert_eq!(*page2[0], hash3);
    assert(!truncated2, 'not truncated');
}

#[test]
#[should_panic(expected: 'limit too large')]
fn test_get_validator_requests_paginated_rejects_over_limit() {
    let (_, validation_registry, _, _) = deploy_contracts();
    let _ = validation_registry.get_validator_requests_paginated(validator(), 0, 257);
}

#[test]
fn test_get_validator_requests_tracks_designated_validator_not_requester() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    let erc721 = IERC721Dispatcher { contract_address: identity_address };

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Approve validator() as operator so requester != designated validator.
    start_cheat_caller_address(identity_address, agent_owner());
    erc721.approve(validator(), agent_id);
    stop_cheat_caller_address(identity_address);

    // Operator creates request while designating validator2() as responder.
    let request_hash: u256 = 0xBEEF;
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    start_cheat_caller_address(validation_address, validator());
    validation_registry.validation_request(validator2(), agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    let designated_requests = validation_registry.get_validator_requests(validator2());
    assert_eq!(designated_requests.len(), 1);
    assert_eq!(*designated_requests[0], request_hash);

    let requester_requests = validation_registry.get_validator_requests(validator());
    assert_eq!(requester_requests.len(), 0);
}

#[test]
#[should_panic(expected: 'Request not found')]
fn test_get_request_nonexistent_reverts() {
    let (_, validation_registry, _, _) = deploy_contracts();
    validation_registry.get_request(0x9999);
}

#[test]
#[should_panic(expected: 'Request not found')]
fn test_get_validation_status_nonexistent_reverts() {
    let (_, validation_registry, _, _) = deploy_contracts();
    let nonexistent_hash: u256 = 0x9999;
    validation_registry.get_validation_status(nonexistent_hash);
}

#[test]
fn test_get_validation_status_pending_returns_defaults() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create request but no response yet
    let request_hash: u256 = 0x1234;
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // Should return defaults for pending request (no response yet)
    let (stored_validator, stored_agent_id, response, response_hash, tag, last_update) = validation_registry
        .get_validation_status(request_hash);

    assert_eq!(stored_validator, validator());
    assert_eq!(stored_agent_id, agent_id);
    assert_eq!(response, 0, "Pending: should return 0");
    assert_eq!(last_update, 0, "Pending: should return 0");
    assert_eq!(response_hash, 0, "Pending: should return 0");
    assert_eq!(tag, "", "Pending: should return empty tag");
    assert!(validation_registry.request_exists(request_hash), "Request should exist");
}

#[test]
fn test_get_identity_registry_returns_correct_address() {
    let (_, validation_registry, identity_address, _) = deploy_contracts();
    assert_eq!(validation_registry.get_identity_registry(), identity_address);
}

// ============ Edge Cases ============

#[test]
#[should_panic(expected: 'Request hash exists')]
fn test_validation_request_same_hash_twice_reverts() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let request_hash: u256 = 0x1234;
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), request_hash);

    // SECURITY: Attempting to use the same hash again should revert to prevent hijacking
    validation_registry.validation_request(validator(), agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);
}

#[test]
fn test_validation_response_valid_and_invalid() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let hash1: u256 = 0x1111;
    let hash2: u256 = 0x2222;
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(validator(), agent_id, request_uri, hash2);
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator());
    let tag: ByteArray = "";
    validation_registry.validation_response(hash1, 100, "", 0, tag.clone());
    validation_registry.validation_response(hash2, 0, "", 0, tag);
    stop_cheat_caller_address(validation_address);

    let (_, _, response1, _, _, _) = validation_registry.get_validation_status(hash1);
    let (_, _, response2, _, _, _) = validation_registry.get_validation_status(hash2);

    assert_eq!(response1, 100);
    assert_eq!(response2, 0);
}

#[test]
fn test_get_summary_all_valid() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create 3 fully valid responses
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 100, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 100, 0x2222, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 100, 0x3333, "",
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, "");

    assert_eq!(count, 3);
    assert_eq!(avg_response, 100);
}

#[test]
fn test_get_summary_all_invalid() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create 3 fully invalid responses
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 0, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 0, 0x2222, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 0, 0x3333, "",
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, "");

    assert_eq!(count, 3);
    assert_eq!(avg_response, 0);
}

#[test]
fn test_get_summary_mixed_with_pending() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // One pending request and two responded requests.
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, 0x1111);
    stop_cheat_caller_address(validation_address);

    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 100, 0x2222, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 20, 0x3333, "",
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, "");

    assert_eq!(count, 2); // pending request excluded
    assert_eq!(avg_response, 60); // (100 + 20) / 2
}

#[test]
fn test_get_summary_average_rounds_down() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 100, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 99, 0x2222, "",
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, "");
    assert_eq!(count, 2);
    assert_eq!(avg_response, 99); // floor((100 + 99) / 2)
}

#[test]
fn test_get_summary_filter_no_match_returns_zero() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 88, 0x1111, "security",
    );

    let unmatched_validators = array![validator2()].span();
    let (count_by_validator, avg_by_validator) = validation_registry
        .get_summary(agent_id, unmatched_validators, "");
    assert_eq!(count_by_validator, 0);
    assert_eq!(avg_by_validator, 0);

    let empty_validators = array![].span();
    let (count_by_tag, avg_by_tag) = validation_registry
        .get_summary(agent_id, empty_validators, "non-matching-tag");
    assert_eq!(count_by_tag, 0);
    assert_eq!(avg_by_tag, 0);
}
