# Mini-Pay Architecture

## Overview
Mini-Pay is a Python-based P2P payment skill for Starknet built on starknet-py. No Cairo contracts are required. The skill provides multiple interfaces for sending ETH/STRK, generating payment links with QR codes, and managing invoices.

## Components

### Core Modules
- `src/core/wallet.py` - Starknet account management and signing via starknet-py
- `src/core/transfer.py` - Direct token transfers for ETH and STRK
- `src/core/payment_link.py` - Generation of shareable payment URLs with encoded amount, recipient and memo
- `src/core/qr.py` - QR code generation for payment links using qrcode[pil]
- `src/core/invoice.py` - Invoice creation, storage and status tracking
- `src/core/errors.py` - Production-ready error handling

### Interfaces
- `scripts/cli.py` - Command-line interface for transfers, links and invoices
- `src/bot/telegram_bot.py` - Telegram bot integration for in-chat payments
- `src/api/server.py` - Optional lightweight API for programmatic access

### Configuration
Environment variables are loaded from `.env`. See `.env.example`.

## Flow
1. User initiates payment via CLI / Telegram / API
2. Wallet signs transaction via starknet-py
3. Transfer is broadcast to Starknet RPC
4. Payment link / QR / Invoice is generated and returned
5. Status is tracked and confirmed on-chain

## Security
Private keys never leave the local environment. All RPC calls are read-only except signed transactions.
