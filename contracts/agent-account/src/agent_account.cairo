#[starknet::contract(account)]
pub mod AgentAccount {
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::Zero;
    use starknet::{ClassHash, ContractAddress, SyscallResultTrait, get_block_timestamp, get_caller_address, get_tx_info};
    use starknet::account::Call;
    use starknet::storage::*;
    use openzeppelin::account::AccountComponent;
    use openzeppelin::introspection::src5::SRC5Component;
    use super::super::interfaces::{IAgentAccount, SessionPolicy};
    use super::super::session_key::SessionKeyComponent;

    const MIN_TRANSACTION_VERSION: u256 = 1;
    const QUERY_OFFSET: u256 = 0x100000000000000000000000000000000;
    /// Default timelock delay for upgrades (5 minutes).
    const DEFAULT_UPGRADE_DELAY: u64 = 300;
    /// Minimum timelock delay for upgrades (1 hour).
    const MIN_UPGRADE_DELAY: u64 = 3600;

    fn execute_calls(mut calls: Span<Call>) -> Array<Span<felt252>> {
        let mut res = array![];
        for call in calls {
            let Call { to, selector, calldata } = *call;
            res
                .append(
                    starknet::syscalls::call_contract_syscall(to, selector, calldata)
                        .unwrap_syscall(),
                );
        };
        res
    }

    fn is_tx_version_valid() -> bool {
        let tx_info = get_tx_info().unbox();
        let tx_version: u256 = tx_info.version.into();
        if tx_version >= QUERY_OFFSET {
            QUERY_OFFSET + MIN_TRANSACTION_VERSION <= tx_version
        } else {
            MIN_TRANSACTION_VERSION <= tx_version
        }
    }

    component!(path: AccountComponent, storage: account, event: AccountEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: SessionKeyComponent, storage: session_keys, event: SessionKeyEvent);

    // ─── Embedded impls from AccountComponent ─────────────────────────
    // We embed everything EXCEPT SRC6Impl and SRC6CamelOnlyImpl.
    // Those are replaced by our CustomSRC6Impl which intercepts
    // __validate__ and __execute__ for session key enforcement.
    // ──────────────────────────────────────────────────────────────────
    #[abi(embed_v0)]
    impl DeclarerImpl = AccountComponent::DeclarerImpl<ContractState>;
    #[abi(embed_v0)]
    impl PublicKeyImpl = AccountComponent::PublicKeyImpl<ContractState>;
    #[abi(embed_v0)]
    impl PublicKeyCamelImpl = AccountComponent::PublicKeyCamelImpl<ContractState>;
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    impl AccountInternalImpl = AccountComponent::InternalImpl<ContractState>;
    impl SessionKeyInternalImpl = SessionKeyComponent::SessionKeyImpl<ContractState>;

    /// ERC-20 `transfer(recipient, amount)` selector: sn_keccak("transfer")
    pub const TRANSFER_SELECTOR: felt252 =
        0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e;

    /// ERC-20 `approve(spender, amount)` selector: sn_keccak("approve")
    /// Without this check, a session key could bypass spending_limit by calling
    /// approve(colluder, MAX) and having the colluder drain via transferFrom.
    pub const APPROVE_SELECTOR: felt252 =
        0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c;

    /// OZ ERC-20 `increase_allowance(spender, added_value)` selector (snake_case).
    /// Same calldata layout as approve: [spender, amount_low, amount_high].
    /// Without this, a session key could bypass spending_limit via
    /// increase_allowance on an existing zero/small approval.
    pub const INCREASE_ALLOWANCE_SELECTOR: felt252 =
        0x1d13ab0a76d7407b1d5faccd4b3d8a9efe42f3d3c21766431d4fafb30f45bd4;

