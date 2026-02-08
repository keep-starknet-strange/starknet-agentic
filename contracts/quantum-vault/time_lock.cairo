use starknet::{ContractAddress, get_block_timestamp};
use starknet::storage::*;

#[starknet::component]
pub mod TimeLockComponent {
    use super::*;

    #[storage]
    pub struct Storage {
        // Time-lock storage
        txs: Map<felt252, super::TimeLockData>,
        pending_txs: Map<(ContractAddress, felt252, u64), felt252>,
        // Maps (to, selector, unlock_at) -> tx_id for uniqueness
        time_lock: Map<(ContractAddress, felt252, u64), felt252>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        TimeLockCreated: TimeLockCreated,
        TimeLockCancelled: TimeLockCancelled,
        TimeLockExecuted: TimeLockExecuted,
        TimeLockExtended: TimeLockExtended,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockCreated {
        pub tx_id: felt252,
        pub to: ContractAddress,
        pub selector: felt252,
        pub unlock_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockCancelled {
        pub tx_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockExecuted {
        pub tx_id: felt252,
        pub executed_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TimeLockExtended {
        pub tx_id: felt252,
        pub new_unlock_at: u64,
    }

    pub trait TimeLockTrait<TContractState> {
        fn create_time_lock(
            ref self: ComponentState<TContractState>,
            to: ContractAddress,
            selector: felt252,
            calldata: Span<felt252>,
            delay_seconds: u64,
        ) -> felt252;
        
        fn execute_time_lock(
            ref self: ComponentState<TContractState>,
            tx_id: felt252,
        ) -> bool;
        
        fn cancel_time_lock(
            ref self: ComponentState<TContractState>,
            tx_id: felt252,
        ) -> bool;
        
        fn extend_time_lock(
            ref self: ComponentState<TContractState>,
            tx_id: felt252,
            new_delay_seconds: u64,
        ) -> bool;
        
        fn get_time_lock_data(
            self: @ComponentState<TContractState>,
            tx_id: felt252,
        ) -> super::TimeLockData;
        
        fn is_time_lock_expired(
            self: @ComponentState<TContractState>,
            unlock_at: u64,
        ) -> bool;
    }

    pub impl TimeLockImpl<
        TContractState, 
        +HasComponent<TContractState>,
        +Drop<TContractState>
    > of TimeLockTrait<TContractState> {
        
        fn create_time_lock(
            ref self: ComponentState<TContractState>,
            to: ContractAddress,
            selector: felt252,
            calldata: Span<felt252>,
            delay_seconds: u64,
        ) -> felt252 {
            let unlock_at = get_block_timestamp() + delay_seconds;
            
            // Generate unique tx_id
            let tx_id = self.txs.read(0) + 1;
            
            let time_lock_data = super::TimeLockData {
                to,
                selector,
                calldata,
                unlock_at,
                executed: false,
            };
            
            self.txs.write(tx_id, time_lock_data);
            self.time_lock.write((to, selector, unlock_at), tx_id);
            self.txs.write(0, tx_id); // Update counter

            self.emit(TimeLockCreated {
                tx_id,
                to,
                selector,
                unlock_at,
            });

            tx_id
        }

        fn execute_time_lock(
            ref self: ComponentState<TContractState>,
            tx_id: felt252,
        ) -> bool {
            let data = self.txs.read(tx_id);
            
            assert(!data.executed, 'Already executed');
            assert(self.is_time_lock_expired(data.unlock_at), 'Time lock not expired');

            // Execute via syscall
            let result = starknet::syscalls::call_contract_syscall(
                data.to, data.selector, data.calldata
            ).unwrap_syscall();

            // Mark as executed
            self.txs.write(tx_id, super::TimeLockData {
                to: data.to,
                selector: data.selector,
                calldata: data.calldata,
                unlock_at: data.unlock_at,
                executed: true,
            });

            self.emit(TimeLockExecuted {
                tx_id,
                executed_at: get_block_timestamp(),
            });

            true
        }

        fn cancel_time_lock(
            ref self: ComponentState<TContractState>,
            tx_id: felt252,
        ) -> bool {
            let data = self.txs.read(tx_id);
            assert(!data.executed, 'Already executed');

            // Clear the time lock
            self.time_lock.write((data.to, data.selector, data.unlock_at), 0);
            self.txs.write(tx_id, super::TimeLockData {
                to: data.to,
                selector: data.selector,
                calldata: array![].span(),
                unlock_at: 0,
                executed: true, // Mark as cancelled
            });

            self.emit(TimeLockCancelled { tx_id });
            true
        }

        fn extend_time_lock(
            ref self: ComponentState<TContractState>,
            tx_id: felt252,
            new_delay_seconds: u64,
        ) -> bool {
            let data = self.txs.read(tx_id);
            assert(!data.executed, 'Already executed');

            let new_unlock_at = get_block_timestamp() + new_delay_seconds;
            
            // Update storage
            self.time_lock.write((data.to, data.selector, data.unlock_at), 0);
            self.time_lock.write((data.to, data.selector, new_unlock_at), tx_id);
            
            self.txs.write(tx_id, super::TimeLockData {
                to: data.to,
                selector: data.selector,
                calldata: data.calldata,
                unlock_at: new_unlock_at,
                executed: false,
            });

            self.emit(TimeLockExtended {
                tx_id,
                new_unlock_at,
            });

            true
        }

        fn get_time_lock_data(
            self: @ComponentState<TContractState>,
            tx_id: felt252,
        ) -> super::TimeLockData {
            self.txs.read(tx_id)
        }

        fn is_time_lock_expired(
            self: @ComponentState<TContractState>,
            unlock_at: u64,
        ) -> bool {
            get_block_timestamp() >= unlock_at
        }
    }
}
