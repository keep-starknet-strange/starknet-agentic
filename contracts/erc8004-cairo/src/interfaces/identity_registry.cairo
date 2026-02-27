use starknet::ContractAddress;

#[derive(Drop, Serde, Debug, PartialEq)]
pub struct MetadataEntry {
    pub key: ByteArray,
    pub value: ByteArray,
}

#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct Registered {
    #[key]
    pub agent_id: u256,
    pub token_uri: ByteArray,
    pub owner: ContractAddress,
}

#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct MetadataSet {
    #[key]
    pub agent_id: u256,
    #[key]
    pub indexed_key: ByteArray,
    pub key: ByteArray,
    pub value: ByteArray,
}

#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct URIUpdated {
    #[key]
    pub agent_id: u256,
    pub new_uri: ByteArray,
    #[key]
    pub updated_by: ContractAddress,
}

#[starknet::interface]
pub trait IIdentityRegistry<TState> {
    // Registration functions
    fn register_with_metadata(
        ref self: TState, token_uri: ByteArray, metadata: Array<MetadataEntry>,
    ) -> u256;

    fn register_with_token_uri(ref self: TState, token_uri: ByteArray) -> u256;

    fn register(ref self: TState) -> u256;

    // Metadata functions
    fn set_metadata(ref self: TState, agent_id: u256, key: ByteArray, value: ByteArray);

    fn get_metadata(self: @TState, agent_id: u256, key: ByteArray) -> ByteArray;

    // URI management
    fn set_agent_uri(ref self: TState, agent_id: u256, new_uri: ByteArray);

    // Agent wallet management
    fn get_agent_wallet(self: @TState, agent_id: u256) -> ContractAddress;
    fn get_wallet_set_nonce(self: @TState, agent_id: u256) -> u64;

    fn set_agent_wallet(
        ref self: TState,
        agent_id: u256,
        new_wallet: ContractAddress,
        deadline: u64,
        signature: Array<felt252>,
    );

    fn set_agent_wallet_with_expected_nonce(
        ref self: TState,
        agent_id: u256,
        new_wallet: ContractAddress,
        deadline: u64,
        expected_nonce: u64,
        signature: Array<felt252>,
    );

    fn unset_agent_wallet(ref self: TState, agent_id: u256);

    // Query functions
    fn total_agents(self: @TState) -> u256;

    fn agent_exists(self: @TState, agent_id: u256) -> bool;

    fn is_authorized_or_owner(self: @TState, spender: ContractAddress, agent_id: u256) -> bool;

    fn get_version(self: @TState) -> ByteArray;
}
