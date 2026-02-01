use erc8004::interfaces::identity_registry::{
    IIdentityRegistryDispatcher, IIdentityRegistryDispatcherTrait, MetadataEntry,
};
use openzeppelin::token::erc721::interface::{
    IERC721Dispatcher, IERC721DispatcherTrait, IERC721MetadataDispatcher,
    IERC721MetadataDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

// Test addresses
fn alice() -> ContractAddress {
    starknet::contract_address_const::<0x1>()
}

fn bob() -> ContractAddress {
    starknet::contract_address_const::<0x2>()
}

fn charlie() -> ContractAddress {
    starknet::contract_address_const::<0x3>()
}

// Deploy the IdentityRegistry contract
fn deploy_registry() -> (IIdentityRegistryDispatcher, IERC721Dispatcher, ContractAddress) {
    let contract = declare("IdentityRegistry").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![]).unwrap();
    let registry_dispatcher = IIdentityRegistryDispatcher { contract_address };
    let erc721_dispatcher = IERC721Dispatcher { contract_address };
    (registry_dispatcher, erc721_dispatcher, contract_address)
}

// ============ Registration Tests ============

#[test]
fn test_register_with_token_uri_and_metadata() {
    let (registry, erc721, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());

    // Prepare metadata
    let mut metadata = array![
        MetadataEntry { key: "agentName", value: "Alice Agent" },
        MetadataEntry { key: "agentType", value: "AI Assistant" },
    ];

    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";

    // Register
    let agent_id = registry.register_with_metadata(token_uri.clone(), metadata);

    // Assertions
    assert_eq!(agent_id, 1, "First agent should have ID 1");
    assert_eq!(erc721.owner_of(agent_id), alice(), "Alice should own the agent");
    assert_eq!(registry.total_agents(), 1, "Should have 1 agent");
    assert!(registry.agent_exists(agent_id), "Agent should exist");

    // Check metadata
    let name_value = registry.get_metadata(agent_id, "agentName");
    assert_eq!(name_value, "Alice Agent", "Agent name should match");

    let type_value = registry.get_metadata(agent_id, "agentType");
    assert_eq!(type_value, "AI Assistant", "Agent type should match");

    stop_cheat_caller_address(registry_address);
}

#[test]
fn test_register_with_token_uri_only() {
    let (registry, erc721, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, bob());

    let token_uri: ByteArray = "https://example.com/agent.json";
    let agent_id = registry.register_with_token_uri(token_uri.clone());

    assert_eq!(agent_id, 1, "Should be agent ID 1");
    assert_eq!(erc721.owner_of(agent_id), bob(), "Bob should own the agent");

    stop_cheat_caller_address(registry_address);
}

#[test]
fn test_register_without_token_uri() {
    let (registry, erc721, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, charlie());

    let agent_id = registry.register();

    assert_eq!(agent_id, 1, "Should be agent ID 1");
    assert_eq!(erc721.owner_of(agent_id), charlie(), "Charlie should own the agent");

    stop_cheat_caller_address(registry_address);
}

#[test]
fn test_register_multiple_agents() {
    let (registry, _, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());
    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id1 = registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(registry_address);

    start_cheat_caller_address(registry_address, bob());
    let token_uri2: ByteArray = "https://example.com/agent.json";
    let agent_id2 = registry.register_with_token_uri(token_uri2);
    stop_cheat_caller_address(registry_address);

    start_cheat_caller_address(registry_address, charlie());
    let agent_id3 = registry.register();
    stop_cheat_caller_address(registry_address);

    assert_eq!(agent_id1, 1, "First agent ID should be 1");
    assert_eq!(agent_id2, 2, "Second agent ID should be 2");
    assert_eq!(agent_id3, 3, "Third agent ID should be 3");
    assert_eq!(registry.total_agents(), 3, "Should have 3 agents");
}

#[test]
#[should_panic(expected: 'Empty key')]
fn test_register_empty_metadata_key_reverts() {
    let (registry, _, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());

    let mut metadata = array![MetadataEntry { key: "", value: "test" }];

    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    registry.register_with_metadata(token_uri, metadata);

    stop_cheat_caller_address(registry_address);
}

