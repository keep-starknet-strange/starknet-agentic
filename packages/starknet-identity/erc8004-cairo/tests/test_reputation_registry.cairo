use erc8004::interfaces::identity_registry::{
    IIdentityRegistryDispatcher, IIdentityRegistryDispatcherTrait,
};
use erc8004::interfaces::reputation_registry::{
    FeedbackAuth, IReputationRegistryDispatcher, IReputationRegistryDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp_global, stop_cheat_block_timestamp_global,
};
use starknet::{ContractAddress, get_block_timestamp, get_tx_info};

// Test addresses
fn agent_owner() -> ContractAddress {
    starknet::contract_address_const::<0xA11CE>()
}

fn client() -> ContractAddress {
    starknet::contract_address_const::<0xB0B>()
}

fn client2() -> ContractAddress {
    starknet::contract_address_const::<0x3>()
}

fn responder() -> ContractAddress {
    starknet::contract_address_const::<0x4>()
}

// Deploy contracts (including MockAccount for signature verification)
fn deploy_contracts() -> (
    IIdentityRegistryDispatcher,
    IReputationRegistryDispatcher,
    ContractAddress,
    ContractAddress,
    ContractAddress, // mock_account_address
) {
    // Deploy IdentityRegistry
    let identity_contract = declare("IdentityRegistry").unwrap().contract_class();
    let (identity_address, _) = identity_contract.deploy(@array![]).unwrap();
    let identity_registry = IIdentityRegistryDispatcher { contract_address: identity_address };

    // Deploy ReputationRegistry with IdentityRegistry address
    let reputation_contract = declare("ReputationRegistry").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append(identity_address.into());
    let (reputation_address, _) = reputation_contract.deploy(@calldata).unwrap();
    let reputation_registry = IReputationRegistryDispatcher {
        contract_address: reputation_address,
    };

    // Deploy SimpleMockAccount for signature verification in tests
    let mock_account_contract = declare("SimpleMockAccount").unwrap().contract_class();
    let (mock_account_address, _) = mock_account_contract.deploy(@array![]).unwrap();

    (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address)
}

// Helper to create FeedbackAuth struct
fn create_feedback_auth(
    agent_id: u256,
    client_address: ContractAddress,
    index_limit: u64,
    expiry: u64,
    identity_registry: ContractAddress,
    signer_address: ContractAddress,
) -> FeedbackAuth {
    let chain_id: u256 = get_tx_info().unbox().chain_id.into();
    FeedbackAuth {
        agent_id, client_address, index_limit, expiry, chain_id, identity_registry, signer_address,
    }
}

// Helper to create a dummy signature (for testing, actual signature would come from account)
fn create_dummy_signature() -> Span<felt252> {
    array![0x1234567890abcdef, 0xfedcba0987654321].span()
}

// ============ Give Feedback Tests ============

#[test]
fn test_give_feedback_success() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    // Register agent using mock account as owner
    start_cheat_caller_address(identity_address, mock_account_address);
    let token_uri: ByteArray = "ipfs://QmTest/agent.json";
    let agent_id = identity_registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(identity_address);

    // Create feedback auth with mock account as signer
    let expiry = get_block_timestamp() + 86400; // 1 day
    let feedback_auth = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );

    // Give feedback
    start_cheat_caller_address(reputation_address, client());
    let feedback_uri: ByteArray = "ipfs://QmFeedback/feedback.json";
    let tag1: u256 = 'quality';
    let tag2: u256 = 'speed';
    let filehash: u256 = 0x1234; // keccak256("test")

    reputation_registry
        .give_feedback(
            agent_id,
            95,
            tag1,
            tag2,
            feedback_uri,
            filehash,
            feedback_auth,
            create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    // Verify feedback was stored
    let (score, stored_tag1, stored_tag2, is_revoked) = reputation_registry
        .read_feedback(agent_id, client(), 1);
    assert_eq!(score, 95, "Score should match");
    assert_eq!(stored_tag1, tag1, "Tag1 should match");
    assert_eq!(stored_tag2, tag2, "Tag2 should match");
    assert!(!is_revoked, "Should not be revoked");

    // Verify client was added
    let clients = reputation_registry.get_clients(agent_id);
    assert_eq!(clients.len(), 1, "Should have 1 client");

    // Verify last index
    assert_eq!(reputation_registry.get_last_index(agent_id, client()), 1, "Last index should be 1");
}

