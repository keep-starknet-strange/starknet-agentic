use starknet::ContractAddress;

#[derive(Drop, Serde, Copy, starknet::Store)]
pub struct SessionPolicy {
    pub valid_after: u64,
    pub valid_until: u64,
    pub spending_limit: u256,
    pub spending_token: ContractAddress,
    pub allowed_contract: ContractAddress,
    pub max_calls_per_tx: u32,
}

#[starknet::interface]
pub trait IAgentAccount<TContractState> {
    // Session key management
    fn register_session_key(ref self: TContractState, key: felt252, policy: SessionPolicy);
    fn revoke_session_key(ref self: TContractState, key: felt252);
    fn get_session_key_policy(self: @TContractState, key: felt252) -> SessionPolicy;
    fn is_session_key_valid(self: @TContractState, key: felt252) -> bool;

    // Owner controls
    fn set_spending_limit(
        ref self: TContractState,
        token: ContractAddress,
        amount: u256,
        period: u64
    );
    fn emergency_revoke_all(ref self: TContractState);

    // Agent identity
    fn set_agent_id(ref self: TContractState, registry: ContractAddress, agent_id: u256);
    fn get_agent_id(self: @TContractState) -> (ContractAddress, u256);
}
