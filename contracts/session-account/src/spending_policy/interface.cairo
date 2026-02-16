/// Spending policy interface for session key per-token spending limits.
///
/// This optional extension adds per-call and rolling-window spending caps
/// on ERC-20 operations performed by session keys.
///
/// Ported from chipi-pay/sessions-smart-contract v33 (commit 5f8674c).
/// Credit: @chipi-pay team for the original implementation.

use starknet::ContractAddress;

/// Stored per-(session_key, token) spending policy.
#[derive(Drop, Copy, Serde, starknet::Store)]
pub struct SpendingPolicy {
    /// Maximum amount a single call can spend.
    pub max_per_call: u256,
    /// Maximum cumulative amount within the current time window.
    pub max_per_window: u256,
    /// Duration of the rolling window in seconds (e.g. 86400 for 24h).
    pub window_seconds: u64,
    /// Amount spent in the current window so far.
    pub spent_in_window: u256,
    /// Timestamp when the current window started.
    /// Invariant: window_start == 0 and spent_in_window == 0 means uninitialized.
    /// On first spend, window_start is set to current block timestamp.
    /// Window resets only when now > window_start + window_seconds.
    pub window_start: u64,
}

/// External interface for managing per-token spending policies.
#[starknet::interface]
pub trait ISessionSpendingPolicy<TContractState> {
    fn set_spending_policy(
        ref self: TContractState,
        session_key: felt252,
        token: ContractAddress,
        max_per_call: u256,
        max_per_window: u256,
        window_seconds: u64,
    );
    fn get_spending_policy(
        self: @TContractState,
        session_key: felt252,
        token: ContractAddress,
    ) -> SpendingPolicy;
    fn remove_spending_policy(
        ref self: TContractState,
        session_key: felt252,
        token: ContractAddress,
    );
}

/// Well-known ERC-20 selectors that represent spending operations.
/// Matches the 4 selectors tracked by starknet-agentic.
pub const TRANSFER_SELECTOR: felt252 = selector!("transfer");
pub const APPROVE_SELECTOR: felt252 = selector!("approve");
pub const INCREASE_ALLOWANCE_SELECTOR: felt252 = selector!("increase_allowance");
pub const INCREASE_ALLOWANCE_CAMEL_SELECTOR: felt252 = selector!("increaseAllowance");
