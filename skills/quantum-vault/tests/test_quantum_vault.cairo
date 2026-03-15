// Quantum Vault — Test Suite
// Uses snforge (Starknet Foundry) for integration testing.
//!
//! A mock ERC-20 is included so tests run without external dependencies.

// ═══════════════════════════════════════════════
// Mock ERC-20 for testing
// ═══════════════════════════════════════════════

#[starknet::interface]
trait IMockERC20<TContractState> {
    fn transfer(ref self: TContractState, recipient: starknet::ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TContractState,
        sender: starknet::ContractAddress,
        recipient: starknet::ContractAddress,
        amount: u256,
    ) -> bool;
    fn balance_of(self: @TContractState, account: starknet::ContractAddress) -> u256;
    fn mint(ref self: TContractState, to: starknet::ContractAddress, amount: u256);
    fn approve(ref self: TContractState, spender: starknet::ContractAddress, amount: u256) -> bool;
}

#[starknet::contract]
mod MockERC20 {
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess, Map, StoragePathEntry};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[abi(embed_v0)]
    impl MockERC20Impl of super::IMockERC20<ContractState> {
        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = starknet::get_caller_address();
            let sender_bal = self.balances.entry(sender).read();
            self.balances.entry(sender).write(sender_bal - amount);
            let rec_bal = self.balances.entry(recipient).read();
            self.balances.entry(recipient).write(rec_bal + amount);
            true
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let caller = starknet::get_caller_address();
            let allowance = self.allowances.entry((sender, caller)).read();
            self.allowances.entry((sender, caller)).write(allowance - amount);
            let sender_bal = self.balances.entry(sender).read();
            self.balances.entry(sender).write(sender_bal - amount);
            let rec_bal = self.balances.entry(recipient).read();
            self.balances.entry(recipient).write(rec_bal + amount);
            true
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            let bal = self.balances.entry(to).read();
            self.balances.entry(to).write(bal + amount);
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let owner = starknet::get_caller_address();
            self.allowances.entry((owner, spender)).write(amount);
            true
        }
    }
}

