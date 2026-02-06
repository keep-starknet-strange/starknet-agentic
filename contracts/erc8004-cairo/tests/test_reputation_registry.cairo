use erc8004::interfaces::identity_registry::{
    IIdentityRegistryDispatcher, IIdentityRegistryDispatcherTrait,
};
use erc8004::interfaces::reputation_registry::{
    IReputationRegistryDispatcher, IReputationRegistryDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

// Test addresses
fn agent_owner() -> ContractAddress {
    0xA11CE.try_into().unwrap()
}

fn client() -> ContractAddress {
    0xB0B.try_into().unwrap()
}

fn client2() -> ContractAddress {
    0x3.try_into().unwrap()
}

fn responder() -> ContractAddress {
    0x4.try_into().unwrap()
}

// Contract owner for upgrades
fn owner() -> ContractAddress {
    0x999.try_into().unwrap()
}

// Deploy contracts
fn deploy_contracts() -> (
    IIdentityRegistryDispatcher, IReputationRegistryDispatcher, ContractAddress, ContractAddress,
) {
    // Deploy IdentityRegistry with owner
    let identity_contract = declare("IdentityRegistry").unwrap().contract_class();
    let (identity_address, _) = identity_contract.deploy(@array![owner().into()]).unwrap();
    let identity_registry = IIdentityRegistryDispatcher { contract_address: identity_address };

    // Deploy ReputationRegistry with owner and IdentityRegistry address
    let reputation_contract = declare("ReputationRegistry").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append(owner().into()); // owner
    calldata.append(identity_address.into()); // identity_registry
    let (reputation_address, _) = reputation_contract.deploy(@calldata).unwrap();
    let reputation_registry = IReputationRegistryDispatcher {
        contract_address: reputation_address,
    };

    (identity_registry, reputation_registry, identity_address, reputation_address)
}

// Helper to give feedback
fn give_feedback_helper(
    reputation_registry: IReputationRegistryDispatcher,
    reputation_address: ContractAddress,
    agent_id: u256,
    caller: ContractAddress,
    value: i128,
    value_decimals: u8,
    tag1: ByteArray,
    tag2: ByteArray,
) {
    start_cheat_caller_address(reputation_address, caller);
    reputation_registry
        .give_feedback(agent_id, value, value_decimals, tag1, tag2, "", "", 0);
    stop_cheat_caller_address(reputation_address);
}

// ============ Give Feedback Tests ============

#[test]
fn test_give_feedback_success() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    // Register agent
    start_cheat_caller_address(identity_address, agent_owner());
    let token_uri: ByteArray = "ipfs://QmTest/agent.json";
    let agent_id = identity_registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(identity_address);

    // Give feedback
    let tag1: ByteArray = "quality";
    let tag2: ByteArray = "speed";
    let feedback_uri: ByteArray = "ipfs://QmFeedback/feedback.json";

    start_cheat_caller_address(reputation_address, client());
    reputation_registry.give_feedback(agent_id, 95, 0, tag1.clone(), tag2.clone(), "", feedback_uri, 0x1234);
    stop_cheat_caller_address(reputation_address);

    // Verify feedback was stored
    let (value, decimals, stored_tag1, stored_tag2, is_revoked) = reputation_registry
        .read_feedback(agent_id, client(), 1);
    assert_eq!(value, 95, "Value should match");
    assert_eq!(decimals, 0, "Decimals should match");
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
fn test_give_feedback_with_decimals() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedback with 2 decimal places (value = 4.5 represented as 450 with 2 decimals)
    start_cheat_caller_address(reputation_address, client());
    reputation_registry.give_feedback(agent_id, 450, 2, "tag1", "tag2", "", "", 0);
    stop_cheat_caller_address(reputation_address);

    let (value, decimals, _, _, _) = reputation_registry.read_feedback(agent_id, client(), 1);
    assert_eq!(value, 450);
    assert_eq!(decimals, 2);
}

#[test]
fn test_give_feedback_negative_value() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give negative feedback
    start_cheat_caller_address(reputation_address, client());
    reputation_registry.give_feedback(agent_id, -50, 0, "tag1", "tag2", "", "", 0);
    stop_cheat_caller_address(reputation_address);

    let (value, _, _, _, _) = reputation_registry.read_feedback(agent_id, client(), 1);
    assert_eq!(value, -50);
}

