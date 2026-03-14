fn split_amount(amount: u128) -> (u128, u128) {
    let q = amount / 2;
    let r = amount % 2;
    (q, r)
}

#[starknet::contract]
mod InsecureVault {
    use starknet::{ContractAddress};
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
        self.owner.write(owner);
        self.fee_bps.write(initial_fee_bps);
    }

    #[external(v0)]
    fn set_fee(ref self: ContractState, new_fee_bps: u16) {
        self.fee_bps.write(new_fee_bps);
    }

    #[external(v0)]
    fn split_half(ref self: ContractState, amount: u128) {
        let q = amount / 2;
        let r = amount % 2;
        self.last_half.write(q);
        self.last_remainder.write(r);
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
