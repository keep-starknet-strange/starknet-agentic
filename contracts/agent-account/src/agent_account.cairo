#[starknet::contract(account)]
pub mod AgentAccount {
    use starknet::{ContractAddress, get_block_timestamp};
    use starknet::storage::*;
    use openzeppelin::account::AccountComponent;
    use openzeppelin::introspection::src5::SRC5Component;
    use super::super::interfaces::{IAgentAccount, SessionPolicy};
    use super::super::session_key::SessionKeyComponent;

    component!(path: AccountComponent, storage: account, event: AccountEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: SessionKeyComponent, storage: session_keys, event: SessionKeyEvent);

    #[abi(embed_v0)]
    impl AccountMixinImpl = AccountComponent::AccountMixinImpl<ContractState>;

    impl AccountInternalImpl = AccountComponent::InternalImpl<ContractState>;
    impl SessionKeyInternalImpl = SessionKeyComponent::SessionKeyImpl<ContractState>;

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

    #[constructor]
    fn constructor(ref self: ContractState, public_key: felt252) {
        self.account.initializer(public_key);
    }

    #[abi(embed_v0)]
    impl AgentAccountImpl of IAgentAccount<ContractState> {
        fn register_session_key(ref self: ContractState, key: felt252, policy: SessionPolicy) {
            self.account.assert_only_self();

            // Register in component
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

        /// Validates a session key call against its policy constraints:
        /// - Key must be active and within its time window
        /// - Target contract must be allowed by the key's policy
        fn validate_session_key_call(
            self: @ContractState,
            key: felt252,
            target: ContractAddress,
        ) -> bool {
            self.session_keys.validate_call(key, target)
        }

        /// Debits the session key's spending allowance. Panics if the
        /// cumulative spend in the current 24h period exceeds the policy limit.
        fn use_session_key_allowance(
            ref self: ContractState,
            key: felt252,
            token: ContractAddress,
            amount: u256,
        ) {
            self.account.assert_only_self();
            self.session_keys.check_and_update_spending(key, token, amount);
        }

        /// Revokes ALL currently active session keys. Cost is bounded by the
        /// number of active keys, not total historical registrations.
        fn emergency_revoke_all(ref self: ContractState) {
            self.account.assert_only_self();

            let count = self.session_key_count.read();
            let mut i: u32 = 0;

            loop {
                if i >= count {
                    break;
                }
                let key = self.active_session_keys.entry(i).read();
                // Revoke in component
                self.session_keys.revoke(key);
                // Clear index mapping
                self.session_key_index.entry(key).write(0);
                i += 1;
            };

            // Reset counter — subsequent calls are O(0) until new keys registered
            self.session_key_count.write(0);

            self.emit(EmergencyRevoked {
                timestamp: get_block_timestamp()
            });
        }

        /// Returns the number of currently active session keys.
        fn get_active_session_key_count(self: @ContractState) -> u32 {
            self.session_key_count.read()
        }

        fn set_agent_id(ref self: ContractState, registry: ContractAddress, agent_id: u256) {
            self.account.assert_only_self();
            self.agent_registry.write(registry);
            self.agent_id.write(agent_id);

            self.emit(AgentIdSet { registry, agent_id });
        }

        fn get_agent_id(self: @ContractState) -> (ContractAddress, u256) {
            (self.agent_registry.read(), self.agent_id.read())
        }
    }
}
