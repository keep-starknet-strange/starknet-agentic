// ============================================
// ReputationRegistry
// (ERC-8004 in Cairo)
// On-chain feedback system with cryptographic authorization
//
// This contract implements the Reputation Registry as specified in ERC-8004 v1.0.
// It provides a standard interface for posting and fetching feedback signals with
// on-chain storage and aggregation capabilities.
//
// Key Features:
// - Cryptographic feedback authorization
// - On-chain feedback storage with scores (0-100)
// - Tag-based categorization system
// - URI support with integrity hashes
// - Feedback revocation
// - Response appending by any party
// - On-chain aggregation for composability
// ============================================

#[starknet::contract]
pub mod ReputationRegistry {
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use erc8004::interfaces::identity_registry::{
        IIdentityRegistryDispatcher, IIdentityRegistryDispatcherTrait,
    };
    use erc8004::interfaces::reputation_registry::{
        Feedback, FeedbackAuth, FeedbackRevoked, IReputationRegistry, NewFeedback, ResponseAppended,
    };
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin::token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};
    use starknet::storage::*;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_tx_info};

    // Account interface for signature verification
    #[starknet::interface]
    trait IAccount<TState> {
        fn is_valid_signature(self: @TState, hash: felt252, signature: Array<felt252>) -> felt252;
    }

    // ============ Component Declarations ============
    component!(
        path: ReentrancyGuardComponent, storage: reentrancy_guard, event: ReentrancyGuardEvent,
    );

    // ReentrancyGuard Internal Implementation
    impl ReentrancyGuardInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    // ============ Storage ============
    #[storage]
    pub struct Storage {
        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,
        // Reference to IdentityRegistry
        identity_registry: ContractAddress,
        // agentId => clientAddress => feedbackIndex => Feedback
        feedback: Map<(u256, ContractAddress, u64), Feedback>,
        // agentId => clientAddress => last feedback index
        last_index: Map<(u256, ContractAddress), u64>,
        // agentId => Vec of client addresses
        clients: Map<u256, Vec<ContractAddress>>,
        // agentId => clientAddress => exists in clients array
        client_exists: Map<(u256, ContractAddress), bool>,
        // agentId => clientAddress => feedbackIndex => responder => response count
        response_count: Map<(u256, ContractAddress, u64, ContractAddress), u64>,
    }

    // ============ Events ============
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        NewFeedback: NewFeedback,
        FeedbackRevoked: FeedbackRevoked,
        ResponseAppended: ResponseAppended,
    }

    // ============ Constructor ============
    #[constructor]
    fn constructor(ref self: ContractState, identity_registry_address: ContractAddress) {
        // Validate address is not zero
        assert(!identity_registry_address.is_zero(), 'Invalid registry address');
        self.identity_registry.write(identity_registry_address);
    }

    // ============ IReputationRegistry Implementation ============
    #[abi(embed_v0)]
    impl ReputationRegistryImpl of IReputationRegistry<ContractState> {
        fn give_feedback(
            ref self: ContractState,
            agent_id: u256,
            score: u8,
            tag1: u256,
            tag2: u256,
            fileuri: ByteArray,
            filehash: u256,
            feedback_auth: FeedbackAuth,
            signature: Span<felt252>,
        ) {
            // Validate score
            assert(score <= 100, 'Score must be 0-100');

            // Verify agent exists using dispatcher
            let identity_registry = IIdentityRegistryDispatcher {
                contract_address: self.identity_registry.read(),
            };
            assert(identity_registry.agent_exists(agent_id), 'Agent does not exist');

            // Get agent owner using ERC721 dispatcher
            let erc721 = IERC721Dispatcher { contract_address: self.identity_registry.read() };
            let agent_owner = erc721.owner_of(agent_id);

            let caller = get_caller_address();

            // SECURITY: Prevent self-feedback to maintain integrity
            assert(caller != agent_owner, 'Self-feedback not allowed');

            // Verify authorization parameters
            assert(feedback_auth.agent_id == agent_id, 'AgentId mismatch');
            assert(feedback_auth.client_address == caller, 'ClientAddress mismatch');
            assert(
                feedback_auth.chain_id == get_tx_info().unbox().chain_id.into(), 'ChainId mismatch',
            );
            assert(
                feedback_auth.identity_registry == self.identity_registry.read(),
                'Registry mismatch',
            );
            assert(get_block_timestamp() < feedback_auth.expiry, 'Authorization expired');

            // Get current index for this client-agent pair
            let current_index = self.last_index.entry((agent_id, caller)).read() + 1;
            assert(current_index <= feedback_auth.index_limit, 'Index limit exceeded');

            // Verify signer is owner or approved operator
            assert(
                feedback_auth.signer_address == agent_owner
                    || erc721.is_approved_for_all(agent_owner, feedback_auth.signer_address)
                    || erc721.get_approved(agent_id) == feedback_auth.signer_address,
                'Invalid signer',
            );

            // Verify off-chain signature using SNIP-12 (TypedData)
            // 1. Hash the FeedbackAuth struct
            let message_hash = self._hash_feedback_auth(@feedback_auth);

            // 2. Verify the signature against the signer's account
            let is_valid = self
                ._verify_signature(message_hash, signature, feedback_auth.signer_address);
            assert(is_valid, 'Invalid signature');

            // Store feedback
            self
                .feedback
                .entry((agent_id, caller, current_index))
                .write(Feedback { score, tag1, tag2, is_revoked: false });

            // Update last index
            self.last_index.entry((agent_id, caller)).write(current_index);

            // Add client to list if first feedback
            if !self.client_exists.entry((agent_id, caller)).read() {
                self.clients.entry(agent_id).push(caller);
                self.client_exists.entry((agent_id, caller)).write(true);
            }

            self
                .emit(
                    Event::NewFeedback(
                        NewFeedback {
                            agent_id, client_address: caller, score, tag1, tag2, fileuri, filehash,
                        },
                    ),
                );
        }

        fn revoke_feedback(ref self: ContractState, agent_id: u256, feedback_index: u64) {
            let caller = get_caller_address();
            let last_idx = self.last_index.entry((agent_id, caller)).read();

            assert(feedback_index > 0 && feedback_index <= last_idx, 'Invalid index');

            let mut fb = self.feedback.entry((agent_id, caller, feedback_index)).read();
            assert(!fb.is_revoked, 'Already revoked');

            fb.is_revoked = true;
            self.feedback.entry((agent_id, caller, feedback_index)).write(fb);

            self
                .emit(
                    Event::FeedbackRevoked(
                        FeedbackRevoked { agent_id, client_address: caller, feedback_index },
                    ),
                );
        }

        fn append_response(
            ref self: ContractState,
            agent_id: u256,
            client_address: ContractAddress,
            feedback_index: u64,
            response_uri: ByteArray,
            response_hash: u256,
        ) {
            let last_idx = self.last_index.entry((agent_id, client_address)).read();
            assert(feedback_index > 0 && feedback_index <= last_idx, 'Invalid index');
            assert(response_uri.len() > 0, 'Empty URI');

            let caller = get_caller_address();

            // Increment response count for this responder
            let count = self
                .response_count
                .entry((agent_id, client_address, feedback_index, caller))
                .read();
            self
                .response_count
                .entry((agent_id, client_address, feedback_index, caller))
                .write(count + 1);

            self
                .emit(
                    Event::ResponseAppended(
                        ResponseAppended {
                            agent_id,
                            client_address,
                            feedback_index,
                            responder: caller,
                            response_uri,
                            response_hash,
                        },
                    ),
                );
        }

        fn get_summary(
            self: @ContractState,
            agent_id: u256,
            client_addresses: Span<ContractAddress>,
            tag1: u256,
            tag2: u256,
        ) -> (u64, u8) {
            let (total_score, valid_count) = self
                ._aggregate_feedback(agent_id, client_addresses, tag1, tag2);

            let average_score = if valid_count > 0 {
                (total_score / valid_count.into()).try_into().unwrap()
            } else {
                0
            };

            (valid_count, average_score)
        }

        fn read_feedback(
            self: @ContractState, agent_id: u256, client_address: ContractAddress, index: u64,
        ) -> (u8, u256, u256, bool) {
            let last_idx = self.last_index.entry((agent_id, client_address)).read();
            assert(index > 0 && index <= last_idx, 'Invalid index');

            let fb = self.feedback.entry((agent_id, client_address, index)).read();
            (fb.score, fb.tag1, fb.tag2, fb.is_revoked)
        }

        fn read_all_feedback(
            self: @ContractState,
            agent_id: u256,
            client_addresses: Span<ContractAddress>,
            tag1: u256,
            tag2: u256,
            include_revoked: bool,
        ) -> (Array<ContractAddress>, Array<u8>, Array<u256>, Array<u256>, Array<bool>) {
            let mut clients = ArrayTrait::new();
            let mut scores = ArrayTrait::new();
            let mut tag1s = ArrayTrait::new();
            let mut tag2s = ArrayTrait::new();
            let mut revoked_statuses = ArrayTrait::new();

            self
                ._populate_feedback_arrays(
                    agent_id,
                    client_addresses,
                    tag1,
                    tag2,
                    include_revoked,
                    ref clients,
                    ref scores,
                    ref tag1s,
                    ref tag2s,
                    ref revoked_statuses,
                );

            (clients, scores, tag1s, tag2s, revoked_statuses)
        }

        fn get_response_count(
            self: @ContractState,
            agent_id: u256,
            client_address: ContractAddress,
            feedback_index: u64,
            responders: Span<ContractAddress>,
        ) -> u64 {
            // Early return if no responders specified
            if responders.len() == 0 {
                return 0;
            }

            let mut count = 0;

            if client_address.is_zero() {
                // Count all responses for all clients from specified responders
                let client_vec = self.clients.entry(agent_id);
                let mut i = 0;
                while i < client_vec.len() {
                    let client = client_vec.at(i).read();
                    let last_idx = self.last_index.entry((agent_id, client)).read();

                    let mut j = 1;
                    while j <= last_idx {
                        let mut k = 0;
                        while k < responders.len() {
                            count += self
                                .response_count
                                .entry((agent_id, client, j, *responders.at(k)))
                                .read();
                            k += 1;
                        }
                        j += 1;
                    }
                    i += 1;
                }
            } else if feedback_index == 0 {
                // Count all responses for specific client from specified responders
                let last_idx = self.last_index.entry((agent_id, client_address)).read();
                let mut j = 1;
                while j <= last_idx {
                    let mut k = 0;
                    while k < responders.len() {
                        count += self
                            .response_count
                            .entry((agent_id, client_address, j, *responders.at(k)))
                            .read();
                        k += 1;
                    }
                    j += 1;
                }
            } else {
                // Count responses for specific feedback from specified responders
                let mut k = 0;
                while k < responders.len() {
                    count += self
                        .response_count
                        .entry((agent_id, client_address, feedback_index, *responders.at(k)))
                        .read();
                    k += 1;
                }
            }

            count
        }

        fn get_clients(self: @ContractState, agent_id: u256) -> Array<ContractAddress> {
            let mut result = ArrayTrait::new();
            let client_vec = self.clients.entry(agent_id);

            let mut i = 0;
            while i < client_vec.len() {
                result.append(client_vec.at(i).read());
                i += 1;
            }

            result
        }

        fn get_last_index(
            self: @ContractState, agent_id: u256, client_address: ContractAddress,
        ) -> u64 {
            self.last_index.entry((agent_id, client_address)).read()
        }

        fn get_identity_registry(self: @ContractState) -> ContractAddress {
            self.identity_registry.read()
        }
    }

    // ============ Internal Functions ============
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Hash FeedbackAuth struct using Poseidon (Starknet's native hash function)
        /// This is equivalent to keccak256 in Ethereum but uses Poseidon for efficiency
        fn _hash_feedback_auth(self: @ContractState, auth: @FeedbackAuth) -> felt252 {
            // Build array of all struct fields for hashing
            let mut hash_data = ArrayTrait::new();

            // Add domain separator (similar to EIP-712)
            hash_data.append('ERC8004-ReputationRegistry'); // Domain name
            // Add FeedbackAuth fields
            hash_data.append((*auth.agent_id).low.into());
            hash_data.append((*auth.agent_id).high.into());
            hash_data.append((*auth.client_address).into());
            hash_data.append((*auth.index_limit).into());
            hash_data.append((*auth.expiry).into());
            hash_data.append((*auth.chain_id).low.into());
            hash_data.append((*auth.chain_id).high.into());
            hash_data.append((*auth.identity_registry).into());
            hash_data.append((*auth.signer_address).into());

            // Hash using Poseidon
            poseidon_hash_span(hash_data.span())
        }

        /// Verify signature using the signer's account contract
        /// Delegates to the account's is_valid_signature method (SNIP-6)
        fn _verify_signature(
            self: @ContractState,
            message_hash: felt252,
            signature: Span<felt252>,
            signer: ContractAddress,
        ) -> bool {
            // Convert Span to Array for the call
            let mut signature_array = ArrayTrait::new();
            let mut i = 0;
            while i < signature.len() {
                signature_array.append(*signature.at(i));
                i += 1;
            }

            // Call the account contract's is_valid_signature method
            let account = IAccountDispatcher { contract_address: signer };

            // SNIP-6 standard: returns 'VALID' (0x56414c4944) if signature is valid
            let result = account.is_valid_signature(message_hash, signature_array);

            // Check if result equals 'VALID'
            result == 'VALID' || result == starknet::VALIDATED
        }

        fn _aggregate_feedback(
            self: @ContractState,
            agent_id: u256,
            client_addresses: Span<ContractAddress>,
            tag1: u256,
            tag2: u256,
        ) -> (u256, u64) {
            let mut total_score: u256 = 0;
            let mut valid_count: u64 = 0;

            let clients = if client_addresses.len() > 0 {
                client_addresses
            } else {
                // Get all clients from Vec
                let client_vec = self.clients.entry(agent_id);
                let mut all_clients = ArrayTrait::new();
                let mut i = 0;
                while i < client_vec.len() {
                    all_clients.append(client_vec.at(i).read());
                    i += 1;
                }
                all_clients.span()
            };

            let mut i = 0;
            while i < clients.len() {
                let client = *clients.at(i);
                let last_idx = self.last_index.entry((agent_id, client)).read();

                let mut j = 1;
                while j <= last_idx {
                    let fb = self.feedback.entry((agent_id, client, j)).read();

                    // Skip revoked feedback if not included
                    if fb.is_revoked {
                        j += 1;
                        continue;
                    }

                    // Apply tag filters
                    if tag1 != 0 && fb.tag1 != tag1 {
                        j += 1;
                        continue;
                    }
                    if tag2 != 0 && fb.tag2 != tag2 {
                        j += 1;
                        continue;
                    }

                    total_score += fb.score.into();
                    valid_count += 1;

                    j += 1;
                }

                i += 1;
            }

            (total_score, valid_count)
        }

        fn _populate_feedback_arrays(
            self: @ContractState,
            agent_id: u256,
            client_addresses: Span<ContractAddress>,
            tag1: u256,
            tag2: u256,
            include_revoked: bool,
            ref clients: Array<ContractAddress>,
            ref scores: Array<u8>,
            ref tag1s: Array<u256>,
            ref tag2s: Array<u256>,
            ref revoked_statuses: Array<bool>,
        ) {
            let client_list = if client_addresses.len() > 0 {
                client_addresses
            } else {
                let client_vec = self.clients.entry(agent_id);
                let mut all_clients = ArrayTrait::new();
                let mut i = 0;
                while i < client_vec.len() {
                    all_clients.append(client_vec.at(i).read());
                    i += 1;
                }
                all_clients.span()
            };

            let mut i = 0;
            while i < client_list.len() {
                let client = *client_list.at(i);
                let last_idx = self.last_index.entry((agent_id, client)).read();

                let mut j = 1;
                while j <= last_idx {
                    let fb = self.feedback.entry((agent_id, client, j)).read();

                    if !include_revoked && fb.is_revoked {
                        j += 1;
                        continue;
                    }
                    if tag1 != 0 && fb.tag1 != tag1 {
                        j += 1;
                        continue;
                    }
                    if tag2 != 0 && fb.tag2 != tag2 {
                        j += 1;
                        continue;
                    }

                    clients.append(client);
                    scores.append(fb.score);
                    tag1s.append(fb.tag1);
                    tag2s.append(fb.tag2);
                    revoked_statuses.append(fb.is_revoked);

                    j += 1;
                }

                i += 1;
            }
        }
    }
}
