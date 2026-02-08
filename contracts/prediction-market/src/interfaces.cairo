use starknet::ContractAddress;

#[starknet::interface]
pub trait IPredictionMarket<TState> {
    /// Place a bet on the given outcome.
    fn bet(ref self: TState, outcome: u8, amount: u256);

    /// Resolve the market with the winning outcome. Only callable by oracle after resolution_time.
    fn resolve(ref self: TState, winning_outcome: u8);

    /// Claim winnings after market is resolved.
    fn claim(ref self: TState) -> u256;

    /// Returns the pool size for each outcome: Array<(outcome_id, pool_amount)>.
    fn get_pools(self: @TState) -> Array<(u8, u256)>;

    /// Returns the implied probability for each outcome scaled to 1e18.
    fn get_implied_probs(self: @TState) -> Array<(u8, u256)>;

    /// Returns the total pool across all outcomes.
    fn get_total_pool(self: @TState) -> u256;

    /// Returns a user's bet amount for a given outcome.
    fn get_bet(self: @TState, user: ContractAddress, outcome: u8) -> u256;

    /// Returns market status: 0=OPEN, 1=CLOSED, 2=RESOLVED, 3=SETTLED.
    fn get_status(self: @TState) -> u8;

    /// Returns the winning outcome (only valid after resolution).
    fn get_winning_outcome(self: @TState) -> u8;

    /// Returns market metadata.
    fn get_market_info(self: @TState) -> (felt252, u64, ContractAddress, ContractAddress, u16);
}

#[starknet::interface]
pub trait IMarketFactory<TState> {
    /// Create a new prediction market. Returns (market_address, market_id).
    fn create_market(
        ref self: TState,
        question_hash: felt252,
        resolution_time: u64,
        oracle: ContractAddress,
        collateral_token: ContractAddress,
        fee_bps: u16,
    ) -> (ContractAddress, u256);

    /// Get market address by id.
    fn get_market(self: @TState, id: u256) -> ContractAddress;

    /// Get total number of markets created.
    fn get_market_count(self: @TState) -> u256;
}

#[starknet::interface]
pub trait IAccuracyTracker<TState> {
    /// Record a prediction for a market. predicted_prob is scaled 0..1e18.
    fn record_prediction(ref self: TState, market_id: u256, predicted_prob: u256);

    /// Finalize a market with actual outcome (0 or 1). Computes Brier scores.
    fn finalize_market(ref self: TState, market_id: u256, actual_outcome: u8);

    /// Get an agent's Brier score: (cumulative_score * 1e18, prediction_count).
    fn get_brier_score(self: @TState, agent: ContractAddress) -> (u256, u64);

    /// Get a specific prediction for (agent, market_id).
    fn get_prediction(self: @TState, agent: ContractAddress, market_id: u256) -> u256;

    /// Get number of predictors for a given market.
    fn get_market_predictor_count(self: @TState, market_id: u256) -> u64;

    /// Get predictor address by index for a given market.
    fn get_market_predictor(self: @TState, market_id: u256, index: u64) -> ContractAddress;

    /// Get reputation-weighted probability for a market. Returns weighted aggregate scaled 1e18.
    fn get_weighted_probability(self: @TState, market_id: u256) -> u256;

    /// Returns whether a market has been finalized.
    fn is_finalized(self: @TState, market_id: u256) -> bool;
}

#[starknet::interface]
pub trait IERC20<TState> {
    fn transfer(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
}
