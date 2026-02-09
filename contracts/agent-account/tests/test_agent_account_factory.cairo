use agent_account::interfaces::{
    IAgentAccountDispatcher, IAgentAccountDispatcherTrait, IAgentAccountFactoryDispatcher,
    IAgentAccountFactoryDispatcherTrait,
};
use agent_account::mock_identity_registry::{
    IMockIdentityRegistryDispatcher, IMockIdentityRegistryDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use snforge_std::signature::stark_curve::StarkCurveKeyPairImpl;
use starknet::{ClassHash, ContractAddress};

fn addr(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

fn other() -> ContractAddress {
    addr(0xbeef)
}

fn zero() -> ContractAddress {
    addr(0)
}

fn deploy_identity_registry() -> ContractAddress {
    let contract = declare("MockIdentityRegistry").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![]).unwrap();
    contract_address
}

fn deploy_factory(
    account_class_hash: ClassHash,
    identity_registry: ContractAddress,
) -> (IAgentAccountFactoryDispatcher, ContractAddress) {
    let contract = declare("AgentAccountFactory").unwrap().contract_class();
    let (contract_address, _) = contract
        .deploy(@array![account_class_hash.into(), identity_registry.into()])
        .unwrap();
    (IAgentAccountFactoryDispatcher { contract_address }, contract_address)
}

fn setup() -> (IAgentAccountFactoryDispatcher, ContractAddress, ClassHash, ContractAddress) {
    let account_class = declare("AgentAccount").unwrap().contract_class();
    let account_class_hash = *account_class.class_hash;
    let registry = deploy_identity_registry();
    let (factory, factory_addr) = deploy_factory(account_class_hash, registry);
    (factory, factory_addr, account_class_hash, registry)
}

// ---------------------------------------------------------------------------
// deploy_account
// ---------------------------------------------------------------------------

#[test]
fn test_factory_deploys_account_and_links_identity() {
    let (factory, _, _, factory_registry) = setup();

    let owner_key = StarkCurveKeyPairImpl::from_secret_key(0x123);
    let public_key = owner_key.public_key;
    let salt: felt252 = 0x456;

    let (account_address, agent_id) = factory.deploy_account(public_key, salt, "");
    assert(agent_id == 1, 'Agent ID minted');

    let registry = IMockIdentityRegistryDispatcher { contract_address: factory_registry };
    let owner = registry.owner_of(agent_id);
    assert(owner == account_address, 'Agent transferred to account');

    let account = IAgentAccountDispatcher { contract_address: account_address };
    let (stored_registry, stored_agent_id) = account.get_agent_id();
    assert(stored_registry == factory_registry, 'Registry linked');
    assert(stored_agent_id == agent_id, 'Agent ID linked');
}

#[test]
fn test_factory_deploys_multiple_accounts() {
    let (factory, _, _, factory_registry) = setup();

    let key1 = StarkCurveKeyPairImpl::from_secret_key(0x1);
    let key2 = StarkCurveKeyPairImpl::from_secret_key(0x2);

    let (addr1, id1) = factory.deploy_account(key1.public_key, 0x10, "agent-1");
    let (addr2, id2) = factory.deploy_account(key2.public_key, 0x20, "agent-2");

    assert(id1 == 1, 'First agent ID');
    assert(id2 == 2, 'Second agent ID');
    assert(addr1 != addr2, 'Different addresses');

    let registry = IMockIdentityRegistryDispatcher { contract_address: factory_registry };
    assert(registry.owner_of(id1) == addr1, 'First owned');
    assert(registry.owner_of(id2) == addr2, 'Second owned');
}

// ---------------------------------------------------------------------------
// set_account_class_hash
// ---------------------------------------------------------------------------

#[test]
fn test_set_account_class_hash_by_owner() {
    let (factory, factory_addr, _, _) = setup();
    let new_hash: ClassHash = 0x999.try_into().unwrap();

    let owner = factory.get_owner();
    start_cheat_caller_address(factory_addr, owner);
    factory.set_account_class_hash(new_hash);
    stop_cheat_caller_address(factory_addr);

    assert(factory.get_account_class_hash() == new_hash, 'Class hash updated');
}

#[test]
#[should_panic(expected: 'Only owner')]
fn test_set_account_class_hash_rejects_non_owner() {
    let (factory, factory_addr, _, _) = setup();
    let new_hash: ClassHash = 0x999.try_into().unwrap();

    start_cheat_caller_address(factory_addr, other());
    factory.set_account_class_hash(new_hash);
}

<<<<<<< HEAD
=======
#[test]
#[should_panic(expected: 'Class hash cannot be zero')]
fn test_set_account_class_hash_rejects_zero() {
    let (factory, factory_addr, _, _) = setup();
    let owner = factory.get_owner();
    let zero_class: ClassHash = 0.try_into().unwrap();

    start_cheat_caller_address(factory_addr, owner);
    factory.set_account_class_hash(zero_class);
}

>>>>>>> origin/main
// ---------------------------------------------------------------------------
// set_identity_registry
// ---------------------------------------------------------------------------

#[test]
fn test_set_identity_registry_by_owner() {
    let (factory, factory_addr, _, _) = setup();
    let new_registry = addr(0xaaa);

    let owner = factory.get_owner();
    start_cheat_caller_address(factory_addr, owner);
    factory.set_identity_registry(new_registry);
    stop_cheat_caller_address(factory_addr);

    assert(factory.get_identity_registry() == new_registry, 'Registry updated');
}

#[test]
#[should_panic(expected: 'Only owner')]
fn test_set_identity_registry_rejects_non_owner() {
    let (factory, factory_addr, _, _) = setup();
    let new_registry = addr(0xaaa);

    start_cheat_caller_address(factory_addr, other());
    factory.set_identity_registry(new_registry);
}

<<<<<<< HEAD
=======
#[test]
#[should_panic(expected: 'Registry cannot be zero')]
fn test_set_identity_registry_rejects_zero() {
    let (factory, factory_addr, _, _) = setup();
    let owner = factory.get_owner();

    start_cheat_caller_address(factory_addr, owner);
    factory.set_identity_registry(zero());
}

>>>>>>> origin/main
// ---------------------------------------------------------------------------
// transfer_ownership
// ---------------------------------------------------------------------------

#[test]
fn test_transfer_ownership() {
    let (factory, factory_addr, _, _) = setup();
    let owner = factory.get_owner();
    let new_owner = other();

    start_cheat_caller_address(factory_addr, owner);
    factory.transfer_ownership(new_owner);
    stop_cheat_caller_address(factory_addr);

    assert(factory.get_owner() == new_owner, 'Owner transferred');
}

#[test]
fn test_transfer_ownership_new_owner_can_admin() {
    let (factory, factory_addr, _, _) = setup();
    let owner = factory.get_owner();
    let new_owner = other();

    start_cheat_caller_address(factory_addr, owner);
    factory.transfer_ownership(new_owner);
    stop_cheat_caller_address(factory_addr);

    // New owner can set class hash
    let new_hash: ClassHash = 0xfff.try_into().unwrap();
    start_cheat_caller_address(factory_addr, new_owner);
    factory.set_account_class_hash(new_hash);
    stop_cheat_caller_address(factory_addr);

    assert(factory.get_account_class_hash() == new_hash, 'New owner can admin');
}

#[test]
#[should_panic(expected: 'Only owner')]
fn test_transfer_ownership_old_owner_loses_access() {
    let (factory, factory_addr, _, _) = setup();
    let owner = factory.get_owner();
    let new_owner = other();

    start_cheat_caller_address(factory_addr, owner);
    factory.transfer_ownership(new_owner);
    stop_cheat_caller_address(factory_addr);

    // Old owner can no longer admin
    let new_hash: ClassHash = 0xeee.try_into().unwrap();
    start_cheat_caller_address(factory_addr, owner);
    factory.set_account_class_hash(new_hash);
}

#[test]
#[should_panic(expected: 'Only owner')]
fn test_transfer_ownership_rejects_non_owner() {
    let (factory, factory_addr, _, _) = setup();

    start_cheat_caller_address(factory_addr, other());
    factory.transfer_ownership(other());
}

#[test]
#[should_panic(expected: 'New owner is zero address')]
fn test_transfer_ownership_rejects_zero_address() {
    let (factory, factory_addr, _, _) = setup();
    let owner = factory.get_owner();

    start_cheat_caller_address(factory_addr, owner);
    factory.transfer_ownership(zero());
}

// ---------------------------------------------------------------------------
// deploy_account edge cases
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected: 'Zero public key')]
fn test_deploy_account_rejects_zero_public_key() {
    let (factory, _, _, _) = setup();
    factory.deploy_account(0, 0x1, "");
}

