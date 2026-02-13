use starknet::ContractAddress;
use starknet::account::Call;
use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
    start_cheat_block_timestamp_global,
    start_cheat_signature_global, stop_cheat_signature_global,
};
use session_account::account::{
    ISessionKeyManagerDispatcher, ISessionKeyManagerDispatcherTrait,
};
use session_account::spending_policy::interface::{
    ISessionSpendingPolicyDispatcher, ISessionSpendingPolicyDispatcherTrait,
};

// ---------- dispatcher interface for __execute__ ----------

#[starknet::interface]
trait IAccountExecute<TContractState> {
    fn __execute__(ref self: TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
}

#[starknet::interface]
trait IAccountValidate<TContractState> {
    fn __validate__(ref self: TContractState, calls: Array<Call>) -> felt252;
}

// ---------- constants ----------

const OWNER_PUBKEY: felt252 = 0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef;
const SESSION_PUBKEY: felt252 = 0x987654321fedcba987654321fedcba987654321fedcba987654321fedcba;

// Well-known ERC-20 selectors (must match interface.cairo)
const TRANSFER_SELECTOR: felt252 = 0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e;
const APPROVE_SELECTOR: felt252 = 0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c;

// ---------- deploy helpers ----------

fn deploy_account() -> (ContractAddress, ISessionKeyManagerDispatcher, ISessionSpendingPolicyDispatcher) {
    let contract_class = declare("SessionAccount").unwrap().contract_class();
    let constructor_calldata = array![OWNER_PUBKEY];
    let (contract_address, _) = contract_class.deploy(@constructor_calldata).unwrap();

    let session_mgr = ISessionKeyManagerDispatcher { contract_address };
    let spending_mgr = ISessionSpendingPolicyDispatcher { contract_address };
    (contract_address, session_mgr, spending_mgr)
}

fn deploy_with_execute() -> (
    ContractAddress,
    ISessionKeyManagerDispatcher,
    ISessionSpendingPolicyDispatcher,
    IAccountExecuteDispatcher,
) {
    let (addr, session_mgr, spending_mgr) = deploy_account();
    let exec = IAccountExecuteDispatcher { contract_address: addr };
    (addr, session_mgr, spending_mgr, exec)
}

// ---------- call builders ----------

fn make_transfer_call(token: ContractAddress, amount: u256) -> Call {
    let recipient: felt252 = 0xBEEF;
    Call {
        to: token,
        selector: TRANSFER_SELECTOR,
        calldata: array![recipient, amount.low.into(), amount.high.into()].span(),
    }
}

fn make_approve_call(token: ContractAddress, amount: u256) -> Call {
    let spender: felt252 = 0xBEEF;
    Call {
        to: token,
        selector: APPROVE_SELECTOR,
        calldata: array![spender, amount.low.into(), amount.high.into()].span(),
    }
}

// ===================================================================
// Policy management tests (6 — kept from original)
// ===================================================================

#[test]
fn test_spending_policy_set_and_get() {
    let (account_address, _session_mgr, spending_mgr) = deploy_account();

    let current_time = 1_000_000_u64;
    start_cheat_block_timestamp_global(current_time);

    let token: ContractAddress = 0xDA1.try_into().unwrap();
    let max_per_call: u256 = 1000;
    let max_per_window: u256 = 5000;
    let window_seconds: u64 = 86400; // 24h

    // Set policy as owner
    start_cheat_caller_address(account_address, account_address);
    spending_mgr.set_spending_policy(SESSION_PUBKEY, token, max_per_call, max_per_window, window_seconds);
    stop_cheat_caller_address(account_address);

    // Read it back
    let policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy.max_per_call == max_per_call, 'wrong max_per_call');
    assert(policy.max_per_window == max_per_window, 'wrong max_per_window');
    assert(policy.window_seconds == window_seconds, 'wrong window_seconds');
    assert(policy.spent_in_window == 0, 'should start at 0');
    assert(policy.window_start == current_time, 'wrong window_start');
}

