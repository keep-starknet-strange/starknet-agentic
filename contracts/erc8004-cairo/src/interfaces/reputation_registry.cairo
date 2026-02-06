use starknet::ContractAddress;

// ============ Structs ============

/// Feedback core data (stored on-chain)
/// Note: tags are stored separately as ByteArray due to storage constraints
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct FeedbackCore {
    pub value: i128,
    pub value_decimals: u8,
    pub is_revoked: bool,
}

// ============ Events ============

/// Emitted when new feedback is given
/// Matches Solidity: NewFeedback(agentId, clientAddress, feedbackIndex, value, valueDecimals, 
///                               indexedTag1, tag1, tag2, endpoint, feedbackURI, feedbackHash)
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct NewFeedback {
    #[key]
    pub agent_id: u256,
    #[key]
    pub client_address: ContractAddress,
    pub feedback_index: u64,
    pub value: i128,
    pub value_decimals: u8,
    #[key]
    pub indexed_tag1: ByteArray,
    pub tag1: ByteArray,
    pub tag2: ByteArray,
    pub endpoint: ByteArray,
    pub feedback_uri: ByteArray,
    pub feedback_hash: u256,
}

/// Emitted when feedback is revoked
/// Matches Solidity: FeedbackRevoked(agentId, clientAddress, feedbackIndex)
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct FeedbackRevoked {
    #[key]
    pub agent_id: u256,
    #[key]
    pub client_address: ContractAddress,
    #[key]
    pub feedback_index: u64,
}

/// Emitted when a response is appended
/// Matches Solidity: ResponseAppended(agentId, clientAddress, feedbackIndex, responder, responseURI, responseHash)
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct ResponseAppended {
    #[key]
    pub agent_id: u256,
    #[key]
    pub client_address: ContractAddress,
    pub feedback_index: u64,
    #[key]
    pub responder: ContractAddress,
    pub response_uri: ByteArray,
    pub response_hash: u256,
}

// ============ Interface ============

#[starknet::interface]
pub trait IReputationRegistry<TState> {
    /// Give feedback for an agent
    /// Matches Solidity: giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)
    fn give_feedback(
        ref self: TState,
        agent_id: u256,
        value: i128,
        value_decimals: u8,
        tag1: ByteArray,
        tag2: ByteArray,
        endpoint: ByteArray,
        feedback_uri: ByteArray,
        feedback_hash: u256,
    );

    /// Revoke previously given feedback
    fn revoke_feedback(ref self: TState, agent_id: u256, feedback_index: u64);

    /// Append a response to existing feedback
    fn append_response(
        ref self: TState,
        agent_id: u256,
        client_address: ContractAddress,
        feedback_index: u64,
        response_uri: ByteArray,
        response_hash: u256,
    );

    /// Get aggregated summary of feedback
    /// Returns (count, summaryValue, summaryValueDecimals)
    fn get_summary(
        self: @TState,
        agent_id: u256,
        client_addresses: Span<ContractAddress>,
        tag1: ByteArray,
        tag2: ByteArray,
    ) -> (u64, i128, u8);

    /// Read a single feedback entry
    /// Returns (value, valueDecimals, tag1, tag2, isRevoked)
    fn read_feedback(
        self: @TState, agent_id: u256, client_address: ContractAddress, index: u64,
    ) -> (i128, u8, ByteArray, ByteArray, bool);

    /// Read all feedback matching filters
    /// Returns arrays: (clients, feedbackIndexes, values, valueDecimals, tag1s, tag2s, revokedStatuses)
    fn read_all_feedback(
        self: @TState,
        agent_id: u256,
        client_addresses: Span<ContractAddress>,
        tag1: ByteArray,
        tag2: ByteArray,
        include_revoked: bool,
    ) -> (
        Array<ContractAddress>,
        Array<u64>,
        Array<i128>,
        Array<u8>,
        Array<ByteArray>,
        Array<ByteArray>,
        Array<bool>,
    );

    /// Get response count for feedback
    fn get_response_count(
        self: @TState,
        agent_id: u256,
        client_address: ContractAddress,
        feedback_index: u64,
        responders: Span<ContractAddress>,
    ) -> u64;

    /// Get all clients who have given feedback for an agent
    fn get_clients(self: @TState, agent_id: u256) -> Array<ContractAddress>;

    /// Get last feedback index for a client-agent pair
    fn get_last_index(self: @TState, agent_id: u256, client_address: ContractAddress) -> u64;

    /// Get the identity registry address
    fn get_identity_registry(self: @TState) -> ContractAddress;
}
