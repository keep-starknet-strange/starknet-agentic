use starknet::{ClassHash, ContractAddress};
use core::byte_array::ByteArray;

#[derive(Copy, Drop, Serde)]
pub struct Call {
    pub to: ContractAddress,
    pub selector: felt252,
    pub calldata: Span<felt252>,
}

#[derive(Drop, Serde, Copy, starknet::Store)]
pub struct SessionPolicy {
    pub valid_after: u64,
    pub valid_until: u64,
    pub spending_limit: u256,
    pub spending_token: ContractAddress,
    pub allowed_contract: ContractAddress,
    pub max_calls_per_tx: u32,
    pub spending_period_secs: u64,
}

#[starknet::interface]
pub trait IAgentAccount<TContractState> {
    // Account interface
    fn __validate__(ref self: TContractState, calls: Array<Call>) -> felt252;
    fn __execute__(ref self: TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn is_valid_signature(self: @TContractState, hash: felt252, signature: Array<felt252>) -> felt252;

    // Session key management
    fn register_session_key(ref self: TContractState, key: felt252, policy: SessionPolicy);
    fn revoke_session_key(ref self: TContractState, key: felt252);
    fn get_session_key_policy(self: @TContractState, key: felt252) -> SessionPolicy;
    fn is_session_key_valid(self: @TContractState, key: felt252) -> bool;

    // Policy enforcement
    fn validate_session_key_call(
        self: @TContractState,
        key: felt252,
        target: ContractAddress,
    ) -> bool;
    fn use_session_key_allowance(
        ref self: TContractState,
        key: felt252,
        token: ContractAddress,
        amount: u256,
    );

    // Owner controls
    fn emergency_revoke_all(ref self: TContractState);
    fn get_active_session_key_count(self: @TContractState) -> u32;

    // Agent identity
    fn set_agent_id(ref self: TContractState, registry: ContractAddress, agent_id: u256);
    fn init_agent_id_from_factory(
        ref self: TContractState,
        registry: ContractAddress,
        agent_id: u256,
    );
    fn get_agent_id(self: @TContractState) -> (ContractAddress, u256);

    // Upgradability (timelocked)
    fn schedule_upgrade(ref self: TContractState, new_class_hash: ClassHash);
    fn execute_upgrade(ref self: TContractState);
    fn cancel_upgrade(ref self: TContractState);
    fn get_upgrade_info(self: @TContractState) -> (ClassHash, u64, u64, u64);
    fn set_upgrade_delay(ref self: TContractState, new_delay: u64);
}

#[starknet::interface]
pub trait IAgentAccountFactory<TContractState> {
    fn deploy_account(
        ref self: TContractState,
        public_key: felt252,
        salt: felt252,
        token_uri: ByteArray,
    ) -> (ContractAddress, u256);
    fn get_account_class_hash(self: @TContractState) -> ClassHash;
    fn set_account_class_hash(ref self: TContractState, new_class_hash: ClassHash);
    fn get_identity_registry(self: @TContractState) -> ContractAddress;
    fn set_identity_registry(ref self: TContractState, new_registry: ContractAddress);
    fn get_owner(self: @TContractState) -> ContractAddress;
    fn transfer_ownership(ref self: TContractState, new_owner: ContractAddress);
}
