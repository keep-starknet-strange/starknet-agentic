#[starknet::contract]
pub mod PredictionMarket {
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use starknet::storage::*;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use prediction_market::interfaces::{IERC20Dispatcher, IERC20DispatcherTrait};

    // Market states
    const STATUS_OPEN: u8 = 0;
    const STATUS_CLOSED: u8 = 1;
    const STATUS_RESOLVED: u8 = 2;

    // Scaling factor for probability (1e18)
    const SCALE: u256 = 1_000_000_000_000_000_000;

    component!(
        path: ReentrancyGuardComponent, storage: reentrancy_guard, event: ReentrancyGuardEvent,
    );
    impl ReentrancyGuardInternalImpl =
        ReentrancyGuardComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,
        question_hash: felt252,
        resolution_time: u64,
        oracle: ContractAddress,
        creator: ContractAddress,
        collateral_token: ContractAddress,
        fee_bps: u16,
        status: u8,
        winning_outcome: u8,
        total_pool: u256,
        // outcome_id => pool amount
        pools: Map<u8, u256>,
        // (user, outcome_id) => bet amount
        bets: Map<(ContractAddress, u8), u256>,
        // user => whether they claimed
        claimed: Map<ContractAddress, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        BetPlaced: BetPlaced,
        MarketResolved: MarketResolved,
        Claimed: Claimed,
    }

    #[derive(Drop, starknet::Event)]
    pub struct BetPlaced {
        #[key]
        pub user: ContractAddress,
        pub outcome: u8,
        pub amount: u256,
        pub new_pool_size: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct MarketResolved {
        pub winning_outcome: u8,
        pub total_pool: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Claimed {
        #[key]
        pub user: ContractAddress,
        pub payout: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        question_hash: felt252,
        resolution_time: u64,
        oracle: ContractAddress,
        creator: ContractAddress,
        collateral_token: ContractAddress,
        fee_bps: u16,
    ) {
        assert(fee_bps <= 1000, 'fee_bps too high'); // max 10%
        assert(resolution_time > get_block_timestamp(), 'resolution_time in past');

        self.question_hash.write(question_hash);
        self.resolution_time.write(resolution_time);
        self.oracle.write(oracle);
        self.creator.write(creator);
        self.collateral_token.write(collateral_token);
        self.fee_bps.write(fee_bps);
        self.status.write(STATUS_OPEN);
    }

    #[abi(embed_v0)]
    impl PredictionMarketImpl of prediction_market::interfaces::IPredictionMarket<ContractState> {
        fn bet(ref self: ContractState, outcome: u8, amount: u256) {
            self.reentrancy_guard.start();

            assert(self.status.read() == STATUS_OPEN, 'market not open');
            assert(get_block_timestamp() < self.resolution_time.read(), 'betting period ended');
            assert(outcome <= 1, 'invalid outcome');
            assert(amount > 0, 'amount must be positive');

            // Transfer collateral from caller
            let caller = get_caller_address();
            let token = IERC20Dispatcher {
                contract_address: self.collateral_token.read(),
            };
            let success = token.transfer_from(caller, starknet::get_contract_address(), amount);
            assert(success, 'transfer failed');

            // Update pools
            let current_pool = self.pools.entry(outcome).read();
            let new_pool = current_pool + amount;
            self.pools.entry(outcome).write(new_pool);

            // Update user bet
            let current_bet = self.bets.entry((caller, outcome)).read();
            self.bets.entry((caller, outcome)).write(current_bet + amount);

            // Update total
            let new_total = self.total_pool.read() + amount;
            self.total_pool.write(new_total);

            self.emit(BetPlaced { user: caller, outcome, amount, new_pool_size: new_pool });

            self.reentrancy_guard.end();
        }

        fn resolve(ref self: ContractState, winning_outcome: u8) {
            self.reentrancy_guard.start();

            let caller = get_caller_address();
            assert(caller == self.oracle.read(), 'only oracle can resolve');
            assert(self.status.read() == STATUS_OPEN, 'market not open');
            assert(
                get_block_timestamp() >= self.resolution_time.read(), 'resolution time not reached',
            );
            assert(winning_outcome <= 1, 'invalid outcome');

            self.status.write(STATUS_RESOLVED);
            self.winning_outcome.write(winning_outcome);

            self.emit(MarketResolved {
                winning_outcome,
                total_pool: self.total_pool.read(),
            });

            self.reentrancy_guard.end();
        }

        fn claim(ref self: ContractState) -> u256 {
            self.reentrancy_guard.start();

            assert(self.status.read() == STATUS_RESOLVED, 'market not resolved');

            let caller = get_caller_address();
            assert(!self.claimed.entry(caller).read(), 'already claimed');

            let winning = self.winning_outcome.read();
            let user_bet = self.bets.entry((caller, winning)).read();
            assert(user_bet > 0, 'no winning bet');

            let winning_pool = self.pools.entry(winning).read();
            let total = self.total_pool.read();
            let fee_bps: u256 = self.fee_bps.read().into();

            // payout = user_bet * total_pool * (10000 - fee_bps) / (winning_pool * 10000)
            let payout = (user_bet * total * (10000 - fee_bps)) / (winning_pool * 10000);

            self.claimed.entry(caller).write(true);

            // Transfer payout
            let token = IERC20Dispatcher {
                contract_address: self.collateral_token.read(),
            };
            let success = token.transfer(caller, payout);
            assert(success, 'transfer failed');

            self.emit(Claimed { user: caller, payout });

            self.reentrancy_guard.end();

            payout
        }

        fn get_pools(self: @ContractState) -> Array<(u8, u256)> {
            array![(0, self.pools.entry(0).read()), (1, self.pools.entry(1).read())]
        }

        fn get_implied_probs(self: @ContractState) -> Array<(u8, u256)> {
            let total = self.total_pool.read();
            if total == 0 {
                return array![(0, SCALE / 2), (1, SCALE / 2)];
            }
            let prob_0 = (self.pools.entry(0).read() * SCALE) / total;
            let prob_1 = (self.pools.entry(1).read() * SCALE) / total;
            array![(0, prob_0), (1, prob_1)]
        }

        fn get_total_pool(self: @ContractState) -> u256 {
            self.total_pool.read()
        }

        fn get_bet(self: @ContractState, user: ContractAddress, outcome: u8) -> u256 {
            self.bets.entry((user, outcome)).read()
        }

        fn get_status(self: @ContractState) -> u8 {
            self.status.read()
        }

        fn get_winning_outcome(self: @ContractState) -> u8 {
            self.winning_outcome.read()
        }

        fn get_market_info(
            self: @ContractState,
        ) -> (felt252, u64, ContractAddress, ContractAddress, u16) {
            (
                self.question_hash.read(),
                self.resolution_time.read(),
                self.oracle.read(),
                self.collateral_token.read(),
                self.fee_bps.read(),
            )
        }
    }
}
