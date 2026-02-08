use starknet::{ClassHash, ContractAddress};

//
// ============================================================================
// QUANTUM VAULT INTERFACES
// ============================================================================
//

#[starknet::interface]
pub trait IQuantumVault<TState> {
    // --- Core Multi-Sig Functions ---
    fn submit_transaction(
        ref self: TState,
        to: ContractAddress,
        selector: felt252,
        calldata: Array<felt252>,
        value: u256
    ) -> u256;
    
    fn confirm_transaction(ref self: TState, tx_id: u256);
    fn execute_transaction(ref self: TState, tx_id: u256);
    fn cancel_transaction(ref self: TState, tx_id: u256, reason: felt252);
    
    // --- Asset Management ---
    fn deposit(ref self: TState, token: ContractAddress, amount: u256);
    fn withdraw(
        ref self: TState,
        token: ContractAddress,
        to: ContractAddress,
        amount: u256,
        tx_id: u256
    );
    
    // --- Time-Lock System ---
    fn create_time_lock(
        ref self: TState,
        to: ContractAddress,
        selector: felt252,
        calldata: Array<felt252>,
        delay_seconds: u64
    ) -> felt252;
    
    fn execute_time_lock(ref self: TState, lock_id: felt252);
    fn extend_time_lock(ref self: TState, lock_id: felt252, additional_seconds: u64);
    fn cancel_time_lock(ref self: TState, lock_id: felt252);
    
    // --- STARK Proof System ---
    fn submit_proof(
        ref self: TState,
        proof: Array<felt252>,
        public_inputs: Array<felt252>
    ) -> felt252;
    
    fn verify_proof(ref self: TState, proof_id: felt252) -> bool;
    fn activate_proof(ref self: TState, proof_id: felt252);
    fn expire_old_proofs(ref self: TState) -> u32;
    
    // --- Session Key Management (Agent Integration) ---
    fn register_session_key(ref self: TState, key: felt252, policy: SessionPolicy);
    fn revoke_session_key(ref self: TState, key: felt252);
    fn execute_with_session_key(
        ref self: TState,
        key: felt252,
        to: ContractAddress,
        selector: felt252,
        calldata: Array<felt252>
    );
    
    // --- Security Functions ---
    fn pause(ref self: TState);
    fn unpause(ref self: TState);
    fn activate_emergency_mode(ref self: TState, reason: felt252);
    fn propose_upgrade(ref self: TState, new_class_hash: ClassHash);
    fn execute_upgrade(ref self: TState);
    fn change_guardian(ref self: TState, new_guardian: ContractAddress);
    fn enable_quantum_mode(ref self: TState);
    fn update_merkle_root(ref self: TState, new_root: felt252);
    
    // --- View Functions ---
    fn get_threshold(self: @TState) -> u8;
    fn get_signer(self: @TState, index: u8) -> ContractAddress;
    fn get_transaction(self: @TState, tx_id: u256) -> Transaction;
    fn get_confirmation_count(self: @TState, tx_id: u256) -> u8;
    fn is_signer(self: @TState, addr: ContractAddress) -> bool;
    fn is_paused(self: @TState) -> bool;
    fn is_emergency_mode(self: @TState) -> bool;
    fn is_quantum_mode(self: @TState) -> bool;
    fn get_balance(self: @TState, token: ContractAddress, owner: ContractAddress) -> u256;
    fn get_session_policy(self: @TState, key: felt252) -> SessionPolicy;
    fn get_time_lock(self: @TState, lock_id: felt252) -> TimeLockedTx;
    fn get_proof(self: @TState, proof_id: felt252) -> ProofRecord;
}

// ============================================================================
// ERC-20 COMPATIBILITY INTERFACES
// ============================================================================

#[starknet::interface]
pub trait IERC20<TState> {
    fn name(self: @TState) -> felt252;
    fn symbol(self: @TState) -> felt252;
    fn decimals(self: @TState) -> u8;
    fn total_supply(self: @TState) -> u256;
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn transfer(ref self: TState, to: ContractAddress, amount: u256) -> bool;
    fn allowance(self: @TState, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState,
        from: ContractAddress,
        to: ContractAddress,
        amount: u256
    ) -> bool;
    fn increase_allowance(
        ref self: TState,
        spender: ContractAddress,
        added_value: u256
    ) -> bool;
    fn decrease_allowance(
        ref self: TState,
        spender: ContractAddress,
        subtracted_value: u256
    ) -> bool;
}

// ============================================================================
// SUPPORTING STRUCTURES
// ============================================================================

#[derive(Drop, Clone, starknet::Serde)]
pub struct Transaction {
    pub to: ContractAddress,
    pub selector: felt252,
    pub calldata: Span<felt252>,
    pub value: u256,
    pub nonce: u256,
    pub created_at: u64,
    pub executed_at: u64,
    pub cancelled: bool,
}

#[derive(Drop, Clone, starknet::Serde)]
pub struct TimeLockedTx {
    pub to: ContractAddress,
    pub selector: felt252,
    pub calldata: Span<felt252>,
    pub tx_hash: felt252,
    pub unlock_at: u64,
    pub executed: bool,
    pub cancelled: bool,
    pub created_at: u64,
}

#[derive(Drop, Clone, starknet::Serde)]
pub struct ProofRecord {
    pub proof: Array<felt252>,
    pub public_inputs: Span<felt252>,
    pub proof_hash: felt252,
    pub verified: bool,
    pub active: bool,
    pub submitted_at: u64,
    pub verified_at: u64,
    pub expires_at: u64,
}

#[derive(Drop, Clone, starknet::Serde)]
pub struct SessionPolicy {
    pub allowed_contract: ContractAddress,
    pub spending_token: ContractAddress,
    pub spending_limit: u256,
    pub valid_after: u64,
    pub valid_until: u64,
}

// ============================================================================
// ERC-165 INTERFACE
// ============================================================================

#[starknet::interface]
pub trait IERC165<TState> {
    fn supports_interface(self: @TState, interface_id: felt252) -> bool;
}

// ============================================================================
// STARK VERIFIER INTERFACE
// ============================================================================

#[starknet::interface]
pub trait IStarkVerifier<TState> {
    fn verify_stark_proof(
        self: @TState,
        proof: Array<felt252>,
        public_inputs: Array<felt252>
    ) -> bool;
    
    fn get_verifier_status(self: @TState) -> felt252;
}

// ============================================================================
// AGENT IDENTITY INTERFACE (ERC-8004)
// ============================================================================

#[starknet::interface]
pub trait IAgentIdentity<TState> {
    fn get_agent_id(self: @TState) -> felt252;
    fn get_agent_reputation(self: @TState) -> u256;
    fn get_validation_history(self: @TState, validator: ContractAddress) -> ValidationRecord;
    fn register_validation(
        ref self: TState,
        agent_id: felt252,
        validation_type: felt252,
        data: Array<felt252>
    );
}

// ============================================================================
// VALIDATION RECORD (For ERC-8004)
// ============================================================================

#[derive(Drop, Clone, starknet::Serde)]
pub struct ValidationRecord {
    pub validator: ContractAddress,
    pub validation_type: felt252,
    pub timestamp: u64,
    pub data: Array<felt252>,
    pub signature: felt252,
}
