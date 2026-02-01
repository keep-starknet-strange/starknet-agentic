use erc8004::interfaces::identity_registry::{
    IIdentityRegistryDispatcher, IIdentityRegistryDispatcherTrait,
};
use erc8004::interfaces::validation_registry::{
    IValidationRegistryDispatcher, IValidationRegistryDispatcherTrait,
};
use openzeppelin::token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

// Test addresses
fn agent_owner() -> ContractAddress {
    starknet::contract_address_const::<0x1>()
}

fn validator() -> ContractAddress {
    starknet::contract_address_const::<0x2>()
}

fn validator2() -> ContractAddress {
    starknet::contract_address_const::<0x3>()
}

// Deploy contracts
fn deploy_contracts() -> (
    IIdentityRegistryDispatcher, IValidationRegistryDispatcher, ContractAddress, ContractAddress,
) {
    // Deploy IdentityRegistry
    let identity_contract = declare("IdentityRegistry").unwrap().contract_class();
    let (identity_address, _) = identity_contract.deploy(@array![]).unwrap();
    let identity_registry = IIdentityRegistryDispatcher { contract_address: identity_address };

    // Deploy ValidationRegistry with IdentityRegistry address
    let validation_contract = declare("ValidationRegistry").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append(identity_address.into());
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
    score: u8,
    request_hash: u256,
) {
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let tag: u256 = 'hard-finality';

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator_addr, agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator_addr);
    validation_registry.validation_response(request_hash, score, response_uri, 0, tag);
    stop_cheat_caller_address(validation_address);
}

// Helper function with custom tag
fn create_and_respond_validation_with_tag(
    validation_registry: IValidationRegistryDispatcher,
    validation_address: ContractAddress,
    agent_id: u256,
    validator_addr: ContractAddress,
    score: u8,
    request_hash: u256,
    tag: u256,
) {
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator_addr, agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator_addr);
    validation_registry.validation_response(request_hash, score, response_uri, 0, tag);
    stop_cheat_caller_address(validation_address);
}

// ============ Validation Request Tests ============

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
    let request_hash: u256 = 0x1234; // keccak256("request_data")
    validation_registry
        .validation_request(validator(), agent_id, request_uri.clone(), request_hash);
    stop_cheat_caller_address(validation_address);

    // Verify request was stored
    let (validator_addr, stored_agent_id, stored_uri, _timestamp) = validation_registry
        .get_request(request_hash);
    assert_eq!(validator_addr, validator());
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
    validation_registry
        .validation_request(validator(), agent_id, request_uri, 0); // Hash = 0 means auto-generate
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
    validation_registry.validation_request(validator2(), agent_id, request_uri, hash2);
    stop_cheat_caller_address(validation_address);

    let agent_validations = validation_registry.get_agent_validations(agent_id);
    assert_eq!(agent_validations.len(), 2);
}

#[test]
#[should_panic(expected: 'Invalid validator address')]
fn test_validation_request_invalid_validator_reverts() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    let zero_address: ContractAddress = starknet::contract_address_const::<0x0>();
    validation_registry.validation_request(zero_address, agent_id, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);
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

    start_cheat_caller_address(validation_address, validator());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator(), agent_id, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Self-validation not allowed')]
fn test_validation_request_self_validation_reverts() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Agent owner tries to validate own work
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(agent_owner(), agent_id, request_uri, 0x1234);
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

    // Operator can make validation request
    start_cheat_caller_address(validation_address, validator());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(validator2(), agent_id, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);

    let (validator_addr, _, _, _) = validation_registry.get_request(0x1234);
    assert_eq!(validator_addr, validator2());
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
    validation_registry.validation_request(validator2(), agent_id, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);

    let (validator_addr, _, _, _) = validation_registry.get_request(0x1234);
    assert_eq!(validator_addr, validator2());
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

    // Provide response
    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let response_hash: u256 = 0x5678;
    let tag: u256 = 'hard-finality';
    validation_registry.validation_response(request_hash, 100, response_uri, response_hash, tag);
    stop_cheat_caller_address(validation_address);

    // Verify response was stored
    let (validator_addr, stored_agent_id, response, stored_tag, _last_update) = validation_registry
        .get_validation_status(request_hash);
    assert_eq!(validator_addr, validator());
    assert_eq!(stored_agent_id, agent_id);
    assert_eq!(response, 100);
    assert_eq!(stored_tag, tag);
}