#[test]
#[should_panic(expected: ('Account: unauthorized',))]
fn test_spending_policy_unauthorized_set() {
    let (_account_address, _session_mgr, spending_mgr) = deploy_account();

    let current_time = 1_000_000_u64;
    start_cheat_block_timestamp_global(current_time);

    let token: ContractAddress = 0xDA1.try_into().unwrap();

    // Try to set policy without being the account owner -- should panic
    spending_mgr.set_spending_policy(SESSION_PUBKEY, token, 1000, 5000, 86400);
}

#[test]
fn test_spending_policy_remove() {
    let (account_address, _session_mgr, spending_mgr) = deploy_account();

    let current_time = 1_000_000_u64;
    start_cheat_block_timestamp_global(current_time);

    let token: ContractAddress = 0xDA1.try_into().unwrap();

    // Set then remove
    start_cheat_caller_address(account_address, account_address);
    spending_mgr.set_spending_policy(SESSION_PUBKEY, token, 1000, 5000, 86400);
    spending_mgr.remove_spending_policy(SESSION_PUBKEY, token);
    stop_cheat_caller_address(account_address);

    // Verify policy is zeroed
    let policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy.max_per_call == 0, 'should be zero');
    assert(policy.max_per_window == 0, 'should be zero');
    assert(policy.window_seconds == 0, 'should be zero');
}

#[test]
fn test_spending_policy_multiple_tokens() {
    let (account_address, _session_mgr, spending_mgr) = deploy_account();

    let current_time = 1_000_000_u64;
    start_cheat_block_timestamp_global(current_time);

    let dai: ContractAddress = 0xDA1.try_into().unwrap();
    let usdc: ContractAddress = 0xC01.try_into().unwrap();

    start_cheat_caller_address(account_address, account_address);
    spending_mgr.set_spending_policy(SESSION_PUBKEY, dai, 1000, 5000, 86400);
    spending_mgr.set_spending_policy(SESSION_PUBKEY, usdc, 500, 2000, 3600);
    stop_cheat_caller_address(account_address);

    // Policies are independent
    let dai_policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, dai);
    let usdc_policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, usdc);

    assert(dai_policy.max_per_call == 1000, 'DAI max_per_call wrong');
    assert(dai_policy.max_per_window == 5000, 'DAI max_per_window wrong');
    assert(dai_policy.window_seconds == 86400, 'DAI window wrong');

    assert(usdc_policy.max_per_call == 500, 'USDC max_per_call wrong');
    assert(usdc_policy.max_per_window == 2000, 'USDC max_per_window wrong');
    assert(usdc_policy.window_seconds == 3600, 'USDC window wrong');
}

#[test]
fn test_spending_policy_no_policy_allows_all() {
    let (account_address, session_mgr, spending_mgr) = deploy_account();

    let current_time = 1_000_000_u64;
    start_cheat_block_timestamp_global(current_time);

    // Add session key with no spending policy
    start_cheat_caller_address(account_address, account_address);
    session_mgr.add_or_update_session_key(SESSION_PUBKEY, current_time + 86400, 10, array![]);
    stop_cheat_caller_address(account_address);

    // Verify session exists but no spending policy is set
    let data = session_mgr.get_session_data(SESSION_PUBKEY);
    assert(data.valid_until > 0, 'session should exist');

    let token: ContractAddress = 0xDA1.try_into().unwrap();
    let policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    // No policy set: max_per_window == 0, so enforcement is skipped
    assert(policy.max_per_window == 0, 'no policy should be zero');
}

