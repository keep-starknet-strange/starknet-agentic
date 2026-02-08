#!/usr/bin/env python3.12
"""
Starknet Privacy CLI - Confidential transactions and shielded pools

Usage:
    python3.12 scripts/cli.py <command> [options]
"""

import argparse
import sys
import os
import json
import secrets
from pathlib import Path

# Add skill root to path
SKILL_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(SKILL_ROOT))

from scripts.shielded_pool import ShieldedPool
from scripts.notes import ConfidentialNote


# In-memory pool for demo (in production, use contract state)
_pool = ShieldedPool()


def cmd_status(args):
    """Show privacy protocol status."""
    print("Starknet Privacy Protocol")
    print("=" * 50)
    print("Features:")
    print("  - Confidential Notes (encrypted UTXO-style)")
    print("  - Shielded Pools (like Zcash)")
    print("  - ZK-SNARK proofs (via Garaga)")
    print("  - Selective privacy (transparent/shielded)")
    print()
    print("Components:")
    print("  - Note Registry: Stores encrypted notes")
    print("  - Merkle Tree: Note commitment tree")
    print("  - Nullifier Set: Prevents double-spending")
    print()
    integrity = _pool.verify_integrity()
    print(f"Pool Status:")
    print(f"  - Total notes: {integrity['total_notes']}")
    print(f"  - Spent nullifiers: {integrity['spent_nullifiers']}")
    print(f"  - Valid: {'Yes' if integrity['valid'] else 'No'}")


def cmd_demo(args):
    """Run shielded pool demo."""
    print("Running Shielded Pool Demo...")
    print()
    from shielded_pool import demo
    demo()


def cmd_deposit(args):
    """Deposit to shielded pool."""
    amount_wei = int(float(args.amount) * 1e18)
    secret = int(args.secret, 16) if args.secret else secrets.randbits(256)
    
    result = _pool.deposit(amount_wei, secret)
    
    print(f"Deposit Successful!")
    print(f"  Amount: {args.amount} ETH")
    print(f"  Commitment: {result['commitment']}")
    print(f"  Merkle Root: {result['merkle_root']}")
    print()
    print(f"SAVE YOUR SECRET: {hex(secret)}")
    print(f"SAVE YOUR COMMITMENT: {result['commitment']}")


def cmd_balance(args):
    """Check shielded balance."""
    secret = int(args.secret, 16)
    
    result = _pool.get_balance(secret)
    
    print(f"Shielded Balance:")
    print(f"  Total: {result['total_balance'] / 1e18:.6f} ETH")
    print(f"  Notes: {result['note_count']}")
    
    if result['notes']:
        print()
        print("Notes:")
        for i, note in enumerate(result['notes']):
            print(f"  {i+1}. Value: {int(note['value']) / 1e18:.4f} ETH")


def cmd_transfer(args):
    """Private transfer between notes."""
    from_commitment = args.from_note
    to_address = args.to_address
    amount_wei = int(float(args.amount) * 1e18)
    owner_secret = int(args.secret, 16)
    
    result = _pool.create_transfer(
        from_commitment,
        to_address,
        amount_wei,
        owner_secret
    )
    
    print(f"Transfer Successful!")
    print(f"  Amount: {args.amount} ETH")
    print(f"  Nullifier: {result['nullifier_published']}")
    print(f"  New Merkle Root: {result['new_merkle_root']}")
    print()
    print("Note: In real implementation, recipient needs their secret to decrypt.")


def cmd_withdraw(args):
    """Withdraw from shielded pool."""
    commitment = args.commitment
    owner_secret = int(args.secret, 16)
    recipient = args.recipient
    
    result = _pool.withdraw(commitment, owner_secret, recipient)
    
    print(f"Withdrawal Successful!")
    print(f"  Amount: {result['amount'] / 1e18:.6f} ETH")
    print(f"  Recipient: {result['recipient']}")
    print(f"  Nullifier: {result['nullifier_published']}")


def cmd_list_notes(args):
    """List notes for an address (encrypted)."""
    # For demo, list all notes in pool
    print("Notes in Shielded Pool:")
    print()
    
    state = _pool.export_state()
    for commitment, note_data in state['notes'].items():
        value_eth = int(note_data['value']) / 1e18
        print(f"  Commitment: {commitment[:30]}...")
        print(f"    Value: {value_eth:.4f} ETH")
        print()


def cmd_create_note(args):
    """Create a standalone confidential note."""
    value_wei = int(float(args.value) * 1e18)
    secret = int(args.secret, 16) if args.secret else secrets.randbits(256)
    
    note = ConfidentialNote.create(value_wei, secret)
    encrypted = note.encrypt()
    
    print(f"Confidential Note Created!")
    print(f"  Value: {args.value} ETH")
    print(f"  Commitment: {hex(note.commitment)}")
    print(f"  Nullifier: {hex(note.nullifier)}")
    print()
    print(f"SAVE YOUR SECRET: {hex(secret)}")
    print()
    print("Encrypted note data:")
    print(f"  {json.dumps(encrypted, indent=4)}")


