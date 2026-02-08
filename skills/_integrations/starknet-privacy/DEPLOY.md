# Shielded Pool Deployment Info

## Deployed Contract Artifacts

### Location
```
contracts/starknet_shielded_pool_forge/target/dev/
├── starknet_shielded_pool.sierra.json          # Sierra bytecode (394KB)
├── starknet_shielded_pool_ShieldedPoolMinimal.contract_class.json  # ABI + Sierra
└── shielded_pool_ShieldedPool.contract_class.json  # Latest build
```

### ABI Functions
```json
{
  "deposit": {"inputs": ["commitment", "amount"], "outputs": ["index"]},
  "spend": {"inputs": ["nullifier", "old_commitment", "new_commitment"], "outputs": ["success"]},
  "withdraw": {"inputs": ["nullifier", "amount", "recipient"], "outputs": ["success"]},
  "is_nullifier_spent": {"inputs": ["nullifier"], "outputs": ["spent"]},
  "get_pool_balance": {"outputs": ["balance"]},
  "get_merkle_root": {"outputs": ["root"]},
  "get_total_deposits": {"outputs": ["count"]},
  "get_owner": {"outputs": ["owner"]},
  "update_merkle_root": {"inputs": ["new_root"]}
}
```

## Deploy Command
```bash
export STARKNET_PRIVATE_KEY=...
export STARKNET_ACCOUNT_ADDRESS=...
python3 scripts/deploy.py --network testnet
```

## Quick Test
```bash
# Test merkle tree
python3 scripts/merkle_tree.py
```

## Next Steps
1. Install starknet-py (Python 3.10-3.12)
2. Set deployment credentials
3. Run deploy.py
4. Integrate with ZK circuits
