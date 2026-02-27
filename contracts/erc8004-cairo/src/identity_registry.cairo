// ============================================
// IdentityRegistry
// ERC-8004 in Cairo
// ERC-721 based agent registry with metadata storage
//
// This contract implements the Identity Registry as specified in ERC-8004 v1.0.
// Each agent is represented as an ERC-721 NFT, making agents immediately browsable
// and transferable with NFT-compliant applications.
//
// Key Features:
// - ERC-721 compliance with metadata support
// - Flexible registration with optional metadata
// - On-chain key-value metadata storage
// - Transferable agent ownership
// - Agent wallet management with signature verification
// - Upgradeable via replace_class
// ============================================

#[starknet::contract]
pub mod IdentityRegistry {
    use core::poseidon::poseidon_hash_span;
    use core::num::traits::Zero;
    use core::to_byte_array::AppendFormattedToByteArray;
    use erc8004::interfaces::account::IAccountDispatcher;
    use erc8004::interfaces::account::IAccountDispatcherTrait;
    use erc8004::interfaces::identity_registry::{
        IIdentityRegistry, MetadataEntry, MetadataSet, Registered, URIUpdated,
    };
    use erc8004::version::contract_version;
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin::token::erc721::ERC721Component;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::interfaces::upgrades::IUpgradeable;
    use starknet::storage::*;
    use starknet::{
        ClassHash, ContractAddress, get_block_timestamp, get_caller_address, get_contract_address,
        get_tx_info,
    };

    // ============ Constants ============
    // Maximum deadline delay: 5 minutes (300 seconds)
    const MAX_DEADLINE_DELAY: u64 = 300;

    // ============ Component Declarations ============
    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(
        path: ReentrancyGuardComponent, storage: reentrancy_guard, event: ReentrancyGuardEvent,
    );
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    // ============ Component Implementations ============
    // ERC721 Core (transfer, approve, etc. - excluding metadata)
    #[abi(embed_v0)]
    impl ERC721Impl = ERC721Component::ERC721Impl<ContractState>;
    impl ERC721InternalImpl = ERC721Component::InternalImpl<ContractState>;

    // SRC5 (Interface support)
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    // ReentrancyGuard Internal Implementation
    impl ReentrancyGuardInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    // Ownable
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    // Upgradeable Internal Implementation
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    // ============ Storage ============
    #[storage]
    pub struct Storage {
        // Component storage
        #[substorage(v0)]
        erc721: ERC721Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        // Identity Registry specific storage
        agent_id_counter: u256,
        agent_metadata: Map<(u256, felt252), ByteArray>, // (agent_id, key_hash) => value
        token_uris: Map<u256, ByteArray>, // agent_id => token_uri
        agent_wallets: Map<u256, ContractAddress>, // agent_id => wallet address
        wallet_set_nonces: Map<u256, u64>, // agent_id => nonce for set_agent_wallet signatures
    }

