#[starknet::contract]
pub mod FeeSmoothing {
    use ofs_fee_smoothing::interfaces::{IFeeSmoothing, IFeeSmoothingAdmin};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use starknet::storage::*;
    use openzeppelin::access::ownable::OwnableComponent;

    // ─── Constants ───────────────────────────────────────────────────────
    // Price scaling: 10^12 for fixed-point arithmetic
    const PRICE_SCALE: u128 = 1_000_000_000_000;
    
    // $10^{-9} STRK per L2gas minimum (protocol minimum)
    const MIN_BASE_FEE_STRK: u128 = 3_000_000_000;
    
    // TWAP window: 24 hours in seconds
    const TWAP_WINDOW_SECONDS: u64 = 86400;
    
    // Price freshness threshold: 1 hour
    const MAX_PRICE_AGE: u64 = 3600;
    
    // Maximum price deviation per update: 20%
    const MAX_PRICE_DEVIATION: u128 = 200_000_000_000;  // 20% of PRICE_SCALE
    
    // Valid price range: $0.01 to $100.00 (scaled)
    const MIN_VALID_PRICE: u128 = 10_000_000_000;   // $0.01
    const MAX_VALID_PRICE: u128 = 1_000_000_000_000_000; // $1000.00
    
    // Default smoothing: 80% TWAP, 20% spot
    const DEFAULT_SMOOTHING: u128 = 800_000_000_000;
    
    // ─── Components ─────────────────────────────────────────────────────
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    // ─── Storage ─────────────────────────────────────────────────────────
    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        
        // Price data (STRK/USD, scaled by PRICE_SCALE)
        current_price: u128,
        price_cumulative: u256,
        price_last_update: u64,
        twap_24h: u128,
        
        // Smoothing parameters
        smoothing_factor: u128,         // TWAP weight (0-1 scaled)
        target_usd_per_gas: u128,       // Target USD cost per L2gas (scaled)
        max_deviation_percent: u128,    // Max single-update deviation
        
