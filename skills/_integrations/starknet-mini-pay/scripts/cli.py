#!/usr/bin/env python3.12
"""
Starknet Mini-Pay CLI (FIXED)
Command-line interface with proper async handling

FIXES from audit:
1. Added missing asyncio.run() at entry points
2. Fixed all await calls
3. Added proper error handling
4. Added async context managers
"""

import argparse
import asyncio
import sys
import os
import aiohttp

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mini_pay import MiniPay, MiniPayError, InvalidAddressError, InsufficientBalanceError
from qr_generator import QRGenerator
from link_builder import PaymentLinkBuilder
from invoice import InvoiceManager


# Configuration
NETWORKS = {
    "mainnet": "https://rpc.starknet.lava.build:443",
    "sepolia": "https://starknet-sepolia.public.blastapi.io/rpc/v0_6"
}

DEFAULT_RPC = NETWORKS["mainnet"]


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Starknet Mini-Pay CLI (Fixed)",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        "--network", "-n",
        choices=["mainnet", "sepolia"],
        default="mainnet",
        help="Network (default: mainnet)"
    )
    
    parser.add_argument(
        "--rpc", "-r",
        help="Custom RPC URL (overrides --network)"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Send command
    send_parser = subparsers.add_parser("send", help="Send a payment")
    send_parser.add_argument("address", help="Recipient Starknet address (0x...)")
    send_parser.add_argument("amount", type=float, help="Amount to send")
    send_parser.add_argument("--memo", help="Optional memo/note")
    send_parser.add_argument("--token", default="ETH", help="Token (ETH, STRK, USDC)")
    send_parser.add_argument("--from", dest="from_address", help="Sender address")
    send_parser.add_argument("--key", dest="private_key", help="Private key")
    
    # Balance command
    balance_parser = subparsers.add_parser("balance", help="Check balance")
    balance_parser.add_argument("address", help="Starknet address")
    balance_parser.add_argument("--token", default="ETH", help="Token to check")
    
    # QR command
    qr_parser = subparsers.add_parser("qr", help="Generate QR code for address")
    qr_parser.add_argument("address", help="Starknet address")
    qr_parser.add_argument("--output", "-o", default="qr_code.png", help="Output file")
    qr_parser.add_argument("--amount", type=float, help="Pre-fill amount")
    qr_parser.add_argument("--memo", help="Pre-fill memo")
    
    # Link command
    link_parser = subparsers.add_parser("link", help="Create payment link")
    link_parser.add_argument("address", help="Recipient address")
    link_parser.add_argument("--amount", type=float, help="Amount")
    link_parser.add_argument("--memo", help="Payment memo")
    link_parser.add_argument("--token", default="ETH", help="Token")
    
    # Parse link command
    parse_parser = subparsers.add_parser("parse-link", help="Parse payment link")
    parse_parser.add_argument("url", help="Payment link URL")
    
    # Invoice command
    invoice_parser = subparsers.add_parser("invoice", help="Create payment invoice")
    invoice_parser.add_argument("address", help="Your address (to receive payment)")
    invoice_parser.add_argument("amount", type=float, help="Amount requested")
    invoice_parser.add_argument("--token", default="USDC", help="Token")
    invoice_parser.add_argument("--expires", type=int, default=3600, help="Expiry in seconds")
    invoice_parser.add_argument("--memo", help="Invoice description")
    
    # Status command
    status_parser = subparsers.add_parser("status", help="Check transaction status")
    status_parser.add_argument("tx_hash", help="Transaction hash")
    
    # Config command
    config_parser = subparsers.add_parser("config", help="Show current configuration")
    
    return parser.parse_args()


async def cmd_send(args, rpc_url: str):
    """Handle send command."""
    # Load config from environment or args
    from_address = args.from_address or os.environ.get("MINI_PAY_ADDRESS", "")
    private_key = args.private_key or os.environ.get("MINI_PAY_PRIVATE_KEY", "")
    
    if not from_address:
        print("❌ Error: No sender address provided. Set MINI_PAY_ADDRESS or use --from")
        return 1
    
    if not private_key:
        print("❌ Error: No private key provided. Set MINI_PAY_PRIVATE_KEY or use --key")
        return 1
    
    # Convert amount to wei
    token = args.token.upper()
    decimals = 18 if token in ["ETH", "STRK"] else 6
    amount_wei = int(args.amount * 10**decimals)
    
    print(f"📤 Sending {args.amount} {token} to {args.address[:16]}...")
    print(f"   Memo: {args.memo or 'None'}")
    
    pay = MiniPay(rpc_url=rpc_url)
    
    try:
        result = await pay.transfer(
            from_address=from_address,
            private_key=private_key,
            to_address=args.address,
            amount=amount_wei,
            token=token
        )
        
        print(f"⏳ Transaction submitted: {result.tx_hash[:32]}...")
        
        # Wait for confirmation
        status = await pay.wait_for_confirmation(result.tx_hash)
        
        if status == "CONFIRMED":
            print(f"✅ Payment confirmed!")
        else:
            print(f"⚠️ Status: {status}")
        
        return 0
        
    except InvalidAddressError as e:
        print(f"❌ Address error: {e}")
        return 1
    except InsufficientBalanceError as e:
        print(f"❌ Balance error: {e}")
        return 1
    except MiniPayError as e:
        print(f"❌ Error: {e}")
        return 1


async def cmd_balance(args, rpc_url: str):
    """Handle balance command."""
    pay = MiniPay(rpc_url=rpc_url)
    
    try:
        balance = await pay.get_balance(args.address, args.token)
        
        decimals = 18 if args.token.upper() in ["ETH", "STRK"] else 6
        display_amount = balance / 10**decimals
        
        print(f"💰 Balance for {args.address[:16]}...")
        print(f"   {args.token}: {display_amount:.6f}")
        
        return 0
        
    except InvalidAddressError as e:
        print(f"❌ Invalid address: {e}")
        return 1
    except MiniPayError as e:
        print(f"❌ Error: {e}")
        return 1


async def cmd_qr(args):
    """Handle QR generation command."""
    qr = QRGenerator()
    
    try:
        qr.generate(
            address=args.address,
            amount=args.amount,
            memo=args.memo,
            output_file=args.output
        )
        print(f"✅ QR code saved to {args.output}")
        
        # Also print the payment link
        link = PaymentLinkBuilder()
        url = link.create(args.address, args.amount, args.memo, args.token or "ETH")
        print(f"📱 Payment link: {url}")
        
        return 0
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1


async def cmd_link(args):
    """Handle link creation command."""
    link = PaymentLinkBuilder()
    
    url = link.create(
        address=args.address,
        amount=args.amount,
        memo=args.memo,
        token=args.token
    )
    
    print(f"🔗 Payment Link:")
    print(f"   {url}")
    
    # Generate QR for the link
    qr = QRGenerator()
    qr_file = f"link_{args.address[:8]}.png"
    qr.generate_link(url, qr_file)
    print(f"📱 QR code saved to {qr_file}")
    
    # Create wallet deep links
    deep_links = link.create_wallet_deep_links(
        address=args.address,
        amount=args.amount,
        memo=args.memo,
        token=args.token
    )
    
    print(f"\n🦊 Wallet Links:")
    print(f"   ArgentX: {deep_links['argent'][:60]}...")
    print(f"   Braavos: {deep_links['braavos'][:60]}...")
    
    return 0


async def cmd_parse_link(args):
    """Handle link parsing command."""
    link = PaymentLinkBuilder()
    
    try:
        data = link.parse(args.url)
        print("📋 Parsed Payment Link:")
        print(f"   Address: {data.address}")
        print(f"   Amount: {data.amount or 'N/A'} {data.token}")
        print(f"   Memo: {data.memo or 'N/A'}")
        return 0
        
    except Exception as e:
        print(f"❌ Error parsing link: {e}")
        return 1


async def cmd_invoice(args, rpc_url: str):
    """Handle invoice creation command."""
    async with InvoiceManager(rpc_url=rpc_url) as invoice_mgr:
        invoice = await invoice_mgr.create(
            payer_address=args.address,
            amount=args.amount,
            token=args.token.upper(),
            expiry_seconds=args.expires,
            description=args.memo
        )
        
        print(f"📄 Invoice Created:")
        print(f"   ID: {invoice.id}")
        print(f"   Amount: {args.amount} {args.token}")
        print(f"   Expires: {args.expires}s ({args.expires/3600:.1f} hours)")
        print(f"   Address: {args.address}")
        
        # Generate payment link
        link = PaymentLinkBuilder()
        url = link.create(
            address=args.address,
            amount=args.amount,
            memo=f"Invoice #{invoice.id[:8]}",
            token=args.token
        )
        print(f"   Link: {url}")
        
        return 0


async def cmd_status(args, rpc_url: str):
    """Handle status check command."""
    pay = MiniPay(rpc_url=rpc_url)
    
    try:
        status = await pay.get_transaction_status(args.tx_hash)
        tx_data = await pay.get_transaction(args.tx_hash)
        
        print(f"📊 Transaction Status:")
        print(f"   TX: {args.tx_hash[:32]}...")
        print(f"   Status: {status}")
        print(f"   Block: {tx_data.get('block_number', 'Pending')}")
        
        return 0
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1


def cmd_config(rpc_url: str):
    """Show configuration."""
    print("⚙️  Configuration")
    print("=" * 40)
    print(f"RPC URL: {rpc_url}")
    print(f"Network: {'mainnet' if 'mainnet' in rpc_url else 'sepolia'}")
    print(f"MINI_PAY_ADDRESS: {'✓ Set' if os.environ.get('MINI_PAY_ADDRESS') else '✗ Not set'}")
    print(f"MINI_PAY_PRIVATE_KEY: {'✓ Set' if os.environ.get('MINI_PAY_PRIVATE_KEY') else '✗ Not set'}")


async def main():
    """Main entry point with proper async handling."""
    args = parse_args()
    
    # Determine RPC URL
    rpc_url = args.rpc if args.rpc else NETWORKS.get(args.network, DEFAULT_RPC)
    
    # Route command
    if not args.command:
        parse_args().print_help()
        return 0
    
    if args.command == "config":
        cmd_config(rpc_url)
        return 0
    
    if args.command == "send":
        return await cmd_send(args, rpc_url)
    
    if args.command == "balance":
        return await cmd_balance(args, rpc_url)
    
    if args.command == "qr":
        return await cmd_qr(args)
    
    if args.command == "link":
        return await cmd_link(args)
    
    if args.command == "parse-link":
        return await cmd_parse_link(args)
    
    if args.command == "invoice":
        return await cmd_invoice(args, rpc_url)
    
    if args.command == "status":
        return await cmd_status(args, rpc_url)
    
    parse_args().print_help()
    return 0


# Entry point with proper async handling
if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
