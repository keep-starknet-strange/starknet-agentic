// SPDX-License-Identifier: MIT
// Shielded Pool Tests

#[cfg(test)]
mod tests {
    use starknet::ContractAddress;
    use starknet::testing::set_caller_address;
    use starknet::contract_address_const;

    // Import the contract
    use starknet_shielded_pool::ShieldedPool;

    // ------------------------------------------------------------------
    // Helper Functions
    // ------------------------------------------------------------------

    fn deployer() -> ContractAddress {
        contract_address_const::<0xDEPLOYER>()
    }

    fn user1() -> ContractAddress {
        contract_address_const::<0xUSER1>()
    }

    fn user2() -> ContractAddress {
        contract_address_const::<0xUSER2>()
    }

    // ------------------------------------------------------------------
    // Constructor Tests
    // ------------------------------------------------------------------

    #[test]
    #[available_gas(2000000)]
    fn test_constructor() {
        let contract = deploy_syscall(deployer()).unwrap();
        let state = contract.contract_state;
        
        // Verify initial state
        assert(state.merkle_root.read() == 0, 'Merkle root should be 0');
        assert(state.pool_balance.read() == 0, 'Pool balance should be 0');
        assert(state.owner.read() == deployer(), 'Owner should be deployer');
    }

    // ------------------------------------------------------------------
    // Deposit Tests
    // ------------------------------------------------------------------

    #[test]
    #[available_gas(2000000)]
    fn test_deposit() {
        let contract = deploy_syscall(deployer()).unwrap();
        let mut state = contract.contract_state;
        
        set_caller_address(user1());
        
        let commitment = 0x1234567890abcdef;
        
        // Execute deposit
        let result = state.deposit(commitment);
        
        // Verify
        assert(result == commitment, 'Should return commitment');
        assert(state.pool_balance.read() > 0, 'Pool balance should increase');
        assert(state.notes.entry(commitment).read() != 0, 'Note should be stored');
    }

    #[test]
    #[available_gas(2000000)]
    #[should_panic(expected: ('Invalid commitment',))]
    fn test_deposit_zero_commitment_fails() {
        let contract = deploy_syscall(deployer()).unwrap();
        let mut state = contract.contract_state;
        
        set_caller_address(user1());
        
        state.deposit(0);
    }

    #[test]
    #[available_gas(2000000)]
    #[should_panic(expected: ('Commitment exists',))]
    fn test_deposit_duplicate_fails() {
        let contract = deploy_syscall(deployer()).unwrap();
        let mut state = contract.contract_state;
        
        set_caller_address(user1());
        
        let commitment = 0x1234567890abcdef;
        
        // First deposit
        state.deposit(commitment);
        
        // Second deposit with same commitment
        state.deposit(commitment);
    }

    // ------------------------------------------------------------------
    // Transfer Tests
    // ------------------------------------------------------------------

    #[test]
    #[available_gas(2000000)]
    fn test_transfer() {
        let contract = deploy_syscall(deployer()).unwrap();
        let mut state = contract.contract_state;
        
        set_caller_address(user1());
        
        // Setup: deposit
        let commitment_old = 0xAAAA;
        state.deposit(commitment_old);
        
        // Update merkle root
        state.update_merkle_root(0xBBBB);
        
        // Transfer
        let nullifier = 0xCCCC;
        let commitment_new = 0xDDDD;
        let encrypted_recipient = 0x1234;
        
        let result = state.transfer(
            nullifier,
            commitment_old,
            commitment_new,
            array![],  // merkle proof
            encrypted_recipient
        );
        
        // Verify
        assert(result == 1, 'Transfer should succeed');
        assert(state.nullifiers.entry(nullifier).read() == true, 'Nullifier should be used');
    }

    // ------------------------------------------------------------------
    // Nullifier Tests
    // ------------------------------------------------------------------

    #[test]
    #[available_gas(2000000)]
    fn test_nullifier_used() {
        let contract = deploy_syscall(deployer()).unwrap();
        let state = contract.contract_state;
        
        assert(!state.is_nullifier_used(0x1234), 'Nullifier should not be used');
    }

    // ------------------------------------------------------------------
    // Balance Tests
    // ------------------------------------------------------------------

    #[test]
    #[available_gas(2000000)]
    fn test_get_pool_balance() {
        let contract = deploy_syscall(deployer()).unwrap();
        let state = contract.contract_state;
        
        assert(state.get_pool_balance() == 0, 'Initial balance should be 0');
    }

    // ------------------------------------------------------------------
    // Merkle Root Tests
    // ------------------------------------------------------------------

    #[test]
    #[available_gas(2000000)]
    fn test_update_merkle_root() {
        let contract = deploy_syscall(deployer()).unwrap();
        let mut state = contract.contract_state;
        
        let new_root = 0x1234567890abcdef;
        
        state.update_merkle_root(new_root);
        
        assert(state.merkle_root.read() == new_root, 'Merkle root should be updated');
    }

    #[test]
    #[available_gas(2000000)]
    #[should_panic(expected: ('Not owner',))]
    fn test_update_merkle_root_non_owner_fails() {
        let contract = deploy_syscall(deployer()).unwrap();
        let mut state = contract.contract_state;
        
        set_caller_address(user1());  // Not owner
        
        state.update_merkle_root(0x1234);
    }
}
