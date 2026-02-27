// SPDX-License-Identifier: MIT
//
// Forked from chipi-pay/sessions-smart-contract (v32)
// https://github.com/chipi-pay/sessions-smart-contract
//
// Modifications:
//   - ERC-8004 agent identity binding
//   - OpenZeppelin Cairo Contracts v3.0.0 imports
//   - IAgentIdentity interface with SRC-5 registration

/// Session data.
#[derive(Drop, Copy, Serde, starknet::Store)]
pub struct SessionData {
    pub valid_until: u64,
    pub max_calls: u32,
    pub calls_used: u32,
    pub allowed_entrypoints_len: u32,
}

/// Session key management interface.
#[starknet::interface]
pub trait ISessionKeyManager<TContractState> {
    fn add_or_update_session_key(
        ref self: TContractState,
        session_key: felt252,
        valid_until: u64,
        max_calls: u32,
        allowed_entrypoints: Array<felt252>,
    );
    fn revoke_session_key(ref self: TContractState, session_key: felt252);
    fn get_session_data(self: @TContractState, session_key: felt252) -> SessionData;
}

/// ERC-8004 agent identity interface.
#[starknet::interface]
pub trait IAgentIdentity<TContractState> {
    fn set_agent_id(ref self: TContractState, agent_id: felt252);
    fn get_agent_id(self: @TContractState) -> felt252;
}

#[starknet::contract(account)]
mod SessionAccount {
    use super::SessionData;
    use openzeppelin::account::AccountComponent;
    use openzeppelin::account::extensions::src9::SRC9Component;
    use openzeppelin::account::extensions::src9::OutsideExecution;
    use openzeppelin::account::extensions::src9::snip12_utils::OutsideExecutionStructHash;
    use openzeppelin::interfaces::src9::ISRC9_V2;
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::interfaces::upgrades::IUpgradeable;
    use openzeppelin::utils::snip12::{OffchainMessageHash, SNIP12Metadata};
    use starknet::ClassHash;
    use starknet::get_block_timestamp;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::account::Call;
    use starknet::get_tx_info;
    use starknet::get_contract_address;
    use starknet::get_caller_address;
    use core::ecdsa::check_ecdsa_signature;
    use core::poseidon::poseidon_hash_span;
    use core::array::ArrayTrait;
    use core::array::SpanTrait;
    use core::traits::Into;
    use core::num::traits::Zero;
    use crate::spending_policy::component::SpendingPolicyComponent;

    // ── SNIP-12 type hashes ──────────────────────────────────────────────
    const STARKNET_DOMAIN_TYPE_HASH_REV1: felt252 =
        0x1ff2f602e42168014d405a94f75e8a93d640751d71d16311266e140d8b0a210;
    const STARKNET_MESSAGE_PREFIX: felt252 = 'StarkNet Message';
    const SESSION_SIGNATURE_MODE_V1: u8 = 1;
    const SESSION_SIGNATURE_MODE_V2: u8 = 2;
    const DEFAULT_UPGRADE_DELAY: u64 = 3600;
    // Session accounts intentionally allow a lower minimum delay than agent accounts
    // to support short-lived session workflows while preserving a non-zero safety window.
    const MIN_UPGRADE_DELAY: u64 = 60;

    // ── Components ────────────────────────────────────────────────────────
    component!(path: AccountComponent, storage: account, event: AccountEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: SRC9Component, storage: src9, event: SRC9Event);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    component!(
        path: SpendingPolicyComponent,
        storage: spending_policy,
        event: SpendingPolicyEvent
    );

    #[abi(embed_v0)]
    impl PublicKeyImpl = AccountComponent::PublicKeyImpl<ContractState>;
    #[abi(embed_v0)]
    impl PublicKeyCamelImpl = AccountComponent::PublicKeyCamelImpl<ContractState>;
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    #[abi(embed_v0)]
    impl SessionSpendingPolicyImpl =
        SpendingPolicyComponent::SessionSpendingPolicyImpl<ContractState>;
    impl AccountInternalImpl = AccountComponent::InternalImpl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;
    // Custom __validate__ — do not embed AccountComponent::SRC6Impl or SRC9Component::SRC6Impl

    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    // Custom SRC9 impl — enforces session whitelist before execution.
    impl SRC9InternalImpl = SRC9Component::InternalImpl<ContractState>;

    impl SpendingPolicyInternalImpl =
        SpendingPolicyComponent::InternalImpl<ContractState>;

    impl SpendingPolicyHasAccountOwnerImpl of
        SpendingPolicyComponent::HasAccountOwner<ContractState> {
        fn assert_only_self(self: @ContractState) {
            self.account.assert_only_self();
        }
    }

    impl SNIP12MetadataImpl of SNIP12Metadata {
        fn name() -> felt252 {
            'Account.execute_from_outside'
        }
        fn version() -> felt252 {
            2
        }
    }

