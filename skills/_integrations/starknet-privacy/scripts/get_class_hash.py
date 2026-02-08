#!/usr/bin/env python3.12
"""
Get class hash from compiled Cairo contract.
"""

import json
import sys

try:
    from starknet_py.hash.sierra_class_hash import compute_sierra_class_hash
    from starknet_py.hash.sierra_class_hash_objects import SierraContractClass
except ImportError:
    print("Error: starknet-py not installed correctly")
    print("Run: uv pip install starknet-py")
    sys.exit(1)

def get_class_hash(sierra_path: str):
    """Compute class hash from Sierra file."""
    
    with open(sierra_path, 'r') as f:
        sierra_data = json.load(f)
    
    # Create SierraContractClass object
    contract_class = SierraContractClass(
        sierra_program=sierra_data.get('sierra_program', []),
        contract_class_version=sierra_data.get('version', '0.0.0'),
        entry_points_by_type=sierra_data.get('entry_points_by_type', {}),
        abi=sierra_data.get('abi', [])
    )
    
    # Compute class hash
    class_hash = compute_sierra_class_hash(contract_class)
    
    return class_hash

if __name__ == "__main__":
    sierra_path = sys.argv[1] if len(sys.argv) > 1 else "target/dev/starknet_shielded_pool.sierra.json"
    
    try:
        class_hash = get_class_hash(sierra_path)
        print("=" * 65)
        print("STARKNET SHIELDED POOL - CLASS HASH")
        print("=" * 65)
        print()
        print(f"File: {sierra_path}")
        print()
        print(f"Class Hash: {hex(class_hash)}")
        print(f"           : {class_hash}")
        print()
        print("-" * 65)
        print("DEPLOY COMMAND (starkli):")
        print("-" * 65)
        print()
        print(f"starkli deploy \\")
        print(f"  --network sepolia \\")
        print(f"  --class-hash {hex(class_hash)} \\")
        print(f"  --constructor-args 0xYOUR_WALLET_ADDRESS")
        print()
        print("-" * 65)
        print("WALLET UI:")
        print("-" * 65)
        print("  Paste class hash in Braavos/Argent X deployer")
        print("=" * 65)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
