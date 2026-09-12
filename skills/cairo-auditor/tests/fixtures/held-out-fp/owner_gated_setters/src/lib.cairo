// BENIGN. Tempts NO_ACCESS_CONTROL_MUTATION: every mutating entrypoint is named
// with a setter prefix the detector greps for, and every one is owner-gated.
#[starknet::contract]
mod OwnerGatedSetters {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        fee_bps: u16,
        oracle: ContractAddress,
        paused: bool,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        assert!(!owner.is_zero(), "owner_zero");
        self.owner.write(owner);
    }

    fn assert_only_owner(self: @ContractState) {
        assert!(get_caller_address() == self.owner.read(), "not_owner");
    }

    #[external(v0)]
    fn set_fee_bps(ref self: ContractState, fee_bps: u16) {
        assert_only_owner(@self);
        assert!(fee_bps <= 1000_u16, "fee_too_high");
        self.fee_bps.write(fee_bps);
    }

    #[external(v0)]
    fn configure_oracle(ref self: ContractState, oracle: ContractAddress) {
        assert_only_owner(@self);
        assert!(!oracle.is_zero(), "oracle_zero");
        self.oracle.write(oracle);
    }

    #[external(v0)]
    fn grant_pause(ref self: ContractState, paused: bool) {
        assert_only_owner(@self);
        self.paused.write(paused);
    }
}