    /// OZ ERC-20 `increaseAllowance(spender, addedValue)` selector (camelCase).
    /// OZ ERC-20 exposes both snake_case and camelCase; both must be tracked.
    pub const INCREASE_ALLOWANCE_CAMEL_SELECTOR: felt252 =
        0x16cc063b8338363cf388ce7fe1df408bf10f16cd51635d392e21d852fafb683;

    /// Returns true if the selector corresponds to an ERC-20 operation that
    /// moves or authorizes moving value: transfer, approve, increase_allowance.
    /// All share identical calldata layout: [address, amount_low, amount_high].
    ///
    /// NOTE: transfer_from / transferFrom are deliberately NOT tracked here.
    /// They consume existing approvals (which are already gated by approve +
    /// increase_allowance tracking above). Debiting transferFrom would
    /// double-count the same exposure.
    fn is_spending_selector(sel: felt252) -> bool {
        sel == TRANSFER_SELECTOR
            || sel == APPROVE_SELECTOR
            || sel == INCREASE_ALLOWANCE_SELECTOR
            || sel == INCREASE_ALLOWANCE_CAMEL_SELECTOR
    }

    #[storage]
    struct Storage {
        #[substorage(v0)]
        account: AccountComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        session_keys: SessionKeyComponent::Storage,
        agent_registry: ContractAddress,
        agent_id: u256,
        /// Compact list of active session keys (swap-and-remove on revoke).
        active_session_keys: Map<u32, felt252>,
        /// Number of currently active session keys (NOT historical total).
        session_key_count: u32,
        /// Maps key -> 1-based index in active_session_keys (0 = not tracked).
        session_key_index: Map<felt252, u32>,
        /// Factory address that deployed this account (zero if deployed directly).
        factory: ContractAddress,
        /// Timelocked upgrade: pending class hash.
        pending_upgrade: ClassHash,
        /// Timelocked upgrade: timestamp when upgrade was scheduled.
        upgrade_scheduled_at: u64,
        /// Timelocked upgrade: delay in seconds before upgrade can execute.
        upgrade_delay: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        AccountEvent: AccountComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        SessionKeyEvent: SessionKeyComponent::Event,
        AgentIdSet: AgentIdSet,
        EmergencyRevoked: EmergencyRevoked,
        UpgradeScheduled: UpgradeScheduled,
        UpgradeExecuted: UpgradeExecuted,
        UpgradeCancelled: UpgradeCancelled,
        UpgradeDelayUpdated: UpgradeDelayUpdated,
    }