#[test]
fn test_give_feedback_multiple_feedbacks() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // First feedback
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );

    // Second feedback
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 95, 0, "tag1", "tag2",
    );

    assert_eq!(reputation_registry.get_last_index(agent_id, client()), 2);

    let (value1, _, _, _, _) = reputation_registry.read_feedback(agent_id, client(), 1);
    let (value2, _, _, _, _) = reputation_registry.read_feedback(agent_id, client(), 2);

    assert_eq!(value1, 90);
    assert_eq!(value2, 95);
}

#[test]
fn test_give_feedback_multiple_clients() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Client 1 feedback
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );

    // Client 2 feedback
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), 85, 0, "tag1", "tag2",
    );

    let clients = reputation_registry.get_clients(agent_id);
    assert_eq!(clients.len(), 2);
}

#[test]
#[should_panic(expected: 'too many decimals')]
fn test_give_feedback_decimals_too_high_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    start_cheat_caller_address(reputation_address, client());
    reputation_registry.give_feedback(agent_id, 100, 19, "tag1", "tag2", "", "", 0); // 19 > 18
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'value too large')]
fn test_give_feedback_value_too_large_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // MAX_ABS_VALUE is 1e38, try 1e39
    let huge_value: i128 = 170141183460469231731687303715884105727; // i128::MAX
    start_cheat_caller_address(reputation_address, client());
    reputation_registry.give_feedback(agent_id, huge_value, 0, "tag1", "tag2", "", "", 0);
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'Self-feedback not allowed')]
fn test_give_feedback_self_feedback_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Agent owner tries to give feedback to themselves
    start_cheat_caller_address(reputation_address, agent_owner());
    reputation_registry.give_feedback(agent_id, 100, 0, "tag1", "tag2", "", "", 0);
    stop_cheat_caller_address(reputation_address);
}

// ============ Revoke Feedback Tests ============

#[test]
fn test_revoke_feedback_success() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedback first
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );

    // Revoke it
    start_cheat_caller_address(reputation_address, client());
    reputation_registry.revoke_feedback(agent_id, 1);
    stop_cheat_caller_address(reputation_address);

    // Verify revoked
    let (_, _, _, _, is_revoked) = reputation_registry.read_feedback(agent_id, client(), 1);
    assert!(is_revoked, "Should be revoked");
}

#[test]
#[should_panic(expected: 'index must be > 0')]
fn test_revoke_feedback_zero_index_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    start_cheat_caller_address(reputation_address, client());
    reputation_registry.revoke_feedback(agent_id, 0);
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'index out of bounds')]
fn test_revoke_feedback_invalid_index_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    start_cheat_caller_address(reputation_address, client());
    reputation_registry.revoke_feedback(agent_id, 1); // No feedback given yet
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'Already revoked')]
fn test_revoke_feedback_already_revoked_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give and revoke feedback
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );
    start_cheat_caller_address(reputation_address, client());
    reputation_registry.revoke_feedback(agent_id, 1);

    // Try to revoke again
    reputation_registry.revoke_feedback(agent_id, 1);
    stop_cheat_caller_address(reputation_address);
}

// ============ Append Response Tests ============

#[test]
fn test_append_response_success() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedback first
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );

    // Append response
    start_cheat_caller_address(reputation_address, responder());
    let response_uri: ByteArray = "ipfs://QmResponse/response.json";
    reputation_registry.append_response(agent_id, client(), 1, response_uri, 0x5678);
    stop_cheat_caller_address(reputation_address);
}

#[test]
fn test_append_response_multiple_responders() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedback
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );

    // Multiple responses
    start_cheat_caller_address(reputation_address, responder());
    reputation_registry.append_response(agent_id, client(), 1, "ipfs://response1", 0);
    stop_cheat_caller_address(reputation_address);

    start_cheat_caller_address(reputation_address, agent_owner());
    reputation_registry.append_response(agent_id, client(), 1, "ipfs://response2", 0);
    stop_cheat_caller_address(reputation_address);

    // Verify response count
    let responders = array![responder(), agent_owner()];
    let count = reputation_registry.get_response_count(agent_id, client(), 1, responders.span());
    assert_eq!(count, 2);
}

