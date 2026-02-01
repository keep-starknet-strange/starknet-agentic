use starknet::ContractAddress;

// ============ Structs ============

#[derive(Drop, Serde, starknet::Store)]
pub struct Request {
    pub validator_address: ContractAddress,
    pub agent_id: u256,
    pub request_uri: ByteArray,
    pub request_hash: u256, // bytes32 in Solidity
    pub timestamp: u64,
}

#[derive(Drop, Serde, starknet::Store)]
pub struct Response {
    pub validator_address: ContractAddress,
    pub agent_id: u256,
    pub response: u8,
    pub tag: u256, // bytes32 in Solidity
    pub last_update: u64,
}

// ============ Events ============

#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct ValidationRequest {
    #[key]
    pub validator_address: ContractAddress,
    #[key]
    pub agent_id: u256,
    pub request_uri: ByteArray,
    pub request_hash: u256,
}

#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct ValidationResponse {
    #[key]
    pub validator_address: ContractAddress,
    #[key]
    pub agent_id: u256,
    pub request_hash: u256,
    pub response: u8,
    pub response_uri: ByteArray,
    pub response_hash: u256,
    pub tag: u256,
}

// ============ Interface ============

#[starknet::interface]
pub trait IValidationRegistry<TState> {
    fn validation_request(
        ref self: TState,
        validator_address: ContractAddress,
        agent_id: u256,
        request_uri: ByteArray,
        request_hash: u256,
    );

    fn validation_response(
        ref self: TState,
        request_hash: u256,
        response: u8,
        response_uri: ByteArray,
        response_hash: u256,
        tag: u256,
    );

    fn get_validation_status(
        self: @TState, request_hash: u256,
    ) -> (ContractAddress, u256, u8, u256, u256);

    fn get_summary(
        self: @TState, agent_id: u256, validator_addresses: Span<ContractAddress>, tag: u256,
    ) -> (u64, u8);

    fn get_agent_validations(self: @TState, agent_id: u256) -> Array<u256>;

    fn get_validator_requests(self: @TState, validator_address: ContractAddress) -> Array<u256>;

    fn request_exists(self: @TState, request_hash: u256) -> bool;

    fn get_request(self: @TState, request_hash: u256) -> (ContractAddress, u256, ByteArray, u64);

    fn get_identity_registry(self: @TState) -> ContractAddress;
}
