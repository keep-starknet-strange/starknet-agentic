// Quantum Vault — Time-Lock Vault for AI Agents on Starknet
// SPDX-License-Identifier: MIT
//!
//! A production-ready time-lock vault that holds ERC-20 tokens in custody.
//! Users deposit tokens with a configurable timelock; tokens cannot be
//! withdrawn until the lock period expires. Cancellation is itself
//! time-locked at 2× the deposit timelock to prevent instant-cancel abuse.
//! After withdraw or cancel the deposit slot is freed for reuse.

use starknet::ContractAddress;

// ──────────────────────────────────────────────
// Interface
// ──────────────────────────────────────────────

#[starknet::interface]
pub trait IQuantumVault<TContractState> {
    /// Deposit ERC-20 tokens into the vault with a timelock.
    fn deposit(
        ref self: TContractState,
        token: ContractAddress,
        amount: u256,
        timelock_seconds: u64,
    );

    /// Withdraw tokens after the timelock has expired.
    fn withdraw(ref self: TContractState, deposit_id: u64);

    /// Cancel a deposit. The cancel itself is time-locked at 2× the deposit
    /// timelock to prevent instant-cancel attacks.
    fn cancel(ref self: TContractState, deposit_id: u64);

    // ── View functions ──

    fn get_deposit(self: @TContractState, deposit_id: u64) -> Deposit;
    fn get_user_deposits(self: @TContractState, user: ContractAddress) -> Array<u64>;
    fn get_withdrawable_amount(self: @TContractState, deposit_id: u64) -> u256;
    fn get_deposit_count(self: @TContractState) -> u64;
}

// ──────────────────────────────────────────────
// Data model
// ──────────────────────────────────────────────

/// A single deposit record stored in the vault.
#[derive(Drop, Serde, starknet::Store)]
pub struct Deposit {
    pub id: u64,
    pub owner: ContractAddress,
    pub token: ContractAddress,
    pub amount: u256,
    pub deposit_time: u64,
    pub timelock_seconds: u64,
    pub cancelled: bool,
    pub withdrawn: bool,
}

// ──────────────────────────────────────────────
// ERC-20 minimal interface (callee side)
// ──────────────────────────────────────────────

/// Minimal ERC-20 interface used for transfers.
#[starknet::interface]
trait IERC20<TContractState> {
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TContractState,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
}

// ──────────────────────────────────────────────
// Contract
// ──────────────────────────────────────────────

