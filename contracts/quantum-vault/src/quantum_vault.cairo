#[starknet::contract]
pub mod QuantumVault {
    use quantum_vault::interfaces::IQuantumVault;
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_block_timestamp};
    use starknet::storage::*;
    use starknet::SyscallResultTrait;
    use openzeppelin::access::ownable::OwnableComponent;

    // ─── Constants ───────────────────────────────────────────────────────
    const MIN_DELAY: u64 = 300;        // 5 minutes minimum
    const MAX_DELAY: u64 = 2592000;    // 30 days maximum
    const GRACE_PERIOD: u64 = 86400;   // 24 hours grace period after expiry

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
        executing: bool,
        lock_to: Map<felt252, ContractAddress>,
        lock_selector: Map<felt252, felt252>,
        lock_calldata: Map<felt252, felt252>,
        lock_unlock_at: Map<felt252, u64>,
        lock_status: Map<felt252, felt252>,  // 0=Pending, 1=Executed, 2=Cancelled
        lock_count: felt252,
    }

    // ─── Events ──────────────────────────────────────────────────────────
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        TimeLockCreated: TimeLockCreated,
        TimeLockExecuted: TimeLockExecuted,
        TimeLockCancelled: TimeLockCancelled,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockCreated {
        pub lock_id: felt252,
        pub to: ContractAddress,
        pub selector: felt252,
        pub unlock_at: u64,
        pub expires_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockExecuted {
        pub lock_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockCancelled {
        pub lock_id: felt252,
    }

    // ─── Constructor ────────────────────────────────────────────────────
    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
        self.executing.write(false);
    }

    // ─── External Functions ─────────────────────────────────────────────
    #[abi(embed_v0)]
    impl QuantumVaultImpl of IQuantumVault<ContractState> {

        fn create_time_lock(
            ref self: ContractState,
            to: ContractAddress,
            selector: felt252,
            calldata_hash: felt252,
            delay_seconds: u64
        ) -> felt252 {
            self.ownable.assert_only_owner();

            assert(to != Zero::zero(), 'Zero target address');

            assert(delay_seconds >= MIN_DELAY, 'Delay too short');
            assert(delay_seconds <= MAX_DELAY, 'Delay too long');

            let unlock_at = get_block_timestamp() + delay_seconds;
            let expires_at = unlock_at + GRACE_PERIOD;
            let lock_id = self.lock_count.read() + 1;

            self.lock_to.write(lock_id, to);
            self.lock_selector.write(lock_id, selector);
            self.lock_calldata.write(lock_id, calldata_hash);
            self.lock_unlock_at.write(lock_id, unlock_at);
            self.lock_status.write(lock_id, 0);
            self.lock_count.write(lock_id);

            self.emit(TimeLockCreated { lock_id, to, selector, unlock_at, expires_at });

            lock_id
        }

        fn execute_time_lock(ref self: ContractState, lock_id: felt252) {
            self.ownable.assert_only_owner();

            assert(!self.executing.read(), 'Already executing');
            self.executing.write(true);

            let status = self.lock_status.read(lock_id);
            assert(status == 0, 'Not pending');

            let now = get_block_timestamp();
            let unlock_at = self.lock_unlock_at.read(lock_id);
            let expires_at = unlock_at + GRACE_PERIOD;

            assert(now >= unlock_at, 'Not unlocked yet');
            assert(now <= expires_at, 'Grace period expired');

            let to = self.lock_to.read(lock_id);
            let selector = self.lock_selector.read(lock_id);
            let calldata_hash = self.lock_calldata.read(lock_id);

            // Hash-commitment scheme: target receives calldata_hash as single arg.
            // For full calldata storage, use Span<felt252> instead.
            let calldata = array![calldata_hash].span();
            let _ = starknet::syscalls::call_contract_syscall(to, selector, calldata)
                .unwrap_syscall();

            self.executing.write(false);
            self.lock_status.write(lock_id, 1);
            self.emit(TimeLockExecuted { lock_id });
        }

        fn cancel_time_lock(ref self: ContractState, lock_id: felt252) {
            self.ownable.assert_only_owner();

            let status = self.lock_status.read(lock_id);
            assert(status == 0, 'Not pending');

            self.lock_status.write(lock_id, 2);
            self.emit(TimeLockCancelled { lock_id });
        }

        fn get_time_lock(
            self: @ContractState,
            lock_id: felt252
        ) -> (ContractAddress, felt252, u64, felt252) {
            (
                self.lock_to.read(lock_id),
                self.lock_selector.read(lock_id),
                self.lock_unlock_at.read(lock_id),
                self.lock_status.read(lock_id)
            )
        }

        fn get_lock_count(self: @ContractState) -> felt252 {
            self.lock_count.read()
        }

        fn is_lock_expired(self: @ContractState, lock_id: felt252) -> bool {
            let unlock_at = self.lock_unlock_at.read(lock_id);
            let expires_at = unlock_at + GRACE_PERIOD;
            get_block_timestamp() >= expires_at
        }
    }
}