#[test]
fn test_validation_response_multiple_responses() {
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

    // First response (soft finality)
    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let tag1: u256 = 'soft-finality';
    validation_registry.validation_response(request_hash, 80, response_uri.clone(), 0, tag1);
    stop_cheat_caller_address(validation_address);

    let (_, _, response1, stored_tag1, _) = validation_registry.get_validation_status(request_hash);
    assert_eq!(response1, 80);
    assert_eq!(stored_tag1, tag1);

    // Second response (hard finality) - updates the first
    start_cheat_caller_address(validation_address, validator());
    let tag2: u256 = 'hard-finality';
    validation_registry.validation_response(request_hash, 100, response_uri, 0, tag2);
    stop_cheat_caller_address(validation_address);

    let (_, _, response2, stored_tag2, _) = validation_registry.get_validation_status(request_hash);
    assert_eq!(response2, 100);
    assert_eq!(stored_tag2, tag2);
}

#[test]
#[should_panic(expected: 'Response must be 0-100')]
fn test_validation_response_score_too_high_reverts() {
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
    validation_registry.validation_response(request_hash, 101, response_uri, 0, 0);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Request not found')]
fn test_validation_response_request_not_found_reverts() {
    let (_, validation_registry, _, validation_address) = deploy_contracts();

    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    validation_registry.validation_response(0x9999, 100, response_uri, 0, 0);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Not authorized validator')]
fn test_validation_response_not_authorized_validator_reverts() {
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

    // validator2 tries to respond but wasn't the assigned validator
    start_cheat_caller_address(validation_address, validator2());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    validation_registry.validation_response(request_hash, 100, response_uri, 0, 0);
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
    validation_registry.validation_response(request_hash, 100, "", 0, 0);
    stop_cheat_caller_address(validation_address);

    let (_, _, response, _, _) = validation_registry.get_validation_status(request_hash);
    assert_eq!(response, 100);
}

// ============ Aggregation Tests ============

#[test]
fn test_get_summary_no_filters() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create multiple validations
    create_and_respond_validation(
        validation_registry, validation_address, agent_id, validator(), 90, 0x1111,
    );
    create_and_respond_validation(
        validation_registry, validation_address, agent_id, validator2(), 80, 0x2222,
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, 0);

    assert_eq!(count, 2);
    assert_eq!(avg_response, 85); // (90 + 80) / 2
}

#[test]
fn test_get_summary_filter_by_validator() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_and_respond_validation(
        validation_registry, validation_address, agent_id, validator(), 90, 0x1111,
    );
    create_and_respond_validation(
        validation_registry, validation_address, agent_id, validator2(), 80, 0x2222,
    );

    let validators_filter = array![validator()].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, validators_filter, 0);

    assert_eq!(count, 1);
    assert_eq!(avg_response, 90);
}

#[test]
fn test_get_summary_filter_by_tag() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let tag1: u256 = 'zkml';
    let tag2: u256 = 'tee';

    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 90, 0x1111, tag1,
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator2(), 80, 0x2222, tag2,
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, tag1);

    assert_eq!(count, 1);
    assert_eq!(avg_response, 90);
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
    create_and_respond_validation(
        validation_registry, validation_address, agent_id, validator2(), 85, 0x2222,
    );

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, 0);

    assert_eq!(count, 1);
    assert_eq!(avg_response, 85);
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
    validation_registry.validation_request(validator2(), agent_id, request_uri, hash2);
    stop_cheat_caller_address(validation_address);

    let validations = validation_registry.get_agent_validations(agent_id);
    assert_eq!(validations.len(), 2);
    assert_eq!(*validations[0], hash1);
    assert_eq!(*validations[1], hash2);
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

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(validator(), agent_id, request_uri, hash2);
    stop_cheat_caller_address(validation_address);

    let requests = validation_registry.get_validator_requests(validator());
    assert_eq!(requests.len(), 2);
    assert_eq!(*requests[0], hash1);
    assert_eq!(*requests[1], hash2);
}