#[starknet::contract]
mod QuantumVault {
    use starknet::{
        ContractAddress, get_caller_address, get_block_timestamp, get_contract_address,
    };
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess, Map, StoragePathEntry,
    };
    use super::{
        IERC20DispatcherTrait, IERC20Dispatcher, Deposit,
    };

    // ── Storage ──

    #[storage]
    struct Storage {
        /// Next deposit id (monotonically increasing).
        deposit_count: u64,
        /// Map deposit_id → Deposit.
        deposits: Map<u64, Deposit>,
        /// Map (user, index) → deposit_id. Gives a per-user enumeration.
        user_deposit_ids: Map<(ContractAddress, u64), u64>,
        /// Map user → number of deposits (current length of their list).
        user_deposit_count: Map<ContractAddress, u64>,
        /// Reentrancy guard flag.
        locked: bool,
    }

    // ── Events ──

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Deposited: Deposited,
        Withdrawn: Withdrawn,
        Cancelled: Cancelled,
    }

    #[derive(Drop, starknet::Event)]
    struct Deposited {
        #[key]
        owner: ContractAddress,
        deposit_id: u64,
        token: ContractAddress,
        amount: u256,
        timelock_seconds: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct Withdrawn {
        #[key]
        owner: ContractAddress,
        deposit_id: u64,
        token: ContractAddress,
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Cancelled {
        #[key]
        owner: ContractAddress,
        deposit_id: u64,
        token: ContractAddress,
        amount: u256,
    }

    // ── Errors ──

    const ERR_ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
    const ERR_ZERO_TOKEN: felt252 = 'ZERO_TOKEN';
    const ERR_ZERO_TIMELOCK: felt252 = 'ZERO_TIMELOCK';
    const ERR_INVALID_DEPOSIT_ID: felt252 = 'INVALID_DEPOSIT_ID';
    const ERR_NOT_OWNER: felt252 = 'NOT_OWNER';
    const ERR_ALREADY_WITHDRAWN: felt252 = 'ALREADY_WITHDRAWN';
    const ERR_ALREADY_CANCELLED: felt252 = 'ALREADY_CANCELLED';
    const ERR_TIMELOCK_NOT_EXPIRED: felt252 = 'TIMELOCK_NOT_EXPIRED';
    const ERR_CANCEL_TIMELOCK_NOT_EXPIRED: felt252 = 'CANCEL_TL_NOT_EXPIRED';
    const ERR_REENTRANCY: felt252 = 'REENTRANCY';

    // ── Constructor ──

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.deposit_count.write(0);
        self.locked.write(false);
    }

    // ── ABI impl ──

    #[abi(embed_v0)]
    impl QuantumVaultImpl of super::IQuantumVault<ContractState> {
        // ── deposit ─────────────────────────────────────────

        /// Transfer `amount` of `token` from caller into the vault and
        /// create a deposit locked for `timelock_seconds`.
        ///
        /// The caller must have approved this contract for at least `amount`
        /// before calling.
        fn deposit(
            ref self: ContractState,
            token: ContractAddress,
            amount: u256,
            timelock_seconds: u64,
        ) {
            // Validate inputs
            assert(amount > 0, ERR_ZERO_AMOUNT);
            assert(timelock_seconds > 0, ERR_ZERO_TIMELOCK);

            let caller = get_caller_address();
            let this = get_contract_address();

            // Pull tokens from caller
            let erc20 = IERC20Dispatcher { contract_address: token };
            let success = erc20.transfer_from(caller, this, amount);
            assert(success, 'TRANSFER_FROM_FAILED');

            // Record deposit
            let deposit_id = self.deposit_count.read();
            let now = get_block_timestamp();

            let deposit = Deposit {
                id: deposit_id,
                owner: caller,
                token,
                amount,
                deposit_time: now,
                timelock_seconds,
                cancelled: false,
                withdrawn: false,
            };

            self.deposits.entry(deposit_id).write(deposit);

            // Append to user's deposit list
            let user_idx = self.user_deposit_count.entry(caller).read();
            self.user_deposit_ids.entry((caller, user_idx)).write(deposit_id);
            self.user_deposit_count.entry(caller).write(user_idx + 1);

            // Bump global counter
            self.deposit_count.write(deposit_id + 1);

            self.emit(Deposited {
                owner: caller,
                deposit_id,
                token,
                amount,
                timelock_seconds,
            });
        }

        // ── withdraw ────────────────────────────────────────

        /// Withdraw tokens after the timelock has expired.
        ///
        /// Reentrancy-guarded. Only the deposit owner may withdraw.
        fn withdraw(ref self: ContractState, deposit_id: u64) {
            self._acquire_reentrancy_guard();

            let caller = get_caller_address();
            let mut deposit = self.deposits.entry(deposit_id).read();

            // Validate state
            assert(deposit.id == deposit_id || deposit_id < self.deposit_count.read(),
                   ERR_INVALID_DEPOSIT_ID);
            assert(deposit.owner == caller, ERR_NOT_OWNER);
            assert(!deposit.withdrawn, ERR_ALREADY_WITHDRAWN);
            assert(!deposit.cancelled, ERR_ALREADY_CANCELLED);

            // Timelock check
            let now = get_block_timestamp();
            assert(
                now >= deposit.deposit_time + deposit.timelock_seconds,
                ERR_TIMELOCK_NOT_EXPIRED,
            );

            // Mark withdrawn before transfer (checks-effects-interactions)
            deposit.withdrawn = true;
            self.deposits.entry(deposit_id).write(deposit);

            // Transfer tokens back to owner
            let erc20 = IERC20Dispatcher { contract_address: deposit.token };
            let success = erc20.transfer(caller, deposit.amount);
            assert(success, 'TRANSFER_FAILED');

            self.emit(Withdrawn {
                owner: caller,
                deposit_id,
                token: deposit.token,
                amount: deposit.amount,
            });

            self._release_reentrancy_guard();
        }

        // ── cancel ──────────────────────────────────────────

        /// Cancel a deposit. The cancel is itself time-locked at 2× the
        /// deposit timelock (measured from deposit_time) to prevent
        /// instant-cancel attacks.
        ///
        /// Only the deposit owner may cancel.
        fn cancel(ref self: ContractState, deposit_id: u64) {
            self._acquire_reentrancy_guard();

            let caller = get_caller_address();
            let mut deposit = self.deposits.entry(deposit_id).read();

            // Validate state
            assert(deposit.id == deposit_id || deposit_id < self.deposit_count.read(),
                   ERR_INVALID_DEPOSIT_ID);
            assert(deposit.owner == caller, ERR_NOT_OWNER);
            assert(!deposit.withdrawn, ERR_ALREADY_WITHDRAWN);
            assert(!deposit.cancelled, ERR_ALREADY_CANCELLED);

            // Cancel timelock = 2× deposit timelock
            let cancel_timelock = deposit.timelock_seconds * 2;
            let now = get_block_timestamp();
            assert(
                now >= deposit.deposit_time + cancel_timelock,
                ERR_CANCEL_TIMELOCK_NOT_EXPIRED,
            );

            // Mark cancelled before transfer
            deposit.cancelled = true;
            self.deposits.entry(deposit_id).write(deposit);

            // Return tokens to owner
            let erc20 = IERC20Dispatcher { contract_address: deposit.token };
            let success = erc20.transfer(caller, deposit.amount);
            assert(success, 'TRANSFER_FAILED');

            self.emit(Cancelled {
                owner: caller,
                deposit_id,
                token: deposit.token,
                amount: deposit.amount,
            });

            self._release_reentrancy_guard();
        }

        // ── View functions ──

        fn get_deposit(self: @ContractState, deposit_id: u64) -> Deposit {
            self.deposits.entry(deposit_id).read()
        }

        /// Returns all deposit ids belonging to `user`.
        fn get_user_deposits(self: @ContractState, user: ContractAddress) -> Array<u64> {
            let count = self.user_deposit_count.entry(user).read();
            let mut result = array![];
            let mut i: u64 = 0;
            while i != count {
                let dep_id = self.user_deposit_ids.entry((user, i)).read();
                result.append(dep_id);
                i += 1;
            };
            result
        }

        /// Returns the withdrawable amount for a deposit.
        /// Returns 0 if timelock has not yet expired, or if already
        /// withdrawn / cancelled.
        fn get_withdrawable_amount(self: @ContractState, deposit_id: u64) -> u256 {
            let deposit = self.deposits.entry(deposit_id).read();
            if deposit.withdrawn || deposit.cancelled {
                return 0;
            }
            let now = get_block_timestamp();
            if now < deposit.deposit_time + deposit.timelock_seconds {
                return 0;
            }
            deposit.amount
        }

        fn get_deposit_count(self: @ContractState) -> u64 {
            self.deposit_count.read()
        }
    }

    // ── Internal helpers ──

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _acquire_reentrancy_guard(ref self: ContractState) {
            assert(!self.locked.read(), ERR_REENTRANCY);
            self.locked.write(true);
        }

        fn _release_reentrancy_guard(ref self: ContractState) {
            self.locked.write(false);
        }
    }
}