#[test]
#[should_panic(expected: 'index must be > 0')]
fn test_append_response_zero_index_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    start_cheat_caller_address(reputation_address, responder());
    reputation_registry.append_response(agent_id, client(), 0, "ipfs://response", 0);
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'index out of bounds')]
fn test_append_response_invalid_index_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    start_cheat_caller_address(reputation_address, responder());
    reputation_registry.append_response(agent_id, client(), 1, "ipfs://response", 0);
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[should_panic(expected: 'Empty URI')]
fn test_append_response_empty_uri_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedback first
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );

    start_cheat_caller_address(reputation_address, responder());
    reputation_registry.append_response(agent_id, client(), 1, "", 0);
    stop_cheat_caller_address(reputation_address);
}

// ============ Read Functions Tests ============

#[test]
fn test_get_summary_basic() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give multiple feedbacks with same decimals
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), 80, 0, "tag1", "tag2",
    );

    let clients_filter = array![client(), client2()].span();
    let (count, avg_value, avg_decimals) = reputation_registry
        .get_summary(agent_id, clients_filter, "", "");

    assert_eq!(count, 2);
    assert_eq!(avg_value, 85); // (90 + 80) / 2
    assert_eq!(avg_decimals, 0);
}

#[test]
fn test_get_summary_filter_by_client() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give multiple feedbacks
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), 80, 0, "tag1", "tag2",
    );

    let clients_filter = array![client()].span();
    let (count, avg_value, _) = reputation_registry.get_summary(agent_id, clients_filter, "", "");

    assert_eq!(count, 1);
    assert_eq!(avg_value, 90);
}

#[test]
fn test_get_summary_filter_by_tags() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedbacks with different tags
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "quality", "speed",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), 80, 0, "other", "speed",
    );

    let clients_filter = array![client(), client2()].span();
    let (count, avg_value, _) = reputation_registry
        .get_summary(agent_id, clients_filter, "quality", "");

    assert_eq!(count, 1);
    assert_eq!(avg_value, 90);
}

#[test]
fn test_get_summary_excludes_revoked() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give multiple feedbacks
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), 80, 0, "tag1", "tag2",
    );

    // Revoke first feedback
    start_cheat_caller_address(reputation_address, client());
    reputation_registry.revoke_feedback(agent_id, 1);
    stop_cheat_caller_address(reputation_address);

    let clients_filter = array![client(), client2()].span();
    let (count, avg_value, _) = reputation_registry.get_summary(agent_id, clients_filter, "", "");

    assert_eq!(count, 1);
    assert_eq!(avg_value, 80); // Only client2's feedback
}

#[test]
fn test_get_summary_mixed_decimals() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give feedbacks with different decimals
    // 90.0 (decimals=0), 8000 with decimals=2 means 80.00
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), 8000, 2, "tag1", "tag2",
    );

    let clients_filter = array![client(), client2()].span();
    let (count, _avg_value, _avg_decimals) = reputation_registry
        .get_summary(agent_id, clients_filter, "", "");

    assert_eq!(count, 2);
    // Mode decimals depends on frequency - both have 1 count each, so mode is the first (0)
    // or last depending on tie-breaking. With our impl, it should be 0.
}

#[test]
fn test_get_summary_with_negative_values() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Test case 1: positive + negative = net positive
    // value1 = 50, value2 = -30
    // sum = 50 + (-30) = 20
    // avg = 20 / 2 = 10
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 50, 0, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), -30, 0, "tag1", "tag2",
    );

    let clients_filter = array![client(), client2()].span();
    let (count, avg_value, avg_decimals) = reputation_registry
        .get_summary(agent_id, clients_filter, "", "");

    assert_eq!(count, 2);
    assert_eq!(avg_value, 10); // (50 + -30) / 2 = 10
    assert_eq!(avg_decimals, 0);
}

