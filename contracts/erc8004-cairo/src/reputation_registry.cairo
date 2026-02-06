// ============================================
// ReputationRegistry
// (ERC-8004 in Cairo)
// On-chain feedback system matching Solidity implementation
//
// This contract implements the Reputation Registry as specified in ERC-8004 v1.0.
// It provides a standard interface for posting and fetching feedback signals with
// on-chain storage and aggregation capabilities.
//
// Key Features:
// - i128 value system with valueDecimals (0-18)
// - ByteArray tags for categorization
// - Optional endpoint field
// - Feedback revocation
// - Response appending by any party
// - On-chain aggregation for composability
// - Upgradeable via replace_class
// ============================================

#[starknet::contract]
pub mod ReputationRegistry {
    use core::dict::Felt252Dict;
    use core::num::traits::Zero;
    use erc8004::interfaces::identity_registry::{
        IIdentityRegistryDispatcher, IIdentityRegistryDispatcherTrait,
    };
    use erc8004::interfaces::reputation_registry::{
        FeedbackCore, FeedbackRevoked, IReputationRegistry, NewFeedback, ResponseAppended,
    };
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::upgrades::interface::IUpgradeable;
    use starknet::storage::*;
    use starknet::{ClassHash, ContractAddress, get_caller_address};

    // ============ Constants ============
    // Maximum absolute value for feedback (matches Solidity: 1e38)
    const MAX_ABS_VALUE: i128 = 100000000000000000000000000000000000000; // 1e38

    // ============ Component Declarations ============
    component!(
        path: ReentrancyGuardComponent, storage: reentrancy_guard, event: ReentrancyGuardEvent,
    );
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    // ReentrancyGuard Internal Implementation
    impl ReentrancyGuardInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    // Ownable
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    // Upgradeable Internal Implementation
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    // ============ Storage ============
    #[storage]
    pub struct Storage {
        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        // Reference to IdentityRegistry
        identity_registry: ContractAddress,
        // agentId => clientAddress => feedbackIndex => FeedbackCore (value, decimals, revoked)
        feedback_core: Map<(u256, ContractAddress, u64), FeedbackCore>,
        // agentId => clientAddress => feedbackIndex => tag1
        feedback_tag1: Map<(u256, ContractAddress, u64), ByteArray>,
        // agentId => clientAddress => feedbackIndex => tag2
        feedback_tag2: Map<(u256, ContractAddress, u64), ByteArray>,
        // agentId => clientAddress => last feedback index
        last_index: Map<(u256, ContractAddress), u64>,
        // agentId => Vec of client addresses
        clients: Map<u256, Vec<ContractAddress>>,
        // agentId => clientAddress => exists in clients array
        client_exists: Map<(u256, ContractAddress), bool>,
        // agentId => clientAddress => feedbackIndex => responder => response count
        response_count: Map<(u256, ContractAddress, u64, ContractAddress), u64>,
    }

