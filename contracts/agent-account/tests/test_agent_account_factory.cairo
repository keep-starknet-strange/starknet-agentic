use agent_account::interfaces::{
    IAgentAccountDispatcher, IAgentAccountDispatcherTrait, IAgentAccountFactoryDispatcher,
    IAgentAccountFactoryDispatcherTrait,
};
use agent_account::mock_identity_registry::{
    IMockIdentityRegistryDispatcher, IMockIdentityRegistryDispatcherTrait,
};
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare};
use snforge_std::signature::stark_curve::StarkCurveKeyPairImpl;
use starknet::{ClassHash, ContractAddress};

fn deploy_identity_registry() -> ContractAddress {
    let contract = declare("MockIdentityRegistry").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![]).unwrap();
    contract_address
}

fn deploy_factory(
    account_class_hash: ClassHash,
    identity_registry: ContractAddress,
) -> IAgentAccountFactoryDispatcher {
    let contract = declare("AgentAccountFactory").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![account_class_hash.into(), identity_registry.into()]).unwrap();
    IAgentAccountFactoryDispatcher { contract_address }
}

#[test]
fn test_factory_deploys_account_and_links_identity() {
    let account_class = declare("AgentAccount").unwrap().contract_class();
    let account_class_hash = *account_class.class_hash;
    let factory_registry = deploy_identity_registry();
    let factory = deploy_factory(account_class_hash, factory_registry);

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
