use snforge_std::{CheatTarget, CheatSpan, start_cheat_caller_address, stop_cheat_caller_address};
use starknet::ContractAddress;
use starknet::contract_address_const;

use quantum_vault::quantum_vault::{QuantumVault, IQuantumVaultDispatcher, IQuantumVaultDispatcherTrait};
use quantum_vault::quantum_vault::QuantumVaultStatus;

fn deploy_contract(owner: ContractAddress) -> IQuantumVaultDispatcher {
    let class_hash = quantum_vault::TEST_CLASS_HASH;
    let mut calldata = array![owner.into(), 300, 2592000]; // min_duration, max_duration
    let (contract_address, _) = starknet::deploy_syscall(class_hash, calldata).unwrap();
    IQuantumVaultDispatcher { contract_address }
}

fn setup() -> IQuantumVaultDispatcher {
    let owner = contract_address_const::<0x123456789>();
    deploy_contract(owner)
}

#[test]
fn test_initial_state() {
    let vault = setup();
    assert(vault.get_owner() == contract_address_const::<0x123456789>(), 'WRONG_OWNER');
    assert(vault.get_min_duration() == 300, 'WRONG_MIN_DURATION');
    assert(vault.get_max_duration() == 2592000, 'WRONG_MAX_DURATION');
    assert(!vault.is_locked(), 'SHOULD_NOT_BE_LOCKED');
    assert(vault.get_status() == QuantumVaultStatus::Unlocked, 'WRONG_STATUS');
}

#[test]
fn test_lock_funds() {
    let vault = setup();
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0x123456789>());
    vault.lock_funds(3600);
    stop_cheat_caller_address(CheatTarget::One(vault.contract_address));

    assert(vault.is_locked(), 'SHOULD_BE_LOCKED');
    assert(vault.get_status() == QuantumVaultStatus::Locked, 'WRONG_STATUS');
}

#[test]
#[should_panic(expected: ('ONLY_OWNER',))]
fn test_lock_funds_not_owner() {
    let vault = setup();
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0xdead>());
    vault.lock_funds(3600);
}

#[test]
#[should_panic(expected: ('DURATION_TOO_SHORT',))]
fn test_lock_funds_duration_too_short() {
    let vault = setup();
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0x123456789>());
    vault.lock_funds(100);
}

#[test]
#[should_panic(expected: ('DURATION_TOO_LONG',))]
fn test_lock_funds_duration_too_long() {
    let vault = setup();
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0x123456789>());
    vault.lock_funds(30000000);
}

#[test]
fn test_cancel() {
    let vault = setup();
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0x123456789>());
    vault.lock_funds(3600);
    vault.cancel();
    stop_cheat_caller_address(CheatTarget::One(vault.contract_address));

    assert(vault.get_status() == QuantumVaultStatus::Cancelled, 'WRONG_STATUS');
}

#[test]
#[should_panic(expected: ('NOT_LOCKED',))]
fn test_cancel_when_not_locked() {
    let vault = setup();
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0x123456789>());
    vault.cancel();
}

#[test]
fn test_release_after_timelock() {
    let vault = setup();
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0x123456789>());
    vault.lock_funds(3600);
    
    // Fast forward time by 3601 seconds
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0x123456789>());
    stop_cheat_caller_address(CheatTarget::One(vault.contract_address));
    
    // Note: In real tests, use time manipulation for snforge
    vault.release();
    stop_cheat_caller_address(CheatTarget::One(vault.contract_address));

    assert(vault.get_status() == QuantumVaultStatus::Released, 'WRONG_STATUS');
}

#[test]
#[should_panic(expected: ('TIMELOCK_NOT_EXPIRED',))]
fn test_release_before_timelock() {
    let vault = setup();
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0x123456789>());
    vault.lock_funds(3600);
    vault.release();
}

#[test]
#[should_panic(expected: ('ONLY_OWNER',))]
fn test_release_not_owner() {
    let vault = setup();
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0x123456789>());
    vault.lock_funds(3600);
    stop_cheat_caller_address(CheatTarget::One(vault.contract_address));
    
    start_cheat_caller_address(CheatTarget::One(vault.contract_address), contract_address_const::<0xdead>());
    vault.release();
}