// ═══════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use starknet::ContractAddress;
    use starknet::contract_address_const;
    use snforge_std::{
        declare, ContractClassTrait, DeclareResultTrait,
        start_cheat_caller_address, stop_cheat_caller_address,
        start_cheat_block_timestamp, stop_cheat_block_timestamp,
        spy_events, EventSpyAssertionsTrait, EventSpyTrait,
    };

    use super::quantum_vault::IQuantumVaultDispatcher;
    use super::quantum_vault::IQuantumVaultDispatcherTrait;
    use super::quantum_vault::QuantumVault;
    use super::quantum_vault::Deposit;

    use super::IMockERC20Dispatcher;
    use super::IMockERC20DispatcherTrait;

    // ── Helpers ──

    fn OWNER() -> ContractAddress {
        contract_address_const::<'OWNER'>()
    }

    fn USER() -> ContractAddress {
        contract_address_const::<'USER'>()
    }

    fn STRANGER() -> ContractAddress {
        contract_address_const::<'STRANGER'>()
    }

    const INITIAL_BALANCE: u256 = 1_000_000;
    const DEPOSIT_AMOUNT: u256 = 10_000;
    const TIMELOCK: u64 = 3600; // 1 hour

    /// Deploy a mock ERC-20, mint tokens to `to`, and return (dispatcher, token_address).
    fn deploy_token(to: ContractAddress) -> (IMockERC20Dispatcher, ContractAddress) {
        let contract = declare("MockERC20").unwrap().contract_class();
        let (addr, _) = contract.deploy(@array![]).unwrap();
        let dispatcher = IMockERC20Dispatcher { contract_address: addr };

        // Mint tokens to `to`
        dispatcher.mint(to, INITIAL_BALANCE);

        (dispatcher, addr)
    }

    /// Deploy the QuantumVault contract and return the dispatcher.
    fn deploy_vault() -> IQuantumVaultDispatcher {
        let contract = declare("QuantumVault").unwrap().contract_class();
        let (addr, _) = contract.deploy(@array![]).unwrap();
        IQuantumVaultDispatcher { contract_address: addr }
    }

    /// Full setup: vault + token, with `user` approving the vault for `amount`.
    fn setup(user: ContractAddress, amount: u256) -> (IQuantumVaultDispatcher, ContractAddress) {
        let vault = deploy_vault();
        let (token, token_addr) = deploy_token(user);

        // User approves vault to pull tokens
        start_cheat_caller_address(token_addr, user);
        token.approve(vault.contract_address, amount);
        stop_cheat_caller_address(token_addr);

        (vault, token_addr)
    }

    // ── Deposit tests ──

    #[test]
    fn test_deposit_increases_balance() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        let token = IMockERC20Dispatcher { contract_address: token_addr };

        // Record balances before
        let user_bal_before = token.balance_of(user);
        let vault_bal_before = token.balance_of(vault.contract_address);

        // Deposit
        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        // Verify token balances
        assert(token.balance_of(user) == user_bal_before - DEPOSIT_AMOUNT, 'USER_BAL_WRONG');
        assert(
            token.balance_of(vault.contract_address) == vault_bal_before + DEPOSIT_AMOUNT,
            'VAULT_BAL_WRONG',
        );

        // Verify deposit record
        let dep = vault.get_deposit(0);
        assert(dep.owner == user, 'DEP_OWNER_WRONG');
        assert(dep.token == token_addr, 'DEP_TOKEN_WRONG');
        assert(dep.amount == DEPOSIT_AMOUNT, 'DEP_AMOUNT_WRONG');
        assert(dep.timelock_seconds == TIMELOCK, 'DEP_TIMELOCK_WRONG');
        assert(!dep.withdrawn, 'DEP_SHOULD_NOT_BE_WITHDRAWN');
        assert(!dep.cancelled, 'DEP_SHOULD_NOT_BE_CANCELLED');

        assert(vault.get_deposit_count() == 1, 'DEPOSIT_COUNT_WRONG');
    }

    #[test]
    fn test_deposit_emits_event() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        let mut spy = spy_events();

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        spy.assert_emitted(@array![
            (
                vault.contract_address,
                QuantumVault::Event::Deposited(
                    QuantumVault::Deposited {
                        owner: user,
                        deposit_id: 0,
                        token: token_addr,
                        amount: DEPOSIT_AMOUNT,
                        timelock_seconds: TIMELOCK,
                    }
                )
            )
        ]);
    }

    #[test]
    #[should_panic]
    fn test_deposit_zero_amount_fails() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, 0);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, 0, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);
    }

    #[test]
    #[should_panic]
    fn test_deposit_zero_timelock_fails() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, 0);
        stop_cheat_caller_address(vault.contract_address);
    }

    // ── Withdraw tests ──

    #[test]
    #[should_panic]
    fn test_withdraw_before_timelock_fails() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        // Deposit at timestamp 0 (default)
        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        // Try to withdraw immediately (timestamp still 0, need 3600)
        start_cheat_caller_address(vault.contract_address, user);
        vault.withdraw(0);
        stop_cheat_caller_address(vault.contract_address);
    }

    #[test]
    fn test_withdraw_after_timelock_succeeds() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);
        let token = IMockERC20Dispatcher { contract_address: token_addr };

        // Deposit at timestamp 0
        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        let vault_bal_after_dep = token.balance_of(vault.contract_address);
        let user_bal_after_dep = token.balance_of(user);

        // Advance time past timelock
        start_cheat_block_timestamp(vault.contract_address, TIMELOCK + 1);

        // Withdraw
        start_cheat_caller_address(vault.contract_address, user);
        vault.withdraw(0);
        stop_cheat_caller_address(vault.contract_address);

        stop_cheat_block_timestamp(vault.contract_address);

        // Verify tokens returned
        assert(token.balance_of(user) == user_bal_after_dep + DEPOSIT_AMOUNT, 'USER_BAL_AFTER_WITHDRAW');
        assert(token.balance_of(vault.contract_address) == vault_bal_after_dep - DEPOSIT_AMOUNT, 'VAULT_BAL_AFTER_WITHDRAW');

        // Verify deposit marked as withdrawn
        let dep = vault.get_deposit(0);
        assert(dep.withdrawn, 'SHOULD_BE_WITHDRAWN');
    }

    #[test]
    fn test_withdraw_emits_event() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        let mut spy = spy_events();

        start_cheat_block_timestamp(vault.contract_address, TIMELOCK + 1);
        start_cheat_caller_address(vault.contract_address, user);
        vault.withdraw(0);
        stop_cheat_caller_address(vault.contract_address);
        stop_cheat_block_timestamp(vault.contract_address);

        spy.assert_emitted(@array![
            (
                vault.contract_address,
                QuantumVault::Event::Withdrawn(
                    QuantumVault::Withdrawn {
                        owner: user,
                        deposit_id: 0,
                        token: token_addr,
                        amount: DEPOSIT_AMOUNT,
                    }
                )
            )
        ]);
    }

    // ── Double withdraw ──

    #[test]
    #[should_panic]
    fn test_double_withdraw_fails() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        start_cheat_block_timestamp(vault.contract_address, TIMELOCK + 1);

        // First withdraw — should succeed
        start_cheat_caller_address(vault.contract_address, user);
        vault.withdraw(0);
        stop_cheat_caller_address(vault.contract_address);

        // Second withdraw — should fail
        start_cheat_caller_address(vault.contract_address, user);
        vault.withdraw(0);
        stop_cheat_caller_address(vault.contract_address);

        stop_cheat_block_timestamp(vault.contract_address);
    }

    // ── Wrong owner ──

    #[test]
    #[should_panic]
    fn test_wrong_owner_withdraw_fails() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        start_cheat_block_timestamp(vault.contract_address, TIMELOCK + 1);

        // Stranger tries to withdraw
        start_cheat_caller_address(vault.contract_address, STRANGER());
        vault.withdraw(0);
        stop_cheat_caller_address(vault.contract_address);

        stop_cheat_block_timestamp(vault.contract_address);
    }

    // ── Cancel tests ──

    #[test]
    #[should_panic]
    fn test_cancel_before_cancel_timelock_fails() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        // Cancel timelock = 2 × TIMELOCK = 7200
        // Advance only to TIMELOCK + 1 (not enough)
        start_cheat_block_timestamp(vault.contract_address, TIMELOCK + 1);

        start_cheat_caller_address(vault.contract_address, user);
        vault.cancel(0);
        stop_cheat_caller_address(vault.contract_address);

        stop_cheat_block_timestamp(vault.contract_address);
    }

    #[test]
    fn test_cancel_after_cancel_timelock_succeeds() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);
        let token = IMockERC20Dispatcher { contract_address: token_addr };

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        let vault_bal_after_dep = token.balance_of(vault.contract_address);
        let user_bal_after_dep = token.balance_of(user);

        // Cancel timelock = 2 × TIMELOCK = 7200
        start_cheat_block_timestamp(vault.contract_address, TIMELOCK * 2 + 1);

        start_cheat_caller_address(vault.contract_address, user);
        vault.cancel(0);
        stop_cheat_caller_address(vault.contract_address);

        stop_cheat_block_timestamp(vault.contract_address);

        // Verify tokens returned
        assert(token.balance_of(user) == user_bal_after_dep + DEPOSIT_AMOUNT, 'USER_BAL_AFTER_CANCEL');
        assert(token.balance_of(vault.contract_address) == vault_bal_after_dep - DEPOSIT_AMOUNT, 'VAULT_BAL_AFTER_CANCEL');

        // Verify deposit marked as cancelled
        let dep = vault.get_deposit(0);
        assert(dep.cancelled, 'SHOULD_BE_CANCELLED');
    }

    #[test]
    fn test_cancel_emits_event() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        let mut spy = spy_events();

        start_cheat_block_timestamp(vault.contract_address, TIMELOCK * 2 + 1);
        start_cheat_caller_address(vault.contract_address, user);
        vault.cancel(0);
        stop_cheat_caller_address(vault.contract_address);
        stop_cheat_block_timestamp(vault.contract_address);

        spy.assert_emitted(@array![
            (
                vault.contract_address,
                QuantumVault::Event::Cancelled(
                    QuantumVault::Cancelled {
                        owner: user,
                        deposit_id: 0,
                        token: token_addr,
                        amount: DEPOSIT_AMOUNT,
                    }
                )
            )
        ]);
    }

    // ── View function tests ──

    #[test]
    fn test_get_user_deposits() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT * 3);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK * 2);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK * 3);
        stop_cheat_caller_address(vault.contract_address);

        let ids = vault.get_user_deposits(user);
        assert(ids.len() == 3, 'SHOULD_HAVE_3_DEPOSITS');
    }

    #[test]
    fn test_get_withdrawable_amount_zero_before_timelock() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        assert(vault.get_withdrawable_amount(0) == 0, 'SHOULD_BE_ZERO');
    }

    #[test]
    fn test_get_withdrawable_amount_full_after_timelock() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        start_cheat_block_timestamp(vault.contract_address, TIMELOCK + 1);
        assert(vault.get_withdrawable_amount(0) == DEPOSIT_AMOUNT, 'SHOULD_BE_FULL');
        stop_cheat_block_timestamp(vault.contract_address);
    }

    #[test]
    fn test_get_withdrawable_amount_zero_after_withdraw() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        start_cheat_block_timestamp(vault.contract_address, TIMELOCK + 1);
        start_cheat_caller_address(vault.contract_address, user);
        vault.withdraw(0);
        stop_cheat_caller_address(vault.contract_address);
        stop_cheat_block_timestamp(vault.contract_address);

        assert(vault.get_withdrawable_amount(0) == 0, 'SHOULD_BE_ZERO_AFTER_WD');
    }

    // ── Multi-user test ──

    #[test]
    fn test_multiple_users_independent() {
        let user_a = OWNER();
        let user_b = USER();

        let vault = deploy_vault();
        let (token, token_addr) = deploy_token(user_a);
        // Also mint to user_b
        token.mint(user_b, INITIAL_BALANCE);

        // user_a approves and deposits
        start_cheat_caller_address(token_addr, user_a);
        token.approve(vault.contract_address, DEPOSIT_AMOUNT);
        stop_cheat_caller_address(token_addr);

        start_cheat_caller_address(vault.contract_address, user_a);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        // user_b approves and deposits
        start_cheat_caller_address(token_addr, user_b);
        token.approve(vault.contract_address, DEPOSIT_AMOUNT * 2);
        stop_cheat_caller_address(token_addr);

        start_cheat_caller_address(vault.contract_address, user_b);
        vault.deposit(token_addr, DEPOSIT_AMOUNT * 2, TIMELOCK * 3);
        stop_cheat_caller_address(vault.contract_address);

        // Verify independent deposits
        let dep_a = vault.get_deposit(0);
        let dep_b = vault.get_deposit(1);
        assert(dep_a.owner == user_a, 'DEP_A_OWNER');
        assert(dep_b.owner == user_b, 'DEP_B_OWNER');
        assert(dep_a.amount == DEPOSIT_AMOUNT, 'DEP_A_AMT');
        assert(dep_b.amount == DEPOSIT_AMOUNT * 2, 'DEP_B_AMT');

        // User lists
        let ids_a = vault.get_user_deposits(user_a);
        let ids_b = vault.get_user_deposits(user_b);
        assert(ids_a.len() == 1, 'USER_A_DEPOSITS');
        assert(ids_b.len() == 1, 'USER_B_DEPOSITS');
    }

    // ── Reuse after withdraw ──

    #[test]
    fn test_deposit_after_withdraw_reuses_slot() {
        let user = OWNER();
        let (vault, token_addr) = setup(user, DEPOSIT_AMOUNT * 2);

        // First deposit + withdraw
        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK);
        stop_cheat_caller_address(vault.contract_address);

        start_cheat_block_timestamp(vault.contract_address, TIMELOCK + 1);
        start_cheat_caller_address(vault.contract_address, user);
        vault.withdraw(0);
        stop_cheat_caller_address(vault.contract_address);
        stop_cheat_block_timestamp(vault.contract_address);

        // Second deposit gets id 1 (counters don't reset — each deposit is unique)
        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit(token_addr, DEPOSIT_AMOUNT, TIMELOCK * 2);
        stop_cheat_caller_address(vault.contract_address);

        assert(vault.get_deposit_count() == 2, 'SHOULD_HAVE_2_DEPOSITS');
        let dep1 = vault.get_deposit(1);
        assert(dep1.amount == DEPOSIT_AMOUNT, 'DEP1_AMT');
        assert(dep1.timelock_seconds == TIMELOCK * 2, 'DEP1_TL');
    }
}
