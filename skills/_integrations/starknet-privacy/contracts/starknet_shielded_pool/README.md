# Starknet Shielded Pool - Cairo Project

Privacy-preserving smart contracts for confidential transactions on Starknet.

## Quick Start

### 1. Install Scarb (Cairo compiler)

```bash
# Option A: Pre-built binary
curl -L https://github.com/software-mansion/scarb/releases/download/v2.8.1/scarb-v2.8.1-x86_64-unknown-linux-gnu.tar.gz | tar -xz
mv scarb-v2.8.1-x86_64-unknown-linux-gnu/bin/scarb ~/.local/bin/

# Verify installation
scarb --version
# Output: scarb 2.8.1
```

### 2. Initialize Project

```bash
cd contracts/starknet_shielded_pool

# Verify project structure
ls -la
# Scarb.toml  src/  tests/

# Build
scarb build
```

Expected output:
```
   Compiling starknet_shielded_pool v1.0.0
    Finished `dev` profile [unoptimized]
```

### 3. Run Tests

```bash
scarb test
```

### 4. Deploy to Starknet

#### Option A: Using Starkli (Recommended)

```bash
# Install starkli
curl -L https://github.com/xJonathan Leighi/starkli/releases/download/v0.3.4/starkli-v0.3.4-x86_64-unknown-linux-gnu.tar.gz | tar -xz
mv starkli ~/.local/bin/

# Configure starkli
starkli init --network sepolia

# Deploy
starkli deploy \
    --network sepolia \
    --class-hash target/dev/starknet_shielded_pool_ShieldedPool.contract_class_hash \
    --constructor-args <OWNER_ADDRESS>
```

#### Option B: Using Braavos Wallet

1. Create Braavos wallet on Sepolia testnet
2. Get Sepolia ETH from faucet: https://starknet-faucet.vercel.app/
3. Go to https://braavos.app/
4. Deploy contract using UI

#### Option C: Using Python SDK

```bash
python3 scripts/deploy.py
```

## Project Structure

```
starknet_shielded_pool/
├── Scarb.toml           # Project configuration
├── src/
│   └── lib.cairo       # Main contract implementation
└── tests/
    └── shielded_pool_test.cairo  # Unit tests
```

## Contract Functions

| Function | Description |
|----------|-------------|
| `deposit(commitment)` | Deposit ETH, receive encrypted note |
| `transfer(nullifier, old, new, proof, data)` | Private transfer |
| `withdraw(nullifier, commitment, proof, amount, recipient)` | Withdraw ETH |
| `is_nullifier_used(nullifier)` | Check if nullifier used |
| `get_pool_balance()` | Get pool balance |
| `get_merkle_root()` | Get merkle root |
| `update_merkle_root(root)` | Update merkle root (owner only) |

## Integration with Python SDK

```python
from scripts.sdk import ShieldedPoolSDK

sdk = ShieldedPoolSDK(
    contract_address="0xDEPLOYED_ADDRESS",
    rpc_url="https://rpc.starknet.lava.build:443"
)

# Deposit
await sdk.deposit(commitment, amount_wei, private_key)

# Transfer
await sdk.transfer(nullifier, old_commitment, new_commitment, proof, data, private_key)

# Withdraw
await sdk.withdraw(nullifier, commitment, proof, amount, recipient, private_key)
```

## Testing on Localnet

```bash
# Start local starknet node
starknet-devnet --port 5050

# Deploy to localnet
starkli deploy \
    --network local \
    --class-hash target/dev/...contract_class_hash

# Interact
cast send <contract> "deposit(bytes32)" <commitment> --value 1ether --rpc http://127.0.0.1:5050
```

## Security Considerations

⚠️ **Important:**

1. This is a demonstration implementation
2. Requires comprehensive security audit before production use
3. Ensure proper access controls and validation
4. Use established libraries (OpenZeppelin) in production
5. Consider formal verification

## Resources

- [Cairo Documentation](https://www.cairo-lang.org/)
- [Scarb Documentation](https://docs.swmansion.com/scarb/)
- [Starknet Documentation](https://docs.starknet.io/)
- [OpenZeppelin Cairo Contracts](https://github.com/OpenZeppelin/cairo-contracts)
- [Starknet Faucet](https://starknet-faucet.vercel.app/)

## License

MIT
