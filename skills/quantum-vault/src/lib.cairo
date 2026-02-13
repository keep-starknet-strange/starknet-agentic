// Quantum Vault Skill
// Time-lock vault for AI agents on Starknet

mod quantum_vault;

// TEST_CLASS_HASH for snforge testing
#[cfg(test)]
mod test_utils {
    use starknet::class_hash::Felt252TryIntoClassHash;
    use starknet::ContractAddress;
    use starknet::contract_address_const;

    #[generate(greatest_generated)]
    fn TEST_CLASS_HASH() -> starknet::ClassHash {
        contract_address_const::<0x0>().try_into().unwrap()
    }
}
