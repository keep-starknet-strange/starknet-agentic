# OFM Keeper - Oracle Fee Smoothing Keeper

Scripts for running the oracle keeper that updates OFM price feeds.

## Installation

```bash
pip install -r requirements.txt
```

## Configuration

Copy the example config and fill in your values:

```bash
cp config.example.json config.json
vim config.json
```

Required fields:
- `starknet_rpc`: RPC endpoint URL
- `fee_smoothing_address`: Deployed OFM contract address
- `account_address`: Oracle account address
- `private_key`: Oracle account private key (hex, no 0x prefix)

Optional fields:
- `update_interval_seconds`: Price update interval (default: 3600)
- `price_deviation_threshold`: Trigger update on deviation (default: 0.05)
- `sources`: Price source configuration

## Usage

### Run Keeper (Continuous)

```bash
python oracle_keeper.py --config config.json
```

### Fetch Prices Once

```bash
python oracle_keeper.py --once
```

### Health Check

```bash
python oracle_keeper.py --health
```

### Custom Interval

```bash
python oracle_keeper.py --interval 1800  # 30 minutes
```

## Price Sources

| Source | Type | Default Weight |
|--------|------|----------------|
| Binance | CEX | 30% |
| Coinbase | CEX | 25% |
| JediSwap | DEX (Starknet) | 12.5% |
| MySwap | DEX (Starknet) | 12.5% |
| Ekubo | DEX v3 (Starknet) | 10% |
| AVNU | DEX Aggregator | 10% |

### Aggregation Method

- **≥3 active sources**: Median price (outlier resistant)
- **<3 active sources**: Weighted average

## Files

```
ofm-keeper/
├── oracle_keeper.py       # Main keeper script
├── requirements.txt       # Python dependencies
├── config.example.json    # Configuration template
└── config.json           # Your configuration (create from example)
```

## Systemd Service (Optional)

Create `/etc/systemd/system/ofm-keeper.service`:

```ini
[Unit]
Description=OFM Oracle Keeper
After=network.target

[Service]
Type=simple
User=starknet
WorkingDirectory=/opt/ofm-keeper
ExecStart=/usr/bin/python3 /opt/ofm-keeper/oracle_keeper.py --config /opt/ofm-keeper/config.json
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ofm-keeper
sudo systemctl start ofm-keeper
```

## Logging

Logs are written to:
- `oracle_keeper.log` (file)
- stdout (console)

Log level: INFO by default

## Troubleshooting

### Connection Errors
- Check RPC endpoint availability
- Verify firewall rules
- Try alternative RPC provider

### Price Errors
- Verify API endpoints (Binance, Coinbase)
- Check rate limits
- Enable fallback sources

### Transaction Errors
- Verify account has enough STRK for fees
- Check nonce is correct
- Verify contract is deployed
