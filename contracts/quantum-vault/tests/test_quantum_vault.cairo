use quantum_vault::quantum_vault::QuantumVault;
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address, stop_cheat_caller_address, start_cheat_block_timestamp, stop_cheat_block_timestamp};
use starknet::ContractAddress;

const OWNER_PUBKEY: felt252 = 0x123456789ABCDEF;

fn deploy_vault() -> (ContractAddress) {
    let contract = declare("QuantumVault").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![OWNER_PUBKEY]).unwrap();
    addr
}

#[test]
fn test_create_time_lock() {
    let addr = deploy_vault();
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let selector: felt252 = 0x1234;
    let calldata_hash: felt252 = 0x5678;
    let delay: u64 = 3600;
    
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let lock_id = dispatcher.create_time_lock(target, selector, calldata_hash, delay);
    
    assert(lock_id == 1, 'First lock should be id 1');
    
    let (to, sel, unlock_at, executed) = dispatcher.get_time_lock(lock_id);
    assert(to == target, 'Target mismatch');
    assert(sel == selector, 'Selector mismatch');
    assert(!executed, 'Should not be executed');
}

#[test]
fn test_time_lock_execution_after_delay() {
    let addr = deploy_vault();
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let selector: felt252 = 0x1234;
    let calldata_hash: felt252 = 0x5678;
    let delay: u64 = 100;
    
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let lock_id = dispatcher.create_time_lock(target, selector, calldata_hash, delay);
    
    // Fast forward time past the delay
    start_cheat_block_timestamp(addr, 200);
    let is_expired = dispatcher.is_expired(200);
    assert(is_expired, 'Should be expired at timestamp 200');
    stop_cheat_block_timestamp(addr);
}

#[test]
fn test_extend_time_lock() {
    let addr = deploy_vault();
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let selector: felt252 = 0x1234;
    let calldata_hash: felt252 = 0x5678;
    let initial_delay: u64 = 3600;
    let extra_delay: u64 = 1800;
    
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let lock_id = dispatcher.create_time_lock(target, selector, calldata_hash, initial_delay);
    
    let (_, _, unlock_before, _) = dispatcher.get_time_lock(lock_id);
    dispatcher.extend_time_lock(lock_id, extra_delay);
    let (_, _, unlock_after, _) = dispatcher.get_time_lock(lock_id);
    assert(unlock_after == unlock_before + extra_delay, 'Extension failed');
}

#[test]
fn test_cancel_time_lock() {
    let addr = deploy_vault();
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let selector: felt252 = 0x1234;
    let calldata_hash: felt252 = 0x5678;
    let delay: u64 = 3600;
    
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let lock_id = dispatcher.create_time_lock(target, selector, calldata_hash, delay);
    dispatcher.cancel_time_lock(lock_id);
    
    let (_, _, _, executed) = dispatcher.get_time_lock(lock_id);
    assert(executed, 'Should be marked as executed/cancelled');
}

#[test]
fn test_get_lock_count() {
    let addr = deploy_vault();
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let calldata_hash: felt252 = 0x5678;
    
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    dispatcher.create_time_lock(target, 0x1, calldata_hash, 3600);
    dispatcher.create_time_lock(target, 0x2, calldata_hash, 3600);
    dispatcher.create_time_lock(target, 0x3, calldata_hash, 3600);
    
    let count = dispatcher.get_lock_count();
    assert(count == 3, 'Should have 3 locks');
}

#[test]
#[should_panic(expected: ('Delay too short',))]
fn test_create_time_lock_too_short_delay() {
    let addr = deploy_vault();
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let calldata_hash: felt252 = 0x5678;
    
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    dispatcher.create_time_lock(target, 0x1, calldata_hash, 100);
}

#[test]
#[should_panic(expected: ('Not unlocked yet',))]
fn test_execute_before_unlock() {
    let addr = deploy_vault();
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let selector: felt252 = 0x1234;
    let calldata_hash: felt252 = 0x5678;
    let delay: u64 = 10000;
    
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let lock_id = dispatcher.create_time_lock(target, selector, calldata_hash, delay);
    dispatcher.execute_time_lock(lock_id);
}

// Dispatcher for tests
use snforge_std::{ContractClassTrait, DeclareResultTrait};
use starknet::{ContractAddress, Felt252TryIntoIdentity};

trait IQuantumVaultDispatcherTrait {
    fn create_time_lock(self: ContractAddress, to: ContractAddress, selector: felt252, calldata_hash: felt252, delay_seconds: u64) -> felt252;
    fn execute_time_lock(self: ContractAddress, lock_id: felt252);
    fn extend_time_lock(self: ContractAddress, lock_id: felt252, additional_seconds: u64);
    fn cancel_time_lock(self: ContractAddress, lock_id: felt252);
    fn get_time_lock(self: ContractAddress, lock_id: felt252) -> (ContractAddress, felt252, u64, bool);
    fn get_lock_count(self: ContractAddress) -> felt252;
    fn is_expired(self: ContractAddress, unlock_at: u64) -> bool;
}

struct IQuantumVaultDispatcher { contract_address: ContractAddress }

impl IQuantumVaultDispatcherImpl of IQuantumVaultDispatcherTrait {
    fn create_time_lock(self: ContractAddress, to: ContractAddress, selector: felt252, calldata_hash: felt252, delay_seconds: u64) -> felt252 {
        let mut args = array![to.into(), selector, calldata_hash, delay_seconds.into()];
        call_contract(self, selector!("create_time_lock"), args)
    }
    fn execute_time_lock(self: ContractAddress, lock_id: felt252) {
        call_contract(self, selector!("execute_time_lock"), array![lock_id])
    }
    fn extend_time_lock(self: ContractAddress, lock_id: felt252, additional_seconds: u64) {
        call_contract(self, selector!("extend_time_lock"), array![lock_id, additional_seconds.into()])
    }
    fn cancel_time_lock(self: ContractAddress, lock_id: felt252) {
        call_contract(self, selector!("cancel_time_lock"), array![lock_id])
    }
    fn get_time_lock(self: ContractAddress, lock_id: felt252) -> (ContractAddress, felt252, u64, bool) {
        let ret = call_contract(self, selector!("get_time_lock"), array![lock_id]);
        let mut ret_span = ret.span();
        (
            (*ret_span[0]).try_into().unwrap(),
            *ret_span[1],
            *ret_span[2].try_into().unwrap(),
            *ret_span[3] != 0
        )
    }
    fn get_lock_count(self: ContractAddress) -> felt252 {
        let ret = call_contract(self, selector!("get_lock_count"), array![]);
        ret[0]
    }
    fn is_expired(self: ContractAddress, unlock_at: u64) -> bool {
        let ret = call_contract(self, selector!("is_expired"), array![unlock_at.into()]);
        ret[0] != 0
    }
}

fn selector!(name: felt252) -> felt252 {
    name
}

fn call_contract(mut calldata: Array<felt252>) -> Array<felt252> {
    // Stub - actual implementation uses snforge_std
    array![]
}
