#!/usr/bin/env python3.12
"""
Starknet Mini-Pay Core Module
Simple P2P payments on Starknet

Token addresses from official sources:
- ETH/STRK: https://docs.starknet.io/resources/chain-info/
- Bridged tokens: https://github.com/starknet-io/starknet-addresses
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Token(Enum):
    ETH = "ETH"
    STRK = "STRK"
    USDC = "USDC"


# Starknet Mainnet Token Addresses
# Source: https://docs.starknet.io/resources/chain-info/
MAINNET_TOKENS = {
    "ETH": 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7,
    "STRK": 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d,
    # USDC: https://github.com/starknet-io/starknet-addresses/blob/master/bridged_tokens/mainnet.json
    "USDC": 0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8,
}

# Sepolia Testnet Token Addresses  
SEPOLIA_TOKENS = {
    "ETH": 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7,
    "STRK": 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d,
}


@dataclass
class PaymentResult:
    tx_hash: str
    status: str
    block_number: Optional[int] = None
    error: Optional[str] = None


class MiniPay:
    """Core Mini-Pay class for Starknet payments."""
    
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
    
    def __init__(self, rpc_url: str = "https://rpc.starknet.lava.build:443", network: str = "mainnet"):
        self.rpc_url = rpc_url
        self.network = network.lower()
        self.client = FullNodeClient(node_url=rpc_url)
        
        if self.network == "sepolia":
            self.tokens = SEPOLIA_TOKENS.copy()
        else:
            self.tokens = MAINNET_TOKENS.copy()
    
    def _get_token_decimals(self, token: str) -> int:
        return {"ETH": 18, "STRK": 18, "USDC": 6}.get(token.upper(), 18)
    
    def _create_account(self, address: str, private_key: str) -> Account:
        key_pair = KeyPair.from_private_key(int(private_key, 16))
        return Account(
            address=int(address, 16),
            client=self.client,
            key_pair=key_pair,
        )
    
    async def _call_contract(self, call: Call, block_id: str = "latest") -> List[int]:
        """Call contract with fallback for different RPC versions."""
        try:
            return await self.client.call_contract(call=call, block_number=block_id)
        except Exception as e:
            error_str = str(e).lower()
            if "invalid params" in error_str or "block id" in error_str:
                try:
                    return await self.client.call_contract(call=call)
                except:
                    pass
            raise
    
    async def get_balance(self, address: str, token: str = "ETH") -> int:
        """Get token balance for an address."""
        token_symbol = token.upper()
        
        if token_symbol not in self.tokens:
            raise ValueError(f"Unknown token: {token}")
        
        try:
            token_address = self.tokens[token_symbol]
            balance_of_selector = get_selector_from_name("balanceOf")
            
            call = Call(
                to_addr=token_address,
                selector=balance_of_selector,
                calldata=[int(address, 16)]
            )
            
            result = await self._call_contract(call)
            
            if len(result) >= 2:
                balance = result[0] + (result[1] << 128)
            else:
                balance = result[0]
            
            return balance
            
        except Exception as e:
            logger.error(f"Balance check failed for {address[:10]}: {e}")
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
        """Send a payment."""
        token_symbol = token.upper()
        
        if token_symbol not in self.tokens:
            raise ValueError(f"Unknown token: {token_symbol}")
        
        if amount_wei <= 0:
            raise ValueError("Amount must be positive")
        
        try:
            int(from_address, 16)
            int(to_address, 16)
        except ValueError:
            raise ValueError("Invalid address format")
        
        account = self._create_account(from_address, private_key)
        
        token_address = self.tokens[token_symbol]
        contract = Contract(
            address=token_address,
            abi=self.ERC20_ABI,
            client=self.client
        )
        
        transfer_call = contract.functions["transfer"].prepare(
            recipient=int(to_address, 16),
            amount=amount_wei
        )
        
        calls = [transfer_call]
        
        for attempt in range(max_retries):
            try:
                estimated = await account.estimate_fee(calls)
                max_fee = int(estimated.overall_fee * 1.5)
                
                logger.info(f"Estimated fee: {estimated.overall_fee / 10**18:.6f} ETH")
                
                if token_symbol != "ETH":
                    eth_balance = await self.get_balance(from_address, "ETH")
                    if eth_balance < max_fee:
                        raise ValueError("Insufficient ETH for fees")
                
                logger.info(f"Sending {amount_wei / 10**self._get_token_decimals(token_symbol):.6f} {token_symbol}")
                
                result = await account.execute(calls, max_fee=max_fee)
                tx_hash = hex(result.transaction_hash)
                
                logger.info(f"Transaction submitted: {tx_hash}")
                return tx_hash
                
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1}/{max_retries} failed: {e}")
                
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                
                raise RuntimeError(f"Transaction failed after {max_retries} attempts")
    
    async def wait_for_confirmation(self, tx_hash: str, max_wait_seconds: int = 180, poll_interval: float = 3.0) -> str:
        """Wait for transaction to be confirmed."""
        import time
        start_time = time.time()
        
        logger.info(f"Waiting for confirmation of {tx_hash[:16]}...")
        
        while True:
            elapsed = time.time() - start_time
            if elapsed > max_wait_seconds:
                return "TIMEOUT"
            
            status = await self.get_transaction_status(tx_hash)
            
            if status in ["CONFIRMED", "REJECTED", "FAILED"]:
                return status
            
            await asyncio.sleep(poll_interval)
    
    async def get_transaction_status(self, tx_hash: str) -> str:
        """Get transaction status."""
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
            if "not found" in str(e).lower():
                return "NOT_FOUND"
            return f"ERROR"
    
    async def get_block_number(self) -> int:
        """Get current block number."""
        return await self.client.get_block_number()


async def example():
    """Example usage."""
    RPC = "https://starknet-mainnet.g.alchemy.com/v2/lq2wTFNVuh1mmqC7oPcYw"
    pay = MiniPay(RPC)
    
    addr = "0x068047beadC45aFF253839D4DD7c2cD1c27D502738BAd0AF935D402bdf9244ED"
    
    print(f"Address: {addr}\n")
    
    for token in ["ETH", "STRK", "USDC"]:
        try:
            balance = await pay.get_balance(addr, token)
            decimals = 18 if token != "USDC" else 6
            print(f"{token}: {balance / 10**decimals:.6f}")
        except Exception as e:
            print(f"{token}: Error - {str(e)[:50]}")
    
    print("\n✓ MiniPay is ready!")


if __name__ == "__main__":
    asyncio.run(example())
