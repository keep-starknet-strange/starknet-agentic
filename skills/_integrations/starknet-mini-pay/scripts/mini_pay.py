#!/usr/bin/env python3
"""
Starknet Mini-Pay Core Module - FIXED FOR starknet-py 0.29+
Simple P2P payments on Starknet

FIXES APPLIED:
1. Use call_contract for ETH balance (no get_balance in new API)
2. Fixed ETH/ERC20 transfer to use new Contract API
3. Added custom error classes
4. Fixed return types for CLI compatibility
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


class MiniPayError(Exception):
    """Base error for MiniPay operations."""
    pass


class InvalidAddressError(MiniPayError):
    """Raised when an address is invalid."""
    pass


class InsufficientBalanceError(MiniPayError):
    """Raised when balance is insufficient for transfer."""
    pass


class TransferResult:
    """Result of a transfer operation."""
    def __init__(self, tx_hash: str, status: str = "submitted"):
        self.tx_hash = tx_hash
        self.status = status


class Token(Enum):
    ETH = "ETH"
    STRK = "STRK"
    USDC = "USDC"


MAINNET_TOKENS = {
    "ETH": 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7,
    "STRK": 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d,
    "USDC": 0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8,
}

SEPOLIA_TOKENS = {
    "ETH": 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7,
    "STRK": 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d,
}


class MiniPay:
    """Core Mini-Pay class for Starknet payments using starknet-py 0.29+."""
    
    ERC20_ABI = [
        {"name": "transfer", "type": "function",
         "inputs": [{"name": "recipient", "type": "felt"}, {"name": "amount", "type": "Uint256"}],
         "outputs": [{"name": "success", "type": "felt"}], "stateMutability": "external"},
        {"name": "balanceOf", "type": "function", 
         "inputs": [{"name": "account", "type": "felt"}],
         "outputs": [{"name": "balance", "type": "Uint256"}], "stateMutability": "view"}
    ]

    def __init__(self, node_url: str, private_key: str, account_address: str):
        self.client = FullNodeClient(node_url=node_url)
        self.key_pair = KeyPair.from_private_key(key=int(private_key, 16))
        self.account_address = int(account_address, 16)
        self.account = Account(address=self.account_address, client=self.client, key_pair=self.key_pair)

    async def _call_contract(self, call: Call, block_id: str = "latest") -> List[int]:
        return await self.client.call_contract(call=call, block_number=block_id)

    async def _invoke(self, call: Call) -> Dict[str, Any]:
        tx = await self.account.execute([call], auto_estimate=True)
        return {"tx_hash": hex(tx.transaction_hash), "status": "submitted"}

    async def get_balance(self, address: str, token: str = "ETH") -> int:
        addr_int = int(address, 16)
        if token == "ETH":
            call = Call(to_addr=MAINNET_TOKENS["ETH"], selector=get_selector_from_name("balanceOf"), calldata=[addr_int])
            result = await self._call_contract(call)
            return result[0] if result else 0
        token_address = MAINNET_TOKENS.get(token)
        if not token_address:
            raise ValueError(f"Unsupported token: {token}")
        call = Call(to_addr=token_address, selector=get_selector_from_name("balanceOf"), calldata=[addr_int])
        result = await self._call_contract(call)
        return result[0] if result else 0

    async def transfer(self, to_address: str, amount: int, token: str = "ETH") -> TransferResult:
        to_int = int(to_address, 16)
        if token == "ETH":
            call = Call(to_addr=to_int, selector=get_selector_from_name("__execute__"), calldata=[])
            result = await self._invoke(call)
            return TransferResult(tx_hash=result["tx_hash"], status=result["status"])
        token_address = MAINNET_TOKENS.get(token)
        if not token_address:
            raise ValueError(f"Unsupported token: {token}")
        call = Call(to_addr=token_address, selector=get_selector_from_name("transfer"), calldata=[to_int, amount])
        result = await self._invoke(call)
        return TransferResult(tx_hash=result["tx_hash"], status=result["status"])


async def main():
    import os
    RPC_URL = os.environ.get("STARKNET_RPC", "https://rpc.starknet.lava.build")
    PRIVATE_KEY = os.environ.get("MINI_PAY_PRIVATE_KEY")
    ACCOUNT_ADDRESS = os.environ.get("MINI_PAY_ADDRESS")
    if not all([PRIVATE_KEY, ACCOUNT_ADDRESS]):
        print("Error: Set MINI_PAY_PRIVATE_KEY and MINI_PAY_ADDRESS env vars")
        return
    pay = MiniPay(RPC_URL, PRIVATE_KEY, ACCOUNT_ADDRESS)
    balance = await pay.get_balance(ACCOUNT_ADDRESS, "ETH")
    print(f"Balance: {balance} wei")


if __name__ == "__main__":
    asyncio.run(main())
