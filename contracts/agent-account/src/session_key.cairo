use super::interfaces::SessionPolicy;

#[starknet::component]
pub mod SessionKeyComponent {
    use starknet::{ContractAddress, get_block_timestamp};
    use starknet::storage::*;
    use super::SessionPolicy;

    #[storage]
    pub struct Storage {
        session_keys: Map<felt252, SessionPolicy>,
        session_key_active: Map<felt252, bool>,
        spending_used: Map<(felt252, ContractAddress), u256>,
        spending_period_start: Map<(felt252, ContractAddress), u64>,
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
        fn validate_call(
            self: @ComponentState<TContractState>,
            key: felt252,
            target: ContractAddress,
        ) -> bool;
        fn check_and_update_spending(
            ref self: ComponentState<TContractState>,
            key: felt252,
            token: ContractAddress,
            amount: u256
        );
        fn revoke_all(ref self: ComponentState<TContractState>, keys: Span<felt252>);
    }

    pub impl SessionKeyImpl<
        TContractState, +HasComponent<TContractState>
    > of SessionKeyTrait<TContractState> {
        fn register(
            ref self: ComponentState<TContractState>,
            key: felt252,
            policy: SessionPolicy
        ) {
            assert(policy.valid_until > policy.valid_after, 'Invalid time range');
            assert(policy.valid_until > get_block_timestamp(), 'Already expired');

            self.session_keys.entry(key).write(policy);
            self.session_key_active.entry(key).write(true);

            // Clear any stale spending state from a previous lifecycle of this key
            self.spending_used.entry((key, policy.spending_token)).write(0);
            self.spending_period_start.entry((key, policy.spending_token)).write(0);

            self.emit(SessionKeyRegistered {
                key,
                valid_after: policy.valid_after,
                valid_until: policy.valid_until,
            });
        }

        fn revoke(ref self: ComponentState<TContractState>, key: felt252) {
            self.session_key_active.entry(key).write(false);
            self.emit(SessionKeyRevoked { key });
        }

        fn get_policy(self: @ComponentState<TContractState>, key: felt252) -> SessionPolicy {
            self.session_keys.entry(key).read()
        }

        fn is_valid(self: @ComponentState<TContractState>, key: felt252) -> bool {
            if !self.session_key_active.entry(key).read() {
                return false;
            }

            let policy = self.session_keys.entry(key).read();
            let now = get_block_timestamp();

            now >= policy.valid_after && now <= policy.valid_until
        }

        /// Validates that a session key is active, within its time window,
        /// and that the target contract is allowed by the key's policy.
        /// Returns false if any check fails.
        fn validate_call(
            self: @ComponentState<TContractState>,
            key: felt252,
            target: ContractAddress,
        ) -> bool {
            // Check key is active and in time window
            if !self.is_valid(key) {
                return false;
            }

            let policy = self.session_keys.entry(key).read();

            // allowed_contract == zero means any contract is allowed
            let zero_addr: ContractAddress = 0.try_into().unwrap();
            if policy.allowed_contract != zero_addr && policy.allowed_contract != target {
                return false;
            }

            true
        }

        /// Debits the session key's spending allowance.
        /// Enforces: key validity (active + time window), token match, and
        /// cumulative spend within the 24h period limit.
        fn check_and_update_spending(
            ref self: ComponentState<TContractState>,
            key: felt252,
            token: ContractAddress,
            amount: u256
        ) {
            // Full validity check: active flag AND time window
            assert(self.is_valid(key), 'Session key not valid');

            let policy = self.session_keys.entry(key).read();

            // Enforce token matches the policy's configured spending token
            assert(token == policy.spending_token, 'Wrong spending token');

            let now = get_block_timestamp();

            // Reset if 24h period has elapsed.
            // Uses addition instead of `period_start == 0` guard to avoid
            // perpetual resets when now == 0.
            let period_start = self.spending_period_start.entry((key, token)).read();
            if period_start + 86400 <= now {
                self.spending_used.entry((key, token)).write(0);
                self.spending_period_start.entry((key, token)).write(now);
            }

            // Check limit
            let used = self.spending_used.entry((key, token)).read();
            assert(used + amount <= policy.spending_limit, 'Spending limit exceeded');

            // Update
            self.spending_used.entry((key, token)).write(used + amount);
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
