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


def get_mini_pay(rpc_url: str) -> MiniPay:
    """Construct MiniPay only when sender credentials are needed."""
    private_key = get_private_key()
    address = os.environ.get("MINI_PAY_ADDRESS")
    if not address:
        raise ValueError("Set MINI_PAY_ADDRESS env variable")
    return MiniPay(rpc_url, private_key, address)


async def main_async():
    args = parse_args()
    if not args.command:
        print("No command specified")
        sys.exit(1)

    rpc_url = args.rpc or NETWORKS.get(args.network)

    if args.command == "balance":
        # Balance check only needs RPC, not sender credentials
        from starknet_py.net.full_node_client import FullNodeClient
        from starknet_py.net.client_models import Call
        from starknet_py.hash.selector import get_selector_from_name

        client = FullNodeClient(node_url=rpc_url)
        addr_int = int(args.address, 16)
        # Use mainnet ETH address for now
        token_addr = 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7
        call = Call(to_addr=token_addr, selector=get_selector_from_name("balanceOf"), calldata=[addr_int])
        result = await client.call_contract(call=call, block_number="latest")
        if result and len(result) >= 2:
            balance = result[0] + (result[1] << 128)
        else:
            balance = 0
        print(f"Balance: {balance} wei")
    elif args.command == "send":
        pay = get_mini_pay(rpc_url)
        amount_wei = int(args.amount * 10**18)
        result = await pay.transfer(args.address, amount_wei, args.token)
        print(f"Tx: {result.tx_hash}")
    elif args.command == "qr":
        qr = QRGenerator()
        await qr.generate_qr(args.address, args.output)
        print(f"QR saved to {args.output}")


def main():
    try:
        asyncio.run(main_async())
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
