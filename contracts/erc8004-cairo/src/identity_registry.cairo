// Identity Registry contract — enhanced with agent wallet auth, URI hash, and dual metadata lanes
// SPDX-License-Identifier: MIT

use starknet::storage::{StoragePointerAccess, StorageBaseAccess};
use starknet::contract::ContractAddress;
use starknet::SyscallSyscallBaseAccessExt;
use openzeppelin::access::accesscontrol::AccessControl;
use openzeppelin::access::accesscontrol::AccessControlPublicReaderTrait;
use openzeppelin::introspection::interface;
use openzeppelin::introspection::interface::InterfaceType;
use starknet::ERC20;
use starknet::snip6::snip6::{SNIP6Context, SNIP6AuthPayload};
use starknet::snip12::snip12::{SNIP12Context, SNIP12TypedData, SNIP12AuthPayload};
use core::array::ArrayTrait;
use core::traits::TryInto;
use core::fmt::DebugTrait;
use openzeppelin::utils::upgradeable::Upgradeable;
use openzeppelin::token::erc20::erc20::ERC20Component;
use openzeppelin::token::erc721::enums::IERC721TokenReceiver;
use openzeppelin::utils::strings::BytesArrayTrait;

use crate::interfaces::identity_registry::{
    IdentityRegistryTrait, IdentityRegistryEvents,
};

// Storage layout
#[starknet::interface]
pub trait IIdentityRegistryState {
    fn register(bytes32, felt252, ByteArray) -> bool;
    fn get_agent_wallet(u256) -> ContractAddress;
    fn set_agent_wallet(u256, ContractAddress, felt252);
    fn get_metadata(u256, ByteArray) -> ByteArray;
    fn set_metadata(u256, ByteArray, ByteArray);
    fn get_uri_hash(u256) -> u256;
    fn set_uri_hash(u256, u256);
    fn get_owner(u256) -> ContractAddress;
    fn get_balance(u256) -> u256;
    fn get_supply() -> u256;
    fn is_operator(u256, ContractAddress) -> bool;
    fn set_operator(u256, ContractAddress, bool);
    fn get_nonce(ContractAddress) -> u256;
    fn increment_nonce(ContractAddress) -> u256;
}

#[starknet::contract]
pub mod IdentityRegistry {
    use super::*;

    // ── Types ────────────────────────────────────────────────────────────────────
    type Metadata = ByteArray;
    type UriHash = u256;
    type AgentWallet = ContractAddress;
    type TokenId = u256;
    type Owner = ContractAddress;
    type Balance = u256;
    type Nonce = u256;
    type Operator = ContractAddress;

    // ── Storage ──────────────────────────────────────────────────────────────────
    #[storage]
    struct Storage {
        // Access control
        access_control: AccessControl<ContractAddress, u256>,
        // Upgradeability
        upgradeable: Upgradeable<ContractAddress, u256>,
        // ERC20 component (mintable token)
        erc20: ERC20Component<ContractAddress, u256>,
        // Ownership of tokens: tokenId -> owner
        ownership: FlatMap<TokenId, Owner>,
        // Agent wallets: tokenId -> agent wallet address
        agent_wallets: FlatMap<TokenId, AgentWallet>,
        // URI hash: tokenId -> u256 hash of off-chain content
        uri_hashes: FlatMap<TokenId, UriHash>,
        // Dual metadata lanes: tokenId -> (ByteArray metadata, felt252 short metadata)
        byte_array_metadata: FlatMap<TokenId, Metadata>,
        felt_metadata: FlatMap<TokenId, felt252>,
        // Operators: tokenId -> operator -> is_operator
        operators: FlatMap<TokenId, Operator, bool>,
        // SNIP-6 nonces for replay protection
        nonces: FlatMap<ContractAddress, Nonce>,
        // Domain separator constants (set at init)
        domain_separator: felt252,
        // Total supply
        total_supply: u256,
        // Registry registry address (for cross-registry validation)
        registry: ContractAddress,
        // Chain ID for domain separation
        chain_id: felt252,
    }

    // ── Events ───────────────────────────────────────────────────────────────────
    event IdentityRegistered(
        IdentityRegistryEvents::IdentityRegistered,
    );
    event AgentWalletSet(IdentityRegistryEvents::AgentWalletSet);
    event MetadataSet(IdentityRegistryEvents::MetadataSet);
    event UriHashSet(IdentityRegistryEvents::UriHashSet);
    event OperatorSet(IdentityRegistryEvents::OperatorSet);
    event InterfaceImplemented(IdentityRegistryEvents::InterfaceImplemented);

