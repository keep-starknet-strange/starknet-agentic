#[starknet::contract]
pub mod MockERC20 {
    use starknet::storage::*;
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        total_supply: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            let balance = self.balances.entry(to).read();
            self.balances.entry(to).write(balance + amount);
            self.total_supply.write(self.total_supply.read() + amount);
        }
    }

    #[external(v0)]
    fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
        self._mint(to, amount);
    }

    #[external(v0)]
    fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
        self.balances.entry(account).read()
    }

    #[external(v0)]
    fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
        let sender = get_caller_address();
        let sender_bal = self.balances.entry(sender).read();
        assert(sender_bal >= amount, 'insufficient balance');
        self.balances.entry(sender).write(sender_bal - amount);
        let recipient_bal = self.balances.entry(recipient).read();
        self.balances.entry(recipient).write(recipient_bal + amount);
        true
    }

    #[external(v0)]
    fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
        let caller = get_caller_address();
        self.allowances.entry((caller, spender)).write(amount);
        true
    }

    #[external(v0)]
    fn transfer_from(
        ref self: ContractState,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool {
        let caller = get_caller_address();
        let allowance = self.allowances.entry((sender, caller)).read();
        assert(allowance >= amount, 'insufficient allowance');
        self.allowances.entry((sender, caller)).write(allowance - amount);

        let sender_bal = self.balances.entry(sender).read();
        assert(sender_bal >= amount, 'insufficient balance');
        self.balances.entry(sender).write(sender_bal - amount);

        let recipient_bal = self.balances.entry(recipient).read();
        self.balances.entry(recipient).write(recipient_bal + amount);
        true
    }
}
