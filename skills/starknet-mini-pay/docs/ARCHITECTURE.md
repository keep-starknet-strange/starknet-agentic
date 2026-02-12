# Starknet Mini-Pay Architecture

## Overview

P2P payment system for Starknet enabling:
- Direct transfers via address
- Payment links with QR codes
- Invoice generation
- Telegram bot integration

## Components

### Core Modules

| Module | Purpose |
|--------|---------|
| `mini_pay.py` | Main payment logic |
| `starknet_client.py` | Starknet blockchain interaction |
| `link_builder.py` | Payment URL generation |
| `qr_generator.py` | QR code generation |
| `invoice.py` | Invoice creation and management |
| `telegram_bot.py` | Telegram bot for payments |
| `cli.py` | Command-line interface |

### Data Flow

```
User Request → MiniPay Core → Starknet Client → Chain
                  ↓
           Invoice/Link/QR
                  ↓
           Telegram Bot (optional)
```

## Features

### Payment Methods

1. **Direct Transfer**: Send to address
2. **Payment Link**: shareable URL with amount and token
3. **QR Code**: Scan to pay
4. **Invoice**: Formal payment request

### Supported Tokens

- ETH
- STRK

## Security Considerations

- Private keys never exposed
- Transaction signing on-chain
- Input validation on all parameters
- Environment variable configuration

## Integration

### MCP Tools

- `mini_pay_transfer` - Direct transfer
- `mini_pay_create_link` - Create payment link
- `mini_pay_create_invoice` - Create invoice
- `mini_pay_qr_code` - Generate QR code

### Telegram Bot

Commands:
- `/pay` - Create payment
- `/invoice` - Create invoice
- `/balance` - Check balance
