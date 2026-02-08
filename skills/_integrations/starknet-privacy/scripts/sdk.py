#!/usr/bin/env python3
"""
Starknet Shielded Pool SDK - Python interface to deployed contracts
"""

import json
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path

from starknet_py.net import FullNodeClient
from starknet_py.contract import Contract
from starknet_py.net.client_models import Call
from starknet_py.hash.utils import compute_hash_on_elements
from starknet_py.hash.state_update import get_contract_storage_delta

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('shielded-pool-sdk')


@dataclass
class ShieldedPoolConfig:
    """Configuration for Shielded Pool SDK."""
    rpc_url: str = "https://rpc.starknet.lava.build:443"
    chain_id: int = 0x534e5f4d41494e  # SN_MAINNET


class SDKError(Exception):
    """Base exception for SDK errors."""
    pass


class ContractNotFoundError(SDKError):
    """Raised when contract address is invalid."""
    pass


class TransactionError(SDKError):
    """Raised when transaction fails."""
    def __init__(self, message: str, tx_hash: str = None):
        super().__init__(message)
        self.tx_hash = tx_hash


class NetworkError(SDKError):
    """Raised when network request fails."""
    pass


@dataclass
class ShieldedPoolConfig:
    """Configuration for Shielded Pool SDK."""
    rpc_url: str = "https://rpc.starknet.lava.build:443"
    chain_id: int = 0x534e5f4d41494e  # SN_MAINNET


# Contract ABI (simplified - full ABI would be generated during compilation)
SHIELDED_POOL_ABI = [
    {
        "name": "deposit",
        "type": "function",
        "inputs": [{"name": "commitment", "type": "felt252"}],
        "outputs": [{"name": "commitment", "type": "felt252"}],
        "stateMutability": "external"
    },
    {
        "name": "transfer",
        "type": "function",
        "inputs": [
            {"name": "nullifier", "type": "felt252"},
            {"name": "commitment_old", "type": "felt252"},
            {"name": "commitment_new", "type": "felt252"},
            {"name": "merkle_proof", "type": "felt252*"},
            {"name": "encrypted_recipient", "type": "felt252"}
        ],
        "outputs": [{"name": "success", "type": "felt252"}],
        "stateMutability": "external"
    },
    {
        "name": "withdraw",
        "type": "function",
        "inputs": [
            {"name": "nullifier", "type": "felt252"},
            {"name": "commitment", "type": "felt252"},
            {"name": "merkle_proof", "type": "felt252*"},
            {"name": "amount", "type": "felt252"},
            {"name": "recipient", "type": "contract_address"}
        ],
        "outputs": [{"name": "success", "type": "felt252"}],
        "stateMutability": "external"
    },
    {
        "name": "is_nullifier_used",
        "type": "function",
        "inputs": [{"name": "nullifier", "type": "felt252"}],
        "outputs": [{"name": "used", "type": "felt252"}],
        "stateMutability": "view"
    },
    {
        "name": "get_pool_balance",
        "type": "function",
        "inputs": [],
        "outputs": [{"name": "balance", "type": "felt252"}],
        "stateMutability": "view"
    },
    {
        "name": "get_merkle_root",
        "type": "function",
        "inputs": [],
        "outputs": [{"name": "root", "type": "felt252"}],
        "stateMutability": "view"
    },
    {
        "name": "update_merkle_root",
        "type": "function",
        "inputs": [{"name": "new_root", "type": "felt252"}],
        "outputs": [],
        "stateMutability": "external"
    }
]


