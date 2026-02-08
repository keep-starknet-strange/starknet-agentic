#!/usr/bin/env python3
"""
Starknet Privacy Pool - Testnet Deployment Script

Deploys the ShieldedPool contract to Starknet Sepolia testnet.

Requirements:
- Python 3.10+
- starknet.py (or openzeppelin-tokens)
- Account with ETH on testnet

Usage:
    python scripts/deploy.py --network sepolia --account <ACCOUNT_PATH>
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

try:
    from starknet_py.net import AccountClient
    from starknet_py.net.models import StarknetDomain
    from starknet_py.net.signer import KeyPair
    from starknet_py.contract import Contract
except ImportError:
    print("ERROR: starknet.py not installed")
    print("Install with: pip install starknet.py")
    sys.exit(1)


# Network configurations
NETWORKS = {
    "sepolia": {
        "rpc_url": "https://starknet-sepolia.public.blastapi.io/rpc/v0_7",
        "chain_id": StarknetDomain.SEPOLIA,
    },
    "testnet": {
        "rpc_url": "https://starknet-goerli.global.ssl.fastly.net",
        "chain_id": StarknetDomain.TESTNET,
    },
    "mainnet": {
        "rpc_url": "https://starknet-mainnet.public.blastapi.io/rpc/v0_7",
        "chain_id": StarknetDomain.MAINNET,
    },
}


def load_contract_compiled() -> dict:
    """Load the compiled contract from Scarb output."""
    contract_path = (
        project_root 
        / "contracts" 
        / "starknet_shielded_pool_forge" 
        / "target" 
        / "dev" 
        / "shielded_pool_ShieldedPool.compiled_contract_class.json"
    )
    
    if not contract_path.exists():
        print(f"ERROR: Contract not found at {contract_path}")
        print("Run: cd contracts/starknet_shielded_pool_forge && scarb build")
        sys.exit(1)
    
    with open(contract_path) as f:
        return json.load(f)


def load_contract_abi() -> list:
    """Load the contract ABI."""
    abi_path = (
        project_root 
        / "contracts" 
        / "starknet_shielded_pool_forge" 
        / "target" 
        / "dev" 
        / "shielded_pool_ShieldedPool.contract_class.json"
    )
    
    if not abi_path.exists():
        print(f"ERROR: ABI not found at {abi_path}")
        sys.exit(1)
    
    with open(abi_path) as f:
        data = json.load(f)
        return data.get("abi", [])


def deploy(
    network: str = "sepolia",
    account_path: Optional[str] = None,
    private_key: Optional[str] = None,
) -> dict:
    """
    Deploy the ShieldedPool contract.
    
    Args:
        network: Network to deploy to (sepolia, testnet, mainnet)
        account_path: Path to OpenZeppelin account JSON
        private_key: Private key (alternative to account_path)
    
    Returns:
        Deployment info dict
    """
    # Validate network
    if network not in NETWORKS:
        print(f"ERROR: Unknown network '{network}'")
        print(f"Available: {', '.join(NETWORKS.keys())}")
        sys.exit(1)
    
    config = NETWORKS[network]
    
    # Load compiled contract
    compiled_contract = load_contract_compiled()
    
    # Prepare constructor args
    # TODO: Replace with actual owner address
    owner_address = 0x0  # Placeholder - user must provide
    
    print(f"\n{'='*60}")
    print(f"DEPLOYING SHIELDED POOL TO {network.upper()}")
    print(f"{'='*60}")
    print(f"RPC URL: {config['rpc_url']}")
    
    # Check for account
    if account_path:
        print(f"Account: {account_path}")
        with open(account_path) as f:
            account_data = json.load(f)
        
        # Load OpenZeppelin account
        # This is a simplified version - actual implementation depends on account type
        print("ERROR: OpenZeppelin account deployment not yet implemented")
        print("Use --private-key for simple account deployment")
        sys.exit(1)
    
    elif private_key:
        print("Using private key for deployment")
        # Create account from private key
        # In production, use proper account abstraction
        print("ERROR: Simple key deployment requires proper setup")
        print("Use ArgentX or Braavos wallet for testnet")
        sys.exit(1)
    
    else:
        print("ERROR: No account provided")
        print("Usage: python deploy.py --network sepolia --account <ACCOUNT_JSON>")
        sys.exit(1)
    
    # The actual deployment would look like this:
    """
    # Deploy contract
    contract = Contract.deploy(
        client=client,
        compiled_contract=compiled_contract,
        constructor_args=[owner_address],
    )
    
    print(f"Deployed at: {contract.address}")
    print(f"Transaction: {contract.hash}")
    """
    
    return {
        "status": "ready",
        "network": network,
        "contract_class": compiled_contract.get("program", {}).get("schema_version", "unknown"),
        "owner_address": hex(owner_address),
        "next_step": "Deploy with actual account",
    }


def get_contract_functions() -> dict:
    """Get contract function definitions."""
    return {
        "deposit": {
            "name": "deposit",
            "type": "external",
            "inputs": [{"name": "commitment", "type": "felt252"}],
            "outputs": [{"name": "index", "type": "u32"}],
        },
        "spend": {
            "name": "spend",
            "type": "external",
            "inputs": [
                {"name": "nullifier", "type": "felt252"},
                {"name": "new_commitment", "type": "felt252"},
            ],
            "outputs": [{"name": "success", "type": "felt252"}],
        },
        "set_merkle_root": {
            "name": "set_merkle_root",
            "type": "external",
            "inputs": [{"name": "new_root", "type": "felt252"}],
            "outputs": [],
        },
        "get_merkle_root": {
            "name": "get_merkle_root",
            "type": "view",
            "inputs": [],
            "outputs": [{"name": "root", "type": "felt252"}],
        },
        "get_next_index": {
            "name": "get_next_index",
            "type": "view",
            "inputs": [],
            "outputs": [{"name": "index", "type": "u32"}],
        },
        "get_owner": {
            "name": "get_owner",
            "type": "view",
            "inputs": [],
            "outputs": [{"name": "owner", "type": "contractAddress"}],
        },
    }


def print_deployment_guide():
    """Print deployment guide."""
    guide = """