#[test]
#[should_panic(expected: 'Identity registry not set')]
fn test_deploy_account_fails_without_registry() {
    let account_class = declare("AgentAccount").unwrap().contract_class();
    let account_class_hash = *account_class.class_hash;
<<<<<<< HEAD
    let (factory, factory_addr) = deploy_factory(account_class_hash, zero());

    let owner = factory.get_owner();
    start_cheat_caller_address(factory_addr, owner);
    factory.set_identity_registry(zero());
    stop_cheat_caller_address(factory_addr);
=======
    let (factory, _) = deploy_factory(account_class_hash, zero());
>>>>>>> origin/main

    let key = StarkCurveKeyPairImpl::from_secret_key(0x5);
    factory.deploy_account(key.public_key, 0x1, "");
}

#[test]
#[should_panic(expected: 'Account class hash not set')]
fn test_deploy_account_fails_without_class_hash() {
<<<<<<< HEAD
    let account_class = declare("AgentAccount").unwrap().contract_class();
    let account_class_hash = *account_class.class_hash;
    let registry = deploy_identity_registry();
    let (factory, factory_addr) = deploy_factory(account_class_hash, registry);

    let zero_class: ClassHash = 0.try_into().unwrap();
    let owner = factory.get_owner();
    start_cheat_caller_address(factory_addr, owner);
    factory.set_account_class_hash(zero_class);
    stop_cheat_caller_address(factory_addr);
=======
    let zero_class: ClassHash = 0.try_into().unwrap();
    let registry = deploy_identity_registry();
    let (factory, _) = deploy_factory(zero_class, registry);
>>>>>>> origin/main

    let key = StarkCurveKeyPairImpl::from_secret_key(0x6);
    factory.deploy_account(key.public_key, 0x2, "");
}
