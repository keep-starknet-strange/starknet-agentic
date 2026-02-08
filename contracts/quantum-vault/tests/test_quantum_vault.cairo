use quantum_vault::quantum_vault::QuantumVault;
use quantum_vault::interfaces::IQuantumVaultDispatcher;
use snforge_std::{ContractClassTrait, declare, start_cheat_caller_address, stop_cheat_caller_address, start_cheat_block_timestamp, stop_cheat_block_timestamp};
use starknet::ContractAddress;

const OWNER: felt252 = 0x123456789ABCDEF;
const OWNER_ADDRESS: ContractAddress = 0x123456789ABCDEF.try_into().unwrap();

fn deploy_vault() -> ContractAddress {
    let contract = declare("QuantumVault").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![OWNER]).unwrap();
    addr
}

#[test]
fn test_create_time_lock() {
    let addr = deploy_vault();
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let selector: felt252 = 0x1234;
    let calldata_hash: felt252 = 0x5678;
    let delay: u64 = 3600;  // 1 hour
    
    // Create as owner
    start_cheat_caller_address(addr, OWNER_ADDRESS);
    let lock_id = dispatcher.create_time_lock(target, selector, calldata_hash, delay);
    stop_cheat_caller_address(addr);
    
    assert(lock_id == 1, 'First lock should be id 1');
    
    // Verify lock was created
    let (to, sel, unlock_at, status) = dispatcher.get_time_lock(lock_id);
    assert(to == target, 'Target mismatch');
    assert(sel == selector, 'Selector mismatch');
    assert(status == 0, 'Should be pending (0)');
}

#[test]
fn test_execute_time_lock() {
    let addr = deploy_vault();
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let selector: felt252 = 0x1234;
    let calldata_hash: felt252 = 0x5678;
    let delay: u64 = 100;
    
    // Create lock
    start_cheat_caller_address(addr, OWNER_ADDRESS);
    let lock_id = dispatcher.create_time_lock(target, selector, calldata_hash, delay);
    stop_cheat_caller_address(addr);
    
    // Fast forward time past unlock
    start_cheat_block_timestamp(addr, 200);
    
    // Execute as owner
    start_cheat_caller_address(addr, OWNER_ADDRESS);
    dispatcher.execute_time_lock(lock_id);
    stop_cheat_caller_address(addr);
    stop_cheat_block_timestamp(addr);
    
    // Verify executed
    let (_, _, _, status) = dispatcher.get_time_lock(lock_id);
    assert(status == 1, 'Should be executed (1)');
}

#[test]
fn test_cancel_time_lock() {
    let addr = deploy_vault();
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let selector: felt252 = 0x1234;
    let calldata_hash: felt252 = 0x5678;
    let delay: u64 = 3600;
    
    start_cheat_caller_address(addr, OWNER_ADDRESS);
    let lock_id = dispatcher.create_time_lock(target, selector, calldata_hash, delay);
    dispatcher.cancel_time_lock(lock_id);
    stop_cheat_caller_address(addr);
    
    // Verify cancelled
    let (_, _, _, status) = dispatcher.get_time_lock(lock_id);
    assert(status == 2, 'Should be cancelled (2)');
}

#[test]
fn test_get_lock_count() {
    let addr = deploy_vault();
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let target: ContractAddress = 0xABC.try_into().unwrap();
    
    start_cheat_caller_address(addr, OWNER_ADDRESS);
    dispatcher.create_time_lock(target, 0x1, 0x1111, 3600);
    dispatcher.create_time_lock(target, 0x2, 0x2222, 3600);
    dispatcher.create_time_lock(target, 0x3, 0x3333, 3600);
    stop_cheat_caller_address(addr);
    
    let count = dispatcher.get_lock_count();
    assert(count == 3, 'Should have 3 locks');
}

#[test]
fn test_is_lock_expired() {
    let addr = deploy_vault();
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let target: ContractAddress = 0xABC.try_into().unwrap();
    let delay: u64 = 100;
    
    start_cheat_caller_address(addr, OWNER_ADDRESS);
    let lock_id = dispatcher.create_time_lock(target, 0x1, 0x1111, delay);
    stop_cheat_caller_address(addr);
    
    // Not expired yet
    assert(!dispatcher.is_lock_expired(lock_id), 'Should not be expired');
    
    // Fast forward time
    start_cheat_block_timestamp(addr, 200);
    assert(dispatcher.is_lock_expired(lock_id), 'Should be expired');
    stop_cheat_block_timestamp(addr);
}

#[test]
#[should_panic(expected: ('Delay too short',))]
fn test_create_time_lock_too_short_delay() {
    let addr = deploy_vault();
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let target: ContractAddress = 0xABC.try_into().unwrap();
    
    start_cheat_caller_address(addr, OWNER_ADDRESS);
    dispatcher.create_time_lock(target, 0x1, 0x1111, 100);  // Less than 300
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: ('Not unlocked yet',))]
fn test_execute_before_unlock() {
    let addr = deploy_vault();
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let target: ContractAddress = 0xABC.try_into().unwrap();
    
    start_cheat_caller_address(addr, OWNER_ADDRESS);
    let lock_id = dispatcher.create_time_lock(target, 0x1, 0x1111, 10000);
    dispatcher.execute_time_lock(lock_id);  // Too early
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: ('Not pending',))]
fn test_execute_cancelled_lock() {
    let addr = deploy_vault();
    let dispatcher = IQuantumVaultDispatcher { contract_address: addr };
    let target: ContractAddress = 0xABC.try_into().unwrap();
    
    start_cheat_caller_address(addr, OWNER_ADDRESS);
    let lock_id = dispatcher.create_time_lock(target, 0x1, 0x1111, 3600);
    dispatcher.cancel_time_lock(lock_id);
    dispatcher.execute_time_lock(lock_id);  // Already cancelled
    stop_cheat_caller_address(addr);
}
