# Starknet Mini-Pay 🪙

Simple P2P payments on Starknet. Like Lightning, but native.

## What is this?

**Starknet Mini-Pay** is a lightweight payment system for everyday users on Starknet. No channels to open, no complex setup, no custodial risk. Just send and receive crypto like sending a text message.

```
📱 Send crypto via Telegram, QR codes, or payment links
💸 Works with ArgentX, Braavos, or any Starknet wallet
🔒 Self-custody only - your keys, your coins
⚡ Fast settlement (2-3 minutes on mainnet)
```

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

`starknet-py` is pinned to the tested 0.30.x range, which requires an RPC endpoint serving
Starknet JSON-RPC spec 0.10.

### 2. Set Environment Variables

```bash
# Keyless public RPC (spec 0.10). Sepolia: https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10
export STARKNET_RPC="https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10"
export MINI_PAY_ADDRESS="0xyour_address_here"
export MINI_PAY_PRIVATE_KEY="0xyour_private_key_here"
export TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
```

### 3. Send Your First Payment

```bash
# Send 0.01 ETH
python3.12 scripts/cli.py send 0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005 0.01 --memo "coffee"

# Check transaction status
python3.12 scripts/cli.py status 0x...
```

## Features

### 💸 P2P Transfers

Send ETH, STRK, or USDC to any Starknet address.

```python
from mini_pay import MiniPay

pay = MiniPay()

# Send payment (V3 transaction: the fee is paid in STRK)
tx_hash = await pay.transfer(
    from_address="0x...",
    private_key="0x...",
    to_address="0x123...",
    amount_wei=10**16,  # 0.01 ETH
    token="ETH",
    memo="Coffee"
)
```

### 📱 QR Codes

Generate QR codes for receiving payments.

```bash
python3.12 scripts/cli.py qr 0xyour_address --output my_qr.png
```

### 🔗 Payment Links

Create shareable payment links.

```bash
# Create link
python3.12 scripts/cli.py link 0xrecipient --amount 0.1 --memo "lunch"

# Parse incoming link
python3.12 scripts/cli.py parse-link "starknet:0x123...?amount=0.1&memo=lunch"
```

**Payment Link Format:**
```
starknet:<address>?amount=<value>&memo=<text>&token=<TOKEN>
```

Example:
```
starknet:0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005?amount=0.01&memo=coffee&token=ETH
```

### 📄 Invoices

Create payment requests with expiry.

```bash
# Create invoice for 25 USDC
python3.12 scripts/cli.py invoice 0xrecipient 25.00 --expires 3600 --memo "Consulting"

# Payment URL
starknet:0x...abc?amount=25&token=USDC&memo=Invoice+#abc123
```

### 🤖 Telegram Bot

Send and receive payments via Telegram.

```bash
python3.12 scripts/telegram_bot.py
```

**Bot Commands:**
- `/pay <address> <amount> [memo]` - Send payment
- `/qr` - Get your QR code
- `/balance` - Check balance
- `/link [amount] [memo]` - Generate payment link
- `/invoice <amount> [memo]` - Create invoice
- `/history` - Transaction history

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    STARKNET MINI-PAY                    │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  QR Codes   │  │  Payment    │  │   Telegram Bot  │ │
│  │  Generator  │  │   Links     │  │   Interface     │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
│           │                │                   │          │
│           └────────────────┴───────────────────┘          │
│                         │                                │
│              ┌─────────▼─────────┐                       │
│              │   starknet-py    │                       │
│              │   SDK + RPC      │                       │
│              └──────────────────┘                       │
│                         │                                │
│         ┌───────────────┼───────────────┐               │
│         ▼               ▼               ▼               │
│    ┌─────────┐    ┌──────────┐    ┌──────────┐         │
│    │ ArgentX │    │  Braavos │    │  Generic  │         │
│    │ Account │    │ Account  │    │  Account  │         │
│    └─────────┘    └──────────┘    └──────────┘         │
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
starknet-mini-pay/
├── SKILL.md              # This file
├── README.md             # Quick start guide
├── scripts/
│   ├── cli.py            # Main CLI interface
│   ├── mini_pay.py       # Core payment logic
│   ├── qr_generator.py   # QR code generation
│   ├── link_builder.py   # Payment link builder
│   ├── invoice.py        # Invoice management
│   ├── telegram_bot.py   # Telegram bot
│   └── starknet_client.py # RPC client
└── tests/
    └── test_payments.py  # Unit tests