// ============ Metadata Tests ============

#[test]
fn test_set_metadata_success() {
    let (registry, _, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());

    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_token_uri(token_uri);

    registry.set_metadata(agent_id, "version", "1.0.0");

    let version = registry.get_metadata(agent_id, "version");
    assert_eq!(version, "1.0.0", "Version should match");

    stop_cheat_caller_address(registry_address);
}

#[test]
fn test_set_metadata_update_existing() {
    let (registry, _, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());

    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_token_uri(token_uri);

    registry.set_metadata(agent_id, "status", "active");
    assert_eq!(registry.get_metadata(agent_id, "status"), "active");

    registry.set_metadata(agent_id, "status", "inactive");
    assert_eq!(registry.get_metadata(agent_id, "status"), "inactive");

    stop_cheat_caller_address(registry_address);
}

#[test]
#[should_panic(expected: 'Not authorized')]
fn test_set_metadata_not_owner_reverts() {
    let (registry, _, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());
    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(registry_address);

    start_cheat_caller_address(registry_address, bob());
    registry.set_metadata(agent_id, "test", "value");
    stop_cheat_caller_address(registry_address);
}

#[test]
#[should_panic(expected: 'Empty key')]
fn test_set_metadata_empty_key_reverts() {
    let (registry, _, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());

    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_token_uri(token_uri);

    registry.set_metadata(agent_id, "", "value");

    stop_cheat_caller_address(registry_address);
}

#[test]
#[should_panic(expected: 'Agent does not exist')]
fn test_get_metadata_nonexistent_agent_reverts() {
    let (registry, _, _) = deploy_registry();
    let key: ByteArray = "test";
    registry.get_metadata(999, key);
}

#[test]
fn test_get_metadata_nonexistent_key_returns_empty() {
    let (registry, _, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());
    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(registry_address);

    let key: ByteArray = "nonexistent";
    let value = registry.get_metadata(agent_id, key);
    assert_eq!(value.len(), 0, "Should return empty ByteArray");
}

// ============ ERC-721 Functionality Tests ============

#[test]
fn test_transfer_success() {
    let (registry, erc721, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());
    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(registry_address);

    start_cheat_caller_address(registry_address, alice());
    erc721.transfer_from(alice(), bob(), agent_id);
    stop_cheat_caller_address(registry_address);

    assert_eq!(erc721.owner_of(agent_id), bob(), "Bob should now own the agent");
}

#[test]
fn test_approve_success() {
    let (_, erc721, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());
    let registry = IIdentityRegistryDispatcher { contract_address: registry_address };
    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(registry_address);

    start_cheat_caller_address(registry_address, alice());
    erc721.approve(bob(), agent_id);
    stop_cheat_caller_address(registry_address);

    assert_eq!(erc721.get_approved(agent_id), bob(), "Bob should be approved");

    start_cheat_caller_address(registry_address, bob());
    erc721.transfer_from(alice(), charlie(), agent_id);
    stop_cheat_caller_address(registry_address);

    assert_eq!(erc721.owner_of(agent_id), charlie(), "Charlie should now own the agent");
}

#[test]
fn test_set_approval_for_all_success() {
    let (registry, erc721, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());
    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(registry_address);

    start_cheat_caller_address(registry_address, alice());
    erc721.set_approval_for_all(bob(), true);
    stop_cheat_caller_address(registry_address);

    assert!(erc721.is_approved_for_all(alice(), bob()), "Bob should be approved for all");

    start_cheat_caller_address(registry_address, bob());
    registry.set_metadata(agent_id, "test", "value");
    stop_cheat_caller_address(registry_address);

    assert_eq!(registry.get_metadata(agent_id, "test"), "value");
}

// ============ View Function Tests ============

#[test]
fn test_total_agents_increments() {
    let (registry, _, registry_address) = deploy_registry();
    assert_eq!(registry.total_agents(), 0, "Should start at 0");

    start_cheat_caller_address(registry_address, alice());
    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(registry_address);
    assert_eq!(registry.total_agents(), 1);

    start_cheat_caller_address(registry_address, bob());
    let token_uri2: ByteArray = "https://example.com/agent.json";
    registry.register_with_token_uri(token_uri2);
    stop_cheat_caller_address(registry_address);
    assert_eq!(registry.total_agents(), 2);
}

