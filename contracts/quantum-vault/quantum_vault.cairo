use starknet::{ClassHash, ContractAddress, get_block_timestamp};
use starknet::storage::*;
use core::poseidon::poseidon_hash_span;
use core::ecdsa::check_ecdsa_signature;

#[starknet::contract]
pub mod QuantumVault {
    // ============================================================================
    // CONSTANTS
    // ============================================================================
    const MIN_THRESHOLD: u8 = 1;
    const MAX_SIGNERS: u8 = 10;
    const MIN_TIME_LOCK_DELAY: u64 = 300;      // 5 minutes
    const MAX_TIME_LOCK_DELAY: u64 = 2592000;           // 30 days (30 * 24 * 60 * 60)
    const EMERGENCY_DELAY: u64 = 86400;         // 24 hours for emergencies
    const UPGRADE_DELAY: u64 = 172800;          // 48 hours for upgrades
    const PROOF_EXPIRY: u64 = 604800;           // 7 days

    // ============================================================================
    // STORAGE
    // ============================================================================
    #[storage]
    struct Storage {
        // --- Core Vault Configuration ---
        threshold: u8,
        signers: Map<u8, ContractAddress>,
        signer_count: u8,
        nonce: u256,
        
        // --- Parent Agent Integration ---
        parent_agent: ContractAddress,
        agent_mode: bool,
        
        // --- Asset Management ---
        balances: Map<(ContractAddress, ContractAddress), u256>, // (token, owner) -> amount
        total_assets: u256,
        
        // --- Multi-Sig State ---
        transactions: Map<u256, Transaction>,
        confirmations: Map<(u256, ContractAddress), bool>,
        transaction_count: u256,
        
        // --- Time-Lock System ---
        time_locks: Map<felt252, TimeLockedTx>,
        time_lock_queue: Map<(felt252, u64), felt252>,
        time_lock_head: felt252,
        
        // --- STARK Proof System ---
        proofs: Map<felt252, ProofRecord>,
        active_proof: felt252,
        proof_verifier: ContractAddress,
        last_proof_time: u64,
        
        // --- Session Keys (Agent Integration) ---
        session_keys: Map<felt252, SessionPolicy>,
        session_key_active: Map<felt252, bool>,
        spending_used: Map<(felt252, ContractAddress), u256>,
        spending_period: Map<(felt252, ContractAddress), u64>,
        
        // --- Security Features ---
        paused: bool,
        guardian: ContractAddress,
        emergency_mode: bool,
        upgrade_class_hash: ClassHash,
        upgrade_ready_at: u64,
        
        // --- Quantum-Resistant Features ---
        quantum_mode: bool,
        poseidon_merkle_root: felt252,
        commitment_chain: Map<u64, felt252>,
        
        // --- ERC-165 Support ---
        supported_interfaces: Map<felt252, bool>,
        
        // --- Events Storage (required by components) ---
        account: AccountComponent::Storage,
    }

    // ============================================================================
    // EVENTS
    // ============================================================================
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        // Core events
        VaultInitialized: VaultInitialized,
        TransactionCreated: TransactionCreated,
        TransactionConfirmed: TransactionConfirmed,
        TransactionExecuted: TransactionExecuted,
        TransactionCancelled: TransactionCancelled,
        
        // Time-lock events
        TimeLockCreated: TimeLockCreated,
        TimeLockExecuted: TimeLockExecuted,
        TimeLockCancelled: TimeLockCancelled,
        TimeLockExtended: TimeLockExtended,
        
        // Proof events
        ProofSubmitted: ProofSubmitted,
        ProofVerified: ProofVerified,
        ProofActivated: ProofActivated,
        ProofExpired: ProofExpired,
        
        // Session key events
        SessionKeyRegistered: SessionKeyRegistered,
        SessionKeyRevoked: SessionKeyRevoked,
        
        // Security events
        VaultPaused: VaultPaused,
        VaultUnpaused: VaultUnpaused,
        EmergencyModeActivated: EmergencyModeActivated,
        GuardianChanged: GuardianChanged,
        UpgradeProposed: UpgradeProposed,
        UpgradeExecuted: UpgradeExecuted,
        