╔════════════════════════════════════════════════════════════════════════╗
║           STARKNET PRIVACY POOL - DEPLOYMENT GUIDE                    ║
╚════════════════════════════════════════════════════════════════════════╝

PREREQUISITES:
1. Starknet wallet (ArgentX or Braavos) with ETH on testnet
2. Node.js for starknet.js (alternative)
3. Or Python with starknet.py

OPTION 1: STARKNET.CLI (Recommended)
----------------------------------------
# Install starknet-cli
npm install -g starknet-cli

# Deploy to Sepolia
starknet deploy --network sepolia --contract <COMPILED_JSON>

OPTION 2: STARKNET.JS
---------------------
# Install dependencies
npm install starknet.js openzeppelin-contract

# Deploy
const provider = new Provider({ sequencer: { baseUrl: 'https://starknet-sepolia.public.blastapi.io/rpc/v0_7' } });
const account = new Account(provider, address, privateKey);
const contract = await Contract.compile_constructorFromArtifact(artifact);
const deployed = await contract.deploy({ constructorCalldata: [owner] });
await deployed.waitForDeployment();

OPTION 3: PYTHON (starknet.py)
------------------------------
# Install
pip install starknet.py openzeppelin-contracts

# Deploy
from starknet_py.contract import Contract
contract = await Contract.deploy(
    client=client,
    compiled_contract=compiled,
    constructor_args=[owner_address],
)

CONTRACT ARTIFACTS:
------------------
Sierra (for deployment):
  contracts/starknet_shielded_pool_forge/target/dev/shielded_pool_ShieldedPool.compiled_contract_class.json

ABI (for interaction):
  contracts/starknet_shielded_pool_forge/target/dev/shielded_pool_ShieldedPool.contract_class.json

NEXT STEPS:
-----------
1. Deploy contract using one of the options above
2. Note the deployed contract address
3. Use the contract in your application
4. For production, add:
   - ZK proof verification
   - Full merkle tree on-chain or off-chain
   - Token integration (ERC20/ETH)
   - Access control
"""
    print(guide)


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Deploy ShieldedPool to Starknet testnet"
    )
    parser.add_argument(
        "--network",
        default="sepolia",
        choices=["sepolia", "testnet", "mainnet"],
        help="Network to deploy to (default: sepolia)",
    )
    parser.add_argument(
        "--account",
        type=str,
        help="Path to account JSON (OpenZeppelin account)",
    )
    parser.add_argument(
        "--private-key",
        type=str,
        help="Private key for deployment",
    )
    parser.add_argument(
        "--guide",
        action="store_true",
        help="Print deployment guide",
    )
    
    args = parser.parse_args()
    
    if args.guide:
        print_deployment_guide()
        return
    
    # Check for contract compilation
    if not (project_root / "contracts" / "starknet_shielded_pool_forge" / "target" / "dev" / "shielded_pool_ShieldedPool.compiled_contract_class.json").exists():
        print("Contract not compiled. Compiling now...")
        os.system("cd contracts/starknet_shielded_pool_forge && scarb build")
    
    # Run deployment
    result = deploy(
        network=args.network,
        account_path=args.account,
        private_key=args.private_key,
    )
    
    print(f"\n{'='*60}")
    print("DEPLOYMENT READY")
    print(f"{'='*60}")
    print(json.dumps(result, indent=2))
    
    print("\nFor actual deployment, use:")
    print("  - Starknet CLI: starknet deploy --network sepolia --contract <COMPILED>")
    print("  - starknet.js: Use the example in scripts/deploy_example.js")
    print("  - Python: Complete starknet.py integration")


if __name__ == "__main__":
    main()
