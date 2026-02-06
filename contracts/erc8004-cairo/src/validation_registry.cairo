// ============================================
// ValidationRegistry
// (ERC-8004 in Cairo)
// This contract implements the Validation Registry as specified in ERC-8004 v1.0.
// It enables agents to request verification of their work and allows validator
// smart contracts to provide responses that can be tracked on-chain.
//
// Key Features:
// - Validation requests with URI and hash commitments
// - Multiple responses per request (progressive validation)
// - Tag-based categorization (ByteArray for Solidity string parity)
// - On-chain aggregation for composability
// - Support for various validation methods (stake-secured, zkML, TEE)
// - Upgradeability via replace_class pattern
// ============================================

#[starknet::contract]
pub mod ValidationRegistry {
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use erc8004::interfaces::identity_registry::{
        IIdentityRegistryDispatcher, IIdentityRegistryDispatcherTrait,
    };
    use erc8004::interfaces::validation_registry::{
        IValidationRegistry, Request, Response, ValidationRequest as ValidationRequestEvent,
        ValidationResponse as ValidationResponseEvent,
    };
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};
    use openzeppelin::upgrades::UpgradeableComponent;
    use starknet::storage::*;
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address};

    // ============ Components ============
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    // Ownable Mixin
    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    // Upgradeable
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    // ============ Storage ============
    #[storage]
    pub struct Storage {
        // Components
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        // Reference to IdentityRegistry
        identity_registry: ContractAddress,
        // requestHash => Request (core data, excludes request_uri)
        requests: Map<u256, Request>,
        // requestHash => request_uri (ByteArray stored separately)
        request_uris: Map<u256, ByteArray>,
        // requestHash => Response
        responses: Map<u256, Response>,
        // requestHash => response tag (ByteArray stored separately)
        response_tags: Map<u256, ByteArray>,
        // agentId => Vec of requestHashes
        agent_validations: Map<u256, Vec<u256>>,
        // validatorAddress => Vec of requestHashes
        validator_requests: Map<ContractAddress, Vec<u256>>,
        // requestHash => exists in arrays
        request_exists: Map<u256, bool>,
    }

    // ============ Events ============
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        ValidationRequest: ValidationRequestEvent,
        ValidationResponse: ValidationResponseEvent,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
    }

    // ============ Constructor ============
    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        identity_registry_address: ContractAddress,
    ) {
        // Validate addresses
        assert(!owner.is_zero(), 'Invalid owner address');
        assert(!identity_registry_address.is_zero(), 'Invalid registry address');

        // Initialize ownable
        self.ownable.initializer(owner);

        self.identity_registry.write(identity_registry_address);
    }

    // ============ IValidationRegistry Implementation ============
    #[abi(embed_v0)]
    impl ValidationRegistryImpl of IValidationRegistry<ContractState> {
        fn validation_request(
            ref self: ContractState,
            agent_id: u256,
            request_uri: ByteArray,
            request_hash: u256,
        ) {
            // Validate inputs
            assert(request_uri.len() > 0, 'Empty request URI');

            // Verify agent exists using dispatcher
            let identity_registry = IIdentityRegistryDispatcher {
                contract_address: self.identity_registry.read(),
            };
            assert(identity_registry.agent_exists(agent_id), 'Agent does not exist');

            // Verify caller is owner or approved operator
            let erc721 = IERC721Dispatcher { contract_address: self.identity_registry.read() };
            let agent_owner = erc721.owner_of(agent_id);
            let caller = get_caller_address();

            assert(
                caller == agent_owner
                    || erc721.is_approved_for_all(agent_owner, caller)
                    || erc721.get_approved(agent_id) == caller,
                'Not authorized',
            );

            // Generate requestHash if not provided (0 means auto-generate)
            let final_request_hash = if request_hash == 0 {
                self._generate_request_hash(agent_id, @request_uri, caller)
            } else {
                request_hash
            };

            // SECURITY: Prevent requestHash hijacking
            // Once a request exists, it cannot be overwritten
            assert(!self.request_exists.entry(final_request_hash).read(), 'Request hash exists');

            // Store request (without request_uri since ByteArray cannot be in struct)
            let timestamp = get_block_timestamp();
            self
                .requests
                .entry(final_request_hash)
                .write(
                    Request {
                        validator_address: caller, // requester is stored
                        agent_id,
                        request_hash: final_request_hash,
                        timestamp,
                    },
                );

            // Store request_uri separately
            self.request_uris.entry(final_request_hash).write(request_uri.clone());

            // Add to tracking arrays
            self.agent_validations.entry(agent_id).push(final_request_hash);
            self.validator_requests.entry(caller).push(final_request_hash);
            self.request_exists.entry(final_request_hash).write(true);

            self
                .emit(
                    Event::ValidationRequest(
                        ValidationRequestEvent {
                            validator_address: caller,
                            agent_id,
                            request_uri,
                            request_hash: final_request_hash,
                        },
                    ),
                );
        }

        fn validation_response(
            ref self: ContractState,
            agent_id: u256,
            request_hash: u256,
            response: u8,
            response_uri: ByteArray,
            response_hash: u256,
            tag: ByteArray,
        ) {
            // Validate response range (matches Solidity: 0=pending, 1=valid, 2=invalid)
            assert(response <= 2, 'Response must be 0-2');

            // Verify request exists
            assert(self.request_exists.entry(request_hash).read(), 'Request not found');

            // Get request
            let request = self.requests.entry(request_hash).read();
            assert(request.agent_id == agent_id, 'Agent ID mismatch');

            // Caller is the validator responding
            let caller = get_caller_address();

            // Store response
            self
                .responses
                .entry(request_hash)
                .write(
                    Response {
                        validator_address: caller,
                        agent_id,
                        response,
                        response_hash,
                        last_update: get_block_timestamp(),
                        has_response: true,
                    },
                );

            // Store tag separately (ByteArray cannot be in struct with starknet::Store)
            self.response_tags.entry(request_hash).write(tag.clone());

            self
                .emit(
                    Event::ValidationResponse(
                        ValidationResponseEvent {
                            validator_address: caller,
                            agent_id,
                            request_hash,
                            response,
                            response_uri,
                            response_hash,
                            tag,
                        },
                    ),
                );
        }

        fn get_validation_status(
            self: @ContractState,
            validator_address: ContractAddress,
            agent_id: u256,
            request_hash: u256,
        ) -> (u8, u64, u256, bool) {
            let resp = self.responses.entry(request_hash).read();

            // Return response details
            // has_response flag distinguishes between no response and response with value 0
            (resp.response, resp.last_update, resp.response_hash, resp.has_response)
        }

        fn get_summary(
            self: @ContractState,
            agent_id: u256,
            tag: ByteArray,
            validator_addresses: Span<ContractAddress>,
        ) -> (u64, u64, u64) {
            let request_hashes_vec = self.agent_validations.entry(agent_id);
            let len = request_hashes_vec.len();

            let mut count: u64 = 0;
            let mut valid_count: u64 = 0;
            let mut invalid_count: u64 = 0;

            let mut i = 0;
            while i < len {
                let request_hash = request_hashes_vec.at(i).read();
                let resp = self.responses.entry(request_hash).read();

                // Skip if no response yet
                if !resp.has_response {
                    i += 1;
                    continue;
                }

                // Apply validator filter if provided
                if validator_addresses.len() > 0 {
                    let mut matches_validator = false;
                    let mut j = 0;
                    while j < validator_addresses.len() {
                        if resp.validator_address == *validator_addresses.at(j) {
                            matches_validator = true;
                            break;
                        }
                        j += 1;
                    }
                    if !matches_validator {
                        i += 1;
                        continue;
                    }
                }

                // Apply tag filter if provided (non-empty tag)
                if tag.len() > 0 {
                    let stored_tag = self.response_tags.entry(request_hash).read();
                    if stored_tag != tag {
                        i += 1;
                        continue;
                    }
                }

                // Count based on response value (matches Solidity: 1=valid, 2=invalid)
                count += 1;
                if resp.response == 1 {
                    valid_count += 1;
                } else if resp.response == 2 {
                    invalid_count += 1;
                }

                i += 1;
            }

            (count, valid_count, invalid_count)
        }

        fn get_agent_validations(self: @ContractState, agent_id: u256) -> Array<u256> {
            let mut result = ArrayTrait::new();
            let vec = self.agent_validations.entry(agent_id);

            let mut i = 0;
            while i < vec.len() {
                result.append(vec.at(i).read());
                i += 1;
            }

            result
        }

        fn get_validator_requests(
            self: @ContractState, validator_address: ContractAddress,
        ) -> Array<u256> {
            let mut result = ArrayTrait::new();
            let vec = self.validator_requests.entry(validator_address);

            let mut i = 0;
            while i < vec.len() {
                result.append(vec.at(i).read());
                i += 1;
            }

            result
        }

        fn request_exists(self: @ContractState, request_hash: u256) -> bool {
            self.request_exists.entry(request_hash).read()
        }

        fn get_request(
            self: @ContractState, request_hash: u256,
        ) -> (ContractAddress, u256, ByteArray, u64) {
            // Use request_exists mapping for existence check (timestamp can be 0 in tests)
            assert(self.request_exists.entry(request_hash).read(), 'Request not found');

            let request = self.requests.entry(request_hash).read();
            let request_uri = self.request_uris.entry(request_hash).read();

            (request.validator_address, request.agent_id, request_uri, request.timestamp)
        }

        fn get_identity_registry(self: @ContractState) -> ContractAddress {
            self.identity_registry.read()
        }

        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            // Only owner can upgrade
            self.ownable.assert_only_owner();

            // Perform upgrade
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    // ============ Internal Functions ============
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Generate request hash from request parameters using poseidon
        /// Returns u256 for consistency with external hash types
        fn _generate_request_hash(
            ref self: ContractState,
            agent_id: u256,
            request_uri: @ByteArray,
            caller: ContractAddress,
        ) -> u256 {
            let timestamp = get_block_timestamp();

            // Convert all inputs to felt252 and hash
            let mut hash_data = ArrayTrait::new();
            hash_data.append(caller.into());
            hash_data.append(agent_id.low.into());
            hash_data.append(agent_id.high.into());

            // Hash request_uri bytes
            let mut i = 0;
            while i < request_uri.len() {
                hash_data.append(request_uri[i].into());
                i += 1;
            }

            hash_data.append(timestamp.into());

            // Use poseidon hash for deterministic hash generation
            let hash_felt = poseidon_hash_span(hash_data.span());

            // Convert felt252 to u256
            hash_felt.into()
        }
    }
}