class ShieldedPoolSDK:
    """
    Python SDK for interacting with Shielded Pool contracts on Starknet.
    """
    
    def __init__(
        self,
        contract_address: str,
        rpc_url: str = "https://rpc.starknet.lava.build:443",
        abi: Optional[List[Dict]] = None
    ):
        """
        Initialize SDK.
        
        Args:
            contract_address: Deployed Shielded Pool contract address
            rpc_url: Starknet RPC URL
            abi: Contract ABI (optional, will use default if not provided)
            
        Raises:
            ContractNotFoundError: If contract address is invalid
            SDKError: If SDK initialization fails
        """
        try:
            self.client = FullNodeClient(node_url=rpc_url)
            self.contract_address = int(contract_address, 16)
            self.contract = Contract(
                address=self.contract_address,
                abi=abi or SHIELDED_POOL_ABI,
                client=self.client
            )
            logger.info(f"SDK initialized for contract: {contract_address[:20]}...")
        except ValueError as e:
            raise ContractNotFoundError(f"Invalid contract address: {contract_address}") from e
        except Exception as e:
            raise SDKError(f"Failed to initialize SDK: {e}") from e
    
    async def get_pool_balance(self) -> int:
        """Get current pool balance."""
        try:
            result = await self.contract.functions["get_pool_balance"].call()
            return result.balance
        except Exception as e:
            logger.error(f"Failed to get pool balance: {e}")
            raise NetworkError(f"Failed to get pool balance: {e}") from e
    
    async def get_merkle_root(self) -> int:
        """Get current merkle root."""
        try:
            result = await self.contract.functions["get_merkle_root"].call()
            return result.root
        except Exception as e:
            logger.error(f"Failed to get merkle root: {e}")
            raise NetworkError(f"Failed to get merkle root: {e}") from e
    
    async def is_nullifier_used(self, nullifier: int) -> bool:
        """Check if nullifier has been used."""
        try:
            result = await self.contract.functions["is_nullifier_used"].call(nullifier)
            return result.used == 1
        except Exception as e:
            logger.error(f"Failed to check nullifier: {e}")
            raise NetworkError(f"Failed to check nullifier: {e}") from e
    
    async def deposit(
        self,
        commitment: int,
        amount_wei: int,
        private_key: str
    ) -> Dict:
        """
        Deposit ETH to shielded pool.
        
        Args:
            commitment: Note commitment hash
            amount_wei: Amount in wei
            private_key: Wallet private key (for signing)
            
        Returns:
            Dict with transaction result
            
        Raises:
            TransactionError: If transaction fails
            SDKError: If preparation fails
        """
        try:
            account = self._get_account(private_key)
            
            call = self.contract.functions["deposit"].prepare(commitment)
            
            tx = await account.execute([call], max_fee=int(1e15))
            await tx.wait()
            
            status = "success" if tx.status == "ACCEPTED" else "pending"
            logger.info(f"Deposit tx: {hex(tx.hash)[:20]}... status: {status}")
            
            return {
                "status": status,
                "transaction_hash": hex(tx.hash),
                "commitment": hex(commitment),
                "amount_wei": amount_wei
            }
        except Exception as e:
            logger.error(f"Deposit transaction failed: {e}")
            raise TransactionError(f"Deposit failed: {e}") from e
    
    async def transfer(
        self,
        nullifier: int,
        commitment_old: int,
        commitment_new: int,
        merkle_proof: List[int],
        encrypted_recipient: int,
        private_key: str
    ) -> Dict:
        """
        Transfer privately between notes.
        
        Args:
            nullifier: Nullifier to prevent double-spend
            commitment_old: Note to spend
            commitment_new: New note
            merkle_proof: Merkle proof array
            encrypted_recipient: Encrypted recipient data
            private_key: Wallet private key
            
        Returns:
            Dict with transaction result
            
        Raises:
            TransactionError: If transaction fails
        """
        try:
            account = self._get_account(private_key)
            
            call = self.contract.functions["transfer"].prepare(
                nullifier,
                commitment_old,
                commitment_new,
                merkle_proof,
                encrypted_recipient
            )
            
            tx = await account.execute([call], max_fee=int(1e15))
            await tx.wait()
            
            status = "success" if tx.status == "ACCEPTED" else "pending"
            logger.info(f"Transfer tx: {hex(tx.hash)[:20]}... status: {status}")
            
            return {
                "status": status,
                "transaction_hash": hex(tx.hash),
                "nullifier": hex(nullifier)
            }
        except Exception as e:
            logger.error(f"Transfer transaction failed: {e}")
            raise TransactionError(f"Transfer failed: {e}") from e
    
    async def withdraw(
        self,
        nullifier: int,
        commitment: int,
        merkle_proof: List[int],
        amount_wei: int,
        recipient_address: str,
        private_key: str
    ) -> Dict:
        """
        Withdraw from shielded pool.
        
        Args:
            nullifier: Nullifier proving ownership
            commitment: Original note commitment
            merkle_proof: Merkle proof
            amount_wei: Amount to withdraw
            recipient_address: Recipient address
            private_key: Wallet private key
            
        Returns:
            Dict with transaction result
            
        Raises:
            TransactionError: If transaction fails
        """
        try:
            account = self._get_account(private_key)
            
            call = self.contract.functions["withdraw"].prepare(
                nullifier,
                commitment,
                merkle_proof,
                amount_wei,
                int(recipient_address, 16)
            )
            
            tx = await account.execute([call], max_fee=int(1e15))
            await tx.wait()
            
            status = "success" if tx.status == "ACCEPTED" else "pending"
            logger.info(f"Withdraw tx: {hex(tx.hash)[:20]}... status: {status}")
            
            return {
                "status": status,
                "transaction_hash": hex(tx.hash),
                "amount_wei": amount_wei,
                "recipient": recipient_address
            }
        except Exception as e:
            logger.error(f"Withdraw transaction failed: {e}")
            raise TransactionError(f"Withdraw failed: {e}") from e
    
    def _get_account(self, private_key: str):
        """Create account from private key."""
        try:
            from starknet_py.account import Account
            from starknet_py.key_pair import KeyPair
            
            key_pair = KeyPair.from_private_key(int(private_key, 16))
            
            return Account(
                address=key_pair.public_key,  # Simplified - would need actual address
                client=self.client,
                key_pair=key_pair
            )
        except ValueError as e:
            raise SDKError(f"Invalid private key format: {e}") from e
        except Exception as e:
            raise SDKError(f"Failed to create account: {e}") from e


