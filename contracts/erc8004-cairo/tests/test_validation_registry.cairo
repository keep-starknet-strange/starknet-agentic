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
    validation_registry.validation_request(agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // Validator responds
    start_cheat_caller_address(validation_address, validator_addr);
    validation_registry.validation_response(agent_id, request_hash, response, response_uri, 0, tag);
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
    validation_registry.validation_request(agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator_addr);
    validation_registry.validation_response(agent_id, request_hash, response, response_uri, 0, tag);
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
    let request_hash: u256 = 0x1234;
    validation_registry.validation_request(agent_id, request_uri.clone(), request_hash);
    stop_cheat_caller_address(validation_address);

    // Verify request was stored
    let (requester_addr, stored_agent_id, stored_uri, _timestamp) = validation_registry
        .get_request(request_hash);
    assert_eq!(requester_addr, agent_owner());
    assert_eq!(stored_agent_id, agent_id);
    assert_eq!(stored_uri, request_uri);

    // Verify tracking arrays
    let agent_validations = validation_registry.get_agent_validations(agent_id);
    assert_eq!(agent_validations.len(), 1);
    assert_eq!(*agent_validations[0], request_hash);

    let requester_requests = validation_registry.get_validator_requests(agent_owner());
    assert_eq!(requester_requests.len(), 1);
    assert_eq!(*requester_requests[0], request_hash);
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
    validation_registry.validation_request(agent_id, request_uri, 0); // Hash = 0 means auto-generate
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
    validation_registry.validation_request(agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(agent_id, request_uri, hash2);
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
    validation_registry.validation_request(agent_id, "", 0x1234);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Agent does not exist')]
fn test_validation_request_nonexistent_agent_reverts() {
    let (_, validation_registry, _, validation_address) = deploy_contracts();

    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(999, request_uri, 0x1234);
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
    validation_registry.validation_request(agent_id, request_uri, 0x1234);
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
    validation_registry.validation_request(agent_id, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);

    let (requester_addr, _, _, _) = validation_registry.get_request(0x1234);
    assert_eq!(requester_addr, validator());
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
    validation_registry.validation_request(agent_id, request_uri, 0x1234);
    stop_cheat_caller_address(validation_address);

    let (requester_addr, _, _, _) = validation_registry.get_request(0x1234);
    assert_eq!(requester_addr, validator());
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
    validation_registry.validation_request(agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // Provide response (1 = valid)
    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let response_hash: u256 = 0x5678;
    let tag: ByteArray = "hard-finality";
    validation_registry
        .validation_response(agent_id, request_hash, 1, response_uri, response_hash, tag);
    stop_cheat_caller_address(validation_address);

    // Verify response was stored
    let (response, _last_update, stored_response_hash, has_response) = validation_registry
        .get_validation_status(validator(), agent_id, request_hash);
    assert_eq!(response, 1);
    // Note: last_update is 0 in tests as get_block_timestamp() returns 0 in snforge by default
    assert_eq!(stored_response_hash, response_hash);
    assert!(has_response);
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
    validation_registry.validation_request(agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // First response (0 = pending)
    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let tag1: ByteArray = "soft-finality";
    validation_registry.validation_response(agent_id, request_hash, 0, response_uri.clone(), 0, tag1);
    stop_cheat_caller_address(validation_address);

    let (response1, _, _, _) = validation_registry.get_validation_status(validator(), agent_id, request_hash);
    assert_eq!(response1, 0);

    // Second response (1 = valid) - updates the first
    start_cheat_caller_address(validation_address, validator());
    let tag2: ByteArray = "hard-finality";
    validation_registry.validation_response(agent_id, request_hash, 1, response_uri, 0, tag2);
    stop_cheat_caller_address(validation_address);

    let (response2, _, _, _) = validation_registry.get_validation_status(validator(), agent_id, request_hash);
    assert_eq!(response2, 1);
}

#[test]
#[should_panic(expected: 'Response must be 0-2')]
fn test_validation_response_invalid_response_reverts() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let request_hash: u256 = 0x1234;
    start_cheat_caller_address(validation_address, agent_owner());
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";
    validation_registry.validation_request(agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let tag: ByteArray = "";
    // Response 3 is invalid (must be 0-2)
    validation_registry.validation_response(agent_id, request_hash, 3, response_uri, 0, tag);
    stop_cheat_caller_address(validation_address);
}

#[test]
#[should_panic(expected: 'Request not found')]
fn test_validation_response_request_not_found_reverts() {
    let (_, validation_registry, _, validation_address) = deploy_contracts();

    start_cheat_caller_address(validation_address, validator());
    let response_uri: ByteArray = "ipfs://QmResponse/validation-response.json";
    let tag: ByteArray = "";
    validation_registry.validation_response(0, 0x9999, 1, response_uri, 0, tag);
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
    validation_registry.validation_request(agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // Empty response URI is allowed
    start_cheat_caller_address(validation_address, validator());
    let tag: ByteArray = "";
    validation_registry.validation_response(agent_id, request_hash, 1, "", 0, tag);
    stop_cheat_caller_address(validation_address);

    let (response, _, _, has_response) = validation_registry.get_validation_status(validator(), agent_id, request_hash);
    assert_eq!(response, 1);
    assert!(has_response);
}

// ============ Aggregation Tests ============

#[test]
fn test_get_summary_no_filters() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create validations: 1=valid, 2=invalid
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 1, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator2(), 2, 0x2222, "",
    );

    let empty_validators = array![].span();
    let (count, valid_count, invalid_count) = validation_registry.get_summary(agent_id, "", empty_validators);

    assert_eq!(count, 2);
    assert_eq!(valid_count, 1);
    assert_eq!(invalid_count, 1);
}

#[test]
fn test_get_summary_filter_by_validator() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 1, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator2(), 2, 0x2222, "",
    );

    let validators_filter = array![validator()].span();
    let (count, valid_count, invalid_count) = validation_registry.get_summary(agent_id, "", validators_filter);

    assert_eq!(count, 1);
    assert_eq!(valid_count, 1);
    assert_eq!(invalid_count, 0);
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
        validation_registry, validation_address, agent_id, validator(), 1, 0x1111, tag1.clone(),
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator2(), 2, 0x2222, tag2,
    );

    let empty_validators = array![].span();
    let (count, valid_count, invalid_count) = validation_registry.get_summary(agent_id, tag1, empty_validators);

    assert_eq!(count, 1);
    assert_eq!(valid_count, 1);
    assert_eq!(invalid_count, 0);
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
    validation_registry.validation_request(agent_id, request_uri, 0x1111);
    stop_cheat_caller_address(validation_address);

    // Create and respond to another
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator2(), 1, 0x2222, "",
    );

    let empty_validators = array![].span();
    let (count, valid_count, invalid_count) = validation_registry.get_summary(agent_id, "", empty_validators);

    assert_eq!(count, 1);
    assert_eq!(valid_count, 1);
    assert_eq!(invalid_count, 0);
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
    validation_registry.validation_request(agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(agent_id, request_uri, hash2);
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

    // Agent owner creates requests
    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(agent_id, request_uri, hash2);
    stop_cheat_caller_address(validation_address);

    // Requests are stored under the requester (agent_owner)
    let requests = validation_registry.get_validator_requests(agent_owner());
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
    let (response, last_update, response_hash, has_response) = validation_registry
        .get_validation_status(validator(), 0, nonexistent_hash);

    assert_eq!(response, 0, "Should return 0");
    assert_eq!(last_update, 0, "Should return 0");
    assert_eq!(response_hash, 0, "Should return 0");
    assert!(!has_response, "Should not have response");
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
    validation_registry.validation_request(agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);

    // Should return defaults for pending request (no response yet)
    let (response, last_update, response_hash, has_response) = validation_registry
        .get_validation_status(validator(), agent_id, request_hash);

    assert_eq!(response, 0, "Pending: should return 0");
    assert_eq!(last_update, 0, "Pending: should return 0");
    assert_eq!(response_hash, 0, "Pending: should return 0");
    assert!(!has_response, "Pending: should not have response");
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
    validation_registry.validation_request(agent_id, request_uri.clone(), request_hash);

    // SECURITY: Attempting to use the same hash again should revert to prevent hijacking
    validation_registry.validation_request(agent_id, request_uri, request_hash);
    stop_cheat_caller_address(validation_address);
}