    #[derive(Drop, starknet::Event)]
    struct AgentIdSet {
        registry: ContractAddress,
        agent_id: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct EmergencyRevoked {
        timestamp: u64,
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
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeCancelled {
        class_hash: ClassHash,
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeDelayUpdated {
        old_delay: u64,
        new_delay: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, public_key: felt252, factory: ContractAddress) {
        self.account.initializer(public_key);
        self.factory.write(factory);
        self.upgrade_delay.write(DEFAULT_UPGRADE_DELAY);
    }

    // ─── Custom __validate_deploy__ ────────────────────────────────────
    // The embedded AccountComponent::DeployableImpl generates a
    // __validate_deploy__ that only accepts (public_key).  Our constructor
    // is (public_key, factory), so we provide our own implementation.
    // ──────────────────────────────────────────────────────────────────

    #[abi(per_item)]
    #[generate_trait]
    impl CustomDeployableImpl of CustomDeployableTrait {
        #[external(v0)]
        fn __validate_deploy__(
            self: @ContractState,
            class_hash: felt252,
            contract_address_salt: felt252,
            public_key: felt252,
            factory: ContractAddress,
        ) -> felt252 {
            let _ = class_hash;
            let _ = contract_address_salt;
            let _ = factory;

            let tx_info = get_tx_info().unbox();
            let tx_hash = tx_info.transaction_hash;
            let signature = tx_info.signature;

            if signature.len() != 2 {
                return 0;
            }

            if public_key == 0 {
                return 0;
            }

            let r = *signature.at(0);
            let s = *signature.at(1);
            if check_ecdsa_signature(tx_hash, public_key, r, s) {
                starknet::VALIDATED
            } else {
                0
            }
        }
    }

    // ─── Custom SRC6 Implementation ────────────────────────────────────
    // Replaces AccountComponent::SRC6Impl to intercept __validate__ and
    // __execute__ for session key policy enforcement.
    //
    // Signature convention:
    //   Owner:       [r, s]               (2 felts — standard ECDSA)
    //   Session key: [session_key, r, s]   (3 felts — key pubkey prepended)
    // ───────────────────────────────────────────────────────────────────

    #[abi(per_item)]
    #[generate_trait]
    impl CustomSRC6Impl of CustomSRC6Trait {
        /// Validates the transaction signature.
        ///
        /// For owner transactions (2-element sig): delegates to OZ's internal
        /// signature check against the account's stored public key.
        ///
        /// For session key transactions (3-element sig): verifies that the
        /// session key is registered and currently valid, then checks the ECDSA
        /// signature against the session key's public key.
        #[external(v0)]
        fn __validate__(self: @ContractState, calls: Array<Call>) -> felt252 {
            let tx_info = get_tx_info().unbox();
            let tx_hash = tx_info.transaction_hash;
            let signature = tx_info.signature;

            if signature.len() == 2 {
                // Owner path: standard ECDSA against account public key
                assert(
                    self.account._is_valid_signature(tx_hash, signature),
                    'Account: invalid signature',
                );
                return starknet::VALIDATED;
            }

            if signature.len() == 3 {
                // Session key path: [session_key_pubkey, r, s]
                let session_key = *signature.at(0);

                // Key must be registered, active, and within its time window
                assert(self.session_keys.is_valid(session_key), 'Session key not valid');

                // Verify ECDSA signature over the transaction hash
                assert(
                    check_ecdsa_signature(
                        tx_hash, session_key, *signature.at(1), *signature.at(2),
                    ),
                    'Session key: bad signature',
                );

                return starknet::VALIDATED;
            }

            // Any other signature length is invalid
            assert(false, 'Account: invalid sig length');
            0 // unreachable
        }

        /// Executes calls with session key policy enforcement.
        ///
        /// For owner transactions (2-element sig): executes with no restrictions.
        /// For session key transactions (3-element sig): enforces per-call policy
        /// checks before execution:
        ///   - `allowed_contract`: each call target must match the policy
        ///   - `spending_limit`: ERC-20 value-moving selectors (`transfer`,
        ///     `approve`, `increase_allowance`, `increaseAllowance`) are debited
        ///     against the session key's 24h rolling allowance.
        #[external(v0)]
        fn __execute__(ref self: ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
            // Security: only the Starknet protocol may invoke __execute__
            let sender = get_caller_address();
            assert(sender.is_zero(), 'Account: invalid caller');
            assert(is_tx_version_valid(), 'Account: invalid tx version');

            // Re-read signature to determine signer type.
            // __validate__ already verified the signature; we just need the format.
            let tx_info = get_tx_info().unbox();
            let signature = tx_info.signature;

            if signature.len() == 3 {
                // Session key transaction — enforce policies before execution
                let session_key = *signature.at(0);
                let policy = self.session_keys.get_policy(session_key);
                let zero_addr: ContractAddress = 0.try_into().unwrap();

                let calls_span = calls.span();
                let mut i: u32 = 0;
                loop {
                    if i >= calls_span.len() {
                        break;
                    }
                    let call = calls_span.at(i);

                    // Enforce allowed_contract policy (zero = any contract allowed)
                    if policy.allowed_contract != zero_addr {
                        assert(
                            *call.to == policy.allowed_contract,
                            'Session: contract not allowed',
                        );
                    }

                    // Enforce spending limit for all ERC-20 value-moving selectors.
                    // All share calldata layout: [address, amount_low, amount_high].
                    if is_spending_selector(*call.selector) {
                        let calldata = *call.calldata;
                        assert(calldata.len() >= 3, 'Session: bad transfer data');

                        let amount_low: u128 = (*calldata.at(1))
                            .try_into()
                            .expect('bad amount_low');
                        let amount_high: u128 = (*calldata.at(2))
                            .try_into()
                            .expect('bad amount_high');
                        let amount = u256 { low: amount_low, high: amount_high };

                        // call.to is the token contract address
                        self
                            .session_keys
                            .check_and_update_spending(session_key, *call.to, amount);
                    }

                    i += 1;
                };
            }
            // Owner path (signature.len() == 2): no restrictions

            execute_calls(calls.span())
        }

        /// Verifies a signature against the owner's public key.
        /// Used by DApps (e.g., Sign In with Starknet). Does NOT cover
        /// session key signatures — those are only valid in transaction context.
        #[external(v0)]
        fn is_valid_signature(
            self: @ContractState, hash: felt252, signature: Array<felt252>,
        ) -> felt252 {
            if self.account._is_valid_signature(hash, signature.span()) {
                starknet::VALIDATED
            } else {
                0
            }
        }

        /// camelCase alias of `is_valid_signature` (SNIP-6 compatibility).
        #[external(v0)]
        fn isValidSignature(
            self: @ContractState, hash: felt252, signature: Array<felt252>,
        ) -> felt252 {
            Self::is_valid_signature(self, hash, signature)
        }
    }

    // ─── Agent Account Interface ──────────────────────────────────────

    #[abi(embed_v0)]
    impl AgentAccountImpl of IAgentAccount<ContractState> {
        fn register_session_key(ref self: ContractState, key: felt252, policy: SessionPolicy) {
            self.account.assert_only_self();

            // Prevent double-registration: key must not already be in the active list.
            assert(self.session_key_index.entry(key).read() == 0, 'Key already registered');

            // Register in component (also clears stale spending state)
            self.session_keys.register(key, policy);

            // Track in compact active-key list
            let count = self.session_key_count.read();
            self.active_session_keys.entry(count).write(key);
            self.session_key_index.entry(key).write(count + 1); // 1-based index
            self.session_key_count.write(count + 1);
        }

        fn revoke_session_key(ref self: ContractState, key: felt252) {
            self.account.assert_only_self();

            // Swap-and-remove from active tracking
            let idx_plus_1 = self.session_key_index.entry(key).read();
            assert(idx_plus_1 > 0, 'Key not in active list');

            let idx = idx_plus_1 - 1;
            let count = self.session_key_count.read();
            let last_idx = count - 1;

            if idx != last_idx {
                // Swap with last element
                let last_key = self.active_session_keys.entry(last_idx).read();
                self.active_session_keys.entry(idx).write(last_key);
                self.session_key_index.entry(last_key).write(idx + 1);
            }

            // Clear removed key's tracking and decrement count
            self.session_key_index.entry(key).write(0);
            self.session_key_count.write(count - 1);

            // Revoke in component
            self.session_keys.revoke(key);
        }

        fn get_session_key_policy(self: @ContractState, key: felt252) -> SessionPolicy {
            self.session_keys.get_policy(key)
        }

        fn is_session_key_valid(self: @ContractState, key: felt252) -> bool {
            self.session_keys.is_valid(key)
        }

        fn validate_session_key_call(
            self: @ContractState, key: felt252, target: ContractAddress,
        ) -> bool {
            self.session_keys.validate_call(key, target)
        }

        fn use_session_key_allowance(
            ref self: ContractState, key: felt252, token: ContractAddress, amount: u256,
        ) {
            self.account.assert_only_self();
            self.session_keys.check_and_update_spending(key, token, amount);
        }

        fn emergency_revoke_all(ref self: ContractState) {
            self.account.assert_only_self();

            let count = self.session_key_count.read();
            let mut i: u32 = 0;

            loop {
                if i >= count {
                    break;
                }
                let key = self.active_session_keys.entry(i).read();
                self.session_keys.revoke(key);
                self.session_key_index.entry(key).write(0);
                i += 1;
            };

            self.session_key_count.write(0);

            self.emit(EmergencyRevoked { timestamp: get_block_timestamp() });
        }

        fn get_active_session_key_count(self: @ContractState) -> u32 {
            self.session_key_count.read()
        }

        fn set_agent_id(ref self: ContractState, registry: ContractAddress, agent_id: u256) {
            self.account.assert_only_self();
            self.agent_registry.write(registry);
            self.agent_id.write(agent_id);

            self.emit(AgentIdSet { registry, agent_id });
        }

        fn init_agent_id_from_factory(
            ref self: ContractState,
            registry: ContractAddress,
            agent_id: u256,
        ) {
            // Only the factory that deployed this account may call this.
            let factory = self.factory.read();
            assert(get_caller_address() == factory, 'Only factory');
            // Only allow initialization once (agent_id defaults to 0).
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(self.agent_registry.read() == zero, 'Already initialized');

            self.agent_registry.write(registry);
            self.agent_id.write(agent_id);

            self.emit(AgentIdSet { registry, agent_id });
        }

        fn get_agent_id(self: @ContractState) -> (ContractAddress, u256) {
            (self.agent_registry.read(), self.agent_id.read())
        }

        // ─── Timelocked Upgrade ──────────────────────────────────────────

        fn schedule_upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.account.assert_only_self();
            let zero_class: ClassHash = 0.try_into().unwrap();
            assert(new_class_hash != zero_class, 'Zero class hash');
            assert(self.pending_upgrade.read() == zero_class, 'Upgrade already pending');

            let now = get_block_timestamp();
            let delay = self.upgrade_delay.read();
            self.pending_upgrade.write(new_class_hash);
            self.upgrade_scheduled_at.write(now);

            self
                .emit(
                    UpgradeScheduled {
                        new_class_hash, scheduled_at: now, executable_after: now + delay,
                    },
                );
        }

        fn execute_upgrade(ref self: ContractState) {
            self.account.assert_only_self();
            let zero_class: ClassHash = 0.try_into().unwrap();
            let pending = self.pending_upgrade.read();
            assert(pending != zero_class, 'No pending upgrade');

            let scheduled_at = self.upgrade_scheduled_at.read();
            let delay = self.upgrade_delay.read();
            let now = get_block_timestamp();
            assert(now >= scheduled_at + delay, 'Timelock not expired');

            // Clear pending state before syscall
            self.pending_upgrade.write(zero_class);
            self.upgrade_scheduled_at.write(0);

            starknet::syscalls::replace_class_syscall(pending).unwrap_syscall();

            self.emit(UpgradeExecuted { new_class_hash: pending });
        }

        fn cancel_upgrade(ref self: ContractState) {
            self.account.assert_only_self();
            let zero_class: ClassHash = 0.try_into().unwrap();
            let pending = self.pending_upgrade.read();
            assert(pending != zero_class, 'No pending upgrade');

            self.pending_upgrade.write(zero_class);
            self.upgrade_scheduled_at.write(0);

            self.emit(UpgradeCancelled { class_hash: pending });
        }

        fn get_upgrade_info(self: @ContractState) -> (ClassHash, u64, u64, u64) {
            (
                self.pending_upgrade.read(),
                self.upgrade_scheduled_at.read(),
                self.upgrade_delay.read(),
                get_block_timestamp(),
            )
        }

        fn set_upgrade_delay(ref self: ContractState, new_delay: u64) {
            self.account.assert_only_self();
            assert(new_delay >= MIN_UPGRADE_DELAY, 'Upgrade delay too small');
            let old_delay = self.upgrade_delay.read();
            self.upgrade_delay.write(new_delay);

            self.emit(UpgradeDelayUpdated { old_delay, new_delay });
        }
    }
}