    // ============ Events ============
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ERC721Event: ERC721Component::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        Registered: Registered,
        MetadataSet: MetadataSet,
        URIUpdated: URIUpdated,
    }

    // ============ ERC721 Hooks for clearing wallet on transfer ============
    impl ERC721HooksImpl of ERC721Component::ERC721HooksTrait<ContractState> {
        fn before_update(
            ref self: ERC721Component::ComponentState<ContractState>,
            to: ContractAddress,
            token_id: u256,
            auth: ContractAddress,
        ) {
            let mut contract = self.get_contract_mut();
            let zero_address: ContractAddress = 0.try_into().unwrap();

            // Check if token exists (not a mint operation)
            // During mint, _owner returns zero address
            let from = self._owner_of(token_id);

            // If this is a transfer (not mint/burn), clear the agent wallet
            // Mint: from == 0, Burn: to == 0, Transfer: both non-zero
            if from != zero_address && to != zero_address {
                // Clear wallet
                contract.agent_wallets.entry(token_id).write(zero_address);
                // Intentionally keep wallet_set_nonces monotonic across transfers.
                // Replay is still prevented because owner + nonce + domain are hash-bound.

                // Emit MetadataSet event with empty value
                contract
                    .emit(
                        Event::MetadataSet(
                            MetadataSet {
                                agent_id: token_id,
                                indexed_key: "agentWallet",
                                key: "agentWallet",
                                value: "",
                            },
                        ),
                    );
            }
        }

        fn after_update(
            ref self: ERC721Component::ComponentState<ContractState>,
            to: ContractAddress,
            token_id: u256,
            auth: ContractAddress,
        ) {
            // No action needed after update
        }
    }

    // ============ Constructor ============
    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        assert(!owner.is_zero(), 'Invalid owner');
        // Initialize ERC721 with name "ERC-8004 Trustless Agent" and symbol "AGENT"
        self.erc721.initializer("ERC-8004 Trustless Agent", "AGENT", "");

        // Initialize Ownable with owner
        self.ownable.initializer(owner);

        // Agent IDs start from 1 (0 is reserved for non-existent agents)
        self.agent_id_counter.write(1);
    }

    // ============ Upgradeable Implementation ============
    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            // Only owner can upgrade
            self.ownable.assert_only_owner();
            // Replace class hash using Starknet native syscall
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    // ============ IIdentityRegistry Implementation ============
    #[abi(embed_v0)]
    impl IdentityRegistryImpl of IIdentityRegistry<ContractState> {
        fn register_with_metadata(
            ref self: ContractState, token_uri: ByteArray, metadata: Array<MetadataEntry>,
        ) -> u256 {
            // Reentrancy protection
            self.reentrancy_guard.start();

            let caller = get_caller_address();

            // Mint agent using internal function
            let agent_id = self._mint_agent(caller, token_uri);

            // Set metadata entries if provided
            if metadata.len() > 0 {
                self._set_metadata_batch(agent_id, metadata);
            }

            self.reentrancy_guard.end();
            agent_id
        }

        fn register_with_token_uri(ref self: ContractState, token_uri: ByteArray) -> u256 {
            // Reentrancy protection
            self.reentrancy_guard.start();

            let caller = get_caller_address();
            let agent_id = self._mint_agent(caller, token_uri);

            self.reentrancy_guard.end();
            agent_id
        }

        fn register(ref self: ContractState) -> u256 {
            // Reentrancy protection
            self.reentrancy_guard.start();

            let caller = get_caller_address();
            let agent_id = self._mint_agent(caller, "");

            self.reentrancy_guard.end();
            agent_id
        }

        fn set_metadata(ref self: ContractState, agent_id: u256, key: ByteArray, value: ByteArray) {
            assert(self._is_approved_or_owner(agent_id), 'Not authorized');
            assert(key.len() > 0, 'Empty key');

            // Check for reserved key "agentWallet"
            assert(!self._is_reserved_key(@key), 'reserved key');

            let key_hash = self._hash_key(@key);
            self.agent_metadata.entry((agent_id, key_hash)).write(value.clone());
            self
                .emit(
                    Event::MetadataSet(
                        MetadataSet {
                            agent_id,
                            indexed_key: key.clone(),
                            key: key.clone(),
                            value: value.clone(),
                        },
                    ),
                );
        }

        fn get_metadata(self: @ContractState, agent_id: u256, key: ByteArray) -> ByteArray {
            assert(self.agent_exists(agent_id), 'Agent does not exist');
            let key_hash = self._hash_key(@key);
            self.agent_metadata.entry((agent_id, key_hash)).read()
        }

        fn set_agent_uri(ref self: ContractState, agent_id: u256, new_uri: ByteArray) {
            assert(self._is_approved_or_owner(agent_id), 'Not authorized');

            // Update token URI
            self.token_uris.entry(agent_id).write(new_uri.clone());

            // Emit URIUpdated event
            let caller = get_caller_address();
            self.emit(Event::URIUpdated(URIUpdated { agent_id, new_uri, updated_by: caller }));
        }

        fn get_agent_wallet(self: @ContractState, agent_id: u256) -> ContractAddress {
            self.agent_wallets.entry(agent_id).read()
        }

        fn get_wallet_set_nonce(self: @ContractState, agent_id: u256) -> u64 {
            self.wallet_set_nonces.entry(agent_id).read()
        }

        fn set_agent_wallet(
            ref self: ContractState,
            agent_id: u256,
            new_wallet: ContractAddress,
            deadline: u64,
            signature: Array<felt252>,
        ) {
            // Authorization check
            assert(self._is_approved_or_owner(agent_id), 'Not authorized');

            // Validate new_wallet is not zero
            let zero_address: ContractAddress = 0.try_into().unwrap();
            assert(new_wallet != zero_address, 'bad wallet');

            // Validate deadline
            let current_time = get_block_timestamp();
            assert(current_time <= deadline, 'expired');
            assert(deadline <= current_time + MAX_DEADLINE_DELAY, 'deadline too far');

            let nonce = self.wallet_set_nonces.entry(agent_id).read();
            self._set_agent_wallet_with_nonce(agent_id, new_wallet, deadline, nonce, signature);
        }

        fn set_agent_wallet_with_expected_nonce(
            ref self: ContractState,
            agent_id: u256,
            new_wallet: ContractAddress,
            deadline: u64,
            expected_nonce: u64,
            signature: Array<felt252>,
        ) {
            // Authorization check
            assert(self._is_approved_or_owner(agent_id), 'Not authorized');

            // Validate new_wallet is not zero
            let zero_address: ContractAddress = 0.try_into().unwrap();
            assert(new_wallet != zero_address, 'bad wallet');

            // Validate deadline
            let current_time = get_block_timestamp();
            assert(current_time <= deadline, 'expired');
            assert(deadline <= current_time + MAX_DEADLINE_DELAY, 'deadline too far');

            let nonce = self.wallet_set_nonces.entry(agent_id).read();
            assert(expected_nonce == nonce, 'bad nonce');

            self._set_agent_wallet_with_nonce(agent_id, new_wallet, deadline, nonce, signature);
        }

        fn unset_agent_wallet(ref self: ContractState, agent_id: u256) {
            assert(self._is_approved_or_owner(agent_id), 'Not authorized');

            let zero_address: ContractAddress = 0.try_into().unwrap();
            self.agent_wallets.entry(agent_id).write(zero_address);

            // Emit MetadataSet event with empty value
            self
                .emit(
                    Event::MetadataSet(
                        MetadataSet {
                            agent_id,
                            indexed_key: "agentWallet",
                            key: "agentWallet",
                            value: "",
                        },
                    ),
                );
        }

        fn total_agents(self: @ContractState) -> u256 {
            // Subtract 1 because counter starts at 1, not 0
            self.agent_id_counter.read() - 1
        }

        fn agent_exists(self: @ContractState, agent_id: u256) -> bool {
            self.erc721.exists(agent_id)
        }

        fn is_authorized_or_owner(
            self: @ContractState, spender: ContractAddress, agent_id: u256,
        ) -> bool {
            let owner = self.erc721.owner_of(agent_id);
            self.erc721._is_authorized(owner, spender, agent_id)
        }

        fn get_version(self: @ContractState) -> ByteArray {
            contract_version()
        }
    }

    // ============ Internal Functions ============
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// @dev Converts a ContractAddress to ByteArray hex string (e.g., "0x1")
        fn _address_to_byte_array(self: @ContractState, address: ContractAddress) -> ByteArray {
            let felt_val: felt252 = address.into();
            let mut result: ByteArray = "0x";
            felt_val.append_formatted_to_byte_array(ref result, 16);
            result
        }

        /// @dev Hashes a ByteArray key to felt252 for storage
        /// @param key The key to hash
        /// @return felt252 The hashed key
        fn _hash_key(self: @ContractState, key: @ByteArray) -> felt252 {
            let mut hash_data = ArrayTrait::new();
            let mut i = 0;
            while i < key.len() {
                hash_data.append(key[i].into());
                i += 1;
            };
            poseidon_hash_span(hash_data.span())
        }

        /// @dev Checks if a key is the reserved "agentWallet" key
        fn _is_reserved_key(self: @ContractState, key: @ByteArray) -> bool {
            key == @"agentWallet"
        }

        /// @dev Mints a new agent NFT and sets initial wallet
        /// @param to The address to mint the agent to
        /// @param token_uri The token URI
        /// @return agent_id The newly minted agent ID
        fn _mint_agent(ref self: ContractState, to: ContractAddress, token_uri: ByteArray) -> u256 {
            // Get current agent ID and increment counter for next registration
            let agent_id = self.agent_id_counter.read();
            self.agent_id_counter.write(agent_id + 1);

            // Mint NFT to the specified address
            self.erc721.mint(to, agent_id);

            // Set token URI if provided
            if token_uri.len() > 0 {
                self.token_uris.entry(agent_id).write(token_uri.clone());
            }

            // Set initial agentWallet to the owner (matching Solidity behavior)
            self.agent_wallets.entry(agent_id).write(to);

            // Emit Registered event with actual token_uri and owner
            self.emit(Event::Registered(Registered { agent_id, token_uri, owner: to }));

            // Emit MetadataSet event for agentWallet with actual address
            let wallet_value = self._address_to_byte_array(to);
            self
                .emit(
                    Event::MetadataSet(
                        MetadataSet {
                            agent_id,
                            indexed_key: "agentWallet",
                            key: "agentWallet",
                            value: wallet_value,
                        },
                    ),
                );

            agent_id
        }

        fn _is_approved_or_owner(ref self: ContractState, agent_id: u256) -> bool {
            let owner = self.erc721.owner_of(agent_id);
            let caller = get_caller_address();
            self.erc721._is_authorized(owner, caller, agent_id)
        }

        /// @dev Sets multiple metadata entries in batch
        /// @param agent_id The agent ID
        /// @param metadata Array of metadata entries
        fn _set_metadata_batch(
            ref self: ContractState, agent_id: u256, metadata: Array<MetadataEntry>,
        ) {
            let mut i = 0;
            while i < metadata.len() {
                let entry = metadata.at(i);
                let key = entry.key.clone();
                let value = entry.value.clone();

                // Require non-empty key (matching Solidity's validation)
                assert(key.len() > 0, 'Empty key');

                // Check for reserved key "agentWallet"
                assert(!self._is_reserved_key(@key), 'reserved key');

                // Hash key for storage
                let key_hash = self._hash_key(@key);

                // Store metadata
                self.agent_metadata.entry((agent_id, key_hash)).write(value.clone());

                // Emit MetadataSet event
                self
                    .emit(
                        Event::MetadataSet(
                            MetadataSet {
                                agent_id,
                                indexed_key: key.clone(),
                                key: key.clone(),
                                value: value.clone(),
                            },
                        ),
                    );

                i += 1;
            }
        }

        /// @dev Computes the message hash for wallet set signature verification
        fn _compute_wallet_set_hash(
            self: @ContractState,
            agent_id: u256,
            new_wallet: ContractAddress,
            owner: ContractAddress,
            deadline: u64,
            nonce: u64,
        ) -> felt252 {
            // Domain-separated preimage to prevent cross-contract and cross-chain replay:
            // (agent_id, new_wallet, owner, deadline, nonce, chain_id, identity_registry_address)
            let tx_info = get_tx_info().unbox();
            let chain_id = tx_info.chain_id;
            let registry_address = get_contract_address();

            let mut hash_data = ArrayTrait::new();
            hash_data.append(agent_id.low.into());
            hash_data.append(agent_id.high.into());
            hash_data.append(new_wallet.into());
            hash_data.append(owner.into());
            hash_data.append(deadline.into());
            hash_data.append(nonce.into());
            hash_data.append(chain_id);
            hash_data.append(registry_address.into());
            poseidon_hash_span(hash_data.span())
        }

        /// @dev Verifies signature using SNIP-6 is_valid_signature
        fn _verify_wallet_signature(
            self: @ContractState,
            wallet: ContractAddress,
            message_hash: felt252,
            signature: Span<felt252>,
        ) -> bool {
            // Call the account contract's is_valid_signature method
            let account = IAccountDispatcher { contract_address: wallet };

            // Convert Span to Array for the call
            let mut signature_array = ArrayTrait::new();
            let mut i = 0;
            while i < signature.len() {
                signature_array.append(*signature.at(i));
                i += 1;
            };

            // SNIP-6 standard: returns 'VALID' (0x56414c4944) if signature is valid
            let result = account.is_valid_signature(message_hash, signature_array);

            // SNIP-6 requires `is_valid_signature` to return 'VALID' on success.
            // We intentionally do not accept alternative return markers here.
            result == 'VALID'
        }

        fn _set_agent_wallet_with_nonce(
            ref self: ContractState,
            agent_id: u256,
            new_wallet: ContractAddress,
            deadline: u64,
            nonce: u64,
            signature: Array<felt252>,
        ) {
            let owner = self.erc721.owner_of(agent_id);
            let message_hash = self
                ._compute_wallet_set_hash(agent_id, new_wallet, owner, deadline, nonce);

            // Verify signature using SNIP-6 is_valid_signature.
            let is_valid = self._verify_wallet_signature(new_wallet, message_hash, signature.span());
            assert(is_valid, 'invalid wallet sig');

            // Burn nonce after successful verification to make signatures one-time use.
            self.wallet_set_nonces.entry(agent_id).write(nonce + 1);

            self.agent_wallets.entry(agent_id).write(new_wallet);

            let wallet_value = self._address_to_byte_array(new_wallet);
            self
                .emit(
                    Event::MetadataSet(
                        MetadataSet {
                            agent_id,
                            indexed_key: "agentWallet",
                            key: "agentWallet",
                            value: wallet_value,
                        },
                    ),
                );
        }
    }

    // ============ ERC721Metadata Override ============
    // Override token_uri to use our custom storage
    #[abi(embed_v0)]
    impl ERC721MetadataImpl of openzeppelin::interfaces::erc721::IERC721Metadata<
        ContractState,
    > {
        fn name(self: @ContractState) -> ByteArray {
            self.erc721.name()
        }

        fn symbol(self: @ContractState) -> ByteArray {
            self.erc721.symbol()
        }

        fn token_uri(self: @ContractState, token_id: u256) -> ByteArray {
            assert(self.erc721.exists(token_id), 'Token does not exist');
            // Return our custom stored URI
            self.token_uris.entry(token_id).read()
        }
    }
}
