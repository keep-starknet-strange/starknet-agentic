#!/usr/bin/env python3.12
"""
Starknet Privacy - Main entry point for privacy protocols
"""

import argparse
import sys
import os
from pathlib import Path

# Add skill root to path
SKILL_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(SKILL_ROOT))


def main():
    parser = argparse.ArgumentParser(
        description="Starknet Privacy - Confidential transactions and shielded pools",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument("--rpc", "-r", default="https://rpc.starknet.lava.build:443",
                       help="RPC URL")
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    subparsers.add_parser("status", help="Show protocol status")
    subparsers.add_parser("demo", help="Run privacy demo")
    
    # CLI proxy
    cli_parser = subparsers.add_parser("cli", help="Run CLI directly")
    cli_parser.add_argument("args", nargs=argparse.REMAINDER, help="CLI arguments")
    
    args = parser.parse_args()
    
    if args.command == "status":
        print("Starknet Privacy Protocol")
        print("=" * 40)
        print("Features:")
        print("  - Confidential Notes")
        print("  - Shielded Pools")
        print("  - ZK-SNARK proofs (Garaga)")
        print("  - Selective privacy")
    
    elif args.command == "cli":
        from scripts.cli import main as cli_main
        sys.argv = [sys.argv[0]] + args.args
        cli_main()
    
    elif args.command == "demo":
        print("Privacy Demo")
        print("=" * 40)
        print("1. Shielded Pool: Deposit ETH → Get encrypted note")
        print("2. Confidential Transfer: Spend note → Create new note")
        print("3. Withdrawal: Burn note → Get ETH")
        print()
        print("Note: Requires deployed contracts")
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
