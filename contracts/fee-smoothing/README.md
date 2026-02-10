# OFS - Oracle Fee Smoothing

**Oracle-based fee smoothing solution for Starknet.**

Provides predictable USD-denominated fees while smoothing STRK price volatility using TWAP.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        dApp Integration                          │
│   get_fee_usd(gas) → predictable USD cost                       │
│   get_fee_strk(gas) → STRK amount at smoothed price             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   OFS Contract (Cairo)                            │
│   ├── Price Oracle (validated updates)                           │
│   ├── TWAP Accumulator (24h window)                             │
│   ├── Fee Calculator (USD ↔ STRK)                               │
│   └── Admin Controls                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Oracle Keeper (Python)                         │
│   Sources:                                                        │
│   ├── Binance CEX (30%)                                           │
│   ├── Coinbase CEX (25%)                                         │
│   ├── JediSwap DEX (12.5%)                                        │
│   ├── MySwap DEX (12.5%)                                          │
│   ├── Ekubo DEX v3 (10%)                                         │
│   └── AVNU Aggregator (10%)                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Contract Features
- **Price Validation**: Min $0.01, Max $100, Max 20% deviation per update
- **TWAP Smoothing**: 24-hour window, configurable 80/20 blend
- **Predictable Fees**: USD-denominated fees independent of STRK volatility
- **Emergency Stop**: Safety mechanism for extreme conditions
- **Access Control**: Ownable with oracle role

### Keeper Features
- **Multi-Source Aggregation**: CEX + DEX with weighted average
- **Outlier Resistance**: Median for ≥3 sources
- **Automatic Updates**: Triggered by 5% deviation
- **Health Monitoring**: RPC and price source checks

## Quick Start

### Build & Test

```bash
cd contracts/fee-smoothing
scarb build
scarb test  # 31 tests
```

### Deploy

```bash
# Build first
scarb build

# Deploy using sncast
sncast deploy --contract target/dev/fee_smoothing_FeeSierra.contract_class_hash

# Save deployed address
```

### Run Keeper

```bash
# Install dependencies
pip install -r ../../scripts/fee-oracle-keeper/requirements.txt

# Configure (edit config.json)
cp ../../scripts/fee-oracle-keeper/config.example.json ../../scripts/fee-oracle-keeper/config.json
vim ../../scripts/fee-oracle-keeper/config.json

# Run keeper
python ../../scripts/fee-oracle-keeper/oracle_keeper.py --config ../../scripts/fee-oracle-keeper/config.json
```

## Contract API

### Public Functions

| Function | Description |
|----------|-------------|
| `update_price(new_price)` | Update STRK/USD price (owner/oracle only) |
| `get_fee_strk(gas)` | Get fee in STRK |
| `get_fee_usd(gas)` | Get predictable USD fee |
| `get_effective_price()` | Get TWAP-blended price |
| `is_price_stale()` | Check if price is stale (>1h) |
| `get_state()` | Get full state snapshot |

### Admin Functions

| Function | Description |
|----------|-------------|
| `set_target_usd_per_gas()` | Set USD target per gas unit |
| `set_smoothing_factor()` | Adjust TWAP weighting |
| `set_max_deviation()` | Change max deviation threshold |
| `emergency_stop()` | Halt with reason |

## File Structure

```
contracts/fee-smoothing/
├── Scarb.toml
├── src/
│   ├── lib.cairo           # Module exports
│   ├── interfaces.cairo   # IFeeSmoothing, IFeeSmoothingAdmin
│   └── fee_smoothing.cairo # Main contract
├── tests/
│   └── test_fee_smoothing.cairo  # 31 tests
└── README.md

scripts/fee-oracle-keeper/
├── oracle_keeper.py        # Main keeper script
├── requirements.txt        # Python dependencies
├── config.example.json      # Configuration template
└── README.md               # Keeper docs
```

## Testing

```bash
cd contracts/fee-smoothing
scarb test
```

Expected: **31/31 tests passed**

### Test Coverage

| Category | Tests |
|----------|-------|
| Constructor | 2 |
| Price Updates | 6 |
| Fee Calculation | 5 |
| Price Staleness | 3 |
| Admin Functions | 5 |
| TWAP Calculation | 2 |
| Edge Cases | 5 |
| Access Control | 2 |
| Protocol Minimum | 1 |

## Gas Costs

| Operation | L2 Gas |
|-----------|--------|
| Constructor | ~610K |
| Price Update | ~1.1-1.2M |
| Get Fee | ~544-600K |
| Admin | ~740K-1.1M |

## Security

| Risk | Mitigation |
|------|------------|
| Flash Attacks | 20% deviation limit |
| Oracle Manipulation | TWAP + multi-source |
| Stale Prices | 1h timeout check |
| Owner Key | Multi-sig recommended |

## Credits

- Starknet Foundation (Cairo, Scarb)
- OpenZeppelin (Cairo contracts)
- Starknet Foundry (snforge)

## License

MIT