#[test]
fn test_give_feedback_multiple_feedbacks() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;
    let tag1: u256 = 'quality';
    let tag2: u256 = 'speed';

    // First feedback
    let feedback_auth1 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(agent_id, 90, tag1, tag2, "", 0, feedback_auth1, create_dummy_signature());
    stop_cheat_caller_address(reputation_address);

    // Second feedback
    let feedback_auth2 = create_feedback_auth(
        agent_id, client(), 2, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(agent_id, 95, tag1, tag2, "", 0, feedback_auth2, create_dummy_signature());
    stop_cheat_caller_address(reputation_address);

    assert_eq!(reputation_registry.get_last_index(agent_id, client()), 2);

    let (score1, _, _, _) = reputation_registry.read_feedback(agent_id, client(), 1);
    let (score2, _, _, _) = reputation_registry.read_feedback(agent_id, client(), 2);

    assert_eq!(score1, 90);
    assert_eq!(score2, 95);
}

#[test]
fn test_give_feedback_multiple_clients() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;
    let tag1: u256 = 'quality';
    let tag2: u256 = 'speed';

    // Client 1 feedback
    let feedback_auth1 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(agent_id, 90, tag1, tag2, "", 0, feedback_auth1, create_dummy_signature());
    stop_cheat_caller_address(reputation_address);

    // Client 2 feedback
    let feedback_auth2 = create_feedback_auth(
        agent_id, client2(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client2());
    reputation_registry
        .give_feedback(agent_id, 85, tag1, tag2, "", 0, feedback_auth2, create_dummy_signature());
    stop_cheat_caller_address(reputation_address);

    let clients = reputation_registry.get_clients(agent_id);
    assert_eq!(clients.len(), 2);
}

#[test]
#[should_panic(expected: 'Score must be 0-100')]
fn test_give_feedback_score_too_high_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;
    let feedback_auth = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );

    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 101, 'tag1', 'tag2', "", 0, feedback_auth, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'Agent does not exist')]
fn test_give_feedback_nonexistent_agent_reverts() {
    let (_, reputation_registry, identity_address, reputation_address, mock_account_address) = deploy_contracts();

    let expiry = get_block_timestamp() + 86400;
    let feedback_auth = create_feedback_auth(
        999, client(), 1, expiry, identity_address, mock_account_address,
    );

    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(999, 90, 'tag1', 'tag2', "", 0, feedback_auth, create_dummy_signature());
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'AgentId mismatch')]
fn test_give_feedback_wrong_agent_id_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;
    // Create auth with wrong agent ID
    let feedback_auth = create_feedback_auth(
        999, client(), 1, expiry, identity_address, mock_account_address,
    );

    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'ClientAddress mismatch')]
fn test_give_feedback_wrong_client_address_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;
    // Create auth with wrong client
    let feedback_auth = create_feedback_auth(
        agent_id, client2(), 1, expiry, identity_address, mock_account_address,
    );

    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'Authorization expired')]
fn test_give_feedback_expired_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Set current time to 1000, then create auth that expires at 999
    start_cheat_block_timestamp_global(1000);
    let expiry = 999; // Already expired
    let feedback_auth = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );

    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'Index limit exceeded')]
fn test_give_feedback_index_limit_exceeded_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;

    // Give first feedback
    let feedback_auth1 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth1, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    // Try second feedback with same limit
    let feedback_auth2 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 95, 'tag1', 'tag2', "", 0, feedback_auth2, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);
}


#[test]
#[should_panic(expected: 'Self-feedback not allowed')]
fn test_give_feedback_self_feedback_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;
    // Agent owner (mock_account_address) tries to give feedback to themselves
    let feedback_auth = create_feedback_auth(
        agent_id, mock_account_address, 1, expiry, identity_address, mock_account_address,
    );

    start_cheat_caller_address(reputation_address, mock_account_address);
    reputation_registry
        .give_feedback(
            agent_id, 100, 'tag1', 'tag2', "", 0, feedback_auth, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);
}

// ============ Revoke Feedback Tests ============

#[test]
fn test_revoke_feedback_success() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedback first
    let expiry = get_block_timestamp() + 86400;
    let feedback_auth = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    // Revoke it
    start_cheat_caller_address(reputation_address, client());
    reputation_registry.revoke_feedback(agent_id, 1);
    stop_cheat_caller_address(reputation_address);

    // Verify revoked
    let (_, _, _, is_revoked) = reputation_registry.read_feedback(agent_id, client(), 1);
    assert!(is_revoked, "Should be revoked");
}