```

## Usage Examples

### Send Payment

```python
import asyncio
from mini_pay import MiniPay

async def main():
    pay = MiniPay(rpc_url="https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10")
    
    tx_hash = await pay.transfer(
        from_address="0xsender...",
        private_key="0xkey...",
        to_address="0xrecipient...",
        amount_wei=5 * 10**16,  # 0.05 ETH
        token="ETH",
        memo="Lunch payment"
    )
    
    print(f"Sent! TX: {tx_hash}")
    
    # Wait for confirmation
    status = await pay.wait_for_confirmation(tx_hash)
    print(f"Status: {status}")

asyncio.run(main())
```

### Generate Payment Link

```python
from link_builder import PaymentLinkBuilder

link = PaymentLinkBuilder().create(
    address="0xrecipient...",
    amount=0.01,
    memo="Coffee",
    token="ETH"
)

print(f"Pay me: {link}")
```

### Create Invoice

```python
import asyncio
from invoice import InvoiceManager

async def main():
    async with InvoiceManager() as invoices:
        invoice = await invoices.create(
            payer_address="0xme...",
            amount=25.00,
            token="USDC",
            description="Consulting services"
        )
        
        print(f"Invoice: {invoice.id}")
        print(f"Pay: {invoices.create_payment_url(invoice)}")
        print(f"Expires: {invoices.format_expiry(invoice)}")

asyncio.run(main())
```

## Telegram Bot Setup

### 1. Create a Bot

1. Message @BotFather on Telegram
2. Send `/newbot` to create a new bot
3. Copy your bot token

### 2. Run the Bot

```bash
export TELEGRAM_BOT_TOKEN="your_bot_token"
export MINI_PAY_ADDRESS="0xyour_address"
export MINI_PAY_PRIVATE_KEY="0xyour_key"

python3.12 scripts/telegram_bot.py
```

### 3. Use the Bot

Message your bot and use `/start` to begin!

## Supported Tokens

| Token | Address | Decimals |
|-------|---------|----------|
| ETH | 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82dc9dd0cc | 18 |
| STRK | 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d | 18 |
| USDC | 0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005 | 6 |

## Comparison

| Feature | Lightning | Starknet Mini-Pay |
|---------|-----------|-------------------|
| Setup time | Hours | Instant |
| Privacy | Onion routing | Native |
| Speed | ~1 sec | ~2-3 min |
| Fees | Variable | Predictable |
| Custody | Lightning node | Self-custody |
| Native | No (needs BTC) | Yes |

## Error Handling

```python
try:
    tx_hash = await pay.transfer(...)
except ValueError as e:
    if "Insufficient STRK for fees" in str(e):
        print("Not enough STRK to pay the V3 transaction fee")
    elif "ACCOUNT_NOT_FOUND" in str(e):
        print("Invalid sender address")
```

## Security Best Practices

1. **Never share private keys** - Only use in secure environments
2. **Use environment variables** - Don't hardcode keys
3. **Validate addresses** - Always checksum addresses
4. **Start small** - Test with small amounts first
5. **Use hardware wallets** - When possible

## Roadmap

- [ ] Multi-signature support
- [ ] Recurring payments
- [ ] Payment splits
- [ ] Mobile app
- [ ] Browser extension
- [ ] Batch transactions

## Resources

- [Starknet Documentation](https://docs.starknet.io/)
- [starknet-py SDK](https://github.com/starknet-io/starknet-py)
- [Argent X Wallet](https://www.argent.xyz/argent-x/)
- [Braavos Wallet](https://braavos.app/)

## License

MIT

---

Built with ⚡ by Sefirot 🤖
