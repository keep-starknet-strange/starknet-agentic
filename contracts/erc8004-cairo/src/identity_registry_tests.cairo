// Identity Registry Tests
// SPDX-License-Identifier: MIT

use starknet::testing::*;
use starknet::contract_address_const::*;
use starknet::snip6::snip6::{SNIP6AuthPayload, SNIP6Context};
use starknet::snip12::snip12::{SNIP12TypedData, SNIP12AuthPayload, SNIP12Context};
use array::ArrayTrait;
use serde::{Serde, Deserializable};

use super::identity_registry::IdentityRegistryTrait;

// Test utilities
fn create_test_contract() -> Interface<IdentityRegistryTrait> {
    let contract = deploy_syscall(
        'IdentityRegistry'.span(),
        array![].span(),
        false,
    ).unwrap_syscall();
    contract.try_into().unwrap()
}

#[test]
fn test_set_agent_wallet_snip6() {
    let contract = create_test_contract();
    let owner = contract_address_const::<0x123>();
    let agent_wallet = contract_address_const::<0x456>();
    
    // TODO: Setup SNIP-6 signature and test
}

#[test]
fn test_set_agent_wallet_snip12() {
    let contract = create_test_contract();
    let owner = contract_address_const::<0x123>();
    let agent_wallet = contract_address_const::<0x456>();
    
    // TODO: Setup SNIP-12 typed data and test
}

#[test]
fn test_dual_metadata_lanes() {
    let contract = create_test_contract();
    let token_id = 0_u256;
    let bytearray_metadata = "test_metadata".into();
    let felt_metadata: felt252 = "short_meta";
    
    // TODO: Test both metadata lanes
}

#[test]
fn test_uri_hash_storage() {
    let contract = create_test_contract();
    let token_id = 0_u256;
    let uri_hash: u256 = 0x1234abcd;
    
    // TODO: Test URI hash storage and retrieval
}