        // Quantum mode events
        QuantumModeEnabled: QuantumModeEnabled,
        MerkleRootUpdated: MerkleRootUpdated,
        
        // ERC-20 events (for compatibility)
        Transfer: Transfer,
        Approval: Approval,
    }

    #[derive(Drop, starknet::Event)]
    pub struct VaultInitialized {
        pub threshold: u8,
        pub signer_count: u8,
        pub parent_agent: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TransactionCreated {
        pub tx_id: u256,
        pub to: ContractAddress,
        pub selector: felt252,
        pub calldata: Span<felt252>,
        pub value: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TransactionConfirmed {
        pub tx_id: u256,
        pub signer: ContractAddress,
        pub confirmation_count: u8,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TransactionExecuted {
        pub tx_id: u256,
        pub executed_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TransactionCancelled {
        pub tx_id: u256,
        pub reason: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockCreated {
        pub lock_id: felt252,
        pub tx_hash: felt252,
        pub unlock_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockExecuted {
        pub lock_id: felt252,
        pub executed_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockCancelled {
        pub lock_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockExtended {
        pub lock_id: felt252,
        pub new_unlock_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct ProofSubmitted {
        pub proof_id: felt252,
        pub submitter: ContractAddress,
        pub proof_hash: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct ProofVerified {
        pub proof_id: felt252,
        pub verifier: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct ProofActivated {
        pub proof_id: felt252,
        pub active_until: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct ProofExpired {
        pub proof_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SessionKeyRegistered {
        pub key: felt252,
        pub valid_until: u64,
        pub spending_limit: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SessionKeyRevoked {
        pub key: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct VaultPaused {
        pub pauser: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct VaultUnpaused {
        pub unpauser: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct EmergencyModeActivated {
        pub activator: ContractAddress,
        pub reason: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct GuardianChanged {
        pub old_guardian: ContractAddress,
        pub new_guardian: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct UpgradeProposed {
        pub new_class_hash: ClassHash,
        pub effective_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct UpgradeExecuted {
        pub new_class_hash: ClassHash,
    }

    #[derive(Drop, starknet::Event)]
    pub struct QuantumModeEnabled {
        pub enabled: bool,
    }

    #[derive(Drop, starknet::Event)]
    pub struct MerkleRootUpdated {
        pub new_root: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Transfer {
        pub from: ContractAddress,
        pub to: ContractAddress,
        pub value: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Approval {
        pub owner: ContractAddress,
        pub spender: ContractAddress,
        pub value: u256,
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================
    #[constructor]
    fn constructor(
        ref self: ComponentState<TContractState>,
        threshold: u8,
        signers: Array<ContractAddress>,
        parent_agent: ContractAddress,
        guardian: ContractAddress
    ) {
        // Validate threshold
        assert(threshold >= MIN_THRESHOLD, 'Threshold too low');
        assert(threshold <= signers.len().try_into().unwrap(), 'Threshold > signers');
        
        // Initialize storage
        self.threshold.write(threshold);
        self.signer_count.write(signers.len().try_into().unwrap());
        self.parent_agent.write(parent_agent);
        self.guardian.write(guardian);
        self.agent_mode.write(false);
        self.paused.write(false);
        self.emergency_mode.write(false);
        self.quantum_mode.write(false);
        self.nonce.write(0);
        self.transaction_count.write(0);
        self.time_lock_head.write(0);
        
        // Store signers
        let mut idx = 0;
        for signer in signers {
            self.signers.write(idx, signer);
            idx += 1;
        }

        // Initialize ERC-165
        self.supported_interfaces.write(0x01ffc9a7, true); // ERC-165
        self.supported_interfaces.write(0x4e2312e0, true); // ERC-1155 receiver
        
        self.emit(VaultInitialized {
            threshold,
            signer_count: signers.len().try_into().unwrap(),
            parent_agent,
        });
    }

    // ============================================================================
    // CORE FUNCTIONS
    // ============================================================================

    /// @notice Submit a transaction for multi-sig approval
    /// @param to Target contract address
    /// @param selector Function selector
    /// @param calldata Function arguments
    /// @param value ETH value to send
    fn submit_transaction(
        ref self: ComponentState<TContractState>,
        to: ContractAddress,
        selector: felt252,
        calldata: Array<felt252>,
        value: u256
    ) -> u256 {
        assert(!self.paused.read(), 'Vault paused');
        
        let tx_id = self.transaction_count.read() + 1;
        let current_time = get_block_timestamp();
        
        let tx = Transaction {
            to,
            selector,
            calldata: calldata.span(),
            value,
            nonce: self.nonce.read(),
            created_at: current_time,
            executed_at: 0,
            cancelled: false,
        };
        
        self.transactions.write(tx_id, tx);
        self.transaction_count.write(tx_id);
        
        // Auto-confirm if called by a signer
        let caller = get_caller_address();
        if self._is_signer(caller) {
            self._confirm_transaction(tx_id, caller);
        }
        
        self.emit(TransactionCreated {
            tx_id,
            to,
            selector,
            calldata: calldata.span(),
            value,
        });
        
        tx_id
    }

    /// @notice Confirm a transaction (one confirmation per signer)
    fn confirm_transaction(
        ref self: ComponentState<TContractState>,
        tx_id: u256
    ) {
        assert(!self.paused.read(), 'Vault paused');
        let caller = get_caller_address();
        self._confirm_transaction(tx_id, caller);
    }

    fn _confirm_transaction(ref self: ComponentState<TContractState>, tx_id: u256, signer: ContractAddress) {
        assert(self._is_signer(signer), 'Not a signer');
        assert(!self.transactions.read(tx_id).cancelled, 'Tx cancelled');
        
        self.confirmations.write((tx_id, signer), true);
        
        let tx = self.transactions.read(tx_id);
        let confirmation_count = self._get_confirmation_count(tx_id);
        
        self.emit(TransactionConfirmed {
            tx_id,
            signer,
            confirmation_count,
        });
    }

    /// @notice Execute a transaction if enough confirmations
    fn execute_transaction(
        ref self: ComponentState<TContractState>,
        tx_id: u256
    ) {
        assert(!self.paused.read(), 'Vault paused');
        let caller = get_caller_address();
        
        assert(self._is_signer(caller), 'Not authorized');
        assert(self._has_enough_confirmations(tx_id), 'Not enough confirmations');
        
        let mut tx = self.transactions.read(tx_id);
        assert(!tx.executed_at.is_non_zero(), 'Already executed');
        assert(!tx.cancelled, 'Tx cancelled');
        
        // Execute the transaction
        let result = starknet::syscalls::call_contract_syscall(
            tx.to, tx.selector, tx.calldata
        ).unwrap_syscall();
        
        // Update state
        tx.executed_at = get_block_timestamp();
        self.transactions.write(tx_id, tx);
        self.nonce.write(tx.nonce + 1);
        
        self.emit(TransactionExecuted {
            tx_id,
            executed_at: tx.executed_at,
        });
    }

    /// @notice Cancel a transaction
    fn cancel_transaction(
        ref self: ComponentState<TContractState>,
        tx_id: u256,
        reason: felt252
    ) {
        let caller = get_caller_address();
        assert(self._is_signer(caller), 'Not authorized');
        
        let mut tx = self.transactions.read(tx_id);
        assert(!tx.executed_at.is_non_zero(), 'Already executed');
        
        tx.cancelled = true;
        self.transactions.write(tx_id, tx);
        
        self.emit(TransactionCancelled { tx_id, reason });
    }

    // ============================================================================
    // ASSET MANAGEMENT
    // ============================================================================

    /// @notice Deposit tokens into vault
    fn deposit(
        ref self: ComponentState<TContractState>,
        token: ContractAddress,
        amount: u256
    ) {
        assert(!self.paused.read(), 'Vault paused');
        let caller = get_caller_address();
        
        let current_balance = self.balances.entry((token, caller)).read();
        self.balances.entry((token, caller)).write(current_balance + amount);
        
        self.emit(Transfer {
            from: caller,
            to: self.address_into_explicit(),
            value: amount,
        });
    }

    /// @notice Withdraw tokens (requires multi-sig)
    fn withdraw(
        ref self: ComponentState<TContractState>,
        token: ContractAddress,
        to: ContractAddress,
        amount: u256,
        tx_id: u256
    ) {
        assert(!self.paused.read(), 'Vault paused');
        
        let tx = self.transactions.read(tx_id);
        assert(!tx.cancelled, 'Tx cancelled');
        assert(self._has_enough_confirmations(tx_id), 'Not enough confirmations');
        
        let current_balance = self.balances.entry((token, self.address_into_explicit())).read();
        assert(current_balance >= amount, 'Insufficient balance');
        
        self.balances.entry((token, self.address_into_explicit())).write(current_balance - amount);
        
        // Emit for ERC-20 compatibility
        self.emit(Transfer {
            from: self.address_into_explicit(),
            to,
            value: amount,
        });
    }

    // ============================================================================
    // TIME-LOCK SYSTEM
    // ============================================================================

    /// @notice Create a time-locked transaction
    fn create_time_lock(
        ref self: ComponentState<TContractState>,
        to: ContractAddress,
        selector: felt252,
        calldata: Array<felt252>,
        delay_seconds: u64
    ) -> felt252 {
        assert(!self.paused.read(), 'Vault paused');
        assert(delay_seconds >= MIN_TIME_LOCK_DELAY, 'Delay too short');
        assert(delay_seconds <= MAX_TIME_LOCK_DELAY, 'Delay too long');
        
        let current_time = get_block_timestamp();
        let unlock_at = current_time + delay_seconds;
        
        // Compute transaction hash
        let mut inputs = array![to.into(), selector];
        for item in calldata {
            inputs.append(item);
        };
        let tx_hash = poseidon_hash_span(inputs.span());
        
        let lock_id = self.time_lock_head.read() + 1;
        
        let time_lock = TimeLockedTx {
            to,
            selector,
            calldata: calldata.span(),
            tx_hash,
            unlock_at,
            executed: false,
            cancelled: false,
            created_at: current_time,
        };
        
        self.time_locks.write(lock_id, time_lock);
        self.time_lock_head.write(lock_id);
        
        self.emit(TimeLockCreated {
            lock_id,
            tx_hash,
            unlock_at,
        });
        
        lock_id
    }

    /// @notice Execute a time-locked transaction after delay
    fn execute_time_lock(
        ref self: ComponentState<TContractState>,
        lock_id: felt252
    ) {
        let mut time_lock = self.time_locks.read(lock_id);
        assert(!time_lock.executed, 'Already executed');
        assert(!time_lock.cancelled, 'Cancelled');
        assert(get_block_timestamp() >= time_lock.unlock_at, 'Not yet unlocked');
        
        // Execute via syscall
        let _ = starknet::syscalls::call_contract_syscall(
            time_lock.to, time_lock.selector, time_lock.calldata
        ).unwrap_syscall();
        
        time_lock.executed = true;
        self.time_locks.write(lock_id, time_lock);
        
        self.emit(TimeLockExecuted {
            lock_id,
            executed_at: get_block_timestamp(),
        });
    }

    /// @notice Extend time-lock delay
    fn extend_time_lock(
        ref self: ComponentState<TContractState>,
        lock_id: felt252,
        additional_seconds: u64
    ) {
        let mut time_lock = self.time_locks.read(lock_id);
        assert(!time_lock.executed, 'Already executed');
        
        let new_unlock_at = time_lock.unlock_at + additional_seconds;
        assert(new_unlock_at <= get_block_timestamp() + MAX_TIME_LOCK_DELAY, 'Exceeds max delay');
        
        time_lock.unlock_at = new_unlock_at;
        self.time_locks.write(lock_id, time_lock);
        
        self.emit(TimeLockExtended {
            lock_id,
            new_unlock_at,
        });
    }

    /// @notice Cancel a time-lock
    fn cancel_time_lock(
        ref self: ComponentState<TContractState>,
        lock_id: felt252
    ) {
        let caller = get_caller_address();
        assert(self._is_signer(caller) || caller == self.guardian.read(), 'Not authorized');
        
        let mut time_lock = self.time_locks.read(lock_id);
        assert(!time_lock.executed, 'Already executed');
        
        time_lock.cancelled = true;
        self.time_locks.write(lock_id, time_lock);
        
        self.emit(TimeLockCancelled { lock_id });
    }

    // ============================================================================
    // STARK PROOF SYSTEM
    // ============================================================================

    /// @notice Submit a STARK proof for verification
    fn submit_proof(
        ref self: ComponentState<TContractState>,
        proof: Array<felt252>,
        public_inputs: Array<felt252>
    ) -> felt252 {
        let caller = get_caller_address();
        
        // Compute proof hash
        let mut inputs = public_inputs;
        inputs.append(0x70726f6f66); // "proof" prefix
        for p in proof {
            inputs.append(p);
        };
        let proof_hash = poseidon_hash_span(inputs.span());
        
        let proof_id = self.time_lock_head.read() + 1;
        
        let record = ProofRecord {
            proof,
            public_inputs: public_inputs.span(),
            proof_hash,
            verified: false,
            active: false,
            submitted_at: get_block_timestamp(),
            verified_at: 0,
            expires_at: get_block_timestamp() + PROOF_EXPIRY,
        };
        
        self.proofs.write(proof_id, record);
        
        self.emit(ProofSubmitted {
            proof_id,
            submitter: caller,
            proof_hash,
        });
        
        proof_id
    }

    /// @notice Verify a submitted proof (would call verifier contract in production)
    fn verify_proof(
        ref self: ComponentState<TContractState>,
        proof_id: felt252
    ) -> bool {
        let caller = get_caller_address();
        assert(self._is_signer(caller), 'Not authorized');
        
        let mut record = self.proofs.read(proof_id);
        assert(!record.verified, 'Already verified');
        
        // In production: call STARK verifier contract
        // For now: simulate verification
        let is_valid = true; // Would be: self._call_verifier(record.proof, record.public_inputs)
        
        if is_valid {
            record.verified = true;
            record.verified_at = get_block_timestamp();
            self.proofs.write(proof_id, record);
            
            self.emit(ProofVerified {
                proof_id,
                verifier: caller,
            });
            true
        } else {
            false
        }
    }

    /// @notice Activate a verified proof for operations
    fn activate_proof(
        ref self: ComponentState<TContractState>,
        proof_id: felt252
    ) {
        let caller = get_caller_address();
        assert(self._is_signer(caller), 'Not authorized');
        
        let mut record = self.proofs.read(proof_id);
        assert(record.verified, 'Not verified');
        assert(!record.active, 'Already active');
        assert(!record.expires_at.is_non_zero(), 'Expired');
        
        record.active = true;
        self.proofs.write(proof_id, record);
        
        self.active_proof.write(proof_id);
        self.last_proof_time.write(get_block_timestamp());
        
        self.emit(ProofActivated {
            proof_id,
            active_until: record.expires_at,
        });
    }

    /// @notice Expire old proofs
    fn expire_old_proofs(ref self: ComponentState<TContractState>) -> u32 {
        let current_time = get_block_timestamp();
        let mut expired = 0;
        let max_proof_id = self.active_proof.read();
        
        if max_proof_id.is_zero() {
            return 0;
        }
        
        let mut id = 1;
        loop {
            if id > max_proof_id {
                break;
            }
            
            let mut record = self.proofs.read(id);
            if record.active && record.expires_at <= current_time {
                record.active = false;
                self.proofs.write(id, record);
                
                self.emit(ProofExpired { proof_id: id });
                expired += 1;
            }
            
            id += 1;
        };
        
        if expired > 0 {
            self.active_proof.write(0);
        }
        
        expired
    }

    // ============================================================================
    // SESSION KEY MANAGEMENT (For Agent Integration)
    // ============================================================================

    /// @notice Register a session key for an agent
    fn register_session_key(
        ref self: ComponentState<TContractState>,
        key: felt252,
        policy: SessionPolicy
    ) {
        assert(!self.paused.read(), 'Vault paused');
        let caller = get_caller_address();
        assert(self._is_signer(caller), 'Not authorized');
        
        assert(policy.valid_until > policy.valid_after, 'Invalid time range');
        assert(policy.valid_until > get_block_timestamp(), 'Already expired');
        
        self.session_keys.write(key, policy);
        self.session_key_active.write(key, true);
        
        // Reset spending tracking
        self.spending_used.entry((key, policy.spending_token)).write(0);
        self.spending_period.entry((key, policy.spending_token)).write(0);
        
        self.emit(SessionKeyRegistered {
            key,
            valid_until: policy.valid_until,
            spending_limit: policy.spending_limit,
        });
    }

    /// @notice Revoke a session key
    fn revoke_session_key(
        ref self: ComponentState<TContractState>,
        key: felt252
    ) {
        let caller = get_caller_address();
        assert(self._is_signer(caller), 'Not authorized');
        
        self.session_key_active.write(key, false);
        
        self.emit(SessionKeyRevoked { key });
    }

    /// @notice Validate and execute with session key
    fn execute_with_session_key(
        ref self: ComponentState<TContractState>,
        key: felt252,
        to: ContractAddress,
        selector: felt252,
        calldata: Array<felt252>
    ) {
        assert(!self.paused.read(), 'Vault paused');
        assert(self.session_key_active.read(key), 'Key not active');
        
        let policy = self.session_keys.read(key);
        let now = get_block_timestamp();
        
        // Validate time window
        assert(now >= policy.valid_after && now <= policy.valid_until, 'Key expired');
        
        // Validate target contract
        if policy.allowed_contract.is_non_zero() {
            assert(policy.allowed_contract == to, 'Contract not allowed');
        }
        
        // Check spending limit
        let token = policy.spending_token;
        let amount = self._parse_transfer_amount(calldata.span());
        
        if amount.is_non_zero() {
            self._check_and_update_spending(key, token, amount);
        }
        
        // Execute transaction
        let _ = starknet::syscalls::call_contract_syscall(
            to, selector, calldata.span()
        ).unwrap_syscall();
    }

    fn _check_and_update_spending(
        ref self: ComponentState<TContractState>,
        key: felt252,
        token: ContractAddress,
        amount: u256
    ) {
        let policy = self.session_keys.read(key);
        let now = get_block_timestamp();
        
        // Reset if 24h period elapsed
        let period_start = self.spending_period.entry((key, token)).read();
        if period_start + 86400 <= now {
            self.spending_used.entry((key, token)).write(0);
            self.spending_period.entry((key, token)).write(now);
        }
        
        // Check limit
        let used = self.spending_used.entry((key, token)).read();
        assert(used + amount <= policy.spending_limit, 'Spending limit exceeded');
        
        // Update
        self.spending_used.entry((key, token)).write(used + amount);
    }

    fn _parse_transfer_amount(self: @ComponentState<TContractState>, calldata: Span<felt252>) -> u256 {
        // Simplified: assume calldata = [recipient, amount_low, amount_high]
        if calldata.len() >= 3 {
            let amount_low = *calldata.at(1);
            let amount_high = *calldata.at(2);
            (amount_high.into() * 0x10000000000000000) + amount_low.into()
        } else {
            0
        }
    }

    // ============================================================================
    // SECURITY FUNCTIONS
    // ============================================================================

    /// @notice Pause the vault (emergency stop)
    fn pause(ref self: ComponentState<TContractState>) {
        let caller = get_caller_address();
        assert(caller == self.guardian.read() || self._is_signer(caller), 'Not authorized');
        
        self.paused.write(true);
        
        self.emit(VaultPaused { pauser: caller });
    }

    /// @notice Unpause the vault
    fn unpause(ref self: ComponentState<TContractState>) {
        let caller = get_caller_address();
        assert(self._is_signer(caller), 'Not authorized');
        
        self.paused.write(false);
        
        self.emit(VaultUnpaused { unpauser: caller });
    }

    /// @notice Activate emergency mode (guardian only)
    fn activate_emergency_mode(
        ref self: ComponentState<TContractState>,
        reason: felt252
    ) {
        let caller = get_caller_address();
        assert(caller == self.guardian.read(), 'Not guardian');
        
        self.emergency_mode.write(true);
        self.paused.write(true);
        
        // Cancel all pending time-locks
        self._cancel_all_time_locks();
        
        self.emit(EmergencyModeActivated { activator: caller, reason });
    }

    /// @notice Propose a contract upgrade
    fn propose_upgrade(
        ref self: ComponentState<TContractState>,
        new_class_hash: ClassHash
    ) {
        assert(!self.paused.read(), 'Vault paused');
        let caller = get_caller_address();
        assert(self._is_signer(caller), 'Not authorized');
        
        self.upgrade_class_hash.write(new_class_hash);
        self.upgrade_ready_at.write(get_block_timestamp() + UPGRADE_DELAY);
        
        self.emit(UpgradeProposed {
            new_class_hash,
            effective_at: self.upgrade_ready_at.read(),
        });
    }

    /// @notice Execute approved upgrade
    fn execute_upgrade(ref self: ComponentState<TContractState>) {
        let caller = get_caller_address();
        assert(self._is_signer(caller), 'Not authorized');
        
        assert(get_block_timestamp() >= self.upgrade_ready_at.read(), 'Upgrade not ready');
        assert(self.upgrade_class_hash.read().is_non_zero(), 'No upgrade proposed');
        
        // In production: use replace_class_syscall
        // self.replace_class_syscall(self.upgrade_class_hash.read());
        
        self.emit(UpgradeExecuted {
            new_class_hash: self.upgrade_class_hash.read(),
        });
    }

    /// @notice Change guardian
    fn change_guardian(
        ref self: ComponentState<TContractState>,
        new_guardian: ContractAddress
    ) {
        let caller = get_caller_address();
        let old_guardian = self.guardian.read();
        
        assert(caller == old_guardian || self._is_signer(caller), 'Not authorized');
        
        self.guardian.write(new_guardian);
        
        self.emit(GuardianChanged {
            old_guardian,
            new_guardian,
        });
    }

    /// @notice Enable quantum mode
    fn enable_quantum_mode(ref self: ComponentState<TContractState>) {
        let caller = get_caller_address();
        assert(self._is_signer(caller), 'Not authorized');
        
        self.quantum_mode.write(true);
        
        self.emit(QuantumModeEnabled { enabled: true });
    }

    /// @notice Update Merkle root for state commitments
    fn update_merkle_root(
        ref self: ComponentState<TContractState>,
        new_root: felt252
    ) {
        assert(self.quantum_mode.read(), 'Quantum mode not enabled');
        let caller = get_caller_address();
        assert(self._is_signer(caller), 'Not authorized');
        
        self.poseidon_merkle_root.write(new_root);
        
        self.emit(MerkleRootUpdated { new_root });
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    fn get_threshold(self: @ComponentState<TContractState>) -> u8 {
        self.threshold.read()
    }

    fn get_signer(self: @ComponentState<TContractState>, index: u8) -> ContractAddress {
        self.signers.read(index)
    }

    fn get_transaction(
        self: @ComponentState<TContractState>,
        tx_id: u256
    ) -> Transaction {
        self.transactions.read(tx_id)
    }

    fn get_confirmation_count(
        self: @ComponentState<TContractState>,
        tx_id: u256
    ) -> u8 {
        self._get_confirmation_count(tx_id)
    }

    fn is_signer(self: @ComponentState<TContractState>, addr: ContractAddress) -> bool {
        self._is_signer(addr)
    }

    fn is_paused(self: @ComponentState<TContractState>) -> bool {
        self.paused.read()
    }

    fn is_emergency_mode(self: @ComponentState<TContractState>) -> bool {
        self.emergency_mode.read()
    }

    fn is_quantum_mode(self: @ComponentState<TContractState>) -> bool {
        self.quantum_mode.read()
    }

    fn get_balance(
        self: @ComponentState<TContractState>,
        token: ContractAddress,
        owner: ContractAddress
    ) -> u256 {
        self.balances.entry((token, owner)).read()
    }

    fn get_session_policy(
        self: @ComponentState<TContractState>,
        key: felt252
    ) -> SessionPolicy {
        self.session_keys.read(key)
    }

    fn get_time_lock(
        self: @ComponentState<TContractState>,
        lock_id: felt252
    ) -> TimeLockedTx {
        self.time_locks.read(lock_id)
    }

    fn get_proof(self: @ComponentState<TContractState>, proof_id: felt252) -> ProofRecord {
        self.proofs.read(proof_id)
    }

    // ============================================================================
    // INTERNAL HELPER FUNCTIONS
    // ============================================================================

    fn _is_signer(self: @ComponentState<TContractState>, addr: ContractAddress) -> bool {
        let count = self.signer_count.read();
        let mut idx = 0;
        loop {
            if idx >= count {
                break;
            }
            if self.signers.read(idx) == addr {
                return true;
            }
            idx += 1;
        };
        false
    }

    fn _get_confirmation_count(self: @ComponentState<TContractState>, tx_id: u256) -> u8 {
        let count = self.signer_count.read();
        let mut confirmations = 0;
        let mut idx = 0;
        loop {
            if idx >= count {
                break;
            }
            let signer = self.signers.read(idx);
            if self.confirmations.read((tx_id, signer)) {
                confirmations += 1;
            }
            idx += 1;
        };
        confirmations
    }

    fn _has_enough_confirmations(self: @ComponentState<TContractState>, tx_id: u256) -> bool {
        let count = self._get_confirmation_count(tx_id);
        count >= self.threshold.read()
    }

    fn _cancel_all_time_locks(ref self: ComponentState<TContractState>) {
        let head = self.time_lock_head.read();
        let mut id = 1;
        loop {
            if id > head {
                break;
            }
            let mut lock = self.time_locks.read(id);
            if !lock.executed && !lock.cancelled {
                lock.cancelled = true;
                self.time_locks.write(id, lock);
                self.emit(TimeLockCancelled { lock_id: id });
            }
            id += 1;
        };
    }

    fn address_into_explicit(self: @ComponentState<TContractState>) -> ContractAddress {
        get_caller_address()
    }
}

// ============================================================================
// SUPPORTING STRUCTURES
// ============================================================================

#[derive(Drop, Clone, starknet::Serde)]
pub struct Transaction {
    to: ContractAddress,
    selector: felt252,
    calldata: Span<felt252>,
    value: u256,
    nonce: u256,
    created_at: u64,
    executed_at: u64,
    cancelled: bool,
}

#[derive(Drop, Clone, starknet::Serde)]
pub struct TimeLockedTx {
    to: ContractAddress,
    selector: felt252,
    calldata: Span<felt252>,
    tx_hash: felt252,
    unlock_at: u64,
    executed: bool,
    cancelled: bool,
    created_at: u64,
}

#[derive(Drop, Clone, starknet::Serde)]
pub struct ProofRecord {
    proof: Array<felt252>,
    public_inputs: Span<felt252>,
    proof_hash: felt252,
    verified: bool,
    active: bool,
    submitted_at: u64,
    verified_at: u64,
    expires_at: u64,
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
// COMPONENT IMPL FOR UPGRADEABILITY
// ============================================================================

#[starknet::contract]
mod AccountComponent {
    use super::*;
    
    #[storage]
    struct Storage {}
    
    #[constructor]
    fn constructor(ref self: ComponentState<TContractState>) {}
}
