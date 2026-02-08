use prediction_market::interfaces::{
    IMarketFactoryDispatcher, IMarketFactoryDispatcherTrait, IPredictionMarketDispatcher,
    IPredictionMarketDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp_global,
};
use starknet::ContractAddress;
use core::num::traits::Zero;

// ============ Test Addresses ============

fn owner() -> ContractAddress {
    0x999.try_into().unwrap()
}

fn alice() -> ContractAddress {
    0xA11CE.try_into().unwrap()
}

fn oracle() -> ContractAddress {
    0xAA.try_into().unwrap()
}

fn token() -> ContractAddress {
    0xEEE.try_into().unwrap()
}

// ============ Deploy Helper ============

fn deploy_factory() -> (IMarketFactoryDispatcher, ContractAddress) {
    start_cheat_block_timestamp_global(1000);

    let market_class = declare("PredictionMarket").unwrap().contract_class();
    let factory_class = declare("MarketFactory").unwrap().contract_class();

    let mut calldata: Array<felt252> = array![];
    calldata.append(owner().into()); // owner
    calldata.append((*market_class.class_hash).into()); // market_class_hash

    let (address, _) = factory_class.deploy(@calldata).unwrap();
    (IMarketFactoryDispatcher { contract_address: address }, address)
}

// ============ Factory Tests ============

#[test]
fn test_factory_initial_state() {
    let (factory, _) = deploy_factory();

    assert_eq!(factory.get_market_count(), 0, "initial count should be 0");
}

#[test]
fn test_create_market() {
    let (factory, factory_addr) = deploy_factory();

    let question_hash: felt252 = 0x1234;
    let resolution_time: u64 = 2000;

    start_cheat_caller_address(factory_addr, alice());
    let (market_address, market_id) = factory.create_market(
        question_hash, resolution_time, oracle(), token(), 200,
    );
    stop_cheat_caller_address(factory_addr);

    assert_eq!(market_id, 0, "first market id should be 0");
    assert!(!market_address.is_zero(), "market address should not be zero");
    assert_eq!(factory.get_market_count(), 1, "count should be 1");
    assert_eq!(factory.get_market(0), market_address, "address should match");
}

#[test]
fn test_create_multiple_markets() {
    let (factory, factory_addr) = deploy_factory();

    start_cheat_caller_address(factory_addr, alice());

    let (addr1, id1) = factory.create_market(0x1111, 2000, oracle(), token(), 100);
    let (addr2, id2) = factory.create_market(0x2222, 3000, oracle(), token(), 200);
    let (addr3, id3) = factory.create_market(0x3333, 4000, oracle(), token(), 300);

    stop_cheat_caller_address(factory_addr);

    assert_eq!(id1, 0, "first id");
    assert_eq!(id2, 1, "second id");
    assert_eq!(id3, 2, "third id");
    assert_eq!(factory.get_market_count(), 3, "three markets");

    assert_eq!(factory.get_market(0), addr1, "addr1");
    assert_eq!(factory.get_market(1), addr2, "addr2");
    assert_eq!(factory.get_market(2), addr3, "addr3");

    // All addresses should be unique
    assert!(addr1 != addr2, "addr1 != addr2");
    assert!(addr2 != addr3, "addr2 != addr3");
}

#[test]
fn test_created_market_is_functional() {
    let (factory, factory_addr) = deploy_factory();

    // Deploy a real token for interaction
    let token_class = declare("MockERC20").unwrap().contract_class();
    let (token_addr, _) = token_class.deploy(@array![]).unwrap();

    start_cheat_caller_address(factory_addr, alice());
    let (market_address, _) = factory.create_market(
        0xABCD, 2000, oracle(), token_addr, 200,
    );
    stop_cheat_caller_address(factory_addr);

    // Verify the deployed market is functional
    let market = IPredictionMarketDispatcher { contract_address: market_address };

    assert_eq!(market.get_status(), 0, "market should be OPEN");
    assert_eq!(market.get_total_pool(), 0, "pool should be empty");

    let (question_hash, resolution_time, oracle_addr, collateral, fee_bps) = market
        .get_market_info();
    assert_eq!(question_hash, 0xABCD, "question hash");
    assert_eq!(resolution_time, 2000, "resolution time");
    assert_eq!(oracle_addr, oracle(), "oracle");
    assert_eq!(collateral, token_addr, "collateral token");
    assert_eq!(fee_bps, 200, "fee bps");
}

#[test]
fn test_different_creators() {
    let (factory, factory_addr) = deploy_factory();

    let bob: ContractAddress = 0xB0B.try_into().unwrap();

    start_cheat_caller_address(factory_addr, alice());
    let (_, id1) = factory.create_market(0x1111, 2000, oracle(), token(), 100);
    stop_cheat_caller_address(factory_addr);

    start_cheat_caller_address(factory_addr, bob);
    let (_, id2) = factory.create_market(0x2222, 3000, oracle(), token(), 200);
    stop_cheat_caller_address(factory_addr);

    assert_eq!(id1, 0, "alice's market");
    assert_eq!(id2, 1, "bob's market");
    assert_eq!(factory.get_market_count(), 2, "two markets total");
}