#[test]
fn test_agent_exists_correct() {
    let (registry, _, registry_address) = deploy_registry();
    assert!(!registry.agent_exists(1), "Agent 1 should not exist yet");

    start_cheat_caller_address(registry_address, alice());
    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_token_uri(token_uri);
    stop_cheat_caller_address(registry_address);

    assert!(registry.agent_exists(agent_id), "Agent should exist");
    assert!(!registry.agent_exists(999), "Agent 999 should not exist");
}


#[test]
fn test_name_and_symbol() {
    let (_, _, registry_address) = deploy_registry();
    let erc721_metadata = IERC721MetadataDispatcher { contract_address: registry_address };

    assert_eq!(erc721_metadata.name(), "ERC-8004 Trustless Agent");
    assert_eq!(erc721_metadata.symbol(), "AGENT");
}

// ============ Edge Cases ============

#[test]
fn test_register_large_metadata() {
    let (registry, _, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());

    // Create large metadata value (1000 characters)
    let mut large_value = "";
    let mut i: u32 = 0;
    while i < 100 {
        large_value = format!("{large_value}0123456789");
        i += 1;
    }

    let mut metadata = array![MetadataEntry { key: "largeData", value: large_value.clone() }];

    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_metadata(token_uri, metadata);

    let retrieved = registry.get_metadata(agent_id, "largeData");
    assert_eq!(retrieved, large_value, "Large metadata should match");

    stop_cheat_caller_address(registry_address);
}

#[test]
fn test_register_many_metadata_entries() {
    let (registry, _, registry_address) = deploy_registry();

    start_cheat_caller_address(registry_address, alice());

    let mut metadata = array![];
    let mut i: u32 = 0;
    while i < 10 {
        let key = format!("key{i}");
        let value = format!("value{i}");
        metadata.append(MetadataEntry { key, value });
        i += 1;
    }

    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let agent_id = registry.register_with_metadata(token_uri, metadata);

    let mut i: u32 = 0;
    while i < 10 {
        let key = format!("key{i}");
        let expected = format!("value{i}");
        let actual = registry.get_metadata(agent_id, key);
        assert_eq!(actual, expected, "Metadata entry should match");
        i += 1;
    }

    stop_cheat_caller_address(registry_address);
}

// ============ Integration Tests ============

#[test]
fn test_full_lifecycle() {
    let (registry, erc721, registry_address) = deploy_registry();

    // 1. Alice registers an agent
    start_cheat_caller_address(registry_address, alice());
    let token_uri: ByteArray = "ipfs://QmTest123/registration.json";
    let mut metadata = array![
        MetadataEntry { key: "name", value: "Alice Agent" },
        MetadataEntry { key: "version", value: "1.0.0" },
    ];
    let agent_id = registry.register_with_metadata(token_uri, metadata);
    stop_cheat_caller_address(registry_address);

    // 2. Alice updates metadata
    start_cheat_caller_address(registry_address, alice());
    registry.set_metadata(agent_id, "status", "active");
    stop_cheat_caller_address(registry_address);

    // 3. Alice approves Bob
    start_cheat_caller_address(registry_address, alice());
    erc721.approve(bob(), agent_id);
    stop_cheat_caller_address(registry_address);

    // 4. Bob can update metadata (as approved)
    start_cheat_caller_address(registry_address, bob());
    registry.set_metadata(agent_id, "lastUpdated", "2024-01-01");
    stop_cheat_caller_address(registry_address);

    // 5. Bob transfers to Charlie
    start_cheat_caller_address(registry_address, bob());
    erc721.transfer_from(alice(), charlie(), agent_id);
    stop_cheat_caller_address(registry_address);

    // 6. Verify final state
    assert_eq!(erc721.owner_of(agent_id), charlie());
    assert_eq!(registry.get_metadata(agent_id, "name"), "Alice Agent");
    assert_eq!(registry.get_metadata(agent_id, "status"), "active");
    assert_eq!(registry.get_metadata(agent_id, "lastUpdated"), "2024-01-01");
}