    // ── Constructor ──────────────────────────────────────────────────────────────
    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin: ContractAddress,
        registry: ContractAddress,
        chain_id: felt252,
    ) {
        // Initialize upgradeability
        self.upgradeable.set_admin(admin);

        // Initialize access control
        self.access_control._setup_role(
            "admin".into(),
            admin,
        );
        self.access_control._grant_role("operator".into(), admin);

        // Initialize ERC20
        self.erc20._initialize_with_admin(admin);

        // Set registry and chain ID
        self.registry.write(registry);
        self.chain_id.write(chain_id);

        // Set default domain separator (will be updated by SNIP-6 module)
        let domain = self._compute_domain_separator(chain_id, registry);
        self.domain_separator.write(domain);

        // Register supported interfaces
        self._register_interfaces();

        emit(IdentityRegistryEvents::InterfaceImplemented {
            interface_id: "erc8004".into(),
            implementation: registry,
        });
    }

    // ── Core Registration ────────────────────────────────────────────────────────
    #[abi(embed_v0)]
    impl IdentityRegistryImpl of super::IdentityRegistryTrait {
        // ── Wallet Auth (SNIP-6) ─────────────────────────────────────────────
        fn _validate_wallet_auth(
            &self,
            payload: SNIP6AuthPayload,
        ) -> ContractAddress {
            let context = SNIP6Context {
                domain: self.domain_separator.read(),
                contract: self.address_in_contract(),
                chain_id: self.chain_id.read(),
            };
            SNIP6Context::verify_context_signature(
                &context,
                payload,
            )
        }

        // ── SNIP-12 Typed Message Auth ───────────────────────────────────────
        fn _validate_snip12_auth(
            &self,
            typed_data: SNIP12TypedData,
            payload: SNIP12AuthPayload,
        ) -> ContractAddress {
            let context = SNIP12Context {
                domain: self.domain_separator.read(),
                contract: self.address_in_contract(),
                chain_id: self.chain_id.read(),
            };
            SNIP12Context::verify_typed_data_signature(
                &context,
                typed_data,
                payload,
            )
        }

        // ── Registration ─────────────────────────────────────────────────────
        fn register(
            &mut self,
            owner: ContractAddress,
            metadata: ByteArray,
            uri: ByteArray,
            signature: SNIP6AuthPayload,
            nonce: Option<Nonce>,
        ) -> u256 {
            // Validate wallet auth (SNIP-6)
            let authenticated_owner = self._validate_wallet_auth(signature);
            assert(
                authenticated_owner == owner,
                "Invalid wallet authentication",
            );

            // Replay protection with nonce
            if nonce.is_some() {
                let current_nonce = self.nonces.read(owner);
                let expected_nonce = nonce.unwrap();
                assert(
                    current_nonce == expected_nonce,
                    "Invalid nonce - replay protection",
                );
                self.nonces.write(owner, current_nonce + 1);
            }

            // Increment supply
            let token_id = self.total_supply.read();
            self.total_supply.write(token_id + 1);

            // Mint ERC20 token
            self.erc20._mint(owner, 1);

            // Set ownership
            self.ownership.write(token_id, owner);

            // Set initial metadata
            self.byte_array_metadata.write(token_id, metadata);
            self.felt_metadata.write(token_id, "default".into());

            // Emit events
            emit(IdentityRegistryEvents::IdentityRegistered {
                token_id,
                owner,
                metadata,
                uri,
            });

            token_id
        }

        // ── Agent Wallet Management ──────────────────────────────────────────
        /// Set agent wallet using SNIP-6 signature
        fn set_agent_wallet_snip6(
            &mut self,
            token_id: u256,
            agent_wallet: ContractAddress,
            signature: SNIP6AuthPayload,
            nonce: Option<Nonce>,
        ) {
            // Verify ownership
            let owner = self.get_owner(token_id);
            assert(self.ownership.read(token_id) == owner, "Not token owner");

            // Validate wallet auth
            let authenticated_owner = self._validate_wallet_auth(signature);
            assert(
                authenticated_owner == owner,
                "Invalid wallet authentication",
            );

            // Replay protection
            if nonce.is_some() {
                let current_nonce = self.nonces.read(owner);
                let expected_nonce = nonce.unwrap();
                assert(
                    current_nonce == expected_nonce,
                    "Invalid nonce - replay protection",
                );
                self.nonces.write(owner, current_nonce + 1);
            }

            // Set agent wallet
            self.agent_wallets.write(token_id, agent_wallet);

            emit(IdentityRegistryEvents::AgentWalletSet {
                token_id,
                agent_wallet,
            });
        }

        /// Set agent wallet using SNIP-12 typed message
        fn set_agent_wallet_sip12(
            &mut self,
            token_id: u256,
            agent_wallet: ContractAddress,
            typed_data: SNIP12TypedData,
            payload: SNIP12AuthPayload,
        ) {
            // Verify ownership
            let owner = self.ownership.read(token_id);

            // Validate SNIP-12 signature
            let signed_address = self._validate_snip12_auth(
                typed_data.clone(),
                payload,
            );
            assert(signed_address == owner, "Invalid SNIP-12 signature");

            // Set agent wallet
            self.agent_wallets.write(token_id, agent_wallet);

            emit(IdentityRegistryEvents::AgentWalletSet {
                token_id,
                agent_wallet,
            });
        }

        // ── Metadata (Dual Lanes) ────────────────────────────────────────────
        /// Set ByteArray metadata lane
        fn set_byte_array_metadata(
            &mut self,
            token_id: u256,
            metadata: ByteArray,
            signature: SNIP6AuthPayload,
        ) {
            let owner = self.ownership.read(token_id);
            let authenticated = self._validate_wallet_auth(signature);
            assert(authenticated == owner, "Not authorized");

            self.byte_array_metadata.write(token_id, metadata);

            emit(IdentityRegistryEvents::MetadataSet {
                token_id,
                metadata: metadata.clone(),
                lane: "byte_array".into(),
            });
        }

        /// Set felt252 metadata lane (short string)
        fn set_felt_metadata(
            &mut self,
            token_id: u256,
            metadata: felt252,
            signature: SNIP6AuthPayload,
        ) {
            let owner = self.ownership.read(token_id);
            let authenticated = self._validate_wallet_auth(signature);
            assert(authenticated == owner, "Not authorized");

            self.felt_metadata.write(token_id, metadata);

            emit(IdentityRegistryEvents::MetadataSet {
                token_id,
                metadata: ByteArray::from(metadata),
                lane: "felt".into(),
            });
        }

        // ── URI Hash Storage ─────────────────────────────────────────────────
        /// Store on-chain u256 URI hash for off-chain content integrity
        fn set_uri_hash(
            &mut self,
            token_id: u256,
            uri_hash: u256,
            signature: SNIP6AuthPayload,
        ) {
            let owner = self.ownership.read(token_id);
            let authenticated = self._validate_wallet_auth(signature);
            assert(authenticated == owner, "Not authorized");

            self.uri_hashes.write(token_id, uri_hash);

            emit(IdentityRegistryEvents::UriHashSet {
                token_id,
                uri_hash,
            });
        }

        // ── Getters ──────────────────────────────────────────────────────────
        fn get_owner(&self, token_id: u256) -> ContractAddress {
            self.ownership.read(token_id)
        }

        fn get_agent_wallet(&self, token_id: u256) -> ContractAddress {
            self.agent_wallets.read(token_id)
        }

        fn get_byte_array_metadata(&self, token_id: u256) -> ByteArray {
            self.byte_array_metadata.read(token_id)
        }

        fn get_felt_metadata(&self, token_id: u256) -> felt252 {
            self.felt_metadata.read(token_id)
        }

        fn get_uri_hash(&self, token_id: u256) -> u256 {
            self.uri_hashes.read(token_id)
        }

        fn get_balance(&self, owner: ContractAddress) -> u256 {
            self.erc20.balance_of(owner)
        }

        fn get_supply(&self) -> u256 {
            self.total_supply.read()
        }

        fn is_operator(
            &self,
            token_id: u256,
            operator: ContractAddress,
        ) -> bool {
            self.operators.read((token_id, operator))
        }

        fn get_nonce(&self, wallet: ContractAddress) -> u256 {
            self.nonces.read(wallet)
        }

        // ── Pagination Support ───────────────────────────────────────────────
        fn get_summary_paginated(
            &self,
            page: u256,
            page_size: u256,
        ) -> Array<(u256, ContractAddress, ByteArray)> {
            let total = self.total_supply.read();
            let start = page * page_size;
            let end = core::cmp::min(start + page_size, total);

            let mut result = ArrayTrait::new();
            let mut i = start;
            while i < end {
                let owner = self.ownership.read(i);
                let metadata = self.byte_array_metadata.read(i);
                result.append((i, owner, metadata));
                i = i + 1;
            }
            result
        }

        // ── Domain Separator ─────────────────────────────────────────────────
        fn _compute_domain_separator(
            &self,
            chain_id: felt252,
            registry: ContractAddress,
        ) -> felt252 {
            // EIP-712 compatible domain separator
            let domain_type_hash = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
            // For simplicity, return a composite hash
            domain_type_hash
        }
    }

    // ── Internal Helpers ─────────────────────────────────────────────────────────
    impl InternalHelpers of IInternalHelpersTrait {
        fn _register_interfaces(&self) {
            // Register ERC-8004 interface
            self.access_control._grant_role("interfaces".into(), "erc8004".into());
        }

        fn _verify_operator(
            &self,
            token_id: u256,
            caller: ContractAddress,
        ) {
            let owner = self.ownership.read(token_id);
            assert(
                caller == owner || self.operators.read((token_id, caller)),
                "Not authorized",
            );
        }
    }

    // ── Role Management ──────────────────────────────────────────────────────────
    #[generate_trait]
    impl PublicRoleAccess of IRoleAccessTrait {
        fn grant_role(&mut self, role: felt252, account: ContractAddress) {
            self.access_control.grant_role(role, account);
        }

        fn revoke_role(
            &mut self,
            role: felt252,
            account: ContractAddress,
        ) {
            self.access_control.revoke_role(role, account);
        }

        fn renounce_role(&mut self, role: felt252, account: ContractAddress) {
            self.access_control.renounce_role(role, account);
        }

        fn has_role(&self, role: felt252, account: ContractAddress) -> bool {
            self.access_control.has_role(role, account)
        }
    }
}
