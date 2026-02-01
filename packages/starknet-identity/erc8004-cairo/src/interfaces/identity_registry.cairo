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

#[starknet::interface]
pub trait IIdentityRegistry<TState> {
    fn register_with_metadata(
        ref self: TState, token_uri: ByteArray, metadata: Array<MetadataEntry>,
    ) -> u256;

    fn register_with_token_uri(ref self: TState, token_uri: ByteArray) -> u256;

    fn register(ref self: TState) -> u256;

    fn set_metadata(ref self: TState, agent_id: u256, key: ByteArray, value: ByteArray);

    fn get_metadata(self: @TState, agent_id: u256, key: ByteArray) -> ByteArray;

    fn total_agents(self: @TState) -> u256;

    fn agent_exists(self: @TState, agent_id: u256) -> bool;
}
