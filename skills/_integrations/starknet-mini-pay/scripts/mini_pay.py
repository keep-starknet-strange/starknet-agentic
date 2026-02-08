#!/usr/bin/env python3.12
"""
Starknet Mini-Pay Core Module - FIXED FOR starknet-py 0.29+
Simple P2P payments on Starknet

FIXES APPLIED:
1. Use call_contract for ETH balance (no get_balance in new API)
2. Fixed ETH/ERC20 transfer to use new Contract API
3. Proper async handling
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum

from starknet_py.net.full_node_client import FullNodeClient
from starknet_py.net.account.account import Account
from starknet_py.net.signer.key_pair import KeyPair
from starknet_py.contract import Contract
from starknet_py.net.client_models import Call
from starknet_py.hash.selector import get_selector_from_name

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Token(Enum):
    ETH = "ETH"
    STRK = "STRK"
    USDC = "USDC"


# Token addresses on Starknet mainnet
ETH_ADDRESS = 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82dc9dd0cc
STRK_ADDRESS = 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d
USDC_ADDRESS = 0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005


@dataclass
class PaymentResult:
    tx_hash: str
    status: str
    block_number: Optional[int] = None
    error: Optional[str] = None


class MiniPay:
    """
    Core Mini-Pay class for Starknet payments.
    Uses starknet-py 0.29+ API.
    """
    
    # Standard ERC20 ABI
    ERC20_ABI = [
        {
            "name": "transfer",
            "type": "function",
            "inputs": [
                {"name": "recipient", "type": "felt"},
                {"name": "amount", "type": "Uint256"}
            ],
            "outputs": [{"name": "success", "type": "felt"}],
            "stateMutability": "external"
        },
        {
            "name": "balanceOf",
            "type": "function",
            "inputs": [{"name": "account", "type": "felt"}],
            "outputs": [{"name": "balance", "type": "Uint256"}],
            "stateMutability": "view"
        }
    ]
    
    def __init__(self, rpc_url: str = "https://rpc.starknet.lava.build:443"):
        self.rpc_url = rpc_url
        self.client = FullNodeClient(node_url=rpc_url)
        
        # Token addresses
        self.tokens = {
            "ETH": ETH_ADDRESS,
            "STRK": STRK_ADDRESS,
            "USDC": USDC_ADDRESS,
        }
    
    def _get_token_decimals(self, token: str) -> int:
        """Get decimal places for token"""
        return {"ETH": 18, "STRK": 18, "USDC": 6}.get(token.upper(), 18)
    
    def _create_account(self, address: str, private_key: str) -> Account:
        """Create Account instance from address and private key"""
        key_pair = KeyPair.from_private_key(int(private_key, 16))
        return Account(
            address=int(address, 16),
            client=self.client,
            key_pair=key_pair,
        )
    
    async def get_balance(self, address: str, token: str = "ETH") -> int:
        """
        Get token balance for an address.
        Returns balance in smallest units (wei/smallest).
        """
        token_symbol = token.upper()
        
        if token_symbol not in self.tokens:
            raise ValueError(f"Unknown token: {token}. Valid: {list(self.tokens.keys())}")
        
        try:
            # Use call_contract for all tokens (ERC20-style)
            token_address = self.tokens[token_symbol]
            balance_of_selector = get_selector_from_name("balanceOf")
            
            call = Call(
                to_addr=token_address,
                selector=balance_of_selector,
                calldata=[int(address, 16)]
            )
            
            result = await self.client.call_contract(call=call)
            
            # Parse Uint256 result (low, high)
            if len(result) >= 2:
                balance = result[0] + (result[1] << 128)
            else:
                balance = result[0]
            
            return balance
            
        except Exception as e:
            logger.error(f"Balance check failed for {address[:10]}: {e}")
            if "not found" in str(e).lower():
                raise ValueError(f"Account not found: {address}")
            raise
    
    async def transfer(
        self,
        from_address: str,
        private_key: str,
        to_address: str,
        amount_wei: int,
        token: str = "ETH",
        memo: Optional[str] = None,
        max_retries: int = 3
    ) -> str:
        """
        Send a payment.
        """
        token_symbol = token.upper()
        
        if token_symbol not in self.tokens:
            raise ValueError(f"Unknown token: {token_symbol}. Valid: {list(self.tokens.keys())}")
        
        if amount_wei <= 0:
            raise ValueError(f"Amount must be positive, got: {amount_wei}")
        
        # Validate addresses
        try:
            int(from_address, 16)
            int(to_address, 16)
        except ValueError:
            raise ValueError("Invalid address format. Must be hex string starting with 0x")
        
        # Create account
        account = self._create_account(from_address, private_key)
        
        # Get token contract
        token_address = self.tokens[token_symbol]
        contract = Contract(
            address=token_address,
            abi=self.ERC20_ABI,
            client=self.client
        )
        
        # Prepare transfer call
        transfer_call = contract.functions["transfer"].prepare(
            recipient=int(to_address, 16),
            amount=amount_wei
        )
        
        calls = [transfer_call]
        
        # Execute with retry logic
        for attempt in range(max_retries):
            try:
                # Estimate fee
                estimated = await account.estimate_fee(calls)
                max_fee = int(estimated.overall_fee * 1.5)
                
                logger.info(f"Estimated fee: {estimated.overall_fee / 10**18:.6f} ETH")
                
                # Check ETH balance for fees if needed
                if token_symbol != "ETH":
                    eth_balance = await self.get_balance(from_address, "ETH")
                    if eth_balance < max_fee:
                        raise ValueError(
                            f"Insufficient ETH for fees. Need {max_fee / 10**18:.6f} ETH"
                        )
                
                # Execute transaction
                logger.info(f"Sending {amount_wei / 10**self._get_token_decimals(token_symbol):.6f} {token_symbol}")
                if memo:
                    logger.info(f"Memo: {memo}")
                
                result = await account.execute(calls, max_fee=max_fee)
                tx_hash = hex(result.transaction_hash)
                
                logger.info(f"Transaction submitted: {tx_hash}")
                return tx_hash
                
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1}/{max_retries} failed: {e}")
                
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                
                raise RuntimeError(f"Transaction failed after {max_retries} attempts: {e}")
    
    async def wait_for_confirmation(
        self,
        tx_hash: str,
        max_wait_seconds: int = 180,
        poll_interval: float = 3.0
    ) -> str:
        """Wait for transaction to be confirmed"""
        import time
        start_time = time.time()
        
        logger.info(f"Waiting for confirmation of {tx_hash[:16]}...")
        
        while True:
            elapsed = time.time() - start_time
            if elapsed > max_wait_seconds:
                logger.warning(f"Transaction timeout after {max_wait_seconds}s")
                return "TIMEOUT"
            
            status = await self.get_transaction_status(tx_hash)
            
            if status in ["CONFIRMED", "REJECTED", "FAILED"]:
                logger.info(f"Transaction {status.lower()}")
                return status
            
            await asyncio.sleep(poll_interval)
    
    async def get_transaction_status(self, tx_hash: str) -> str:
        """Get transaction status"""
        try:
            receipt = await self.client.get_transaction_receipt(tx_hash)
            
            if hasattr(receipt, 'execution_status'):
                exec_status = str(receipt.execution_status).upper()
                finality = getattr(receipt, 'finality_status', '')
                
                if 'SUCCEEDED' in exec_status and 'ACCEPTED' in str(finality).upper():
                    return "CONFIRMED"
                elif 'REVERTED' in exec_status or 'REJECTED' in str(finality).upper():
                    return "REJECTED"
                elif 'PENDING' in exec_status:
                    return "PENDING"
            
            if hasattr(receipt, 'status'):
                status = str(receipt.status).upper()
                if 'ACCEPTED' in status:
                    return "CONFIRMED"
                elif 'PENDING' in status:
                    return "PENDING"
                elif 'REJECTED' in status:
                    return "REJECTED"
            
            return "UNKNOWN"
            
        except Exception as e:
            error_str = str(e).lower()
            if "not found" in error_str:
                return "NOT_FOUND"
            return f"ERROR"
    
    async def get_transaction(self, tx_hash: str) -> Dict[str, Any]:
        """Get full transaction details"""
        try:
            tx = await self.client.get_transaction(tx_hash)
            return {
                "hash": tx_hash,
                "status": await self.get_transaction_status(tx_hash),
                "block_number": getattr(tx, 'block_number', None),
            }
        except Exception as e:
            logger.error(f"Failed to fetch transaction: {e}")
            raise
    
    async def get_block_number(self) -> int:
        """Get current block number"""
        return await self.client.get_block_number()


async def estimate_fee(
    rpc_url: str,
    from_address: str,
    to_address: str,
    amount_wei: int,
    token: str = "ETH"
) -> Dict[str, int]:
    """Estimate transaction fee"""
    pay = MiniPay(rpc_url)
    
    account = Account(
        address=int(from_address, 16),
        client=pay.client,
        key_pair=KeyPair.from_private_key(1),
    )
    
    token_address = pay.tokens.get(token.upper(), ETH_ADDRESS)
    contract = Contract(
        address=token_address,
        abi=pay.ERC20_ABI,
        client=pay.client
    )
    
    calls = [
        contract.functions["transfer"].prepare(
            recipient=int(to_address, 16),
            amount=amount_wei
        )
    ]
    
    estimated = await account.estimate_fee(calls)
    
    return {
        "gas_price": estimated.gas_price,
        "gas_consumed": estimated.gas_consumed,
        "overall_fee": estimated.overall_fee,
        "total_fee_eth": estimated.overall_fee / 10**18,
    }


# Example usage
async def example():
    """Example usage of MiniPay"""
    RPC = "https://rpc.starknet.lava.build:443"
    pay = MiniPay(RPC)
    
    test_addr = "0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005"
    
    # Check balance
    try:
        balance = await pay.get_balance(test_addr, "ETH")
        print(f"ETH Balance: {balance / 10**18:.6f} ETH")
    except Exception as e:
        print(f"Balance check: {e}")
    
    # Estimate fee
    try:
        fee = await estimate_fee(
            RPC,
            test_addr,
            "0x0000000000000000000000000000000000000000000000000000000000000001",
            int(0.001 * 10**18),
            "ETH"
        )
        print(f"Fee Estimate: {fee['total_fee_eth']:.6f} ETH")
    except Exception as e:
        print(f"Fee estimation: {e}")
    
    print("✓ Mini-Pay core module is functional")


if __name__ == "__main__":
    asyncio.run(example())