def create_commitment(value: int, secret: int, salt: int) -> int:
    """Create a note commitment hash."""
    import hashlib
    
    data = f"{value}:{secret}:{salt}".encode()
    return int(hashlib.sha256(data).hexdigest(), 16) % (2**251)


def create_nullifier(commitment: int, nullifier_salt: int) -> int:
    """Create a nullifier from commitment and salt."""
    import hashlib
    
    data = f"{commitment}:{nullifier_salt}".encode()
    return int(hashlib.sha256(data).hexdigest(), 16) % (2**251)


def generate_merkle_proof(
    commitments: List[int],
    target_index: int
) -> List[int]:
    """Generate merkle proof for a commitment."""
    import hashlib
    
    if len(commitments) == 0:
        return []
    
    # Build tree
    level = commitments[:]
    while len(level) > 1:
        next_level = []
        for i in range(0, len(level), 2):
            left = level[i]
            right = level[i + 1] if i + 1 < len(level) else left
            data = f"{left}:{right}".encode()
            next_level.append(int(hashlib.sha256(data).hexdigest(), 16) % (2**251))
        level = next_level
    
    # Build proof
    proof = []
    current_index = target_index
    level = commitments[:]
    
    while len(level) > 1:
        is_left = current_index % 2 == 0
        sibling_index = current_index + 1 if is_left else current_index - 1
        if sibling_index < len(level):
            proof.append(level[sibling_index])
        current_index //= 2
        level = level[::2]
    
    return proof


async def main():
    """Example usage."""
    # Configuration
    CONTRACT_ADDRESS = "0x..."  # Deployed contract address
    RPC_URL = "https://rpc.starknet.lava.build:443"
    
    # Initialize SDK
    sdk = ShieldedPoolSDK(CONTRACT_ADDRESS, RPC_URL)
    
    # Get pool info
    balance = await sdk.get_pool_balance()
    root = await sdk.get_merkle_root()
    
    print(f"Pool Balance: {balance} wei")
    print(f"Merkle Root: {hex(root)}")
    
    # Example: Deposit
    # Replace with actual values
    secret = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef  # Your secret
    salt = 0x56789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567  # Random salt
    amount = 1_000_000_000_000_000_000  # 1 ETH
    
    commitment = create_commitment(amount, secret, salt)
    
    result = await sdk.deposit(commitment, amount, "0x...")  # Replace with actual private key
    print(f"Deposit: {result}")
    
    # Example: Check nullifier
    nullifier = create_nullifier(commitment, 0xDEAD)
    used = await sdk.is_nullifier_used(nullifier)
    print(f"Nullifier used: {used}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
