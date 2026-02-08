#!/usr/bin/env python3
"""
Starknet Mini-Pay CLI (FIXED)
- Private key from ENV variable (not CLI flag) for security
- Fixed imports for custom error classes
- Proper async handling
"""

import argparse
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mini_pay import MiniPay, MiniPayError, TransferResult
from qr_generator import QRGenerator
from link_builder import PaymentLinkBuilder
from invoice import InvoiceManager


NETWORKS = {
    "mainnet": "https://rpc.starknet.lava.build:443",
    "sepolia": "https://starknet-sepolia.public.blastapi.io/rpc/v0_6"
}


def parse_args():
    parser = argparse.ArgumentParser(description="Starknet Mini-Pay CLI", formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--network", "-n", choices=["mainnet", "sepolia"], default="mainnet")
    parser.add_argument("--rpc", "-r", help="Custom RPC URL")
    subparsers = parser.add_subparsers(dest="command")
    
    send = subparsers.add_parser("send", help="Send payment")
    send.add_argument("address", help="Recipient address")
    send.add_argument("amount", type=float, help="Amount")
    send.add_argument("--token", default="ETH")
    
    bal = subparsers.add_parser("balance", help="Check balance")
    bal.add_argument("address", help="Address")
    bal.add_argument("--token", default="ETH")
    
    qr = subparsers.add_parser("qr", help="Generate QR")
    qr.add_argument("address", help="Address")
    qr.add_argument("--output", "-o", default="qr.png")
    
    return parser.parse_args()


def get_private_key():
    key = os.environ.get("MINI_PAY_PRIVATE_KEY")
    if not key:
        raise ValueError("Set MINI_PAY_PRIVATE_KEY env variable")
    return key


async def main_async():
    args = parse_args()
    if not args.command:
        print("No command specified")
        sys.exit(1)
    
    rpc_url = args.rpc or NETWORKS.get(args.network)
    private_key = get_private_key()
    address = os.environ.get("MINI_PAY_ADDRESS", "")
    
    pay = MiniPay(rpc_url, private_key, address)
    
    if args.command == "balance":
        bal = await pay.get_balance(args.address, args.token)
        print(f"Balance: {bal} wei")
    elif args.command == "send":
        amount_wei = int(args.amount * 10**18)
        result = await pay.transfer(args.address, amount_wei, args.token)
        print(f"Tx: {result.tx_hash}")


def main():
    try:
        asyncio.run(main_async())
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