#[test]
#[should_panic(expected: ('Account: unauthorized',))]
fn test_spending_policy_remove_unauthorized() {
    let (account_address, _session_mgr, spending_mgr) = deploy_account();

    let current_time = 1_000_000_u64;
    start_cheat_block_timestamp_global(current_time);

    let token: ContractAddress = 0xDA1.try_into().unwrap();

    // Set policy as owner
    start_cheat_caller_address(account_address, account_address);
    spending_mgr.set_spending_policy(SESSION_PUBKEY, token, 1000, 5000, 86400);
    stop_cheat_caller_address(account_address);

    // Try to remove without being owner -- should panic
    spending_mgr.remove_spending_policy(SESSION_PUBKEY, token);
}

// ===================================================================
// Spending enforcement tests (10 — new, via __execute__)
// ===================================================================

/// Helper: set up a session key + spending policy, return everything needed for enforcement tests.
///
/// NOTE: We use the account's own address as the "token" address. This avoids the snforge
/// "not deployed" error when `_execute_calls` tries `call_contract_syscall` on the token.
/// The call will fail (selector not found on account) but `_execute_calls` catches that
/// via `Result::Err` → empty span. The spending enforcement happens BEFORE _execute_calls,
/// so all spending checks are fully exercised.
fn setup_enforcement(
    current_time: u64,
    max_per_call: u256,
    max_per_window: u256,
    window_seconds: u64,
) -> (ContractAddress, ISessionSpendingPolicyDispatcher, IAccountExecuteDispatcher, ContractAddress) {
    let (account, session_mgr, spending_mgr, exec) = deploy_with_execute();
    // Use account address as fake token (deployed, so call_contract_syscall won't error)
    let token: ContractAddress = account;

    start_cheat_block_timestamp_global(current_time);

    let valid_until = current_time + 86400;
    start_cheat_caller_address(account, account);
    session_mgr.add_or_update_session_key(SESSION_PUBKEY, valid_until, 100, array![TRANSFER_SELECTOR, APPROVE_SELECTOR]);
    spending_mgr.set_spending_policy(SESSION_PUBKEY, token, max_per_call, max_per_window, window_seconds);
    stop_cheat_caller_address(account);

    // Cheat caller to be account itself (satisfy __execute__ caller check)
    start_cheat_caller_address(account, account);
    // Cheat signature to be a 4-element session signature
    let sig = array![SESSION_PUBKEY, 0x111, 0x222, valid_until.into()];
    start_cheat_signature_global(sig.span());

    (account, spending_mgr, exec, token)
}

// #1: Transfer within limits succeeds, spent_in_window updates
#[test]
fn test_enforcement_within_limits() {
    let current_time = 1_000_000_u64;
    let (account, spending_mgr, exec, token) = setup_enforcement(current_time, 100, 1000, 86400);

    let calls = array![make_transfer_call(token, 50)];
    exec.__execute__(calls);

    stop_cheat_signature_global();
    stop_cheat_caller_address(account);

    let policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy.spent_in_window == 50, 'spent should be 50');
}

// #2: Amount exceeding per-call limit panics
#[test]
#[should_panic(expected: ('Spending: exceeds per-call',))]
fn test_enforcement_exceeds_per_call() {
    let current_time = 1_000_000_u64;
    let (_account, _spending_mgr, exec, token) = setup_enforcement(current_time, 100, 1000, 86400);

    // 200 > max_per_call of 100
    let calls = array![make_transfer_call(token, 200)];
    exec.__execute__(calls);
}

// #3: Cumulative spending exceeding window limit panics
#[test]
#[should_panic(expected: ('Spending: exceeds window limit',))]
fn test_enforcement_exceeds_window() {
    let current_time = 1_000_000_u64;
    let (account, _spending_mgr, exec, token) = setup_enforcement(current_time, 700, 1000, 86400);

    // First call: 600 (within limits)
    let calls1 = array![make_transfer_call(token, 600)];
    exec.__execute__(calls1);

    // Need fresh signature for second __execute__
    stop_cheat_signature_global();
    let valid_until = current_time + 86400;
    let sig = array![SESSION_PUBKEY, 0x111, 0x222, valid_until.into()];
    start_cheat_signature_global(sig.span());

    // Second call: 600 → cumulative 1200 > window limit 1000
    let calls2 = array![make_transfer_call(token, 600)];
    exec.__execute__(calls2);

    stop_cheat_signature_global();
    stop_cheat_caller_address(account);
}