#[test]
fn test_validation_response_valid_and_invalid() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let hash1: u256 = 0x1111; // valid
    let hash2: u256 = 0x2222; // invalid
    let request_uri: ByteArray = "ipfs://QmRequest/validation-request.json";

    start_cheat_caller_address(validation_address, agent_owner());
    validation_registry.validation_request(agent_id, request_uri.clone(), hash1);
    validation_registry.validation_request(agent_id, request_uri, hash2);
    stop_cheat_caller_address(validation_address);

    start_cheat_caller_address(validation_address, validator());
    let tag: ByteArray = "";
    validation_registry.validation_response(agent_id, hash1, 1, "", 0, tag.clone()); // valid
    validation_registry.validation_response(agent_id, hash2, 2, "", 0, tag); // invalid
    stop_cheat_caller_address(validation_address);

    let (response1, _, _, has_resp1) = validation_registry.get_validation_status(validator(), agent_id, hash1);
    let (response2, _, _, has_resp2) = validation_registry.get_validation_status(validator(), agent_id, hash2);

    assert_eq!(response1, 1);
    assert!(has_resp1);
    assert_eq!(response2, 2);
    assert!(has_resp2);
}

#[test]
fn test_get_summary_all_valid() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create 3 valid responses
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 1, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 1, 0x2222, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 1, 0x3333, "",
    );

    let empty_validators = array![].span();
    let (count, valid_count, invalid_count) = validation_registry.get_summary(agent_id, "", empty_validators);

    assert_eq!(count, 3);
    assert_eq!(valid_count, 3);
    assert_eq!(invalid_count, 0);
}

#[test]
fn test_get_summary_all_invalid() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Create 3 invalid responses
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 2, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 2, 0x2222, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 2, 0x3333, "",
    );

    let empty_validators = array![].span();
    let (count, valid_count, invalid_count) = validation_registry.get_summary(agent_id, "", empty_validators);

    assert_eq!(count, 3);
    assert_eq!(valid_count, 0);
    assert_eq!(invalid_count, 3);
}

#[test]
fn test_get_summary_mixed_with_pending() {
    let (identity_registry, validation_registry, identity_address, validation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Response 0 = pending (not counted as valid or invalid)
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 0, 0x1111, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 1, 0x2222, "",
    );
    create_and_respond_validation_with_tag(
        validation_registry, validation_address, agent_id, validator(), 2, 0x3333, "",
    );

    let empty_validators = array![].span();
    let (count, valid_count, invalid_count) = validation_registry.get_summary(agent_id, "", empty_validators);

    assert_eq!(count, 3); // All 3 have responses (has_response=true)
    assert_eq!(valid_count, 1); // Only response=1 is valid
    assert_eq!(invalid_count, 1); // Only response=2 is invalid
}
