use starknet::ContractAddress;

// ============ Structs ============

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Feedback {
    pub score: u8,
    pub tag1: u256,
    pub tag2: u256,
    pub is_revoked: bool,
}

#[derive(Drop, Serde)]
pub struct FeedbackAuth {
    pub agent_id: u256,
    pub client_address: ContractAddress,
    pub index_limit: u64,
    pub expiry: u64,
    pub chain_id: u256,
    pub identity_registry: ContractAddress,
    pub signer_address: ContractAddress,
}

// ============ Events ============

#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct NewFeedback {
    #[key]
    pub agent_id: u256,
    #[key]
    pub client_address: ContractAddress,
    pub score: u8,
    pub tag1: u256,
    pub tag2: u256,
    pub fileuri: ByteArray,
    pub filehash: u256,
}

#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct FeedbackRevoked {
    #[key]
    pub agent_id: u256,
    #[key]
    pub client_address: ContractAddress,
    pub feedback_index: u64,
}

#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct ResponseAppended {
    #[key]
    pub agent_id: u256,
    #[key]
    pub client_address: ContractAddress,
    pub feedback_index: u64,
    pub responder: ContractAddress,
    pub response_uri: ByteArray,
    pub response_hash: u256,
}

// ============ Interface ============

#[starknet::interface]
pub trait IReputationRegistry<TState> {
    fn give_feedback(
        ref self: TState,
        agent_id: u256,
        score: u8,
        tag1: u256,
        tag2: u256,
        fileuri: ByteArray,
        filehash: u256,
        feedback_auth: FeedbackAuth,
        signature: Span<felt252>,
    );

    fn revoke_feedback(ref self: TState, agent_id: u256, feedback_index: u64);

    fn append_response(
        ref self: TState,
        agent_id: u256,
        client_address: ContractAddress,
        feedback_index: u64,
        response_uri: ByteArray,
        response_hash: u256,
    );

    fn get_summary(
        self: @TState,
        agent_id: u256,
        client_addresses: Span<ContractAddress>,
        tag1: u256,
        tag2: u256,
    ) -> (u64, u8);

    fn read_feedback(
        self: @TState, agent_id: u256, client_address: ContractAddress, index: u64,
    ) -> (u8, u256, u256, bool);

    fn read_all_feedback(
        self: @TState,
        agent_id: u256,
        client_addresses: Span<ContractAddress>,
        tag1: u256,
        tag2: u256,
        include_revoked: bool,
    ) -> (Array<ContractAddress>, Array<u8>, Array<u256>, Array<u256>, Array<bool>);

    fn get_response_count(
        self: @TState,
        agent_id: u256,
        client_address: ContractAddress,
        feedback_index: u64,
        responders: Span<ContractAddress>,
    ) -> u64;

    fn get_clients(self: @TState, agent_id: u256) -> Array<ContractAddress>;

    fn get_last_index(self: @TState, agent_id: u256, client_address: ContractAddress) -> u64;

    fn get_identity_registry(self: @TState) -> ContractAddress;
}