// #4: Window auto-resets after window_seconds, allowing new spending
#[test]
fn test_enforcement_window_auto_reset() {
    let current_time = 1_000_000_u64;
    let (account, spending_mgr, exec, token) = setup_enforcement(current_time, 900, 1000, 3600);

    // First batch: spend 800
    let calls1 = array![make_transfer_call(token, 800)];
    exec.__execute__(calls1);

    let policy1 = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy1.spent_in_window == 800, 'spent should be 800');

    // Advance time past window
    stop_cheat_signature_global();
    let new_time = current_time + 3601;
    start_cheat_block_timestamp_global(new_time);
    let valid_until = current_time + 86400;
    let sig = array![SESSION_PUBKEY, 0x111, 0x222, valid_until.into()];
    start_cheat_signature_global(sig.span());

    // Second batch after reset: 500 should succeed (window reset to 0)
    let calls2 = array![make_transfer_call(token, 500)];
    exec.__execute__(calls2);

    stop_cheat_signature_global();
    stop_cheat_caller_address(account);

    let policy2 = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy2.spent_in_window == 500, 'spent should reset to 500');
    assert(policy2.window_start == new_time, 'window_start should update');
}

// #4b: Window boundary attack - spending at exact boundary should NOT reset window
#[test]
#[should_panic(expected: ('Spending: exceeds window limit',))]
fn test_window_boundary_prevents_double_spend() {
    let current_time = 1_000_000_u64;
    let window_seconds = 3600_u64;
    let (account, spending_mgr, exec, token) = setup_enforcement(current_time, 1000, 1000, window_seconds);

    // First batch: spend exactly max_per_window at boundary
    let boundary_time = current_time + window_seconds;
    stop_cheat_signature_global();
    start_cheat_block_timestamp_global(boundary_time);
    let valid_until = current_time + 86400;
    let sig = array![SESSION_PUBKEY, 0x111, 0x222, valid_until.into()];
    start_cheat_signature_global(sig.span());

    let calls1 = array![make_transfer_call(token, 1000)];
    exec.__execute__(calls1);

    let policy1 = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy1.spent_in_window == 1000, 'spent should be 1000');
    assert(policy1.window_start == current_time, 'window should NOT reset yet');

    // Attack: try to spend again at exact same time (should FAIL with > fix)
    // With >= this would reset window and allow double-spend
    // With > this correctly panics
    stop_cheat_signature_global();
    start_cheat_signature_global(sig.span());

    let calls2 = array![make_transfer_call(token, 1000)];
    exec.__execute__(calls2); // Should panic: exceeds window limit

    stop_cheat_signature_global();
    stop_cheat_caller_address(account);
}

// #5: No policy set → huge transfer passes, no state written
#[test]
fn test_enforcement_no_policy_unrestricted() {
    let (account, session_mgr, spending_mgr, exec) = deploy_with_execute();
    // Use account address as fake token (avoids "not deployed" error)
    let token: ContractAddress = account;
    let current_time = 1_000_000_u64;
    start_cheat_block_timestamp_global(current_time);

    let valid_until = current_time + 86400;
    start_cheat_caller_address(account, account);
    session_mgr.add_or_update_session_key(SESSION_PUBKEY, valid_until, 100, array![TRANSFER_SELECTOR]);
    // NO spending policy set
    stop_cheat_caller_address(account);

    start_cheat_caller_address(account, account);
    let sig = array![SESSION_PUBKEY, 0x111, 0x222, valid_until.into()];
    start_cheat_signature_global(sig.span());

    // Large transfer with no policy → should pass without panic
    let calls = array![make_transfer_call(token, 999999999)];
    exec.__execute__(calls);

    stop_cheat_signature_global();
    stop_cheat_caller_address(account);

    // No policy state should be written
    let policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy.max_per_window == 0, 'no policy stored');
    assert(policy.spent_in_window == 0, 'no spending tracked');
}

