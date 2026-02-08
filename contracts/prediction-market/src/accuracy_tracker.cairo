#[starknet::contract]
pub mod AccuracyTracker {
    use openzeppelin::access::ownable::OwnableComponent;
    use starknet::storage::*;
    use starknet::{ContractAddress, get_caller_address};

    // 1e18 scaling factor
    const SCALE: u256 = 1_000_000_000_000_000_000;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        // (agent_address, market_id) => predicted_probability scaled 0..1e18
        predictions: Map<(ContractAddress, u256), u256>,
        // (agent_address, market_id) => has_predicted
        has_predicted: Map<(ContractAddress, u256), bool>,
        // agent => cumulative sum of brier scores (each scaled 1e18)
        brier_cumulative: Map<ContractAddress, u256>,
        // agent => number of finalized predictions
        prediction_count: Map<ContractAddress, u64>,
        // market_id => list of predictors
        market_predictors: Map<u256, Vec<ContractAddress>>,
        // market_id => number of predictors
        market_predictor_count: Map<u256, u64>,
        // market_id => finalized
        finalized: Map<u256, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        PredictionRecorded: PredictionRecorded,
        MarketFinalized: MarketFinalized,
        BrierScoreUpdated: BrierScoreUpdated,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PredictionRecorded {
        #[key]
        pub agent: ContractAddress,
        #[key]
        pub market_id: u256,
        pub predicted_prob: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct MarketFinalized {
        #[key]
        pub market_id: u256,
        pub actual_outcome: u8,
        pub num_predictors: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct BrierScoreUpdated {
        #[key]
        pub agent: ContractAddress,
        pub brier_score: u256,
        pub new_cumulative: u256,
        pub new_count: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
    }

    #[abi(embed_v0)]
    impl AccuracyTrackerImpl of prediction_market::interfaces::IAccuracyTracker<ContractState> {
        fn record_prediction(ref self: ContractState, market_id: u256, predicted_prob: u256) {
            assert(predicted_prob <= SCALE, 'prob must be <= 1e18');
            assert(!self.finalized.entry(market_id).read(), 'market already finalized');

            let caller = get_caller_address();
            assert(!self.has_predicted.entry((caller, market_id)).read(), 'already predicted');

            self.predictions.entry((caller, market_id)).write(predicted_prob);
            self.has_predicted.entry((caller, market_id)).write(true);

            // Track predictors for this market
            let count = self.market_predictor_count.entry(market_id).read();
            self.market_predictors.entry(market_id).push(caller);
            self.market_predictor_count.entry(market_id).write(count + 1);

            self.emit(PredictionRecorded { agent: caller, market_id, predicted_prob });
        }

        fn finalize_market(ref self: ContractState, market_id: u256, actual_outcome: u8) {
            self.ownable.assert_only_owner();
            assert(!self.finalized.entry(market_id).read(), 'already finalized');
            assert(actual_outcome <= 1, 'invalid outcome');

            self.finalized.entry(market_id).write(true);

            // actual value is 1e18 if outcome=1, 0 if outcome=0
            let actual: u256 = if actual_outcome == 1 {
                SCALE
            } else {
                0
            };

            let num_predictors = self.market_predictor_count.entry(market_id).read();

            // Compute Brier score for each predictor
            let mut i: u64 = 0;
            while i < num_predictors {
                let agent = self.market_predictors.entry(market_id).at(i).read();
                let predicted = self.predictions.entry((agent, market_id)).read();

                // Brier score = (predicted - actual)^2 / SCALE
                let diff = if predicted > actual {
                    predicted - actual
                } else {
                    actual - predicted
                };
                // brier = diff^2 / SCALE (result is scaled 1e18)
                let brier = (diff * diff) / SCALE;

                // Update cumulative
                let prev_cumulative = self.brier_cumulative.entry(agent).read();
                let new_cumulative = prev_cumulative + brier;
                self.brier_cumulative.entry(agent).write(new_cumulative);

                let prev_count = self.prediction_count.entry(agent).read();
                let new_count = prev_count + 1;
                self.prediction_count.entry(agent).write(new_count);

                self.emit(BrierScoreUpdated {
                    agent,
                    brier_score: brier,
                    new_cumulative,
                    new_count,
                });

                i += 1;
            };

            self.emit(MarketFinalized {
                market_id, actual_outcome, num_predictors,
            });
        }

        fn get_brier_score(self: @ContractState, agent: ContractAddress) -> (u256, u64) {
            let cumulative = self.brier_cumulative.entry(agent).read();
            let count = self.prediction_count.entry(agent).read();
            (cumulative, count)
        }

        fn get_prediction(
            self: @ContractState, agent: ContractAddress, market_id: u256,
        ) -> u256 {
            self.predictions.entry((agent, market_id)).read()
        }

        fn get_market_predictor_count(self: @ContractState, market_id: u256) -> u64 {
            self.market_predictor_count.entry(market_id).read()
        }

        fn get_market_predictor(
            self: @ContractState, market_id: u256, index: u64,
        ) -> ContractAddress {
            self.market_predictors.entry(market_id).at(index).read()
        }

        fn get_weighted_probability(self: @ContractState, market_id: u256) -> u256 {
            let count = self.market_predictor_count.entry(market_id).read();
            if count == 0 {
                return SCALE / 2; // default 50%
            }

            let mut weighted_sum: u256 = 0;
            let mut weight_total: u256 = 0;
            let mut i: u64 = 0;

            while i < count {
                let agent = self.market_predictors.entry(market_id).at(i).read();
                let predicted = self.predictions.entry((agent, market_id)).read();
                let pred_count = self.prediction_count.entry(agent).read();

                // Weight = inverse of average Brier score. New agents get default weight.
                let weight = if pred_count == 0 {
                    SCALE // default weight for new agents
                } else {
                    let cumulative = self.brier_cumulative.entry(agent).read();
                    let avg_brier = cumulative / pred_count.into();
                    if avg_brier == 0 {
                        SCALE * 10 // perfect track record gets high weight
                    } else {
                        // weight = SCALE^2 / avg_brier (inverse proportional)
                        (SCALE * SCALE) / avg_brier
                    }
                };

                weighted_sum += weight * predicted / SCALE;
                weight_total += weight;

                i += 1;
            };

            if weight_total == 0 {
                return SCALE / 2;
            }

            (weighted_sum * SCALE) / weight_total
        }

        fn is_finalized(self: @ContractState, market_id: u256) -> bool {
            self.finalized.entry(market_id).read()
        }
    }
}
