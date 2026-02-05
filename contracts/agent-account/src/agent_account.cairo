#[starknet::contract(account)]
pub mod AgentAccount {
    use core::ecdsa::check_ecdsa_signature;
    use openzeppelin::account::interface::{IPublicKey, IPublicKeyCamel, ISRC6_ID};
    use openzeppelin::account::utils::is_tx_version_valid;
    use openzeppelin::introspection::src5::SRC5Component;
    use starknet::{
        ClassHash, ContractAddress, get_block_timestamp, get_caller_address,
        get_contract_address, get_tx_info,
        syscalls::{call_contract_syscall, replace_class_syscall}, SyscallResultTrait,
    };
    use starknet::storage::{
        StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess, Map,
    };
    use super::super::interfaces::{IAgentAccount, Call, SessionPolicy};
    use super::super::session_key::SessionKeyComponent;

    #[starknet::interface]
    trait IERC721OwnerOf<TContractState> {
        fn owner_of(self: @TContractState, token_id: u256) -> ContractAddress;
    }

    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: SessionKeyComponent, storage: session_keys, event: SessionKeyEvent);

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;

    impl SessionKeyInternalImpl = SessionKeyComponent::SessionKeyImpl<ContractState>;

    const VALIDATED: felt252 = 0x1;
    const INVALID: felt252 = 0x0;
    const DEFAULT_UPGRADE_DELAY_SECS: u64 = 300;
    const SELECTOR_TRANSFER: felt252 =
        0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e;
    const SELECTOR_TRANSFER_FROM: felt252 =
        0x41b033f4a31df8067c24d1e9b550a2ce75fd4a29e1147571aacb636ab7a21be;
    const SELECTOR_APPROVE: felt252 =
        0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c;
    const MAX_MULTICALL_SIZE: u32 = 20;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        session_keys: SessionKeyComponent::Storage,
        public_key: felt252,
        agent_registry: ContractAddress,
        agent_id: u256,
        active_session_keys: Map<u32, felt252>,
        session_key_count: u32,
        pending_upgrade: ClassHash,
        upgrade_scheduled_at: u64,
        upgrade_delay: u64,
        session_key_index: Map<felt252, u32>,
        session_key_in_list: Map<felt252, bool>,
        executing: bool,
        factory: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
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
        execute_after: u64,
        scheduler: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeExecuted {
        new_class_hash: ClassHash,
        executor: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeCancelled {
        cancelled_class_hash: ClassHash,
        canceller: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeDelayUpdated {
        old_delay: u64,
        new_delay: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, public_key: felt252, factory: ContractAddress) {
        self.public_key.write(public_key);
        self.upgrade_delay.write(DEFAULT_UPGRADE_DELAY_SECS);
        self.src5.register_interface(ISRC6_ID);
        self.executing.write(false);
        self.factory.write(factory);
    }

    #[abi(embed_v0)]
    impl AgentAccountImpl of IAgentAccount<ContractState> {
        fn __validate__(ref self: ContractState, calls: Array<Call>) -> felt252 {
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(get_caller_address() == zero, 'Account: invalid caller');
            assert(is_tx_version_valid(), 'Account: invalid tx version');

            let tx_info = get_tx_info().unbox();
            let tx_hash = tx_info.transaction_hash;
            let signature = tx_info.signature;

            if self._is_valid_owner_signature(tx_hash, signature) {
                return VALIDATED;
            }

            if self._is_valid_session_signature_readonly(tx_hash, signature, @calls) {
                return VALIDATED;
            }

            INVALID
        }

        fn __validate_declare__(ref self: ContractState, class_hash: felt252) -> felt252 {
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(get_caller_address() == zero, 'Account: invalid caller');
            assert(is_tx_version_valid(), 'Account: invalid tx version');

            let _ = class_hash;

            let tx_info = get_tx_info().unbox();
            let tx_hash = tx_info.transaction_hash;
            let signature = tx_info.signature;

            if self._is_valid_owner_signature(tx_hash, signature) {
                return VALIDATED;
            }

            INVALID
        }

        fn __validate_deploy__(
            ref self: ContractState,
            class_hash: felt252,
            contract_address_salt: felt252,
            public_key: felt252,
            factory: ContractAddress,
        ) -> felt252 {
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(get_caller_address() == zero, 'Account: invalid caller');
            assert(is_tx_version_valid(), 'Account: invalid tx version');

            let _ = class_hash;
            let _ = contract_address_salt;
            let _ = factory;

            let tx_info = get_tx_info().unbox();
            let tx_hash = tx_info.transaction_hash;
            let signature = tx_info.signature;

            if signature.len() != 2 {
                return INVALID;
            }

            if public_key == 0 {
                return INVALID;
            }

            let r = *signature.at(0);
            let s = *signature.at(1);
            if check_ecdsa_signature(tx_hash, public_key, r, s) {
                return VALIDATED;
            }

            INVALID
        }

        fn __execute__(ref self: ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
            let tx_info = get_tx_info().unbox();
            let signature = tx_info.signature;
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(get_caller_address() == zero, 'Account: invalid caller');
            assert(is_tx_version_valid(), 'Account: invalid tx version');
            assert(calls.len() <= MAX_MULTICALL_SIZE, 'Account: too many calls');
            assert(!self.executing.read(), 'Account: reentrant call');
            self.executing.write(true);

            if signature.len() == 3 {
                let session_key = *signature.at(0);
                if self.session_keys.is_valid(session_key) {
                    let policy = self.session_keys.get_policy(session_key);
                    self._enforce_spending(session_key, policy, @calls);
                }
            }

            let mut results: Array<Span<felt252>> = ArrayTrait::new();
            let mut i: u32 = 0;
            loop {
                if i >= calls.len() {
                    break;
                }
                let call = *calls.at(i);
                let result = call_contract_syscall(call.to, call.selector, call.calldata)
                    .unwrap_syscall();
                results.append(result);
                i += 1;
            };
            self.executing.write(false);
            results
        }

        fn is_valid_signature(
            self: @ContractState,
            hash: felt252,
            signature: Array<felt252>
        ) -> felt252 {
            if self._is_valid_owner_signature(hash, signature.span()) {
                VALIDATED
            } else {
                INVALID
            }
        }

        fn register_session_key(ref self: ContractState, key: felt252, policy: SessionPolicy) {
            self._assert_only_self();

            self.session_keys.register(key, policy);

            self._add_session_key_to_list(key);
        }

        fn revoke_session_key(ref self: ContractState, key: felt252) {
            self._assert_only_self();
            self.session_keys.revoke(key);
            self._remove_session_key_from_list(key);
        }

        fn get_session_key_policy(self: @ContractState, key: felt252) -> SessionPolicy {
            self.session_keys.get_policy(key)
        }

        fn is_session_key_valid(self: @ContractState, key: felt252) -> bool {
            self.session_keys.is_valid(key)
        }

        fn set_spending_limit(
            ref self: ContractState,
            token: ContractAddress,
            amount: u256,
            period: u64
        ) {
            self._assert_only_self();

            let count = self.session_key_count.read();
            let mut i: u32 = 0;
            loop {
                if i >= count {
                    break;
                }
                let key = self.active_session_keys.read(i);
                if self.session_keys.is_active(key) {
                    let policy = self.session_keys.get_policy(key);
                    if policy.spending_token == token {
                        let updated_policy = SessionPolicy {
                            valid_after: policy.valid_after,
                            valid_until: policy.valid_until,
                            spending_limit: amount,
                            spending_token: policy.spending_token,
                            allowed_contract: policy.allowed_contract,
                            max_calls_per_tx: policy.max_calls_per_tx,
                            spending_period_secs: if period != 0 {
                                period
                            } else {
                                policy.spending_period_secs
                            },
                        };
                        self.session_keys.update_policy(key, updated_policy);
                    }
                }
                i += 1;
            };
        }

        fn emergency_revoke_all(ref self: ContractState) {
            self._assert_only_self();

            let count = self.session_key_count.read();
            let mut keys: Array<felt252> = ArrayTrait::new();
            let mut i: u32 = 0;

            loop {
                if i >= count {
                    break;
                }
                let key = self.active_session_keys.read(i);
                keys.append(key);
                self.session_key_in_list.write(key, false);
                self.session_key_index.write(key, 0);
                i += 1;
            };

            self.session_key_count.write(0);
            self.session_keys.revoke_all(keys.span());

            self.emit(EmergencyRevoked {
                timestamp: get_block_timestamp()
            });
        }

        fn set_agent_id(ref self: ContractState, registry: ContractAddress, agent_id: u256) {
            self._assert_only_self();

            let zero: ContractAddress = 0.try_into().unwrap();
            assert(registry != zero, 'Invalid registry');
            let registry_dispatcher = IERC721OwnerOfDispatcher { contract_address: registry };
            let owner = registry_dispatcher.owner_of(agent_id);
            assert(owner == get_contract_address(), 'Agent ID not owned');

            self.agent_registry.write(registry);
            self.agent_id.write(agent_id);

            self.emit(AgentIdSet { registry, agent_id });
        }

        fn init_agent_id_from_factory(
            ref self: ContractState,
            registry: ContractAddress,
            agent_id: u256,
        ) {
            let caller = get_caller_address();
            assert(caller == self.factory.read(), 'Only factory');

            let zero: ContractAddress = 0.try_into().unwrap();
            assert(self.agent_registry.read() == zero, 'Agent ID already set');
            assert(registry != zero, 'Invalid registry');

            let registry_dispatcher = IERC721OwnerOfDispatcher { contract_address: registry };
            let owner = registry_dispatcher.owner_of(agent_id);
            assert(owner == get_contract_address(), 'Agent ID not owned');

            self.agent_registry.write(registry);
            self.agent_id.write(agent_id);

            self.emit(AgentIdSet { registry, agent_id });
        }

        fn get_agent_id(self: @ContractState) -> (ContractAddress, u256) {
            (self.agent_registry.read(), self.agent_id.read())
        }

        fn schedule_upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self._assert_only_self();

            let zero_class: ClassHash = 0.try_into().unwrap();
            let pending = self.pending_upgrade.read();
            assert(pending == zero_class, 'Upgrade already scheduled');
            assert(new_class_hash != zero_class, 'Invalid class hash');

            let now = get_block_timestamp();
            let delay = self.upgrade_delay.read();
            let execute_after = now + delay;

            self.pending_upgrade.write(new_class_hash);
            self.upgrade_scheduled_at.write(now);

            self.emit(UpgradeScheduled {
                new_class_hash,
                scheduled_at: now,
                execute_after,
                scheduler: get_caller_address(),
            });
        }

        fn execute_upgrade(ref self: ContractState) {
            self._assert_only_self();

            let zero_class: ClassHash = 0.try_into().unwrap();
            let pending = self.pending_upgrade.read();
            assert(pending != zero_class, 'No pending upgrade');

            let scheduled_at = self.upgrade_scheduled_at.read();
            let delay = self.upgrade_delay.read();
            let now = get_block_timestamp();
            assert(now >= scheduled_at + delay, 'Timelock not expired');

            self.pending_upgrade.write(zero_class);
            self.upgrade_scheduled_at.write(0);

            replace_class_syscall(pending).unwrap_syscall();

            self.emit(UpgradeExecuted {
                new_class_hash: pending,
                executor: get_caller_address(),
            });
        }

        fn cancel_upgrade(ref self: ContractState) {
            self._assert_only_self();

            let zero_class: ClassHash = 0.try_into().unwrap();
            let pending = self.pending_upgrade.read();
            assert(pending != zero_class, 'No pending upgrade');

            self.pending_upgrade.write(zero_class);
            self.upgrade_scheduled_at.write(0);

            self.emit(UpgradeCancelled {
                cancelled_class_hash: pending,
                canceller: get_caller_address(),
            });
        }

        fn get_upgrade_info(self: @ContractState) -> (ClassHash, u64, u64, u64) {
            let pending = self.pending_upgrade.read();
            let scheduled_at = self.upgrade_scheduled_at.read();
            let delay = self.upgrade_delay.read();
            let execute_after = if scheduled_at > 0 { scheduled_at + delay } else { 0 };
            (pending, scheduled_at, execute_after, delay)
        }

        fn set_upgrade_delay(ref self: ContractState, new_delay: u64) {
            self._assert_only_self();

            let zero_class: ClassHash = 0.try_into().unwrap();
            let pending = self.pending_upgrade.read();
            assert(pending == zero_class, 'Pending upgrade exists');
            assert(new_delay >= 300 && new_delay <= 2592000, 'Invalid delay range');

            let old_delay = self.upgrade_delay.read();
            self.upgrade_delay.write(new_delay);

            self.emit(UpgradeDelayUpdated {
                old_delay,
                new_delay,
            });
        }
    }

    #[abi(embed_v0)]
    impl PublicKeyImpl of IPublicKey<ContractState> {
        fn get_public_key(self: @ContractState) -> felt252 {
            self.public_key.read()
        }

        fn set_public_key(
            ref self: ContractState,
            new_public_key: felt252,
            signature: Span<felt252>,
        ) {
            self._assert_only_self();
            self._assert_new_key_proof(new_public_key, signature);
            self.public_key.write(new_public_key);
        }
    }

    #[abi(embed_v0)]
    impl PublicKeyCamelImpl of IPublicKeyCamel<ContractState> {
        fn getPublicKey(self: @ContractState) -> felt252 {
            self.public_key.read()
        }

        fn setPublicKey(
            ref self: ContractState,
            newPublicKey: felt252,
            signature: Span<felt252>,
        ) {
            self._assert_only_self();
            self._assert_new_key_proof(newPublicKey, signature);
            self.public_key.write(newPublicKey);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _assert_only_self(self: @ContractState) {
            assert(get_caller_address() == get_contract_address(), 'Only self');
        }

        fn _assert_new_key_proof(
            self: @ContractState,
            new_public_key: felt252,
            signature: Span<felt252>,
        ) {
            if signature.len() != 2 {
                assert(false, 'Account: invalid key proof');
            }

            let tx_hash = get_tx_info().unbox().transaction_hash;
            let r = *signature.at(0);
            let s = *signature.at(1);
            assert(
                check_ecdsa_signature(tx_hash, new_public_key, r, s),
                'Account: invalid key proof',
            );
        }

        fn _add_session_key_to_list(ref self: ContractState, key: felt252) {
            if self.session_key_in_list.read(key) {
                return;
            }

            match self._find_session_key_index(key) {
                Option::Some(index) => {
                    self.session_key_index.write(key, index);
                    self.session_key_in_list.write(key, true);
                    return;
                },
                Option::None => {},
            };

            let count = self.session_key_count.read();
            self.active_session_keys.write(count, key);
            self.session_key_index.write(key, count);
            self.session_key_in_list.write(key, true);
            self.session_key_count.write(count + 1);
        }

        fn _remove_session_key_from_list(ref self: ContractState, key: felt252) {
            let mut index = Option::None;
            if self.session_key_in_list.read(key) {
                index = Option::Some(self.session_key_index.read(key));
            } else {
                index = self._find_session_key_index(key);
                match index {
                    Option::Some(found) => {
                        self.session_key_index.write(key, found);
                        self.session_key_in_list.write(key, true);
                    },
                    Option::None => {},
                }
            }

            let index_value = match index {
                Option::Some(value) => value,
                Option::None => {
                    return;
                },
            };

            let count = self.session_key_count.read();
            if count == 0 {
                self.session_key_in_list.write(key, false);
                self.session_key_index.write(key, 0);
                return;
            }
            let last_index = count - 1;
            if index_value != last_index {
                let last_key = self.active_session_keys.read(last_index);
                self.active_session_keys.write(index_value, last_key);
                self.session_key_index.write(last_key, index_value);
            }

            self.session_key_count.write(last_index);
            self.session_key_in_list.write(key, false);
            self.session_key_index.write(key, 0);
        }

        fn _find_session_key_index(self: @ContractState, key: felt252) -> Option<u32> {
            let count = self.session_key_count.read();
            let mut i: u32 = 0;
            loop {
                if i >= count {
                    break;
                }
                if self.active_session_keys.read(i) == key {
                    return Option::Some(i);
                }
                i += 1;
            };

            Option::None
        }

        fn _is_valid_owner_signature(
            self: @ContractState,
            hash: felt252,
            signature: Span<felt252>,
        ) -> bool {
            if signature.len() != 2 {
                return false;
            }

            let r = *signature.at(0);
            let s = *signature.at(1);
            check_ecdsa_signature(hash, self.public_key.read(), r, s)
        }

        fn _is_valid_session_signature_readonly(
            self: @ContractState,
            hash: felt252,
            signature: Span<felt252>,
            calls: @Array<Call>,
        ) -> bool {
            if signature.len() != 3 {
                return false;
            }

            let session_key = *signature.at(0);
            let r = *signature.at(1);
            let s = *signature.at(2);

            if !self.session_keys.is_valid(session_key) {
                return false;
            }

            if !check_ecdsa_signature(hash, session_key, r, s) {
                return false;
            }

            let policy = self.session_keys.get_policy(session_key);

            let max_calls = policy.max_calls_per_tx;
            let calls_len: u32 = calls.len();
            if max_calls != 0 && calls_len > max_calls {
                return false;
            }

            let zero: ContractAddress = 0.try_into().unwrap();
            let self_address = get_contract_address();

            let mut i: u32 = 0;
            loop {
                if i >= calls.len() {
                    break;
                }
                let call = *calls.at(i);

                if call.to == self_address {
                    return false;
                }

                if policy.allowed_contract != zero && call.to != policy.allowed_contract {
                    return false;
                }

                if policy.spending_token != zero && call.to == policy.spending_token {
                    // Block approve on spending token -- approvals create open-ended
                    // allowances that bypass per-period spending limits.
                    if call.selector == SELECTOR_APPROVE {
                        return false;
                    }

                    let maybe_amount = Self::_extract_amount_from_calldata(
                        call.selector, call.calldata
                    );
                    match maybe_amount {
                        Option::Some(_) => {},
                        Option::None => {
                            return false;
                        },
                    }
                }

                i += 1;
            };
            true
        }

        // NOTE: SELECTOR_APPROVE is included here so _enforce_spending can
        // account for approve amounts. The readonly validator blocks approve
        // on the spending token before reaching this function.
        fn _extract_amount_from_calldata(
            selector: felt252,
            calldata: Span<felt252>,
        ) -> Option<u256> {
            let amount_offset: u32 = if selector == SELECTOR_TRANSFER
                || selector == SELECTOR_APPROVE {
                if calldata.len() < 3 {
                    return Option::None;
                }
                1_u32
            } else if selector == SELECTOR_TRANSFER_FROM {
                if calldata.len() < 4 {
                    return Option::None;
                }
                2_u32
            } else {
                return Option::None;
            };

            let amount_low_felt = *calldata.at(amount_offset);
            let amount_high_felt = *calldata.at(amount_offset + 1);

            let amount_low: u128 = match amount_low_felt.try_into() {
                Option::Some(value) => value,
                Option::None => {
                    return Option::None;
                },
            };
            let amount_high: u128 = match amount_high_felt.try_into() {
                Option::Some(value) => value,
                Option::None => {
                    return Option::None;
                },
            };

            Option::Some(u256 { low: amount_low, high: amount_high })
        }

        fn _enforce_spending(
            ref self: ContractState,
            session_key: felt252,
            policy: SessionPolicy,
            calls: @Array<Call>,
        ) {
            let zero: ContractAddress = 0.try_into().unwrap();
            let spending_token = policy.spending_token;

            if spending_token == zero {
                return;
            }

            let mut i: u32 = 0;
            loop {
                if i >= calls.len() {
                    break;
                }
                let call = *calls.at(i);

                if call.to == spending_token {
                    let maybe_amount = Self::_extract_amount_from_calldata(
                        call.selector, call.calldata
                    );
                    match maybe_amount {
                        Option::Some(amount) => {
                            self.session_keys.check_and_update_spending(
                                session_key,
                                spending_token,
                                amount
                            );
                        },
                        Option::None => {
                            assert(false, 'Unknown spending selector');
                        },
                    }
                }

                i += 1;
            };
        }
    }
}
