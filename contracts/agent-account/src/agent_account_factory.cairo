#[starknet::contract]
pub mod AgentAccountFactory {
    use core::byte_array::ByteArray;
    use openzeppelin::token::erc721::interface::{
        IERC721Dispatcher, IERC721DispatcherTrait,
    };
    use starknet::{
        ClassHash, ContractAddress, get_caller_address, get_contract_address,
        syscalls::deploy_syscall, SyscallResultTrait,
    };
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::super::interfaces::{
        IAgentAccountDispatcher, IAgentAccountDispatcherTrait, IAgentAccountFactory,
    };

    #[starknet::interface]
    trait IIdentityRegistry<TState> {
        fn register_with_token_uri(ref self: TState, token_uri: ByteArray) -> u256;
        fn register(ref self: TState) -> u256;
    }

    #[storage]
    struct Storage {
        owner: ContractAddress,
        account_class_hash: ClassHash,
        identity_registry: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        AccountDeployed: AccountDeployed,
        AccountClassHashUpdated: AccountClassHashUpdated,
        IdentityRegistryUpdated: IdentityRegistryUpdated,
    }

    #[derive(Drop, starknet::Event)]
    struct AccountDeployed {
        account: ContractAddress,
        public_key: felt252,
        agent_id: u256,
        registry: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct AccountClassHashUpdated {
        old_class_hash: ClassHash,
        new_class_hash: ClassHash,
    }

    #[derive(Drop, starknet::Event)]
    struct IdentityRegistryUpdated {
        old_registry: ContractAddress,
        new_registry: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        account_class_hash: ClassHash,
        identity_registry: ContractAddress,
    ) {
        let caller = get_caller_address();
        self.owner.write(caller);
        self.account_class_hash.write(account_class_hash);
        self.identity_registry.write(identity_registry);
    }

    #[abi(embed_v0)]
    impl AgentAccountFactoryImpl of IAgentAccountFactory<ContractState> {
        fn deploy_account(
            ref self: ContractState,
            public_key: felt252,
            salt: felt252,
            token_uri: ByteArray,
        ) -> (ContractAddress, u256) {
            let class_hash = self.account_class_hash.read();
            let zero_class: ClassHash = 0.try_into().unwrap();
            assert(class_hash != zero_class, 'Account class hash not set');

            let registry = self.identity_registry.read();
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(registry != zero, 'Identity registry not set');

            let factory_address = get_contract_address();
            let constructor_calldata = array![public_key, factory_address.into()];
            let (account_address, _) = deploy_syscall(
                class_hash,
                salt,
                constructor_calldata.span(),
                false,
            )
                .unwrap_syscall();

            let registry_dispatcher = IIdentityRegistryDispatcher {
                contract_address: registry
            };
            let agent_id = registry_dispatcher.register_with_token_uri(token_uri);

            let erc721 = IERC721Dispatcher { contract_address: registry };
            erc721.transfer_from(factory_address, account_address, agent_id);

            let account = IAgentAccountDispatcher { contract_address: account_address };
            account.init_agent_id_from_factory(registry, agent_id);

            self.emit(
                AccountDeployed {
                    account: account_address,
                    public_key,
                    agent_id,
                    registry,
                },
            );

            (account_address, agent_id)
        }

        fn get_account_class_hash(self: @ContractState) -> ClassHash {
            self.account_class_hash.read()
        }

        fn set_account_class_hash(ref self: ContractState, new_class_hash: ClassHash) {
            self._assert_owner();
            let old_class_hash = self.account_class_hash.read();
            self.account_class_hash.write(new_class_hash);
            self.emit(AccountClassHashUpdated { old_class_hash, new_class_hash });
        }

        fn get_identity_registry(self: @ContractState) -> ContractAddress {
            self.identity_registry.read()
        }

        fn set_identity_registry(ref self: ContractState, new_registry: ContractAddress) {
            self._assert_owner();
            let old_registry = self.identity_registry.read();
            self.identity_registry.write(new_registry);
            self.emit(IdentityRegistryUpdated { old_registry, new_registry });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _assert_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), 'Only owner');
        }
    }
}
