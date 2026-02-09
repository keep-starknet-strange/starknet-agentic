#[starknet::interface]
pub trait IHuginnRegistry<TContractState> {
    fn register_agent(ref self: TContractState, name: felt252, metadata_url: ByteArray);
    fn log_thought(ref self: TContractState, thought_hash: u256);
    fn prove_thought(ref self: TContractState, thought_hash: u256, proof: Span<felt252>);
    fn get_agent(self: @TContractState, agent_id: starknet::ContractAddress) -> (felt252, ByteArray);
    fn get_proof(self: @TContractState, thought_hash: u256) -> (u256, bool, starknet::ContractAddress);
    fn proof_exists(self: @TContractState, thought_hash: u256) -> bool;
    fn get_verifier(self: @TContractState) -> starknet::ContractAddress;
}

#[starknet::interface]
pub trait IThoughtVerifier<TContractState> {
    fn verify(self: @TContractState, thought_hash: u256, proof: Span<felt252>) -> bool;
}

#[starknet::contract]
pub mod HuginnRegistry {
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use starknet::storage::*;
    use starknet::{ContractAddress, get_caller_address};
    use super::{IThoughtVerifierDispatcher, IThoughtVerifierDispatcherTrait};

    // Defensive bound to limit calldata hashing and verifier-call payload size.
    const MAX_PROOF_WORDS: usize = 1024;

    #[storage]
    struct Storage {
        verifier: ContractAddress,
        agents: Map<ContractAddress, AgentProfile>,
        thought_owner: Map<u256, ContractAddress>,
        thought_proofs: Map<u256, Proof>,
    }

    #[derive(Drop, Serde, starknet::Store)]
    pub struct AgentProfile {
        name: felt252,
        metadata_url: ByteArray,
        registered_at: u64,
    }

    #[derive(Drop, Serde, starknet::Store)]
    pub struct Proof {
        thought_hash: u256,
        proof_hash: u256,
        // Invariant: when a record is submitted, `verified` is always true.
        // Invalid proofs revert and are never persisted.
        verified: bool,
        agent_id: ContractAddress,
        submitted: bool,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        OdinEye: OdinEye,
        RavenFlight: RavenFlight,
        MimirWisdom: MimirWisdom,
    }

    #[derive(Drop, starknet::Event)]
    pub struct OdinEye {
        #[key]
        pub agent_id: ContractAddress,
        pub name: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RavenFlight {
        #[key]
        pub agent_id: ContractAddress,
        pub thought_hash: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct MimirWisdom {
        #[key]
        pub agent_id: ContractAddress,
        pub thought_hash: u256,
        pub proof_verified: bool,
    }

    #[constructor]
    fn constructor(ref self: ContractState, verifier_address: ContractAddress) {
        // Verifier address is intentionally immutable for v1.
        // Changing verifier implementation requires registry redeploy.
        assert(!verifier_address.is_zero(), 'Invalid verifier');
        self.verifier.write(verifier_address);
    }

    #[abi(embed_v0)]
    impl HuginnRegistryImpl of super::IHuginnRegistry<ContractState> {
        fn register_agent(ref self: ContractState, name: felt252, metadata_url: ByteArray) {
            let caller = get_caller_address();
            let timestamp = starknet::get_block_timestamp();

            let profile = AgentProfile {
                name,
                metadata_url,
                registered_at: timestamp,
            };
            self.agents.write(caller, profile);

            self.emit(Event::OdinEye(OdinEye { agent_id: caller, name }));
        }

        fn log_thought(ref self: ContractState, thought_hash: u256) {
            let caller = get_caller_address();

            let profile = self.agents.read(caller);
            assert(profile.name != '', 'Agent not registered');

            // First logger becomes canonical owner for this thought hash.
            // Same-owner re-log is idempotent; different owner is rejected.
            let owner = self.thought_owner.read(thought_hash);
            if owner.is_zero() {
                self.thought_owner.write(thought_hash, caller);
            } else {
                assert(owner == caller, 'Thought already claimed');
            }

            self.emit(Event::RavenFlight(RavenFlight { agent_id: caller, thought_hash }));
        }

        fn prove_thought(ref self: ContractState, thought_hash: u256, proof: Span<felt252>) {
            let caller = get_caller_address();

            let profile = self.agents.read(caller);
            assert(profile.name != '', 'Agent not registered');
            assert(proof.len() > 0, 'Empty proof');
            assert(proof.len() <= MAX_PROOF_WORDS, 'Proof too large');

            let owner = self.thought_owner.read(thought_hash);
            assert(!owner.is_zero(), 'Thought not logged');
            assert(owner == caller, 'Not thought owner');

            // Replay policy: one proof per thought hash.
            // A thought hash cannot be overwritten once submitted.
            let existing = self.thought_proofs.read(thought_hash);
            assert(!existing.submitted, 'Proof already submitted');

            let verifier = IThoughtVerifierDispatcher {
                contract_address: self.verifier.read(),
            };
            let is_valid = verifier.verify(thought_hash, proof);
            assert(is_valid, 'Invalid proof');

            let proof_hash = self._hash_proof(proof);
            self
                .thought_proofs
                .write(
                    thought_hash,
                    Proof {
                        thought_hash,
                        proof_hash,
                        verified: true,
                        agent_id: caller,
                        submitted: true,
                    },
                );

            self
                .emit(
                    Event::MimirWisdom(
                        MimirWisdom { agent_id: caller, thought_hash, proof_verified: true },
                    ),
                );
        }

        fn get_agent(self: @ContractState, agent_id: ContractAddress) -> (felt252, ByteArray) {
            let profile = self.agents.read(agent_id);
            (profile.name, profile.metadata_url)
        }

        fn get_proof(self: @ContractState, thought_hash: u256) -> (u256, bool, ContractAddress) {
            let proof = self.thought_proofs.read(thought_hash);
            (proof.proof_hash, proof.verified, proof.agent_id)
        }

        fn proof_exists(self: @ContractState, thought_hash: u256) -> bool {
            self.thought_proofs.read(thought_hash).submitted
        }

        fn get_verifier(self: @ContractState) -> ContractAddress {
            self.verifier.read()
        }
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn _hash_proof(self: @ContractState, proof: Span<felt252>) -> u256 {
            // Deterministic proof transcript hash for indexing/storage.
            // Proof validity is still sourced from the external verifier call.
            poseidon_hash_span(proof).into()
        }
    }
}