#[test]
#[should_panic(expected: 'Invalid index')]
fn test_revoke_feedback_invalid_index_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    start_cheat_caller_address(reputation_address, client());
    reputation_registry.revoke_feedback(agent_id, 1);
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'Already revoked')]
fn test_revoke_feedback_already_revoked_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give and revoke feedback
    let expiry = get_block_timestamp() + 86400;
    let feedback_auth = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth, create_dummy_signature(),
        );
    reputation_registry.revoke_feedback(agent_id, 1);

    // Try to revoke again
    reputation_registry.revoke_feedback(agent_id, 1);
    stop_cheat_caller_address(reputation_address);
}

// ============ Append Response Tests ============

#[test]
fn test_append_response_success() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedback first
    let expiry = get_block_timestamp() + 86400;
    let feedback_auth = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    let feedback_uri: ByteArray = "ipfs://QmFeedback/feedback.json";
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', feedback_uri, 0, feedback_auth, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    // Append response
    start_cheat_caller_address(reputation_address, responder());
    let response_uri: ByteArray = "ipfs://QmResponse/response.json";
    let response_hash: u256 = 0x5678;
    reputation_registry.append_response(agent_id, client(), 1, response_uri, response_hash);
    stop_cheat_caller_address(reputation_address);
}

#[test]
fn test_append_response_multiple_responders() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedback
    let expiry = get_block_timestamp() + 86400;
    let feedback_auth = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    // Multiple responses
    start_cheat_caller_address(reputation_address, responder());
    reputation_registry
        .append_response(agent_id, client(), 1, "ipfs://QmResponse/response.json", 0);
    stop_cheat_caller_address(reputation_address);

    start_cheat_caller_address(reputation_address, agent_owner());
    reputation_registry.append_response(agent_id, client(), 1, "ipfs://QmRefund", 0);
    stop_cheat_caller_address(reputation_address);

    // Verify response count
    let responders = array![responder(), agent_owner()];
    let count = reputation_registry.get_response_count(agent_id, client(), 1, responders.span());
    assert_eq!(count, 2);
}

#[test]
#[should_panic(expected: 'Invalid index')]
fn test_append_response_invalid_index_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    start_cheat_caller_address(reputation_address, responder());
    reputation_registry
        .append_response(agent_id, client(), 1, "ipfs://QmResponse/response.json", 0);
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'Empty URI')]
fn test_append_response_empty_uri_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedback first
    let expiry = get_block_timestamp() + 86400;
    let feedback_auth = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    start_cheat_caller_address(reputation_address, responder());
    reputation_registry.append_response(agent_id, client(), 1, "", 0);
    stop_cheat_caller_address(reputation_address);
}

// ============ Read Functions Tests ============