def cmd_integrity(args):
    """Check shielded pool integrity."""
    integrity = _pool.verify_integrity()
    
    print(f"Shielded Pool Integrity Check:")
    print(f"  Valid: {'Yes' if integrity['valid'] else 'NO - ISSUES FOUND'}")
    print(f"  Total Notes: {integrity['total_notes']}")
    print(f"  Spent Nullifiers: {integrity['spent_nullifiers']}")
    print(f"  Merkle Root: {integrity['merkle_root']}")
    
    if integrity['issues']:
        print()
        print("Issues:")
        for issue in integrity['issues']:
            print(f"  - {issue}")


def cmd_export(args):
    """Export pool state."""
    state = _pool.export_state()
    
    filename = args.output or "shielded_pool_state.json"
    with open(filename, 'w') as f:
        json.dump(state, f, indent=2)
    
    print(f"Pool state exported to: {filename}")
    print(f"  Notes: {len(state['notes'])}")
    print(f"  Nullifiers: {len(state['nullifiers'])}")


def cmd_import(args):
    """Import pool state."""
    global _pool
    
    filename = args.input or "shielded_pool_state.json"
    
    with open(filename, 'r') as f:
        state = json.load(f)
    
    _pool = ShieldedPool.import_state(state)
    
    print(f"Pool state imported from: {filename}")
    print(f"  Notes: {len(state['notes'])}")
    print(f"  Nullifiers: {len(state['nullifiers'])}")


def main():
    parser = argparse.ArgumentParser(
        description="Starknet Privacy CLI - Confidential transactions and shielded pools",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Status
  python3.12 scripts/cli.py status

  # Demo
  python3.12 scripts/cli.py demo

  # Deposit 100 ETH
  python3.12 scripts/cli.py deposit --amount 100 --secret 0x...

  # Check balance
  python3.12 scripts/cli.py balance --secret 0x...

  # Transfer 50 ETH
  python3.12 scripts/cli.py transfer --from-note 0x... --to-address 0x... --amount 50 --secret 0x...

  # Withdraw
  python3.12 scripts/cli.py withdraw --commitment 0x... --secret 0x... --recipient 0x...

  # Create standalone note
  python3.12 scripts/cli.py create-note --value 10

  # Integrity check
  python3.12 scripts/cli.py integrity

  # Export/Import state
  python3.12 scripts/cli.py export --output my_pool.json
  python3.12 scripts/cli.py import --input my_pool.json
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Status
    subparsers.add_parser("status", help="Show protocol status")
    
    # Demo
    subparsers.add_parser("demo", help="Run shielded pool demo")
    
    # Deposit
    deposit_parser = subparsers.add_parser("deposit", help="Deposit to shielded pool")
    deposit_parser.add_argument("--amount", "-a", required=True, type=float, help="Amount in ETH")
    deposit_parser.add_argument("--secret", "-s", help="Secret key (auto-generated if not provided)")
    
    # Balance
    balance_parser = subparsers.add_parser("balance", help="Check shielded balance")
    balance_parser.add_argument("--secret", "-s", required=True, help="Owner's secret key")
    
    # Transfer
    transfer_parser = subparsers.add_parser("transfer", help="Private shielded transfer")
    transfer_parser.add_argument("--from-note", "-f", required=True, help="Source note commitment")
    transfer_parser.add_argument("--to-address", "-t", required=True, help="Recipient address")
    transfer_parser.add_argument("--amount", "-a", required=True, type=float, help="Amount in ETH")
    transfer_parser.add_argument("--secret", "-s", required=True, help="Owner's secret key")
    
    # Withdraw
    withdraw_parser = subparsers.add_parser("withdraw", help="Withdraw from shielded pool")
    withdraw_parser.add_argument("--commitment", "-c", required=True, help="Note commitment to spend")
    withdraw_parser.add_argument("--secret", "-s", required=True, help="Owner's secret key")
    withdraw_parser.add_argument("--recipient", "-r", required=True, help="Recipient address")
    
    # List notes
    subparsers.add_parser("list-notes", help="List notes in pool")
    
    # Create note
    note_parser = subparsers.add_parser("create-note", help="Create confidential note")
    note_parser.add_argument("--value", "-v", required=True, type=float, help="Note value in ETH")
    note_parser.add_argument("--secret", "-s", help="Secret key (auto-generated if not provided)")
    
    # Integrity
    subparsers.add_parser("integrity", help="Check pool integrity")
    
    # Export
    export_parser = subparsers.add_parser("export", help="Export pool state")
    export_parser.add_argument("--output", "-o", help="Output file (default: shielded_pool_state.json)")
    
    # Import
    import_parser = subparsers.add_parser("import", help="Import pool state")
    import_parser.add_argument("--input", "-i", help="Input file (default: shielded_pool_state.json)")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    # Route command
    try:
        if args.command == "status":
            cmd_status(args)
        elif args.command == "demo":
            cmd_demo(args)
        elif args.command == "deposit":
            cmd_deposit(args)
        elif args.command == "balance":
            cmd_balance(args)
        elif args.command == "transfer":
            cmd_transfer(args)
        elif args.command == "withdraw":
            cmd_withdraw(args)
        elif args.command == "list-notes":
            cmd_list_notes(args)
        elif args.command == "create-note":
            cmd_create_note(args)
        elif args.command == "integrity":
            cmd_integrity(args)
        elif args.command == "export":
            cmd_export(args)
        elif args.command == "import":
            cmd_import(args)
        else:
            parser.print_help()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
