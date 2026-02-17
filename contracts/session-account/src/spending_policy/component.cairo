/// Reusable spending policy component for session keys.
///
/// Provides per-(session_key, token) spending limits with per-call caps
/// and rolling-window cumulative caps. Designed to be embedded alongside
/// session key logic in account contracts.
///
/// Ported from chipi-pay/sessions-smart-contract v33 (commit 5f8674c).
/// Credit: @chipi-pay team for the original implementation.

#[starknet::component]
pub mod SpendingPolicyComponent {
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::get_block_timestamp;
    use starknet::account::Call;
    use crate::spending_policy::interface::{
        SpendingPolicy,
        TRANSFER_SELECTOR, APPROVE_SELECTOR,
        INCREASE_ALLOWANCE_SELECTOR, INCREASE_ALLOWANCE_CAMEL_SELECTOR,
    };

    // ----------------------------------------------------------------
    // Storage
    // ----------------------------------------------------------------

    #[storage]
    pub struct Storage {
        /// Spending policies keyed by (session_key, token_address).
        pub policies: Map<(felt252, ContractAddress), SpendingPolicy>,
    }

    // ----------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        SpendingPolicySet: SpendingPolicySet,
        SpendingPolicyRemoved: SpendingPolicyRemoved,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SpendingPolicySet {
        #[key]
        pub session_key: felt252,
        #[key]
        pub token: ContractAddress,
        pub max_per_call: u256,
        pub max_per_window: u256,
        pub window_seconds: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SpendingPolicyRemoved {
        #[key]
        pub session_key: felt252,
        #[key]
        pub token: ContractAddress,
    }

    // ----------------------------------------------------------------
    // Trait bound: embedding contract must provide owner check
    // ----------------------------------------------------------------

    pub trait HasAccountOwner<TContractState> {
        fn assert_only_self(self: @TContractState);
    }

    // ----------------------------------------------------------------
    // Internal implementation
    // ----------------------------------------------------------------

    #[generate_trait]
    pub impl InternalImpl<
        TContractState,
        +HasComponent<TContractState>,
        +HasAccountOwner<TContractState>,
        +Drop<TContractState>,
    > of InternalTrait<TContractState> {

        // ---------- policy management (owner-gated) ----------

        fn set_spending_policy(
            ref self: ComponentState<TContractState>,
            session_key: felt252,
            token: ContractAddress,
            max_per_call: u256,
            max_per_window: u256,
            window_seconds: u64,
        ) {
            let contract_state = self.get_contract();
            HasAccountOwner::assert_only_self(contract_state);

            let policy = SpendingPolicy {
                max_per_call,
                max_per_window,
                window_seconds,
                spent_in_window: 0,
                // Lazy-init window_start on first spend to guarantee a full window
                // from first use (prevents creation-time anchoring bias).
                window_start: 0,
            };
            self.policies.write((session_key, token), policy);

            self.emit(SpendingPolicySet {
                session_key, token, max_per_call, max_per_window, window_seconds,
            });
        }

        fn get_spending_policy(
            self: @ComponentState<TContractState>,
            session_key: felt252,
            token: ContractAddress,
        ) -> SpendingPolicy {
            self.policies.read((session_key, token))
        }

        fn remove_spending_policy(
            ref self: ComponentState<TContractState>,
            session_key: felt252,
            token: ContractAddress,
        ) {
            let contract_state = self.get_contract();
            HasAccountOwner::assert_only_self(contract_state);

            let empty = SpendingPolicy {
                max_per_call: 0,
                max_per_window: 0,
                window_seconds: 0,
                spent_in_window: 0,
                window_start: 0,
            };
            self.policies.write((session_key, token), empty);

            self.emit(SpendingPolicyRemoved { session_key, token });
        }

        // ---------- spending enforcement ----------

        /// Returns true if the given selector is a tracked ERC-20 spending operation.
        fn is_spending_selector(selector: felt252) -> bool {
            selector == TRANSFER_SELECTOR
                || selector == APPROVE_SELECTOR
                || selector == INCREASE_ALLOWANCE_SELECTOR
                || selector == INCREASE_ALLOWANCE_CAMEL_SELECTOR
        }

        /// Check and update spending for a batch of calls.
        /// Should be called from `__execute__` (not `__validate__`) because
        /// spending state mutation in validate would be reverted on execution failure.
        ///
        /// For each call with a spending selector targeting a token with a policy:
        /// 1. Extract u256 amount from calldata positions [1] and [2]
        /// 2. Check amount <= policy.max_per_call
        /// 3. Auto-reset window if now >= window_start + window_seconds
        /// 4. Check spent_in_window + amount <= policy.max_per_window
        /// 5. Update spent_in_window
        fn check_and_update_spending(
            ref self: ComponentState<TContractState>,
            session_key: felt252,
            calls: Span<Call>,
        ) {
            let now = get_block_timestamp();

            let mut i: u32 = 0;
            loop {
                if i >= calls.len() { break; }
                let call = calls.at(i);
                let sel = *call.selector;

                if Self::is_spending_selector(sel) {
                    let token: ContractAddress = *call.to;
                    let mut policy = self.policies.read((session_key, token));

                    // Only enforce if a policy exists (max_per_window > 0)
                    if policy.max_per_window > 0 {
                        // Extract u256 amount from calldata.
                        // ERC-20 transfer/approve: calldata = [recipient, amount_low, amount_high]
                        // increase_allowance: calldata = [spender, amount_low, amount_high]
                        assert(call.calldata.len() >= 3, 'Spending: calldata too short');
                        let amount_low: u128 = match (*call.calldata.at(1)).try_into() {
                            Option::Some(v) => v,
                            Option::None => { panic!("Spending: invalid amount"); },
                        };
                        let amount_high: u128 = match (*call.calldata.at(2)).try_into() {
                            Option::Some(v) => v,
                            Option::None => { panic!("Spending: invalid amount"); },
                        };
                        let amount: u256 = u256 { low: amount_low, high: amount_high };

                        // Check per-call limit
                        assert(amount <= policy.max_per_call, 'Spending: exceeds per-call');

                        // Lazy-init window anchor on first spend.
                        if policy.window_start == 0 && policy.spent_in_window == 0 {
                            policy.window_start = now;
                        }

                        // Auto-reset window if expired
                        if now > policy.window_start + policy.window_seconds.into() {
                            policy.spent_in_window = 0;
                            policy.window_start = now;
                        }

                        // Check cumulative window limit
                        assert(
                            policy.spent_in_window + amount <= policy.max_per_window,
                            'Spending: exceeds window limit'
                        );

                        // Update spent amount
                        policy.spent_in_window = policy.spent_in_window + amount;
                        self.policies.write((session_key, token), policy);
                    }
                }
                i += 1;
            };
        }
    }

    // ----------------------------------------------------------------
    // Public interface implementation
    // ----------------------------------------------------------------

    #[embeddable_as(SessionSpendingPolicyImpl)]
    impl SessionSpendingPolicy<
        TContractState,
        +HasComponent<TContractState>,
        +HasAccountOwner<TContractState>,
        +Drop<TContractState>,
    > of crate::spending_policy::interface::ISessionSpendingPolicy<ComponentState<TContractState>> {
        fn set_spending_policy(
            ref self: ComponentState<TContractState>,
            session_key: felt252,
            token: ContractAddress,
            max_per_call: u256,
            max_per_window: u256,
            window_seconds: u64,
        ) {
            InternalImpl::set_spending_policy(ref self, session_key, token, max_per_call, max_per_window, window_seconds);
        }

        fn get_spending_policy(
            self: @ComponentState<TContractState>,
            session_key: felt252,
            token: ContractAddress,
        ) -> SpendingPolicy {
            InternalImpl::get_spending_policy(self, session_key, token)
        }

        fn remove_spending_policy(
            ref self: ComponentState<TContractState>,
            session_key: felt252,
            token: ContractAddress,
        ) {
            InternalImpl::remove_spending_policy(ref self, session_key, token);
        }
    }
}