#[test]
#[should_panic(expected: 'Request not found')]
fn test_get_request_nonexistent_reverts() {
    let (_, validation_registry, _, _) = deploy_contracts();
    validation_registry.get_request(0x9999);
}

#[test]
fn test_get_validation_status_nonexistent_returns_defaults() {
    let (_, validation_registry, _, _) = deploy_contracts();

    // Non-existent requests return default values (no revert)
    let nonexistent_hash: u256 = 0x9999;
    let (validator_addr, agent_id, response, tag, last_update) = validation_registry
        .get_validation_status(nonexistent_hash);

    let zero_address: ContractAddress = starknet::contract_address_const::<0x0>();
    assert_eq!(validator_addr, zero_address, "Should return address(0)");
    assert_eq!(agent_id, 0, "Should return 0");
    assert_eq!(response, 0, "Should return 0");
    assert_eq!(tag, 0, "Should return 0");
    assert_eq!(last_update, 0, "Should return 0");
    assert!(!validation_registry.request_exists(nonexistent_hash), "Should not exist");
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

    // Should return defaults for pending request (no revert)
    let (returned_validator, returned_agent_id, response, tag, last_update) = validation_registry
        .get_validation_status(request_hash);

    let zero_address: ContractAddress = starknet::contract_address_const::<0x0>();
    assert_eq!(returned_validator, zero_address, "Pending: should return address(0)");
    assert_eq!(returned_agent_id, 0, "Pending: should return 0");
    assert_eq!(response, 0, "Pending: should return 0");
    assert_eq!(tag, 0, "Pending: should return 0");
    assert_eq!(last_update, 0, "Pending: should return 0");
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
    validation_registry
        .validation_request(validator(), agent_id, request_uri.clone(), request_hash);

    // SECURITY: Attempting to use the same hash again should revert to prevent hijacking
    validation_registry.validation_request(validator(), agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);
}

#[test]
fn test_validation_response_binary_scores() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let hash1: u256 = 0x1111; // "pass"
    let hash2: u256 = 0x2222; // "fail"
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(validator(), agent_id, request_uri, hash2);
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator());
    validation_registry.validation_response(hash1, 100, "", 0, 'pass');
    validation_registry.validation_response(hash2, 0, "", 0, 'fail');
    stop_cheat_caller_address(validation_address);

    let (_, _, response1, _, _) = validation_registry.get_validation_status(hash1);
    let (_, _, response2, _, _) = validation_registry.get_validation_status(hash2);

    assert_eq!(response1, 100);
    assert_eq!(response2, 0);
}

#[test]
fn test_validation_response_spectrum_scores() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let scores = array![20, 40, 60, 80, 100];
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";

    let mut i: u32 = 0;
    while i < 5 {
        let hash: u256 = (0x1000 + i).into();

        start_cheat_caller_address(validation_address, agent_owner());
        validation_registry.validation_request(validator(), agent_id, request_uri.clone(), hash);
        stop_cheat_caller_address(validation_address);

        start_cheat_caller_address(validation_address, validator());
        validation_registry.validation_response(hash, *scores[i], "", 0, 0);
        stop_cheat_caller_address(validation_address);

        i += 1;
    }

    let empty_validators = array![].span();
    let (count, avg_response) = validation_registry.get_summary(agent_id, empty_validators, 0);

    assert_eq!(count, 5);
    assert_eq!(avg_response, 60); // (20+40+60+80+100)/5
}

