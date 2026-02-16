use starknet::ContractAddress;

// ============ Structs ============

/// @dev Request stored in contract storage (request_uri stored separately as ByteArray)
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Request {
    pub validator_address: ContractAddress,
    pub agent_id: u256,
    pub request_hash: u256, // bytes32 in Solidity
    pub timestamp: u64,
}

/// @dev Core response data stored in contract storage
/// Note: tag is stored separately (ByteArray cannot derive starknet::Store)
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Response {
    pub validator_address: ContractAddress,
    pub agent_id: u256,
    pub response: u8,
    pub response_hash: u256, // bytes32 in Solidity
    pub last_update: u64,
    pub has_response: bool,
}

// ============ Events ============

/// @dev Emitted when a validation request is created
/// Indexed fields match Solidity: validatorAddress, agentId, requestHash
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct ValidationRequest {
    #[key]
    pub validator_address: ContractAddress,
    #[key]
    pub agent_id: u256,
    pub request_uri: ByteArray,
    #[key]
    pub request_hash: u256,
}

/// @dev Emitted when a validator responds to a request
/// Indexed fields match Solidity: validatorAddress, agentId, requestHash
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct ValidationResponse {
    #[key]
    pub validator_address: ContractAddress,
    #[key]
    pub agent_id: u256,
    #[key]
    pub request_hash: u256,
    pub response: u8,
    pub response_uri: ByteArray,
    pub response_hash: u256,
    pub tag: ByteArray,
}

// ============ Interface ============

#[starknet::interface]
pub trait IValidationRegistry<TState> {
    /// @notice Create a validation request for an agent
    /// @param validator_address The designated validator address
    /// @param agent_id The ID of the agent to validate
    /// @param request_uri URI containing the validation request details
    /// @param request_hash Hash of the request for verification
    fn validation_request(
        ref self: TState,
        validator_address: ContractAddress,
        agent_id: u256,
        request_uri: ByteArray,
        request_hash: u256,
    );

    /// @notice Respond to a validation request (single immutable response)
    /// @param request_hash Hash of the original request
    /// @param response The validation result (0-100)
    /// @param response_uri URI containing response details
    /// @param response_hash Hash of the response for verification
    /// @param tag Category tag for filtering (ByteArray to match Solidity string)
    fn validation_response(
        ref self: TState,
        request_hash: u256,
        response: u8,
        response_uri: ByteArray,
        response_hash: u256,
        tag: ByteArray,
    );

    /// @notice Get the validation status for a specific request
    /// @param request_hash The request hash
    /// @return (validator_address, agent_id, response, response_hash, tag, last_update)
    fn get_validation_status(self: @TState, request_hash: u256)
        -> (ContractAddress, u256, u8, u256, ByteArray, u64);

    /// @notice Get aggregated validation statistics for an agent by tag
    /// @param agent_id The agent ID
    /// @param validator_addresses Optional list of validators to filter by
    /// @param tag The tag to filter by (ByteArray)
    /// @return (count, avg_response)
    fn get_summary(
        self: @TState,
        agent_id: u256,
        validator_addresses: Span<ContractAddress>,
        tag: ByteArray,
    ) -> (u64, u8);

    /// @notice Get aggregated validation statistics for an agent using request pagination
    /// @param request_offset Starting request index in the agent validation list
    /// @param request_limit Maximum number of requests to scan
    /// @return (count, avg_response, truncated)
    /// - truncated=true means there are additional requests after this page
    fn get_summary_paginated(
        self: @TState,
        agent_id: u256,
        validator_addresses: Span<ContractAddress>,
        tag: ByteArray,
        request_offset: u64,
        request_limit: u64,
    ) -> (u64, u8, bool);

    /// @notice Get all validation request hashes for an agent
    fn get_agent_validations(self: @TState, agent_id: u256) -> Array<u256>;

    /// @notice Get validation request hashes for an agent (paginated)
    /// @return (request_hashes, truncated)
    /// - truncated=true means additional items exist after this page
    fn get_agent_validations_paginated(
        self: @TState, agent_id: u256, offset: u64, limit: u64,
    ) -> (Array<u256>, bool);

    /// @notice Get all request hashes created by a validator
    fn get_validator_requests(self: @TState, validator_address: ContractAddress) -> Array<u256>;

    /// @notice Get request hashes created by a validator (paginated)
    /// @return (request_hashes, truncated)
    /// - truncated=true means additional items exist after this page
    fn get_validator_requests_paginated(
        self: @TState, validator_address: ContractAddress, offset: u64, limit: u64,
    ) -> (Array<u256>, bool);

    /// @notice Check if a request exists
    fn request_exists(self: @TState, request_hash: u256) -> bool;

    /// @notice Get request details
    /// @return (validator_address, agent_id, request_uri, timestamp)
    fn get_request(self: @TState, request_hash: u256) -> (ContractAddress, u256, ByteArray, u64);

    /// @notice Get the identity registry address
    fn get_identity_registry(self: @TState) -> ContractAddress;

    /// @notice Upgrade the contract implementation (owner only)
    /// @param new_class_hash The new implementation class hash
    fn upgrade(ref self: TState, new_class_hash: starknet::ClassHash);
}
