#[starknet::interface]
pub trait IQuantumVault<TContractState> {
    fn get_owner(self: @TContractState) -> starknet::ContractAddress;
    fn get_release_time(self: @TContractState) -> u64;
    fn get_min_duration(self: @TContractState) -> u64;
    fn get_max_duration(self: @TContractState) -> u64;
    fn is_locked(self: @TContractState) -> bool;
    fn is_releasable(self: @TContractState) -> bool;
    fn get_status(self: @TContractState) -> QuantumVaultStatus;

    #[generate(trait)]
    fn lock_funds(ref self: TContractState, duration: u64);
    fn release(ref self: TContractState);
    fn cancel(ref self: TContractState);
}

#[derive(Drop, Copy, Debug, PartialEq, Serde)]
pub enum QuantumVaultStatus {
    Unlocked,
    Locked,
    Released,
    Cancelled,
}

#[starknet::contract]
mod QuantumVault {
    use starknet::get_block_timestamp;
    use starknet::get_caller_address;
    use starknet::contract_address::ContractAddress;
    use starknet::call_contract_syscall;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        release_time: u64,
        min_duration: u64,
        max_duration: u64,
        status: super::QuantumVaultStatus,
    }

    #[event]
    #[derive(Drop, Debug, PartialEq)]
    enum Event {
        FundsLocked: FundsLocked,
        FundsReleased: FundsReleased,
        FundsCancelled: FundsCancelled,
    }

    #[derive(Drop, Debug, PartialEq, Serde)]
    struct FundsLocked {
        owner: ContractAddress,
        release_time: u64,
        duration: u64,
    }

    #[derive(Drop, Debug, PartialEq, Serde)]
    struct FundsReleased {
        owner: ContractAddress,
        released_at: u64,
    }

    #[derive(Drop, Debug, PartialEq, Serde)]
    struct FundsCancelled {
        owner: ContractAddress,
        cancelled_at: u64,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        min_duration: u64,
        max_duration: u64
    ) {
        self.owner.write(owner);
        self.min_duration.write(min_duration);
        self.max_duration.write(max_duration);
        self.status.write(super::QuantumVaultStatus::Unlocked);
        self.release_time.write(0);
    }

    #[generate(trait)]
    impl QuantumVaultImpl of IQuantumVault<ContractState> {
        fn get_owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }

        fn get_release_time(self: @ContractState) -> u64 {
            self.release_time.read()
        }

        fn get_min_duration(self: @ContractState) -> u64 {
            self.min_duration.read()
        }

        fn get_max_duration(self: @ContractState) -> u64 {
            self.max_duration.read()
        }

        fn is_locked(self: @ContractState) -> bool {
            self.status.read() == super::QuantumVaultStatus::Locked
        }

        fn is_releasable(self: @ContractState) -> bool {
            let status = self.status.read();
            if status != super::QuantumVaultStatus::Locked {
                return false;
            }
            let release_time = self.release_time.read();
            get_block_timestamp() >= release_time
        }

        fn get_status(self: @ContractState) -> super::QuantumVaultStatus {
            self.status.read()
        }

        fn lock_funds(ref self: ContractState, duration: u64) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'ONLY_OWNER');

            let current_status = self.status.read();
            assert(current_status == super::QuantumVaultStatus::Unlocked, 'ALREADY_LOCKED');

            let min_dur = self.min_duration.read();
            let max_dur = self.max_duration.read();
            assert(duration >= min_dur, 'DURATION_TOO_SHORT');
            assert(duration <= max_dur, 'DURATION_TOO_LONG');

            let release_time = get_block_timestamp() + duration;
            self.release_time.write(release_time);
            self.status.write(super::QuantumVaultStatus::Locked);

            self.emit(Event::FundsLocked(FundsLocked {
                owner: caller,
                release_time,
                duration,
            }));
        }

        fn release(ref self: ContractState) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'ONLY_OWNER');

            let current_status = self.status.read();
            assert(current_status == super::QuantumVaultStatus::Locked, 'NOT_LOCKED');

            let release_time = self.release_time.read();
            assert(get_block_timestamp() >= release_time, 'TIMELOCK_NOT_EXPIRED');

            self.status.write(super::QuantumVaultStatus::Released);

            self.emit(Event::FundsReleased(FundsReleased {
                owner: caller,
                released_at: get_block_timestamp(),
            }));
        }

        fn cancel(ref self: ContractState) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'ONLY_OWNER');

            let current_status = self.status.read();
            assert(current_status == super::QuantumVaultStatus::Locked, 'NOT_LOCKED');

            self.status.write(super::QuantumVaultStatus::Cancelled);

            self.emit(Event::FundsCancelled(FundsCancelled {
                owner: caller,
                cancelled_at: get_block_timestamp(),
            }));
        }
    }
}