    // ============ Events ============
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        NewFeedback: NewFeedback,
        FeedbackRevoked: FeedbackRevoked,
        ResponseAppended: ResponseAppended,
    }

    // ============ Constructor ============
    #[constructor]
    fn constructor(
        ref self: ContractState, owner: ContractAddress, identity_registry_address: ContractAddress,
    ) {
        // Validate address is not zero
        assert(!identity_registry_address.is_zero(), 'bad identity');

        // Initialize Ownable with owner
        self.ownable.initializer(owner);

        self.identity_registry.write(identity_registry_address);
    }

    // ============ Upgradeable Implementation ============
    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            // Only owner can upgrade
            self.ownable.assert_only_owner();
            // Replace class hash using Starknet native syscall
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    // ============ IReputationRegistry Implementation ============
    #[abi(embed_v0)]
    impl ReputationRegistryImpl of IReputationRegistry<ContractState> {
        fn give_feedback(
            ref self: ContractState,
            agent_id: u256,
            value: i128,
            value_decimals: u8,
            tag1: ByteArray,
            tag2: ByteArray,
            endpoint: ByteArray,
            feedback_uri: ByteArray,
            feedback_hash: u256,
        ) {
            // Validate value_decimals (0-18)
            assert(value_decimals <= 18, 'too many decimals');

            // Validate value range
            assert(value >= -MAX_ABS_VALUE && value <= MAX_ABS_VALUE, 'value too large');

            // Get identity registry dispatcher
            let identity_registry = IIdentityRegistryDispatcher {
                contract_address: self.identity_registry.read(),
            };

            let caller = get_caller_address();

            // SECURITY: Prevent self-feedback from owner and operators
            // Also reverts with "Agent does not exist" if agent doesn't exist
            assert(
                !identity_registry.is_authorized_or_owner(caller, agent_id),
                'Self-feedback not allowed',
            );

            // Increment and get current index (1-indexed)
            let current_index = self.last_index.entry((agent_id, caller)).read() + 1;

            // Store feedback core data
            self
                .feedback_core
                .entry((agent_id, caller, current_index))
                .write(FeedbackCore { value, value_decimals, is_revoked: false });

            // Store tags separately (ByteArray cannot be in struct with starknet::Store)
            self.feedback_tag1.entry((agent_id, caller, current_index)).write(tag1.clone());
            self.feedback_tag2.entry((agent_id, caller, current_index)).write(tag2.clone());

            // Update last index
            self.last_index.entry((agent_id, caller)).write(current_index);

            // Track new client
            if !self.client_exists.entry((agent_id, caller)).read() {
                self.clients.entry(agent_id).push(caller);
                self.client_exists.entry((agent_id, caller)).write(true);
            }

            self
                .emit(
                    Event::NewFeedback(
                        NewFeedback {
                            agent_id,
                            client_address: caller,
                            feedback_index: current_index,
                            value,
                            value_decimals,
                            indexed_tag1: tag1.clone(),
                            tag1,
                            tag2,
                            endpoint,
                            feedback_uri,
                            feedback_hash,
                        },
                    ),
                );
        }

        fn revoke_feedback(ref self: ContractState, agent_id: u256, feedback_index: u64) {
            assert(feedback_index > 0, 'index must be > 0');

            let caller = get_caller_address();
            let last_idx = self.last_index.entry((agent_id, caller)).read();

            assert(feedback_index <= last_idx, 'index out of bounds');

            let mut fb = self.feedback_core.entry((agent_id, caller, feedback_index)).read();
            assert(!fb.is_revoked, 'Already revoked');

            fb.is_revoked = true;
            self.feedback_core.entry((agent_id, caller, feedback_index)).write(fb);

            self
                .emit(
                    Event::FeedbackRevoked(
                        FeedbackRevoked { agent_id, client_address: caller, feedback_index },
                    ),
                );
        }

        fn append_response(
            ref self: ContractState,
            agent_id: u256,
            client_address: ContractAddress,
            feedback_index: u64,
            response_uri: ByteArray,
            response_hash: u256,
        ) {
            assert(feedback_index > 0, 'index must be > 0');
            assert(response_uri.len() > 0, 'Empty URI');

            let last_idx = self.last_index.entry((agent_id, client_address)).read();
            assert(feedback_index <= last_idx, 'index out of bounds');

            let caller = get_caller_address();

            // Increment response count for this responder
            let count = self
                .response_count
                .entry((agent_id, client_address, feedback_index, caller))
                .read();
            self
                .response_count
                .entry((agent_id, client_address, feedback_index, caller))
                .write(count + 1);

            self
                .emit(
                    Event::ResponseAppended(
                        ResponseAppended {
                            agent_id,
                            client_address,
                            feedback_index,
                            responder: caller,
                            response_uri,
                            response_hash,
                        },
                    ),
                );
        }

        fn get_summary(
            self: @ContractState,
            agent_id: u256,
            client_addresses: Span<ContractAddress>,
            tag1: ByteArray,
            tag2: ByteArray,
        ) -> (u64, i128, u8) {
            // clientAddresses required (matches Solidity)
            assert(client_addresses.len() > 0, 'clientAddresses required');

            // Track positive and negative sums separately (WAD = 18 decimals)
            let mut sum_positive: u256 = 0;
            let mut sum_negative: u256 = 0;
            let mut count: u64 = 0;

            // Track frequency of each valueDecimals (0-18)
            let mut decimal_counts: Felt252Dict<u64> = Default::default();

            let mut i: u32 = 0;
            while i < client_addresses.len() {
                let client = *client_addresses.at(i);
                let last_idx = self.last_index.entry((agent_id, client)).read();

                let mut j: u64 = 1;
                while j <= last_idx {
                    let fb = self.feedback_core.entry((agent_id, client, j)).read();

                    // Skip revoked feedback
                    if fb.is_revoked {
                        j += 1;
                        continue;
                    }

                    // Apply tag filters
                    if tag1.len() > 0 {
                        let stored_tag1 = self.feedback_tag1.entry((agent_id, client, j)).read();
                        if stored_tag1 != tag1 {
                            j += 1;
                            continue;
                        }
                    }
                    if tag2.len() > 0 {
                        let stored_tag2 = self.feedback_tag2.entry((agent_id, client, j)).read();
                        if stored_tag2 != tag2 {
                            j += 1;
                            continue;
                        }
                    }

                    // Normalize to 18 decimals (WAD)
                    let factor: u256 = self._pow10_u256((18 - fb.value_decimals).into());

                    // Handle signed value: split into positive and negative
                    if fb.value >= 0 {
                        let abs_val: u128 = fb.value.try_into().unwrap();
                        sum_positive += abs_val.into() * factor;
                    } else {
                        // -fb.value gives the absolute value
                        let abs_val: u128 = (-fb.value).try_into().unwrap();
                        sum_negative += abs_val.into() * factor;
                    }

                    // Track decimal frequency
                    let dec_key: felt252 = fb.value_decimals.into();
                    let current_count = decimal_counts.get(dec_key);
                    decimal_counts.insert(dec_key, current_count + 1);

                    count += 1;
                    j += 1;
                };

                i += 1;
            };

            if count == 0 {
                return (0, 0, 0);
            }

            // Find mode (most frequent valueDecimals)
            let mut mode_decimals: u8 = 0;
            let mut max_count: u64 = 0;
            let mut d: u8 = 0;
            while d <= 18 {
                let dec_count = decimal_counts.get(d.into());
                if dec_count > max_count {
                    max_count = dec_count;
                    mode_decimals = d;
                }
                d += 1;
            };

            // Calculate average in WAD, then scale to mode precision
            let count_u256: u256 = count.into();
            let scale_factor: u256 = self._pow10_u256((18 - mode_decimals).into());

            // Calculate signed average
            let (summary_value, _) = if sum_positive >= sum_negative {
                let net_sum = sum_positive - sum_negative;
                let avg_wad = net_sum / count_u256;
                let scaled = avg_wad / scale_factor;
                let val: i128 = scaled.low.try_into().unwrap();
                (val, true)
            } else {
                let net_sum = sum_negative - sum_positive;
                let avg_wad = net_sum / count_u256;
                let scaled = avg_wad / scale_factor;
                let val: i128 = -(scaled.low.try_into().unwrap());
                (val, false)
            };

            (count, summary_value, mode_decimals)
        }

        fn read_feedback(
            self: @ContractState, agent_id: u256, client_address: ContractAddress, index: u64,
        ) -> (i128, u8, ByteArray, ByteArray, bool) {
            assert(index > 0, 'index must be > 0');

            let last_idx = self.last_index.entry((agent_id, client_address)).read();
            assert(index <= last_idx, 'index out of bounds');

            let fb = self.feedback_core.entry((agent_id, client_address, index)).read();
            let tag1 = self.feedback_tag1.entry((agent_id, client_address, index)).read();
            let tag2 = self.feedback_tag2.entry((agent_id, client_address, index)).read();

            (fb.value, fb.value_decimals, tag1, tag2, fb.is_revoked)
        }

        fn read_all_feedback(
            self: @ContractState,
            agent_id: u256,
            client_addresses: Span<ContractAddress>,
            tag1: ByteArray,
            tag2: ByteArray,
            include_revoked: bool,
        ) -> (
            Array<ContractAddress>,
            Array<u64>,
            Array<i128>,
            Array<u8>,
            Array<ByteArray>,
            Array<ByteArray>,
            Array<bool>,
        ) {
            let mut clients_arr: Array<ContractAddress> = ArrayTrait::new();
            let mut indexes_arr: Array<u64> = ArrayTrait::new();
            let mut values_arr: Array<i128> = ArrayTrait::new();
            let mut decimals_arr: Array<u8> = ArrayTrait::new();
            let mut tag1s_arr: Array<ByteArray> = ArrayTrait::new();
            let mut tag2s_arr: Array<ByteArray> = ArrayTrait::new();
            let mut revoked_arr: Array<bool> = ArrayTrait::new();

            // Get client list
            let client_list = if client_addresses.len() > 0 {
                client_addresses
            } else {
                // Get all clients from Vec
                let client_vec = self.clients.entry(agent_id);
                let mut all_clients: Array<ContractAddress> = ArrayTrait::new();
                let mut i: u64 = 0;
                while i < client_vec.len() {
                    all_clients.append(client_vec.at(i).read());
                    i += 1;
                };
                all_clients.span()
            };

            let mut i: u32 = 0;
            while i < client_list.len() {
                let client = *client_list.at(i);
                let last_idx = self.last_index.entry((agent_id, client)).read();

                let mut j: u64 = 1;
                while j <= last_idx {
                    let fb = self.feedback_core.entry((agent_id, client, j)).read();
                    let stored_tag1 = self.feedback_tag1.entry((agent_id, client, j)).read();
                    let stored_tag2 = self.feedback_tag2.entry((agent_id, client, j)).read();

                    // Skip revoked if not included
                    if !include_revoked && fb.is_revoked {
                        j += 1;
                        continue;
                    }

                    // Apply tag filters
                    if tag1.len() > 0 && stored_tag1 != tag1 {
                        j += 1;
                        continue;
                    }
                    if tag2.len() > 0 && stored_tag2 != tag2 {
                        j += 1;
                        continue;
                    }

                    clients_arr.append(client);
                    indexes_arr.append(j);
                    values_arr.append(fb.value);
                    decimals_arr.append(fb.value_decimals);
                    tag1s_arr.append(stored_tag1);
                    tag2s_arr.append(stored_tag2);
                    revoked_arr.append(fb.is_revoked);

                    j += 1;
                };

                i += 1;
            };

            (clients_arr, indexes_arr, values_arr, decimals_arr, tag1s_arr, tag2s_arr, revoked_arr)
        }

        fn get_response_count(
            self: @ContractState,
            agent_id: u256,
            client_address: ContractAddress,
            feedback_index: u64,
            responders: Span<ContractAddress>,
        ) -> u64 {
            // Early return if no responders specified
            if responders.len() == 0 {
                return 0;
            }

            let mut count: u64 = 0;

            if client_address.is_zero() {
                // Count all responses for all clients from specified responders
                let client_vec = self.clients.entry(agent_id);
                let mut i: u64 = 0;
                while i < client_vec.len() {
                    let client = client_vec.at(i).read();
                    let last_idx = self.last_index.entry((agent_id, client)).read();

                    let mut j: u64 = 1;
                    while j <= last_idx {
                        let mut k: u32 = 0;
                        while k < responders.len() {
                            count += self
                                .response_count
                                .entry((agent_id, client, j, *responders.at(k)))
                                .read();
                            k += 1;
                        };
                        j += 1;
                    };
                    i += 1;
                };
            } else if feedback_index == 0 {
                // Count all responses for specific client from specified responders
                let last_idx = self.last_index.entry((agent_id, client_address)).read();
                let mut j: u64 = 1;
                while j <= last_idx {
                    let mut k: u32 = 0;
                    while k < responders.len() {
                        count += self
                            .response_count
                            .entry((agent_id, client_address, j, *responders.at(k)))
                            .read();
                        k += 1;
                    };
                    j += 1;
                };
            } else {
                // Count responses for specific feedback from specified responders
                let mut k: u32 = 0;
                while k < responders.len() {
                    count += self
                        .response_count
                        .entry((agent_id, client_address, feedback_index, *responders.at(k)))
                        .read();
                    k += 1;
                };
            }

            count
        }

        fn get_clients(self: @ContractState, agent_id: u256) -> Array<ContractAddress> {
            let mut result: Array<ContractAddress> = ArrayTrait::new();
            let client_vec = self.clients.entry(agent_id);

            let mut i: u64 = 0;
            while i < client_vec.len() {
                result.append(client_vec.at(i).read());
                i += 1;
            };

            result
        }

        fn get_last_index(
            self: @ContractState, agent_id: u256, client_address: ContractAddress,
        ) -> u64 {
            self.last_index.entry((agent_id, client_address)).read()
        }

        fn get_identity_registry(self: @ContractState) -> ContractAddress {
            self.identity_registry.read()
        }
    }

    // ============ Internal Functions ============
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Calculate 10^exp for normalization (returns u256)
        fn _pow10_u256(self: @ContractState, exp: u8) -> u256 {
            let mut result: u256 = 1;
            let mut i: u8 = 0;
            while i < exp {
                result = result * 10;
                i += 1;
            };
            result
        }
    }
}
