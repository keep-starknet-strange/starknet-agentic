// Identity Registry Interface
// SPDX-License-Identifier: MIT

use starknet::contract::ContractAddress;
use starknet::snip6::snip6::SNIP6AuthPayload;
use starknet::snip12::snip12::{SNIP12TypedData, SNIP12AuthPayload};
use core::array::ArrayTrait;

// ── Events ─────────────────────────────────────────────────────────────────────
#[derive Drop, starknet::Event]
enum IdentityRegistryEvents {
    IdentityRegistered: IdentityRegistered,
    AgentWalletSet: AgentWalletSet,
    MetadataSet: MetadataSet,
    UriHashSet: UriHashSet,
    OperatorSet: OperatorSet,
    InterfaceImplemented: InterfaceImplemented,
}

#[derive(Drop, starknet::Event)]
struct IdentityRegistered {
    token_id: u256,
    owner: ContractAddress,
    metadata: ByteArray,
    uri: ByteArray,
}

#[derive(Drop, starknet::Event)]
struct AgentWalletSet {
    token_id: u256,
    agent_wallet: ContractAddress,
}

#[derive(Drop, starknet::Event)]
struct MetadataSet {
    token_id: u256,
    metadata: ByteArray,
    lane: ByteArray,
}

#[derive(Drop, starknet::Event)]
struct UriHashSet {
    token_id: u256,
    uri_hash: u256,
}

#[derive(Drop, starknet::Event)]
struct OperatorSet {
    token_id: u256,
    operator: ContractAddress,
    is_operator: bool,
}

#[derive(Drop, starknet::Event)]
struct InterfaceImplemented {
    interface_id: felt252,
    implementation: ContractAddress,
}

// ── Trait ──────────────────────────────────────────────────────────────────────
#[starknet::interface]
trait IdentityRegistryTrait<TContractState> {
    // ── SNIP-6 Auth ──────────────────────────────────────────────────────────
    fn set_agent_wallet_snip6(
        ref self: TContractState,
        token_id: u256,
        agent_wallet: ContractAddress,
        signature: SNIP6AuthPayload,
        nonce: Option<u256>,
    );

    // ── SNIP-12 Typed Message Auth ───────────────────────────────────────────
    fn set_agent_wallet_sip12(
        ref self: TContractState,
        token_id: u256,
        agent_wallet: ContractAddress,
        typed_data: SNIP12TypedData,
        payload: SNIP12AuthPayload,
    );

    // ── Dual Metadata ────────────────────────────────────────────────────────
    fn set_byte_array_metadata(
        ref self: TContractState,
        token_id: u256,
        metadata: ByteArray,
        signature: SNIP6AuthPayload,
    );

    fn set_felt_metadata(
        ref self: TContractState,
        token_id: u256,
        metadata: felt252,
        signature: SNIP6AuthPayload,
    );

    fn get_byte_array_metadata(&self: TContractState, token_id: u256) -> ByteArray;
    fn get_felt_metadata(&self: TContractState, token_id: u256) -> felt252;

    // ── URI Hash ─────────────────────────────────────────────────────────────
    fn set_uri_hash(
        ref self: TContractState,
        token_id: u256,
        uri_hash: u256,
        signature: SNIP6AuthPayload,
    );

    fn get_uri_hash(&self: TContractState, token_id: u256) -> u256;

    // ── Core ─────────────────────────────────────────────────────────────────
    fn get_owner(&self: TContractState, token_id: u256) -> ContractAddress;
    fn get_agent_wallet(&self: TContractState, token_id: u256) -> ContractAddress;
    fn get_balance(&self: TContractState, owner: ContractAddress) -> u256;
    fn get_supply(&self: TContractState) -> u256;
    fn is_operator(
        &self: TContractState,
        token_id: u256,
        operator: ContractAddress,
    ) -> bool;
    fn get_nonce(&self: TContractState, wallet: ContractAddress) -> u256;

    // ── Pagination ───────────────────────────────────────────────────────────
    fn get_summary_paginated(
        &self: TContractState,
        page: u256,
        page_size: u256,
    ) -> Array<(u256, ContractAddress, ByteArray)>;
}
