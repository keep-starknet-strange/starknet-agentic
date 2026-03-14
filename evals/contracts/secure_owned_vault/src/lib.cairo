use core::num::traits::DivRem;

fn split_amount(amount: u128) -> (u128, u128) {
    DivRem::div_rem(amount, 2)
}

#[starknet::contract]
mod OwnedVault {
    use core::num::traits::DivRem;
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        fee_bps: u16,
        last_half: u128,
        last_remainder: u128,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, initial_fee_bps: u16) {
        assert!(!owner.is_zero(), "owner_zero");
        assert!(initial_fee_bps <= 10_000_u16, "fee_range");
        self.owner.write(owner);
        self.fee_bps.write(initial_fee_bps);
    }

    fn assert_only_owner(self: @ContractState) {
        let caller = get_caller_address();
        let owner = self.owner.read();
        assert!(caller == owner, "not_owner");
    }

    #[external(v0)]
    fn set_fee(ref self: ContractState, new_fee_bps: u16) {
        assert_only_owner(@self);
        assert!(new_fee_bps <= 10_000_u16, "fee_range");
        self.fee_bps.write(new_fee_bps);
    }

    #[external(v0)]
    fn split_half(ref self: ContractState, amount: u128) {
        assert_only_owner(@self);
        let (half, remainder) = DivRem::div_rem(amount, 2);
        self.last_half.write(half);
        self.last_remainder.write(remainder);
    }

    #[external(v0)]
    fn get_fee(self: @ContractState) -> u16 {
        self.fee_bps.read()
    }

    #[external(v0)]
    fn get_last_split(self: @ContractState) -> (u128, u128) {
        (self.last_half.read(), self.last_remainder.read())
    }
}

#[cfg(test)]
mod tests {
    use super::split_amount;

    #[test]
    fn split_amount_even() {
        let (half, rem) = split_amount(10);
        assert!(half == 5, "half_even");
        assert!(rem == 0, "rem_even");
    }

    #[test]
    fn split_amount_odd() {
        let (half, rem) = split_amount(11);
        assert!(half == 5, "half_odd");
        assert!(rem == 1, "rem_odd");
    }
}