// #6: approve selector is tracked
#[test]
fn test_enforcement_approve_tracked() {
    let current_time = 1_000_000_u64;
    let (account, spending_mgr, exec, token) = setup_enforcement(current_time, 100, 1000, 86400);

    let calls = array![make_approve_call(token, 75)];
    exec.__execute__(calls);

    stop_cheat_signature_global();
    stop_cheat_caller_address(account);

    let policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy.spent_in_window == 75, 'approve should track spent');
}

// #7: Multicall cumulative tracking within single __execute__
#[test]
fn test_enforcement_multicall_cumulative() {
    let current_time = 1_000_000_u64;
    let (account, spending_mgr, exec, token) = setup_enforcement(current_time, 400, 1000, 86400);

    // [transfer(300), approve(300)] in one batch → spent=600
    let calls = array![
        make_transfer_call(token, 300),
        make_approve_call(token, 300),
    ];
    exec.__execute__(calls);

    stop_cheat_signature_global();
    stop_cheat_caller_address(account);

    let policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy.spent_in_window == 600, 'cumulative should be 600');
}

// #8: Multicall cumulative exceeding window panics
#[test]
#[should_panic(expected: ('Spending: exceeds window limit',))]
fn test_enforcement_multicall_exceeds_window() {
    let current_time = 1_000_000_u64;
    let (_account, _spending_mgr, exec, token) = setup_enforcement(current_time, 700, 1000, 86400);

    // [transfer(600), transfer(600)] cumulative 1200 > window 1000
    let calls = array![
        make_transfer_call(token, 600),
        make_transfer_call(token, 600),
    ];
    exec.__execute__(calls);
}

// #9: Non-ERC20 selector on same token → not tracked
#[test]
fn test_enforcement_non_spending_selector() {
    let (account, session_mgr, spending_mgr, exec) = deploy_with_execute();
    // Use account address as fake token (avoids "not deployed" error)
    let token: ContractAddress = account;
    let current_time = 1_000_000_u64;
    start_cheat_block_timestamp_global(current_time);

    let valid_until = current_time + 86400;
    let non_spending_selector: felt252 = selector!("balanceOf");
    start_cheat_caller_address(account, account);
    session_mgr.add_or_update_session_key(SESSION_PUBKEY, valid_until, 100, array![non_spending_selector]);
    spending_mgr.set_spending_policy(SESSION_PUBKEY, token, 100, 1000, 86400);
    stop_cheat_caller_address(account);

    start_cheat_caller_address(account, account);
    let sig = array![SESSION_PUBKEY, 0x111, 0x222, valid_until.into()];
    start_cheat_signature_global(sig.span());

    // Call with non-spending selector → not tracked
    let calls = array![
        Call {
            to: token,
            selector: non_spending_selector,
            calldata: array![0xBEEF].span(),
        }
    ];
    exec.__execute__(calls);

    stop_cheat_signature_global();
    stop_cheat_caller_address(account);

    let policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy.spent_in_window == 0, 'non-spending stays 0');
}

// #10: Exactly at limit passes (<= not <)
#[test]
fn test_enforcement_exactly_at_limit() {
    let current_time = 1_000_000_u64;
    // max_per_call=100, max_per_window=100
    let (account, spending_mgr, exec, token) = setup_enforcement(current_time, 100, 100, 86400);

    // amount == max_per_call == max_per_window → should pass
    let calls = array![make_transfer_call(token, 100)];
    exec.__execute__(calls);

    stop_cheat_signature_global();
    stop_cheat_caller_address(account);

    let policy = spending_mgr.get_spending_policy(SESSION_PUBKEY, token);
    assert(policy.spent_in_window == 100, 'spent should be exactly 100');
}