#[test]
fn test_get_summary_no_filters() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;

    // Give multiple feedbacks
    let feedback_auth1 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth1, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    let feedback_auth2 = create_feedback_auth(
        agent_id, client2(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client2());
    reputation_registry
        .give_feedback(
            agent_id, 80, 'tag1', 'tag2', "", 0, feedback_auth2, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    let empty_clients = array![].span();
    let (count, avg_score) = reputation_registry.get_summary(agent_id, empty_clients, 0, 0);

    assert_eq!(count, 2);
    assert_eq!(avg_score, 85); // (90 + 80) / 2
}

#[test]
fn test_get_summary_filter_by_client() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;

    // Give multiple feedbacks
    let feedback_auth1 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth1, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    let feedback_auth2 = create_feedback_auth(
        agent_id, client2(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client2());
    reputation_registry
        .give_feedback(
            agent_id, 80, 'tag1', 'tag2', "", 0, feedback_auth2, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    let clients_filter = array![client()].span();
    let (count, avg_score) = reputation_registry.get_summary(agent_id, clients_filter, 0, 0);

    assert_eq!(count, 1);
    assert_eq!(avg_score, 90);
}

#[test]
fn test_get_summary_filter_by_tags() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;
    let tag1a: u256 = 'quality';
    let tag1b: u256 = 'other';
    let tag2: u256 = 'speed';

    // Give feedbacks with different tags
    let feedback_auth1 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(agent_id, 90, tag1a, tag2, "", 0, feedback_auth1, create_dummy_signature());
    stop_cheat_caller_address(reputation_address);

    let feedback_auth2 = create_feedback_auth(
        agent_id, client2(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client2());
    reputation_registry
        .give_feedback(agent_id, 80, tag1b, tag2, "", 0, feedback_auth2, create_dummy_signature());
    stop_cheat_caller_address(reputation_address);

    let empty_clients = array![].span();
    let (count, avg_score) = reputation_registry.get_summary(agent_id, empty_clients, tag1a, 0);

    assert_eq!(count, 1);
    assert_eq!(avg_score, 90);
}

#[test]
fn test_get_summary_excludes_revoked() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;

    // Give multiple feedbacks
    let feedback_auth1 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth1, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    let feedback_auth2 = create_feedback_auth(
        agent_id, client2(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client2());
    reputation_registry
        .give_feedback(
            agent_id, 80, 'tag1', 'tag2', "", 0, feedback_auth2, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    // Revoke first feedback
    start_cheat_caller_address(reputation_address, client());
    reputation_registry.revoke_feedback(agent_id, 1);
    stop_cheat_caller_address(reputation_address);

    let empty_clients = array![].span();
    let (count, avg_score) = reputation_registry.get_summary(agent_id, empty_clients, 0, 0);

    assert_eq!(count, 1);
    assert_eq!(avg_score, 80); // Only client2's feedback
}

#[test]
fn test_read_all_feedback_success() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;

    // Give multiple feedbacks
    let feedback_auth1 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth1, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    let feedback_auth2 = create_feedback_auth(
        agent_id, client2(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client2());
    reputation_registry
        .give_feedback(
            agent_id, 85, 'tag1', 'tag2', "", 0, feedback_auth2, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    let empty_clients = array![].span();
    let (clients_arr, scores, _tag1s, _tag2s, revoked_statuses) = reputation_registry
        .read_all_feedback(agent_id, empty_clients, 0, 0, false);

    assert_eq!(clients_arr.len(), 2);
    assert_eq!(scores.len(), 2);
    assert_eq!(*scores.at(0), 90);
    assert_eq!(*scores.at(1), 85);
    assert!(!*revoked_statuses.at(0));
    assert!(!*revoked_statuses.at(1));
}

#[test]
fn test_read_all_feedback_excludes_revoked() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;

    // Give multiple feedbacks
    let feedback_auth1 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth1, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    let feedback_auth2 = create_feedback_auth(
        agent_id, client2(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client2());
    reputation_registry
        .give_feedback(
            agent_id, 85, 'tag1', 'tag2', "", 0, feedback_auth2, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    // Revoke first feedback
    start_cheat_caller_address(reputation_address, client());
    reputation_registry.revoke_feedback(agent_id, 1);
    stop_cheat_caller_address(reputation_address);

    let empty_clients = array![].span();
    let (clients_arr, scores, _, _, _) = reputation_registry
        .read_all_feedback(agent_id, empty_clients, 0, 0, false);

    assert_eq!(clients_arr.len(), 1);
    assert_eq!(*scores.at(0), 85); // Only client2's feedback
}

#[test]
fn test_get_clients_returns_all_clients() {
    let (identity_registry, reputation_registry, identity_address, reputation_address, mock_account_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, mock_account_address);
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let expiry = get_block_timestamp() + 86400;

    // Give multiple feedbacks
    let feedback_auth1 = create_feedback_auth(
        agent_id, client(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry
        .give_feedback(
            agent_id, 90, 'tag1', 'tag2', "", 0, feedback_auth1, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    let feedback_auth2 = create_feedback_auth(
        agent_id, client2(), 1, expiry, identity_address, mock_account_address,
    );
    start_cheat_caller_address(reputation_address, client2());
    reputation_registry
        .give_feedback(
            agent_id, 85, 'tag1', 'tag2', "", 0, feedback_auth2, create_dummy_signature(),
        );
    stop_cheat_caller_address(reputation_address);

    let clients_arr = reputation_registry.get_clients(agent_id);
    assert_eq!(clients_arr.len(), 2);
}

#[test]
fn test_get_identity_registry_returns_correct_address() {
    let (_, reputation_registry, identity_address, _, _) = deploy_contracts();
    assert_eq!(reputation_registry.get_identity_registry(), identity_address);
}