        // Oracle integration
        oracle_address: ContractAddress,
        last_oracle_update: u64,
    }

    // ─── Events ──────────────────────────────────────────────────────────
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        PriceUpdated: PriceUpdated,
        FeeCalculated: FeeCalculated,
        ParametersUpdated: ParametersUpdated,
        EmergencyStop: EmergencyStop,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PriceUpdated {
        pub old_price: u128,
        pub new_price: u128,
        pub effective_price: u128,
        pub twap: u128,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct FeeCalculated {
        pub gas_amount: u128,
        pub fee_strk: u128,
        pub fee_usd: u128,
        pub price_used: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct ParametersUpdated {
        pub param_name: felt252,
        pub old_value: u128,
        pub new_value: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct EmergencyStop {
        pub reason: felt252,
        pub timestamp: u64,
    }

    // ─── Constructor ────────────────────────────────────────────────────
    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        oracle_address: ContractAddress,
        initial_price: u128,           // STRK/USD, scaled
        target_usd_per_gas: u128       // USD per L2gas, scaled
    ) {
        self.ownable.initializer(owner);
        self.oracle_address.write(oracle_address);
        self.target_usd_per_gas.write(target_usd_per_gas);
        self.smoothing_factor.write(DEFAULT_SMOOTHING);
        self.max_deviation_percent.write(MAX_PRICE_DEVIATION);
        
        // Initialize price
        let now = get_block_timestamp();
        self.current_price.write(initial_price);
        self.price_last_update.write(now);
        self.price_cumulative.write((initial_price.into() * now.into()));
        self.twap_24h.write(initial_price);
        self.last_oracle_update.write(now);
    }

    // ─── External Functions ─────────────────────────────────────────────
    #[abi(embed_v0)]
    impl FeeSmoothingImpl of IFeeSmoothing<ContractState> {
        
        /// Update price from oracle (only owner or oracle)
        fn update_price(ref self: ContractState, new_price: u128) {
            let caller = get_caller_address();
            let owner = self.ownable.owner();
            
            assert(
                caller == owner || caller == self.oracle_address.read(),
                'Unauthorized caller'
            );
            
            // Validate price range
            assert(new_price >= MIN_VALID_PRICE, 'Price below minimum');
            assert(new_price <= MAX_VALID_PRICE, 'Price above maximum');
            
            let old_price = self.current_price.read();
            let now = get_block_timestamp();
            let time_elapsed = now - self.price_last_update.read();
            
            // Check price deviation (prevent flash attacks)
            let max_change = (old_price * self.max_deviation_percent.read()) / PRICE_SCALE;
            assert(
                new_price >= old_price - max_change && new_price <= old_price + max_change,
                'Price deviation too large'
            );
            
            // Update cumulative for TWAP
            if time_elapsed > 0 {
                let cumulative = self.price_cumulative.read();
                let new_cumulative = cumulative + (old_price.into() * time_elapsed.into());
                self.price_cumulative.write(new_cumulative);
            }
            
            // Calculate new TWAP
            let twap = self.calculate_twap(now);
            
            // Apply smoothing
            let effective_price = self.calculate_effective_price(new_price, twap);
            
            // Update storage
            self.current_price.write(effective_price);
            self.price_last_update.write(now);
            self.twap_24h.write(twap);
            self.last_oracle_update.write(now);
            
            self.emit(PriceUpdated {
                old_price,
                new_price: effective_price,
                effective_price,
                twap,
                timestamp: now,
            });
        }

        /// Get fee in STRK for a given gas amount
        fn get_fee_strk(self: @ContractState, gas_amount: u128) -> u128 {
            // Check if price is stale
            assert(!self.is_price_stale(), 'Price data is stale');
            
            let price = self.get_effective_price();
            let target_usd = self.target_usd_per_gas.read();
            
            // fee_STRK = (target_USD / price_USD) * gas
            let fee_per_gas = (target_usd * PRICE_SCALE) / price;
            let total_fee = fee_per_gas * gas_amount / PRICE_SCALE;
            
            // Ensure minimum protocol fee
            let min_fee = gas_amount * MIN_BASE_FEE_STRK;
            if total_fee < min_fee {
                min_fee
            } else {
                total_fee
            }
        }

        /// Get fee in USD (predictable) for a given gas amount
        fn get_fee_usd(self: @ContractState, gas_amount: u128) -> u128 {
            // Check if price is stale
            assert(!self.is_price_stale(), 'Price data is stale');
            
            let target_usd = self.target_usd_per_gas.read();
            let adjusted_gas = self.adjust_gas_for_efficiency(gas_amount);
            target_usd * adjusted_gas
        }

        /// Get effective price (TWAP-blended)
        fn get_effective_price(self: @ContractState) -> u128 {
            let spot = self.current_price.read();
            let twap = self.twap_24h.read();
            let smoothing = self.smoothing_factor.read();
            
            // effective = TWAP * smoothing + spot * (1 - smoothing)
            let twap_part = (twap * smoothing) / PRICE_SCALE;
            let spot_part = (spot * (PRICE_SCALE - smoothing)) / PRICE_SCALE;
            
            twap_part + spot_part
        }

        /// Check if price data is stale
        fn is_price_stale(self: @ContractState) -> bool {
            let last_update = self.price_last_update.read();
            let now = get_block_timestamp();
            now - last_update > MAX_PRICE_AGE
        }

        /// Get current state snapshot
        fn get_state(self: @ContractState) -> (u128, u128, u128, u128, bool) {
            (
                self.current_price.read(),
                self.twap_24h.read(),
                self.target_usd_per_gas.read(),
                self.smoothing_factor.read(),
                self.is_price_stale()
            )
        }
    }

    // ─── Admin Functions ─────────────────────────────────────────────────
    #[abi(embed_v0)]
    impl FeeSmoothingAdminImpl of IFeeSmoothingAdmin<ContractState> {
        
        fn set_target_usd_per_gas(ref self: ContractState, new_target: u128) {
            self.ownable.assert_only_owner();
            let old = self.target_usd_per_gas.read();
            self.target_usd_per_gas.write(new_target);
            
            self.emit(ParametersUpdated {
                param_name: 'target_usd_per_gas',
                old_value: old,
                new_value: new_target,
            });
        }

        fn set_smoothing_factor(ref self: ContractState, new_smoothing: u128) {
            self.ownable.assert_only_owner();
            assert(new_smoothing <= PRICE_SCALE, 'Smoothing must be 0-1');
            let old = self.smoothing_factor.read();
            self.smoothing_factor.write(new_smoothing);
            
            self.emit(ParametersUpdated {
                param_name: 'smoothing_factor',
                old_value: old,
                new_value: new_smoothing,
            });
        }

        fn set_max_deviation(ref self: ContractState, new_max: u128) {
            self.ownable.assert_only_owner();
            assert(new_max <= PRICE_SCALE / 2, 'Max deviation too high');
            let old = self.max_deviation_percent.read();
            self.max_deviation_percent.write(new_max);
            
            self.emit(ParametersUpdated {
                param_name: 'max_deviation',
                old_value: old,
                new_value: new_max,
            });
        }

        /// Get current max deviation setting
        fn get_max_deviation_percent(self: @ContractState) -> u128 {
            self.max_deviation_percent.read()
        }

        fn emergency_stop(ref self: ContractState, reason: felt252) {
            self.ownable.assert_only_owner();
            
            // Set all params to safe defaults
            self.target_usd_per_gas.write(1_000_000_000_000); // $0.001/gas
            self.smoothing_factor.write(PRICE_SCALE); // 100% TWAP
            
            self.emit(EmergencyStop {
                reason,
                timestamp: get_block_timestamp(),
            });
        }
    }

    // ─── Internal Functions ─────────────────────────────────────────────
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        
        fn calculate_twap(self: @ContractState, now: u64) -> u128 {
            let last_time = self.price_last_update.read();
            let cumulative = self.price_cumulative.read();
            
            if now - last_time >= TWAP_WINDOW_SECONDS {
                // Full TWAP window available - use cumulative price
                // TWAP = cumulative / window
                let window = TWAP_WINDOW_SECONDS.into();
                let avg = cumulative / window;
                // Safe conversion with fallback
                match avg.try_into() {
                    Option::Some(price) => price,
                    Option::None(_) => self.current_price.read(),
                }
            } else {
                // Not enough time for full TWAP - use weighted average from last update
                // This is fallback behavior during warm-up
                self.current_price.read()
            }
        }
        
        fn calculate_effective_price(
            self: @ContractState,
            spot_price: u128,
            twap: u128
        ) -> u128 {
            let smoothing = self.smoothing_factor.read();
            let twap_part = (twap * smoothing) / PRICE_SCALE;
            let spot_part = (spot_price * (PRICE_SCALE - smoothing)) / PRICE_SCALE;
            twap_part + spot_part
        }
        
        fn adjust_gas_for_efficiency(
            self: @ContractState,
            gas_amount: u128
        ) -> u128 {
            // Future: adjust based on protocol efficiency improvements
            // For now, return as-is
            gas_amount
        }
    }
}
