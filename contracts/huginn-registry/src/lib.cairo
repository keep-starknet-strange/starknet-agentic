#[starknet::interface]
pub trait IHuginnRegistry<TContractState> {
    fn register_agent(ref self: TContractState, name: felt252, metadata_url: ByteArray);
    fn log_thought(ref self: TContractState, thought_hash: u256);
    fn prove_thought(ref self: TContractState, thought_hash: u256, proof: Span<felt252>);
    fn get_agent(self: @TContractState, agent_id: starknet::ContractAddress) -> (felt252, ByteArray);
}

#[starknet::contract]
pub mod HuginnRegistry {
    use starknet::storage::*;
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        agents: Map<ContractAddress, AgentProfile>,
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
        verified: bool,
        agent_id: ContractAddress,
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

            self.emit(Event::RavenFlight(RavenFlight { agent_id: caller, thought_hash }));
        }

        fn prove_thought(ref self: ContractState, thought_hash: u256, proof: Span<felt252>) {
            let caller = get_caller_address();
            
            let profile = self.agents.read(caller);
            assert(profile.name != '', 'Agent not registered');

            // TODO: Integrate STWO verifier contract
            // For now, store proof hash
            let proof_hash = self._hash_proof(proof);
            
            let proof_record = Proof {
                thought_hash,
                proof_hash,
                verified: true, // TODO: actual verification
                agent_id: caller,
            };
            self.thought_proofs.write(thought_hash, proof_record);

            self.emit(Event::MimirWisdom(MimirWisdom { 
                agent_id: caller, 
                thought_hash, 
                proof_verified: true 
            }));
        }

        fn get_agent(self: @ContractState, agent_id: ContractAddress) -> (felt252, ByteArray) {
            let profile = self.agents.read(agent_id);
            (profile.name, profile.metadata_url)
        }
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn _hash_proof(self: @ContractState, proof: Span<felt252>) -> u256 {
            // Simple hash for now - replace with actual STWO verification
            let mut hash: u256 = 0;
            let mut i = 0;
            loop {
                if i >= proof.len() {
                    break;
                }
                hash = hash + (*proof.at(i)).into();
                i += 1;
            };
            hash
        }
    }
}