#[test]
fn test_get_summary_net_negative() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Test case: positive + larger negative = net negative
    // value1 = 30, value2 = -70
    // sum = 30 + (-70) = -40
    // avg = -40 / 2 = -20
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 30, 0, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), -70, 0, "tag1", "tag2",
    );

    let clients_filter = array![client(), client2()].span();
    let (count, avg_value, avg_decimals) = reputation_registry
        .get_summary(agent_id, clients_filter, "", "");

    assert_eq!(count, 2);
    assert_eq!(avg_value, -20); // (30 + -70) / 2 = -20
    assert_eq!(avg_decimals, 0);
}

#[test]
fn test_get_summary_all_negative() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Test case: all negative values
    // value1 = -40, value2 = -60
    // sum = -40 + (-60) = -100
    // avg = -100 / 2 = -50
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), -40, 0, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), -60, 0, "tag1", "tag2",
    );

    let clients_filter = array![client(), client2()].span();
    let (count, avg_value, avg_decimals) = reputation_registry
        .get_summary(agent_id, clients_filter, "", "");

    assert_eq!(count, 2);
    assert_eq!(avg_value, -50); // (-40 + -60) / 2 = -50
    assert_eq!(avg_decimals, 0);
}

#[test]
fn test_get_summary_negative_with_decimals() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Test case: negative values with decimals
    // value1 = -4500 with 2 decimals = -45.00
    // value2 = -5500 with 2 decimals = -55.00
    // sum = -45.00 + (-55.00) = -100.00
    // avg = -100.00 / 2 = -50.00 = -5000 with 2 decimals
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), -4500, 2, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), -5500, 2, "tag1", "tag2",
    );

    let clients_filter = array![client(), client2()].span();
    let (count, avg_value, avg_decimals) = reputation_registry
        .get_summary(agent_id, clients_filter, "", "");

    assert_eq!(count, 2);
    assert_eq!(avg_value, -5000); // (-4500 + -5500) / 2 = -5000
    assert_eq!(avg_decimals, 2);
}

#[test]
#[should_panic(expected: 'clientAddresses required')]
fn test_get_summary_no_clients_reverts() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let empty_clients: Span<ContractAddress> = array![].span();
    reputation_registry.get_summary(agent_id, empty_clients, "", "");
}

#[test]
fn test_read_all_feedback_success() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give multiple feedbacks
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), 85, 2, "tag1", "tag2",
    );

    let empty_clients: Span<ContractAddress> = array![].span();
    let (clients_arr, indexes_arr, values_arr, decimals_arr, _tag1s, _tag2s, revoked_arr) =
        reputation_registry
        .read_all_feedback(agent_id, empty_clients, "", "", false);

    assert_eq!(clients_arr.len(), 2);
    assert_eq!(indexes_arr.len(), 2);
    assert_eq!(values_arr.len(), 2);
    assert_eq!(decimals_arr.len(), 2);
    assert_eq!(*values_arr.at(0), 90);
    assert_eq!(*values_arr.at(1), 85);
    assert_eq!(*decimals_arr.at(0), 0);
    assert_eq!(*decimals_arr.at(1), 2);
    assert!(!*revoked_arr.at(0));
    assert!(!*revoked_arr.at(1));
}

#[test]
fn test_read_all_feedback_excludes_revoked() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give multiple feedbacks
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), 85, 0, "tag1", "tag2",
    );

    // Revoke first feedback
    start_cheat_caller_address(reputation_address, client());
    reputation_registry.revoke_feedback(agent_id, 1);
    stop_cheat_caller_address(reputation_address);

    let empty_clients: Span<ContractAddress> = array![].span();
    let (clients_arr, _, values_arr, _, _, _, _) = reputation_registry
        .read_all_feedback(agent_id, empty_clients, "", "", false);

    assert_eq!(clients_arr.len(), 1);
    assert_eq!(*values_arr.at(0), 85); // Only client2's feedback
}

#[test]
fn test_get_clients_returns_all_clients() {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    // Give multiple feedbacks
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), 90, 0, "tag1", "tag2",
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), 85, 0, "tag1", "tag2",
    );

    let clients_arr = reputation_registry.get_clients(agent_id);
    assert_eq!(clients_arr.len(), 2);
}

#[test]
fn test_get_identity_registry_returns_correct_address() {
    let (_, reputation_registry, identity_address, _) = deploy_contracts();
    assert_eq!(reputation_registry.get_identity_registry(), identity_address);
}
