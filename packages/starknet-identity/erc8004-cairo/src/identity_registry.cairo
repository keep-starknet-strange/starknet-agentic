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
// ============================================

#[starknet::contract]
pub mod IdentityRegistry {
    use core::poseidon::poseidon_hash_span; // For hashing keys
    use erc8004::interfaces::identity_registry::{
        IIdentityRegistry, MetadataEntry, MetadataSet, Registered,
    };
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin::token::erc721::{ERC721Component, ERC721HooksEmptyImpl};
    use starknet::storage::*;
    use starknet::{ContractAddress, get_caller_address};

    // ============ Component Declarations ============
    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(
        path: ReentrancyGuardComponent, storage: reentrancy_guard, event: ReentrancyGuardEvent,
    );

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
        // Identity Registry specific storage
        agent_id_counter: u256,
        agent_metadata: Map<(u256, felt252), ByteArray>, // (agent_id, key_hash) => value
        token_uris: Map<u256, ByteArray> // agent_id => token_uri
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
        Registered: Registered,
        MetadataSet: MetadataSet,
    }

    // ============ Constructor ============
    #[constructor]
    fn constructor(ref self: ContractState) {
        // Initialize ERC721 with name "ERC-8004 Trustless Agent" and symbol "AGENT"
        self.erc721.initializer("ERC-8004 Trustless Agent", "AGENT", "");

        // Agent IDs start from 1 (0 is reserved for non-existent agents)
        self.agent_id_counter.write(1);
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

        fn total_agents(self: @ContractState) -> u256 {
            // Subtract 1 because counter starts at 1, not 0
            self.agent_id_counter.read() - 1
        }

        fn agent_exists(self: @ContractState, agent_id: u256) -> bool {
            self.erc721.exists(agent_id)
        }
    }

    // ============ Internal Functions ============
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// @dev Hashes a ByteArray key to felt252 for storage
        /// @param key The key to hash
        /// @return felt252 The hashed key
        fn _hash_key(self: @ContractState, key: @ByteArray) -> felt252 {
            let mut hash_data = ArrayTrait::new();
            let mut i = 0;
            while i < key.len() {
                hash_data.append(key[i].into());
                i += 1;
            }
            poseidon_hash_span(hash_data.span())
        }

        /// @dev Mints a new agent NFT
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

            // Emit Registered event with actual token_uri and owner
            self.emit(Event::Registered(Registered { agent_id, token_uri, owner: to }));

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
    }

    // ============ ERC721Metadata Override ============
    // Override token_uri to use our custom storage
    #[abi(embed_v0)]
    impl ERC721MetadataImpl of openzeppelin::token::erc721::interface::IERC721Metadata<
        ContractState,
    > {
        fn name(self: @ContractState) -> ByteArray {
            self.erc721.name()
        }

        fn symbol(self: @ContractState) -> ByteArray {
            self.erc721.symbol()
        }

        fn token_uri(self: @ContractState, token_id: u256) -> ByteArray {
            // Return our custom stored URI
            self.token_uris.entry(token_id).read()
        }
    }
}