    // ── SRC-5 interface IDs ───────────────────────────────────────────────
    const SESSION_KEY_MANAGER_ID: felt252 =
        0x037ab4f01106526662a612eaa2926df2aa314c4144b964f183805880bbcfa55d;

    /// starknetKeccak("set_agent_id") ^ starknetKeccak("get_agent_id")
    const AGENT_IDENTITY_ID: felt252 =
        0x02d7c1413db950e74e13e7b1e5b64a7a69a35e081c15f9a09d7cd3a2a4e739f8;

    // ── Storage ───────────────────────────────────────────────────────────
    #[storage]
    struct Storage {
        #[substorage(v0)]
        account: AccountComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        src9: SRC9Component::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        spending_policy: SpendingPolicyComponent::Storage,
        session_keys: Map<felt252, SessionData>,
        session_entrypoints: Map<(felt252, u32), felt252>,
        agent_id: felt252,
        validate_self_call_active: bool,
        pending_upgrade: ClassHash,
        upgrade_scheduled_at: u64,
        upgrade_delay: u64,
        session_signature_mode: u8,
    }

    // ── Events ────────────────────────────────────────────────────────────
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        AccountEvent: AccountComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        SRC9Event: SRC9Component::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        #[flat]
        SpendingPolicyEvent: SpendingPolicyComponent::Event,
        SessionKeyAdded: SessionKeyAdded,
        SessionKeyRevoked: SessionKeyRevoked,
        AgentIdSet: AgentIdSet,
        CallFailed: CallFailed,
        UpgradeScheduled: UpgradeScheduled,
        UpgradeExecuted: UpgradeExecuted,
        UpgradeCancelled: UpgradeCancelled,
        UpgradeDelayUpdated: UpgradeDelayUpdated,
        SessionSignatureModeUpdated: SessionSignatureModeUpdated,
    }

    #[derive(Drop, starknet::Event)]
    struct SessionKeyAdded {
        #[key]
        session_key: felt252,
        valid_until: u64,
        max_calls: u32,
    }

    #[derive(Drop, starknet::Event)]
    struct SessionKeyRevoked {
        #[key]
        session_key: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct AgentIdSet {
        #[key]
        agent_id: felt252,
    }

    /// Emitted when a call inside `_execute_calls` fails but execution continues.
    #[derive(Drop, starknet::Event)]
    struct CallFailed {
        #[key]
        call_index: u32,
        to: starknet::ContractAddress,
        selector: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeScheduled {
        new_class_hash: ClassHash,
        scheduled_at: u64,
        executable_after: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeExecuted {
        new_class_hash: ClassHash,
        executed_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeCancelled {
        cancelled_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeDelayUpdated {
        old_delay: u64,
        new_delay: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct SessionSignatureModeUpdated {
        old_mode: u8,
        new_mode: u8,
    }

    // ── Constructor ───────────────────────────────────────────────────────
    #[constructor]
    fn constructor(ref self: ContractState, public_key: felt252) {
        self.account.initializer(public_key);
        self.src9.initializer();
        self.src5.register_interface(SESSION_KEY_MANAGER_ID);
        self.src5.register_interface(AGENT_IDENTITY_ID);
        self.upgrade_delay.write(DEFAULT_UPGRADE_DELAY);
        self.upgrade_scheduled_at.write(0);
        self.pending_upgrade.write(0.try_into().unwrap());
        self.session_signature_mode.write(SESSION_SIGNATURE_MODE_V1);
    }

    // ── SRC-6 ──────────────────────────────────────────────────────────────
    #[abi(per_item)]
    #[generate_trait]
    impl SRC6Impl of SRC6Trait {
        /// Validates a transaction before execution.
        ///
        /// - Empty signature (len=0): self-calls only (routed via __execute__)
        /// - Session signature (len=4): [session_pubkey, r, s, valid_until]
        /// - Owner signature (len=2): [r, s] — delegates to OZ AccountComponent
        #[external(v0)]
        fn __validate__(ref self: ContractState, calls: Array<Call>) -> felt252 {
            let tx_info = get_tx_info().unbox();
            let signature = tx_info.signature;
            let caller = get_caller_address();

            // Self-calls with empty signatures are only valid while executing
            // an internal batch (set by __execute__/execute_from_outside_v2).
            if signature.len() == 0 {
                if caller == get_contract_address() && self.validate_self_call_active.read() {
                    return starknet::VALIDATED;
                } else {
                    return 0;
                }
            }

            // Session path: 4-element signature [session_pubkey, r, s, valid_until]
            if signature.len() == 4 {
                let session_pubkey = *signature.at(0);
                let r = *signature.at(1);
                let s = *signature.at(2);
                let valid_until: u64 = match (*signature.at(3)).try_into() {
                    Option::Some(v) => v,
                    Option::None => { return 0; },
                };

                if get_block_timestamp() > valid_until {
                    return 0;
                }

                if !self._is_session_allowed_for_calls(session_pubkey, calls.span()) {
                    return 0;
                }

                let signature_mode = self._effective_session_signature_mode();
                let msg_hash = if signature_mode == SESSION_SIGNATURE_MODE_V1 {
                    self._session_message_hash_v1(calls.span(), valid_until)
                } else {
                    self._session_message_hash_v2(calls.span(), valid_until)
                };
                if check_ecdsa_signature(msg_hash, session_pubkey, r, s) {
                    self._consume_session_call(session_pubkey);
                    return starknet::VALIDATED;
                } else {
                    return 0;
                }
            }

            // Owner path: 2-element signature → delegate to OZ
            if signature.len() == 2 {
                return self.account.validate_transaction();
            }

            0
        }

        /// Executes validated calls. Only callable by sequencer (caller=0) or self.
        #[external(v0)]
        fn __execute__(ref self: ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
            let caller = get_caller_address();
            assert(
                caller.is_zero() || caller == get_contract_address(),
                'Account: unauthorized caller',
            );

            // Spending policy enforcement for session keys (AFTER validation, BEFORE execution).
            // Must be in __execute__ (not __validate__) because spending state
            // mutations in validate would be reverted on execution failure.
            let tx_info = get_tx_info().unbox();
            let signature = tx_info.signature;
            if signature.len() == 4 {
                let session_pubkey = *signature.at(0);
                self.spending_policy.check_and_update_spending(session_pubkey, calls.span());
            }

            self.validate_self_call_active.write(true);
            let result = self._execute_calls(calls);
            self.validate_self_call_active.write(false);
            result
        }

        #[external(v0)]
        fn __validate_deploy__(
            self: @ContractState,
            class_hash: felt252,
            contract_address_salt: felt252,
            public_key: felt252,
        ) -> felt252 {
            self.account.validate_transaction()
        }

        #[external(v0)]
        fn __validate_declare__(self: @ContractState, class_hash: felt252) -> felt252 {
            self.account.validate_transaction()
        }

        /// Read-only signature validation (ERC-1271 / SRC-6).
        fn is_valid_signature(
            self: @ContractState, hash: felt252, signature: Array<felt252>,
        ) -> felt252 {
            if signature.len() == 2 {
                let public_key = self.account.get_public_key();
                let is_valid = check_ecdsa_signature(
                    hash, public_key, *signature.at(0), *signature.at(1),
                );
                if is_valid {
                    return starknet::VALIDATED;
                } else {
                    return 0;
                }
            }

            if signature.len() == 4 {
                let session_pubkey = *signature.at(0);
                let r = *signature.at(1);
                let s = *signature.at(2);
                let valid_until: u64 = match (*signature.at(3)).try_into() {
                    Option::Some(v) => v,
                    Option::None => { return 0; },
                };

                if get_block_timestamp() > valid_until {
                    return 0;
                }

                let session = self.session_keys.read(session_pubkey);
                if session.valid_until == 0 {
                    return 0;
                }
                if get_block_timestamp() > session.valid_until {
                    return 0;
                }
                if session.calls_used >= session.max_calls {
                    return 0;
                }

                let is_valid = check_ecdsa_signature(hash, session_pubkey, r, s);
                if is_valid {
                    return starknet::VALIDATED;
                } else {
                    return 0;
                }
            }

            0
        }
    }

    // ── SNIP-9 v2 ──────────────────────────────────────────────────────────
    #[abi(embed_v0)]
    impl CustomSRC9V2Impl of ISRC9_V2<ContractState> {
        fn execute_from_outside_v2(
            ref self: ContractState,
            outside_execution: OutsideExecution,
            signature: Span<felt252>,
        ) -> Array<Span<felt252>> {
            // 1. Validate caller
            let caller_felt: felt252 = outside_execution.caller.into();
            let is_any_caller = caller_felt == 0 || caller_felt == 'ANY_CALLER';
            if !is_any_caller {
                assert(
                    get_caller_address() == outside_execution.caller, 'SRC9: invalid caller',
                );
            }

            // 2. Validate execution time span
            let now = get_block_timestamp();
            assert(outside_execution.execute_after < now, 'SRC9: now <= execute_after');
            assert(now < outside_execution.execute_before, 'SRC9: now >= execute_before');

            // 3. Validate and mark nonce as used
            assert(
                !self.src9.SRC9_nonces.read(outside_execution.nonce), 'SRC9: duplicated nonce',
            );
            self.src9.SRC9_nonces.write(outside_execution.nonce, true);

            // 4. For session sigs, enforce whitelist before signature validation
            let mut is_session_sig = false;
            let mut session_pubkey: felt252 = 0;
            if signature.len() == 4 {
                is_session_sig = true;
                session_pubkey = *signature.at(0);

                // Bind valid_until to stored session value
                let sig_valid_until: u64 = match (*signature.at(3)).try_into() {
                    Option::Some(v) => v,
                    Option::None => {
                        core::panic_with_felt252('Session: invalid timestamp');
                    },
                };
                let session = self.session_keys.read(session_pubkey);
                assert(sig_valid_until <= session.valid_until, 'Session: valid_until exceeded');

                assert(
                    self._is_session_allowed_for_calls(session_pubkey, outside_execution.calls),
                    'Session: unauthorized selector',
                );
            }

            // 5. Validate signature (strict OZ SRC-9/SNIP-12 hash only).
            let mut sig_copy: Array<felt252> = array![];
            let mut i: u32 = 0;
            loop {
                if i >= signature.len() {
                    break;
                }
                sig_copy.append(*signature.at(i));
                i += 1;
            };

            let oz_hash = outside_execution.get_message_hash(get_contract_address());
            let is_valid_oz = SRC6Impl::is_valid_signature(@self, oz_hash, sig_copy);
            let is_valid_signature = is_valid_oz == starknet::VALIDATED || is_valid_oz == 1;
            assert(is_valid_signature, 'SRC9: invalid signature');
            if is_session_sig {
                self._consume_session_call(session_pubkey);
                // Spending policy enforcement (AFTER validation, BEFORE execution).
                // Must be in execute (not validate) because spending state mutations
                // in validate would be reverted on execution failure.
                self.spending_policy.check_and_update_spending(
                    session_pubkey, outside_execution.calls,
                );
            }

            // 6. Execute
            self.validate_self_call_active.write(true);
            let result = self._execute_calls(outside_execution.calls.into());
            self.validate_self_call_active.write(false);
            result
        }

        fn is_valid_outside_execution_nonce(self: @ContractState, nonce: felt252) -> bool {
            !self.src9.SRC9_nonces.read(nonce)
        }
    }

    // ── Upgradeable ───────────────────────────────────────────────────────
    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.account.assert_only_self();
            let zero_class: ClassHash = 0.try_into().unwrap();
            assert(new_class_hash != zero_class, 'Session: zero class hash');
            assert(self.pending_upgrade.read() == zero_class, 'Session: upgrade pending');

            let now = get_block_timestamp();
            let delay = self.upgrade_delay.read();
            self.pending_upgrade.write(new_class_hash);
            self.upgrade_scheduled_at.write(now);

            self.emit(
                UpgradeScheduled {
                    new_class_hash,
                    scheduled_at: now,
                    executable_after: now + delay,
                },
            );
        }
    }

    #[starknet::interface]
    trait IUpgradeTimelock<TState> {
        fn execute_upgrade(ref self: TState);
        fn cancel_upgrade(ref self: TState);
        fn set_upgrade_delay(ref self: TState, new_delay: u64);
        fn get_upgrade_info(self: @TState) -> (ClassHash, u64, u64, u64);
    }

    #[abi(embed_v0)]
    impl UpgradeTimelockImpl of IUpgradeTimelock<ContractState> {
        fn execute_upgrade(ref self: ContractState) {
            self.account.assert_only_self();

            let pending = self.pending_upgrade.read();
            let zero_class: ClassHash = 0.try_into().unwrap();
            assert(pending != zero_class, 'Session: no pending upgrade');

            let now = get_block_timestamp();
            let scheduled_at = self.upgrade_scheduled_at.read();
            let delay = self.upgrade_delay.read();
            assert(now >= scheduled_at + delay, 'Session: upgrade timelock');

            self.pending_upgrade.write(zero_class);
            self.upgrade_scheduled_at.write(0);
            self.upgradeable.upgrade(pending);

            self.emit(UpgradeExecuted { new_class_hash: pending, executed_at: now });
        }

        fn cancel_upgrade(ref self: ContractState) {
            self.account.assert_only_self();

            let pending = self.pending_upgrade.read();
            let zero_class: ClassHash = 0.try_into().unwrap();
            assert(pending != zero_class, 'Session: no pending upgrade');

            self.pending_upgrade.write(zero_class);
            self.upgrade_scheduled_at.write(0);
            self.emit(UpgradeCancelled { cancelled_at: get_block_timestamp() });
        }

        fn set_upgrade_delay(ref self: ContractState, new_delay: u64) {
            self.account.assert_only_self();
            assert(new_delay >= MIN_UPGRADE_DELAY, 'Session: delay too small');

            let old_delay = self.upgrade_delay.read();
            self.upgrade_delay.write(new_delay);
            self.emit(UpgradeDelayUpdated { old_delay, new_delay });
        }

        fn get_upgrade_info(self: @ContractState) -> (ClassHash, u64, u64, u64) {
            (
                self.pending_upgrade.read(),
                self.upgrade_scheduled_at.read(),
                self.upgrade_delay.read(),
                get_block_timestamp(),
            )
        }
    }

    // ── Session Key Management ─────────────────────────────────────────────
    impl SessionKeyManagerImpl of super::ISessionKeyManager<ContractState> {
        fn add_or_update_session_key(
            ref self: ContractState,
            session_key: felt252,
            valid_until: u64,
            max_calls: u32,
            allowed_entrypoints: Array<felt252>,
        ) {
            self.account.assert_only_self();
            assert(session_key != 0, 'Session: zero key');
            assert(valid_until > 0, 'Session: zero valid_until');
            assert(max_calls > 0, 'Session: zero max_calls');

            // Clear stale entrypoints before writing new ones
            let old_session = self.session_keys.read(session_key);
            let mut i = 0;
            loop {
                if i >= old_session.allowed_entrypoints_len {
                    break;
                }
                self.session_entrypoints.write((session_key, i), 0);
                i += 1;
            };

            let sess = SessionData {
                valid_until, max_calls, calls_used: 0, allowed_entrypoints_len: allowed_entrypoints.len(),
            };
            self.session_keys.write(session_key, sess);

            let mut i = 0;
            loop {
                if i >= allowed_entrypoints.len() {
                    break;
                }
                self._store_entrypoint(session_key, i, *allowed_entrypoints.at(i));
                i += 1;
            };

            self.emit(SessionKeyAdded { session_key, valid_until, max_calls });
        }

        fn revoke_session_key(ref self: ContractState, session_key: felt252) {
            self.account.assert_only_self();
            assert(session_key != 0, 'Session: zero key');

            let current_session = self.session_keys.read(session_key);
            assert(current_session.valid_until != 0, 'Session: key not found');
            let entrypoints_to_clear = current_session.allowed_entrypoints_len;

            let mut i = 0;
            loop {
                if i >= entrypoints_to_clear {
                    break;
                }
                self.session_entrypoints.write((session_key, i), 0);
                i += 1;
            };

            let sess = SessionData {
                valid_until: 0, max_calls: 0, calls_used: 0, allowed_entrypoints_len: 0,
            };
            self.session_keys.write(session_key, sess);
            self.emit(SessionKeyRevoked { session_key });
        }

        fn get_session_data(self: @ContractState, session_key: felt252) -> SessionData {
            self.session_keys.read(session_key)
        }
    }

    // ── ERC-8004 Agent Identity ─────────────────────────────────────────────
    impl AgentIdentityImpl of super::IAgentIdentity<ContractState> {
        fn set_agent_id(ref self: ContractState, agent_id: felt252) {
            self.account.assert_only_self();
            assert(agent_id != 0, 'Agent: zero agent_id');
            self.agent_id.write(agent_id);
            self.emit(AgentIdSet { agent_id });
        }

        fn get_agent_id(self: @ContractState) -> felt252 {
            self.agent_id.read()
        }
    }

    // ── External entrypoints (session management) ─────────────────────────
    #[external(v0)]
    fn add_or_update_session_key(
        ref self: ContractState,
        session_key: felt252,
        valid_until: u64,
        max_calls: u32,
        allowed_entrypoints: Array<felt252>,
    ) {
        SessionKeyManagerImpl::add_or_update_session_key(
            ref self, session_key, valid_until, max_calls, allowed_entrypoints,
        );
    }

    #[external(v0)]
    fn revoke_session_key(ref self: ContractState, session_key: felt252) {
        SessionKeyManagerImpl::revoke_session_key(ref self, session_key);
    }

    #[external(v0)]
    fn get_session_data(self: @ContractState, session_key: felt252) -> SessionData {
        SessionKeyManagerImpl::get_session_data(self, session_key)
    }

    // ── External entrypoints (agent identity) ─────────────────────────────
    #[external(v0)]
    fn set_agent_id(ref self: ContractState, agent_id: felt252) {
        AgentIdentityImpl::set_agent_id(ref self, agent_id);
    }

    #[external(v0)]
    fn get_agent_id(self: @ContractState) -> felt252 {
        AgentIdentityImpl::get_agent_id(self)
    }

    // ── Utility entrypoints ───────────────────────────────────────────────
    #[external(v0)]
    fn register_interfaces(ref self: ContractState) {
        self.account.assert_only_self();
        self.src5.register_interface(SESSION_KEY_MANAGER_ID);
        self.src5.register_interface(AGENT_IDENTITY_ID);
    }

    #[external(v0)]
    fn get_contract_info(self: @ContractState) -> felt252 {
        'v32-agent'
    }

    #[external(v0)]
    fn get_snip9_version(self: @ContractState) -> u8 {
        2
    }

    /// Compute session message hash. Owner-only.
    #[external(v0)]
    fn compute_session_message_hash(
        ref self: ContractState, calls: Array<Call>, valid_until: u64,
    ) -> felt252 {
        self.account.assert_only_self();
        let signature_mode = self._effective_session_signature_mode();
        if signature_mode == SESSION_SIGNATURE_MODE_V1 {
            self._session_message_hash_v1(calls.span(), valid_until)
        } else {
            self._session_message_hash_v2(calls.span(), valid_until)
        }
    }

    #[external(v0)]
    fn compute_session_message_hash_v1(
        ref self: ContractState, calls: Array<Call>, valid_until: u64,
    ) -> felt252 {
        self.account.assert_only_self();
        self._session_message_hash_v1(calls.span(), valid_until)
    }

    #[external(v0)]
    fn compute_session_message_hash_v2(
        ref self: ContractState, calls: Array<Call>, valid_until: u64,
    ) -> felt252 {
        self.account.assert_only_self();
        self._session_message_hash_v2(calls.span(), valid_until)
    }

    #[external(v0)]
    fn get_session_signature_mode(self: @ContractState) -> u8 {
        self._effective_session_signature_mode()
    }

    #[external(v0)]
    fn set_session_signature_mode(ref self: ContractState, new_mode: u8) {
        self.account.assert_only_self();
        assert(
            new_mode == SESSION_SIGNATURE_MODE_V1 || new_mode == SESSION_SIGNATURE_MODE_V2,
            'Session: invalid sig mode',
        );

        let current_mode = self._effective_session_signature_mode();
        if current_mode == new_mode {
            return;
        }

        if current_mode == SESSION_SIGNATURE_MODE_V2
            && new_mode == SESSION_SIGNATURE_MODE_V1 {
            assert(false, 'Session: mode downgrade');
        }

        self.session_signature_mode.write(new_mode);
        self.emit(SessionSignatureModeUpdated { old_mode: current_mode, new_mode });
    }

    #[external(v0)]
    fn is_valid_signature(
        self: @ContractState, hash: felt252, signature: Array<felt252>,
    ) -> felt252 {
        SRC6Impl::is_valid_signature(self, hash, signature)
    }

    #[external(v0)]
    fn get_session_allowed_entrypoints_len(self: @ContractState, session_key: felt252) -> u32 {
        let s = self.session_keys.read(session_key);
        s.allowed_entrypoints_len
    }

    #[external(v0)]
    fn get_session_allowed_entrypoint_at(
        self: @ContractState, session_key: felt252, index: u32,
    ) -> felt252 {
        self._load_entrypoint(session_key, index)
    }

    // ── Internal logic ────────────────────────────────────────────────────
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _store_entrypoint(
            ref self: ContractState, session_key: felt252, index: u32, entrypoint: felt252,
        ) {
            self.session_entrypoints.write((session_key, index), entrypoint);
        }

        fn _load_entrypoint(self: @ContractState, session_key: felt252, index: u32) -> felt252 {
            self.session_entrypoints.read((session_key, index))
        }

        /// Returns true if no call in the batch targets this account itself.
        fn _calls_avoid_self(self: @ContractState, calls: Span<Call>) -> bool {
            let account_address = get_contract_address();
            let mut i = 0;
            loop {
                if i >= calls.len() {
                    break;
                }
                let call = calls.at(i);
                if *call.to == account_address {
                    return false;
                }
                i += 1;
            };
            true
        }

        /// Returns true if the session key is allowed to execute the given calls.
        ///
        /// Three-layer enforcement (order matters — refs #216, #217):
        ///   1. Session validity: key exists, not expired, call budget not exhausted.
        ///   2. Admin selector blocklist: rejects privileged selectors on ANY target
        ///      contract to prevent privilege escalation even on external contracts
        ///      that share selector names.
        ///   3. Self-call guard: rejects any call targeting this account itself,
        ///      unconditionally, even when an explicit whitelist is configured.
        ///
        /// Invariants preserved:
        ///   - Spending monotonicity: spending counters only increase within a window.
        ///   - Authorization boundary: session keys cannot modify their own policies,
        ///     register new session keys, revoke keys, or change the owner key.
        ///   - Enforcement completeness: guard applies to both __execute__ and
        ///     execute_from_outside_v2 session paths.
        ///
        /// See also: docs/security/SPENDING_POLICY_AUDIT.md
        fn _is_session_allowed_for_calls(
            self: @ContractState, session_key: felt252, calls: Span<Call>,
        ) -> bool {
            let session = self.session_keys.read(session_key);
            if session.valid_until == 0 {
                return false;
            }
            if get_block_timestamp() > session.valid_until {
                return false;
            }
            if session.calls_used >= session.max_calls {
                return false;
            }

            // --- Layer 2: Admin selector blocklist ---
            // Each category prevents a specific privilege escalation vector:
            //   - upgrade/*: session key could replace account logic with a backdoor
            //   - *session_key/emergency_revoke*: session key could grant itself
            //     new permissions or revoke the owner's ability to revoke it
            //   - set_public_key: session key could replace the owner key
            //   - __execute__/__validate__/*: re-entrant execution or validation bypass
            //   - set_agent_id/register_interfaces: identity takeover
            //   - *spending_policy: session key could raise its own spending limits
            let UPGRADE_SELECTOR: felt252 = selector!("upgrade");
            let SCHEDULE_UPGRADE_SELECTOR: felt252 = selector!("schedule_upgrade");
            let EXECUTE_UPGRADE_SELECTOR: felt252 = selector!("execute_upgrade");
            let CANCEL_UPGRADE_SELECTOR: felt252 = selector!("cancel_upgrade");
            let SET_UPGRADE_DELAY_SELECTOR: felt252 = selector!("set_upgrade_delay");
            let REGISTER_SESSION_SELECTOR: felt252 = selector!("register_session_key");
            let ADD_SESSION_SELECTOR: felt252 = selector!("add_or_update_session_key");
            let REVOKE_SESSION_SELECTOR: felt252 = selector!("revoke_session_key");
            let EMERGENCY_REVOKE_ALL_SELECTOR: felt252 = selector!("emergency_revoke_all");
            let EXECUTE_SELECTOR: felt252 = selector!("__execute__");
            let SET_PUBLIC_KEY_SELECTOR: felt252 = selector!("set_public_key");
            let SET_PUBLIC_KEY_CAMEL_SELECTOR: felt252 = selector!("setPublicKey");
            let EXECUTE_FROM_OUTSIDE_V2_SELECTOR: felt252 = selector!(
                "execute_from_outside_v2",
            );
            let SET_AGENT_ID_SELECTOR: felt252 = selector!("set_agent_id");
            let REGISTER_INTERFACES_SELECTOR: felt252 = selector!("register_interfaces");
            let COMPUTE_HASH_SELECTOR: felt252 = selector!("compute_session_message_hash");
            let COMPUTE_HASH_V1_SELECTOR: felt252 = selector!("compute_session_message_hash_v1");
            let COMPUTE_HASH_V2_SELECTOR: felt252 = selector!("compute_session_message_hash_v2");
            let SET_SIGNATURE_MODE_SELECTOR: felt252 = selector!("set_session_signature_mode");
            let VALIDATE_SELECTOR: felt252 = selector!("__validate__");
            let VALIDATE_DECLARE_SELECTOR: felt252 = selector!("__validate_declare__");
            let VALIDATE_DEPLOY_SELECTOR: felt252 = selector!("__validate_deploy__");
            let SET_SPENDING_POLICY_SELECTOR: felt252 = selector!("set_spending_policy");
            let REMOVE_SPENDING_POLICY_SELECTOR: felt252 = selector!("remove_spending_policy");

            let mut i = 0;
            loop {
                if i >= calls.len() {
                    break;
                }
                let call = calls.at(i);
                let sel = *call.selector;

                if sel == UPGRADE_SELECTOR
                    || sel == SCHEDULE_UPGRADE_SELECTOR
                    || sel == EXECUTE_UPGRADE_SELECTOR
                    || sel == CANCEL_UPGRADE_SELECTOR
                    || sel == SET_UPGRADE_DELAY_SELECTOR
                    || sel == REGISTER_SESSION_SELECTOR
                    || sel == ADD_SESSION_SELECTOR
                    || sel == REVOKE_SESSION_SELECTOR
                    || sel == EMERGENCY_REVOKE_ALL_SELECTOR
                    || sel == EXECUTE_SELECTOR
                    || sel == SET_PUBLIC_KEY_SELECTOR
                    || sel == SET_PUBLIC_KEY_CAMEL_SELECTOR
                    || sel == EXECUTE_FROM_OUTSIDE_V2_SELECTOR
                    || sel == SET_AGENT_ID_SELECTOR
                    || sel == REGISTER_INTERFACES_SELECTOR
                    || sel == COMPUTE_HASH_SELECTOR
                    || sel == COMPUTE_HASH_V1_SELECTOR
                    || sel == COMPUTE_HASH_V2_SELECTOR
                    || sel == SET_SIGNATURE_MODE_SELECTOR
                    || sel == VALIDATE_SELECTOR
                    || sel == VALIDATE_DECLARE_SELECTOR
                    || sel == VALIDATE_DEPLOY_SELECTOR
                    || sel == SET_SPENDING_POLICY_SELECTOR
                    || sel == REMOVE_SPENDING_POLICY_SELECTOR {
                    return false;
                }
                i += 1;
            };

            // Canonical self-call escalation guard used by session validation paths,
            // including SRC-9 execute_from_outside_v2 via _is_session_allowed_for_calls.
            // Session path must never target this account, even with a non-empty whitelist.
            if !self._calls_avoid_self(calls) {
                return false;
            }

            // Empty whitelist: any non-self selector is allowed.
            if session.allowed_entrypoints_len == 0 {
                return true;
            }

            // Verify all selectors are in the explicit whitelist
            let mut i = 0;
            loop {
                if i >= calls.len() {
                    break;
                }
                let call = calls.at(i);
                let selector = *call.selector;

                let mut j = 0;
                let mut found = false;
                loop {
                    if j >= session.allowed_entrypoints_len {
                        break;
                    }
                    let allowed = self._load_entrypoint(session_key, j);
                    if allowed == selector {
                        found = true;
                        break;
                    }
                    j += 1;
                };
                if !found {
                    return false;
                }
                i += 1;
            };
            true
        }

        fn _consume_session_call(ref self: ContractState, session_key: felt252) {
            let mut session = self.session_keys.read(session_key);
            session.calls_used += 1;
            self.session_keys.write(session_key, session);
        }

        fn _effective_session_signature_mode(self: @ContractState) -> u8 {
            let raw_mode = self.session_signature_mode.read();
            // Backward compatibility for contracts upgraded from versions that did not
            // persist this field. A zero value maps to legacy v1 semantics.
            if raw_mode == 0 {
                SESSION_SIGNATURE_MODE_V1
            } else {
                raw_mode
            }
        }

        /// Legacy v1 hash used before SNIP-12 domain-separated mode.
        fn _session_message_hash_v1(
            self: @ContractState, calls: Span<Call>, valid_until: u64,
        ) -> felt252 {
            let tx_info = get_tx_info().unbox();
            let mut hash_data = array![];

            hash_data.append(get_contract_address().into());
            hash_data.append(tx_info.chain_id.into());
            hash_data.append(tx_info.nonce.into());
            hash_data.append(valid_until.into());

            let mut i = 0;
            loop {
                if i >= calls.len() {
                    break;
                }
                let call = calls.at(i);
                hash_data.append((*call.to).into());
                hash_data.append((*call.selector).into());
                hash_data.append(call.calldata.len().into());

                let mut j = 0;
                loop {
                    if j >= call.calldata.len() {
                        break;
                    }
                    hash_data.append((*call.calldata.at(j)).into());
                    j += 1;
                };
                i += 1;
            };

            poseidon_hash_span(hash_data.span())
        }

        /// SNIP-12 domain-separated v2 hash for session signatures.
        fn _session_message_hash_v2(
            self: @ContractState, calls: Span<Call>, valid_until: u64,
        ) -> felt252 {
            let tx_info = get_tx_info().unbox();
            let mut hash_data = array![];

            hash_data.append(get_contract_address().into());
            hash_data.append(tx_info.chain_id.into());
            hash_data.append(tx_info.nonce.into());
            hash_data.append(valid_until.into());

            let mut i = 0;
            loop {
                if i >= calls.len() {
                    break;
                }
                let call = calls.at(i);
                hash_data.append((*call.to).into());
                hash_data.append((*call.selector).into());
                hash_data.append(call.calldata.len().into());

                let mut j = 0;
                loop {
                    if j >= call.calldata.len() {
                        break;
                    }
                    hash_data.append((*call.calldata.at(j)).into());
                    j += 1;
                };
                i += 1;
            };

            let payload_hash = poseidon_hash_span(hash_data.span());
            let domain_hash = poseidon_hash_span(
                array![
                    STARKNET_DOMAIN_TYPE_HASH_REV1,
                    'Session.transaction',
                    2,
                    tx_info.chain_id.into(),
                    1,
                ]
                    .span(),
            );
            poseidon_hash_span(
                array![
                    STARKNET_MESSAGE_PREFIX,
                    domain_hash,
                    get_contract_address().into(),
                    payload_hash,
                ]
                    .span(),
            )
        }

        /// Execute calls. Returns empty span for failed calls (doesn't revert entire batch).
        fn _execute_calls(
            ref self: ContractState, mut calls: Array<Call>,
        ) -> Array<Span<felt252>> {
            let mut res = array![];
            let mut call_index: u32 = 0;
            loop {
                match calls.pop_front() {
                    Option::Some(call) => {
                        match starknet::syscalls::call_contract_syscall(
                            call.to, call.selector, call.calldata,
                        ) {
                            Result::Ok(ret) => res.append(ret),
                            // IMPORTANT: Failed calls return empty span instead of reverting.
                            // Rationale: Spending policy has already debited spent_in_window
                            // BEFORE this execution (check-effects-interactions pattern).
                            // Reverting here would allow bypass attacks where attacker
                            // intentionally fails calls to avoid spending limit deduction.
                            // This is fail-closed behavior: failed transfers still count.
                            // MCP callers should check on-chain state to detect failures.
                            Result::Err(_) => {
                                self.emit(CallFailed {
                                    call_index,
                                    to: call.to,
                                    selector: call.selector,
                                });
                                res.append(array![].span());
                            },
                        }
                        call_index += 1;
                    },
                    Option::None => { break; },
                }
            };
            res
        }
    }
}
