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
// - Tag-based categorization
// - On-chain aggregation for composability
// - Support for various validation methods (stake-secured, zkML, TEE)
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
    use openzeppelin::token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};
    use starknet::storage::*;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};

    // ============ Storage ============
    #[storage]
    pub struct Storage {
        // Reference to IdentityRegistry
        identity_registry: ContractAddress,
        // requestHash => Request
        requests: Map<u256, Request>,
        // requestHash => Response
        responses: Map<u256, Response>,
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
    }

    // ============ Constructor ============
    #[constructor]
    fn constructor(ref self: ContractState, identity_registry_address: ContractAddress) {
        // Validate identity_registry_address
        assert(!identity_registry_address.is_zero(), 'Invalid registry address');
        self.identity_registry.write(identity_registry_address);
    }

    // ============ IValidationRegistry Implementation ============
    #[abi(embed_v0)]
    impl ValidationRegistryImpl of IValidationRegistry<ContractState> {
        fn validation_request(
            ref self: ContractState,
            validator_address: ContractAddress,
            agent_id: u256,
            request_uri: ByteArray,
            request_hash: u256,
        ) {
            // Validate inputs
            assert(!validator_address.is_zero(), 'Invalid validator address');
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

            // SECURITY: Prevent self-validation (defeats purpose of independent validation)
            // As per ERC-8004 v1.0 intent: "independent validators checks"
            assert(validator_address != agent_owner, 'Self-validation not allowed');
            assert(validator_address != caller, 'Self-validation not allowed');

            // Generate requestHash if not provided (for non-IPFS URIs)
            let final_request_hash = if request_hash == 0 {
                self._generate_request_hash(validator_address, agent_id, @request_uri, caller)
            } else {
                request_hash
            };

            // SECURITY: Prevent requestHash hijacking
            // Once a request exists, it cannot be overwritten
            assert(!self.request_exists.entry(final_request_hash).read(), 'Request hash exists');

            // Store request
            self
                .requests
                .entry(final_request_hash)
                .write(
                    Request {
                        validator_address,
                        agent_id,
                        request_uri: request_uri.clone(),
                        request_hash: final_request_hash,
                        timestamp: get_block_timestamp(),
                    },
                );

            // Add to tracking arrays
            self.agent_validations.entry(agent_id).push(final_request_hash);
            self.validator_requests.entry(validator_address).push(final_request_hash);
            self.request_exists.entry(final_request_hash).write(true);

            self
                .emit(
                    Event::ValidationRequest(
                        ValidationRequestEvent {
                            validator_address,
                            agent_id,
                            request_uri,
                            request_hash: final_request_hash,
                        },
                    ),
                );
        }

        fn validation_response(
            ref self: ContractState,
            request_hash: u256,
            response: u8,
            response_uri: ByteArray,
            response_hash: u256,
            tag: u256,
        ) {
            // Validate response range
            assert(response <= 100, 'Response must be 0-100');

            // Get request
            let request = self.requests.entry(request_hash).read();
            assert(!request.validator_address.is_zero(), 'Request not found');

            // Verify caller is the designated validator
            let caller = get_caller_address();
            assert(caller == request.validator_address, 'Not authorized validator');

            // Store or update response
            self
                .responses
                .entry(request_hash)
                .write(
                    Response {
                        validator_address: request.validator_address,
                        agent_id: request.agent_id,
                        response,
                        tag,
                        last_update: get_block_timestamp(),
                    },
                );

            self
                .emit(
                    Event::ValidationResponse(
                        ValidationResponseEvent {
                            validator_address: request.validator_address,
                            agent_id: request.agent_id,
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
            self: @ContractState, request_hash: u256,
        ) -> (ContractAddress, u256, u8, u256, u256) {
            let resp = self.responses.entry(request_hash).read();

            // Return default values for pending requests (no panic)
            // This allows callers to distinguish between:
            // - Non-existent request: validator_address == 0 && !request_exists
            // - Pending request: validator_address == 0 && request_exists
            // - Responded request: validator_address != 0
            (
                resp.validator_address,
                resp.agent_id,
                resp.response,
                resp.tag,
                resp.last_update.into(),
            )
        }

        fn get_summary(
            self: @ContractState,
            agent_id: u256,
            validator_addresses: Span<ContractAddress>,
            tag: u256,
        ) -> (u64, u8) {
            let request_hashes_vec = self.agent_validations.entry(agent_id);
            let len = request_hashes_vec.len();

            let mut total_response: u256 = 0;
            let mut valid_count: u64 = 0;

            let mut i = 0;
            while i < len {
                let request_hash = request_hashes_vec.at(i).read();
                let resp = self.responses.entry(request_hash).read();

                // Skip if no response yet
                if resp.validator_address.is_zero() {
                    i += 1;
                    continue;
                }

                // Apply validator filter
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

                // Apply tag filter
                if tag != 0 && resp.tag != tag {
                    i += 1;
                    continue;
                }

                total_response += resp.response.into();
                valid_count += 1;
                i += 1;
            }

            let avg_response = if valid_count > 0 {
                (total_response / valid_count.into()).try_into().unwrap()
            } else {
                0
            };

            (valid_count, avg_response)
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
            let request = self.requests.entry(request_hash).read();
            assert(!request.validator_address.is_zero(), 'Request not found');

            (request.validator_address, request.agent_id, request.request_uri, request.timestamp)
        }

        fn get_identity_registry(self: @ContractState) -> ContractAddress {
            self.identity_registry.read()
        }
    }

    // ============ Internal Functions ============
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Generate request hash from request parameters
        fn _generate_request_hash(
            ref self: ContractState,
            validator_address: ContractAddress,
            agent_id: u256,
            request_uri: @ByteArray,
            caller: ContractAddress,
        ) -> u256 {
            // Use Pedersen hash for on-chain hash generation
            let timestamp = get_block_timestamp();

            // Convert all inputs to felt252 and hash
            let mut hash_data = ArrayTrait::new();
            hash_data.append(validator_address.into());
            hash_data.append(agent_id.low.into());
            hash_data.append(agent_id.high.into());

            // Hash request_uri bytes
            let mut i = 0;
            while i < request_uri.len() {
                hash_data.append(request_uri[i].into());
                i += 1;
            }

            hash_data.append(timestamp.into());
            hash_data.append(caller.into());

            // Use poseidon hash for deterministic hash generation
            let hash_felt = poseidon_hash_span(hash_data.span());

            // Convert felt252 to u256
            let hash_u256: u256 = hash_felt.into();
            hash_u256
        }
    }
}