// ===================================================================
// Audit regression tests (3)
// ===================================================================

// #11: set_spending_policy blocked by admin blocklist (Risk 2)
#[test]
fn test_blocklist_rejects_set_spending_policy() {
    let (account, session_mgr, _spending_mgr) = deploy_account();
    let current_time: u64 = 1_000_000;
    start_cheat_block_timestamp_global(current_time);

    let valid_until = current_time + 86400;
    let set_spending_sel: felt252 = selector!("set_spending_policy");
    // Session with explicit whitelist including set_spending_policy
    start_cheat_caller_address(account, account);
    session_mgr.add_or_update_session_key(SESSION_PUBKEY, valid_until, 10, array![set_spending_sel]);
    stop_cheat_caller_address(account);

    let sig = array![SESSION_PUBKEY, 0x1, 0x2, valid_until.into()];
    start_cheat_signature_global(sig.span());

    let validate = IAccountValidateDispatcher { contract_address: account };

    let calls = array![
        Call { to: account, selector: set_spending_sel, calldata: array![].span() }
    ];

    // Admin blocklist should reject before whitelist check
    let result = validate.__validate__(calls);
    assert(result == 0, 'set_spending must be blocked');

    stop_cheat_signature_global();
}

// #12: remove_spending_policy blocked by admin blocklist (Risk 2)
#[test]
fn test_blocklist_rejects_remove_spending_policy() {
    let (account, session_mgr, _spending_mgr) = deploy_account();
    let current_time: u64 = 1_000_000;
    start_cheat_block_timestamp_global(current_time);

    let valid_until = current_time + 86400;
    let remove_spending_sel: felt252 = selector!("remove_spending_policy");
    // Session with explicit whitelist including remove_spending_policy
    start_cheat_caller_address(account, account);
    session_mgr.add_or_update_session_key(SESSION_PUBKEY, valid_until, 10, array![remove_spending_sel]);
    stop_cheat_caller_address(account);

    let sig = array![SESSION_PUBKEY, 0x1, 0x2, valid_until.into()];
    start_cheat_signature_global(sig.span());

    let validate = IAccountValidateDispatcher { contract_address: account };

    let calls = array![
        Call { to: account, selector: remove_spending_sel, calldata: array![].span() }
    ];

    let result = validate.__validate__(calls);
    assert(result == 0, 'remove_spending must block');

    stop_cheat_signature_global();
}

// #13: Invalid amount calldata (felt > u128::MAX) panics with clear message (Risk 3)
#[test]
#[should_panic(expected: "Spending: invalid amount")]
fn test_spending_enforcement_invalid_amount_calldata() {
    let (account, session_mgr, spending_mgr, exec) = deploy_with_execute();
    // Use account address as fake token (avoids "not deployed" error)
    let token: ContractAddress = account;
    let current_time = 1_000_000_u64;
    start_cheat_block_timestamp_global(current_time);

    let valid_until = current_time + 86400;
    start_cheat_caller_address(account, account);
    session_mgr.add_or_update_session_key(SESSION_PUBKEY, valid_until, 100, array![TRANSFER_SELECTOR]);
    spending_mgr.set_spending_policy(SESSION_PUBKEY, token, 100, 1000, 86400);
    stop_cheat_caller_address(account);

    start_cheat_caller_address(account, account);
    let sig = array![SESSION_PUBKEY, 0x111, 0x222, valid_until.into()];
    start_cheat_signature_global(sig.span());

    // Calldata with felt252 > u128::MAX as amount_low
    let overflow_amount: felt252 = 0x100000000000000000000000000000000; // 2^128, exceeds u128::MAX
    let calls = array![
        Call {
            to: token,
            selector: TRANSFER_SELECTOR,
            calldata: array![0xBEEF, overflow_amount, 0].span(),
        }
    ];
    exec.__execute__(calls);
}
