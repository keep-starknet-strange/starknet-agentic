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

const MAX_FUZZ_ABS_VALUE: i128 = 1_000_000_000_000;

fn owner() -> ContractAddress {
    0x999.try_into().unwrap()
}

fn agent_owner() -> ContractAddress {
    0xA11CE.try_into().unwrap()
}

fn client() -> ContractAddress {
    0xB0B.try_into().unwrap()
}

fn client2() -> ContractAddress {
    0x3.try_into().unwrap()
}

fn deploy_contracts() -> (
    IIdentityRegistryDispatcher, IReputationRegistryDispatcher, ContractAddress, ContractAddress,
) {
    let identity_contract = declare("IdentityRegistry").unwrap().contract_class();
    let (identity_address, _) = identity_contract.deploy(@array![owner().into()]).unwrap();
    let identity_registry = IIdentityRegistryDispatcher { contract_address: identity_address };

    let reputation_contract = declare("ReputationRegistry").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append(owner().into());
    calldata.append(identity_address.into());
    let (reputation_address, _) = reputation_contract.deploy(@calldata).unwrap();
    let reputation_registry = IReputationRegistryDispatcher {
        contract_address: reputation_address,
    };

    (identity_registry, reputation_registry, identity_address, reputation_address)
}

fn give_feedback_helper(
    reputation_registry: IReputationRegistryDispatcher,
    reputation_address: ContractAddress,
    agent_id: u256,
    caller: ContractAddress,
    value: i128,
    value_decimals: u8,
) {
    start_cheat_caller_address(reputation_address, caller);
    reputation_registry.give_feedback(agent_id, value, value_decimals, "tag1", "tag2", "", "", 0);
    stop_cheat_caller_address(reputation_address);
}

#[test]
#[fuzzer(runs: 64)]
fn fuzz_get_summary_single_feedback_roundtrip(raw_value: i128, raw_decimals: u8) {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let value_decimals = raw_decimals % 19;
    let value = raw_value % MAX_FUZZ_ABS_VALUE;

    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), value, value_decimals,
    );

    let clients_filter = array![client()].span();
    let (count, summary_value, summary_decimals) = reputation_registry
        .get_summary(agent_id, clients_filter, "", "");

    assert_eq!(count, 1);
    assert_eq!(summary_value, value);
    assert_eq!(summary_decimals, value_decimals);
}

#[test]
#[fuzzer(runs: 64)]
fn fuzz_get_summary_two_feedbacks_stays_within_bounds(raw_a: i128, raw_b: i128, raw_decimals: u8) {
    let (identity_registry, reputation_registry, identity_address, reputation_address) =
        deploy_contracts();

    start_cheat_caller_address(identity_address, agent_owner());
    let agent_id = identity_registry.register();
    stop_cheat_caller_address(identity_address);

    let value_decimals = raw_decimals % 19;
    let value_a = raw_a % MAX_FUZZ_ABS_VALUE;
    let value_b = raw_b % MAX_FUZZ_ABS_VALUE;

    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client(), value_a, value_decimals,
    );
    give_feedback_helper(
        reputation_registry, reputation_address, agent_id, client2(), value_b, value_decimals,
    );

    let clients_filter = array![client(), client2()].span();
    let (count, summary_value, summary_decimals) = reputation_registry
        .get_summary(agent_id, clients_filter, "", "");

    assert_eq!(count, 2);
    assert_eq!(summary_decimals, value_decimals);

    let min_value = if value_a <= value_b { value_a } else { value_b };
    let max_value = if value_a >= value_b { value_a } else { value_b };
    assert(summary_value >= min_value, 'summary below min');
    assert(summary_value <= max_value, 'summary above max');
}
