use starknet::ContractAddress;
use super::interfaces::SessionPolicy;

#[starknet::component]
pub mod SessionKeyComponent {
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use super::SessionPolicy;

    #[storage]
    struct Storage {
        session_keys: LegacyMap<felt252, SessionPolicy>,
        session_key_active: LegacyMap<felt252, bool>,
        spending_used: LegacyMap<(felt252, ContractAddress), u256>,
        spending_period_start: LegacyMap<(felt252, ContractAddress), u64>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        SessionKeyRegistered: SessionKeyRegistered,
        SessionKeyRevoked: SessionKeyRevoked,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SessionKeyRegistered {
        pub key: felt252,
        pub valid_after: u64,
        pub valid_until: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SessionKeyRevoked {
        pub key: felt252,
    }

    pub trait SessionKeyTrait<TContractState> {
        fn register(
            ref self: ComponentState<TContractState>,
            key: felt252,
            policy: SessionPolicy
        );
        fn revoke(ref self: ComponentState<TContractState>, key: felt252);
        fn get_policy(self: @ComponentState<TContractState>, key: felt252) -> SessionPolicy;
        fn is_valid(self: @ComponentState<TContractState>, key: felt252) -> bool;
        fn check_and_update_spending(
            ref self: ComponentState<TContractState>,
            key: felt252,
            token: ContractAddress,
            amount: u256
        );
        fn revoke_all(ref self: ComponentState<TContractState>, keys: Span<felt252>);
    }

    impl SessionKeyImpl<
        TContractState, +HasComponent<TContractState>
    > of SessionKeyTrait<TContractState> {
        fn register(
            ref self: ComponentState<TContractState>,
            key: felt252,
            policy: SessionPolicy
        ) {
            assert(policy.valid_until > policy.valid_after, 'Invalid time range');
            assert(policy.valid_until > get_block_timestamp(), 'Already expired');

            self.session_keys.write(key, policy);
            self.session_key_active.write(key, true);

            self.emit(SessionKeyRegistered {
                key,
                valid_after: policy.valid_after,
                valid_until: policy.valid_until,
            });
        }

        fn revoke(ref self: ComponentState<TContractState>, key: felt252) {
            self.session_key_active.write(key, false);
            self.emit(SessionKeyRevoked { key });
        }

        fn get_policy(self: @ComponentState<TContractState>, key: felt252) -> SessionPolicy {
            self.session_keys.read(key)
        }

        fn is_valid(self: @ComponentState<TContractState>, key: felt252) -> bool {
            if !self.session_key_active.read(key) {
                return false;
            }

            let policy = self.session_keys.read(key);
            let now = get_block_timestamp();

            now >= policy.valid_after && now <= policy.valid_until
        }

        fn check_and_update_spending(
            ref self: ComponentState<TContractState>,
            key: felt252,
            token: ContractAddress,
            amount: u256
        ) {
            let policy = self.session_keys.read(key);
            let now = get_block_timestamp();

            // Reset if new period
            let period_start = self.spending_period_start.read((key, token));
            if period_start == 0 || (now - period_start) >= 86400 { // 24h period
                self.spending_used.write((key, token), 0);
                self.spending_period_start.write((key, token), now);
            }

            // Check limit
            let used = self.spending_used.read((key, token));
            assert(used + amount <= policy.spending_limit, 'Spending limit exceeded');

            // Update
            self.spending_used.write((key, token), used + amount);
        }

        fn revoke_all(ref self: ComponentState<TContractState>, keys: Span<felt252>) {
            let mut i: u32 = 0;
            loop {
                if i >= keys.len() {
                    break;
                }
                self.revoke(*keys.at(i));
                i += 1;
            }
        }
    }
}
