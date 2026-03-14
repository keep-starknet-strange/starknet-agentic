use core::num::traits::DivRem;

fn halve_and_remainder(value: u128) -> (u128, u128) {
    DivRem::div_rem(value, 2)
}

fn is_even(value: u128) -> bool {
    let (_half, rem) = DivRem::div_rem(value, 2);
    rem == 0
}

fn count_to(n: u32) -> u32 {
    let mut i = 0_u32;
    while i != n {
        i += 1;
    }
    i
}

#[starknet::contract]
mod MathPatterns {
    use core::num::traits::DivRem;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        last_half: u128,
        last_remainder: u128,
        last_count: u32,
    }

    #[external(v0)]
    fn split_half(ref self: ContractState, value: u128) {
        let (half, rem) = DivRem::div_rem(value, 2);
        self.last_half.write(half);
        self.last_remainder.write(rem);
    }

    #[external(v0)]
    fn count(ref self: ContractState, n: u32) {
        let mut i = 0_u32;
        while i != n {
            i += 1;
        }
        self.last_count.write(i);
    }

    #[external(v0)]
    fn get_last_split(self: @ContractState) -> (u128, u128) {
        (self.last_half.read(), self.last_remainder.read())
    }

    #[external(v0)]
    fn get_last_count(self: @ContractState) -> u32 {
        self.last_count.read()
    }
}

#[cfg(test)]
mod tests {
    use super::{count_to, halve_and_remainder, is_even};

    #[test]
    fn split_ok() {
        let (half, rem) = halve_and_remainder(11);
        assert!(half == 5, "half");
        assert!(rem == 1, "rem");
    }

    #[test]
    fn parity_ok() {
        assert!(is_even(12), "even");
        assert!(!is_even(13), "odd");
    }

    #[test]
    fn loop_ok() {
        assert!(count_to(7) == 7, "count");
    }
}
