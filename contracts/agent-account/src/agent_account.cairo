#[starknet::contract(account)]
pub mod AgentAccount {
    use starknet::{ContractAddress, get_caller_address, get_tx_info, get_block_timestamp};
    use openzeppelin::account::AccountComponent;
    use openzeppelin::account::interface::{IPublicKey, IPublicKeyCamel};
    use openzeppelin::introspection::src5::SRC5Component;
    use super::super::interfaces::{IAgentAccount, SessionPolicy};
    use super::super::session_key::SessionKeyComponent;

    component!(path: AccountComponent, storage: account, event: AccountEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: SessionKeyComponent, storage: session_keys, event: SessionKeyEvent);

    #[abi(embed_v0)]
    impl AccountImpl = AccountComponent::AccountImpl<ContractState>;

    #[abi(embed_v0)]
    impl PublicKeyImpl = AccountComponent::PublicKeyImpl<ContractState>;

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
        active_session_keys: LegacyMap<u32, felt252>,
        session_key_count: u32,
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
        self.account._public_key.write(public_key);
    }

    #[abi(embed_v0)]
    impl AgentAccountImpl of IAgentAccount<ContractState> {
        fn register_session_key(ref self: ContractState, key: felt252, policy: SessionPolicy) {
            self.account.assert_only_self();

            // Register in component
            self.session_keys.register(key, policy);

            // Track for emergency revoke
            let count = self.session_key_count.read();
            self.active_session_keys.write(count, key);
            self.session_key_count.write(count + 1);
        }

        fn revoke_session_key(ref self: ContractState, key: felt252) {
            self.account.assert_only_self();
            self.session_keys.revoke(key);
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
            self.account.assert_only_self();
            // Implementation: update policy for active keys if needed
            // For now, spending limits are set per session key in policy
        }

        fn emergency_revoke_all(ref self: ContractState) {
            self.account.assert_only_self();

            // Collect all active keys
            let count = self.session_key_count.read();
            let mut keys: Array<felt252> = ArrayTrait::new();
            let mut i: u32 = 0;

            loop {
                if i >= count {
                    break;
                }
                keys.append(self.active_session_keys.read(i));
                i += 1;
            };

            // Revoke all
            self.session_keys.revoke_all(keys.span());

            self.emit(EmergencyRevoked {
                timestamp: get_block_timestamp()
            });
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
