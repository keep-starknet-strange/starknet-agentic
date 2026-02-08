"""
Starknet RPC Client wrapper for Mini-Pay
Low-level RPC interactions
"""

import asyncio
from typing import Dict, Any, Optional, List
from starknet_py.net.full_node_client import FullNodeClient
from starknet_py.net.models import StarknetBlock, InvokeFunction
from starknet_py.contract import Contract
from starknet_py.rpc_provider import RpcProvider


class StarknetClient:
    """Low-level Starknet RPC client"""
    
    def __init__(self, rpc_url: str = "https://rpc.starknet.lava.build:443"):
        self.rpc_url = rpc_url
        self.client = FullNodeClient(node_url=rpc_url)
    
    async def get_block_number(self) -> int:
        """Get current block number"""
        return await self.client.get_block_number()
    
    async def get_block(self, block_id: str = "latest") -> StarknetBlock:
        """Get block by hash or tag"""
        return await self.client.get_block(block_id=block_id)
    
    async def get_transaction(self, tx_hash: str) -> Dict[str, Any]:
        """Get transaction by hash"""
        tx = await self.client.get_transaction(tx_hash)
        return {
            "hash": tx.hash,
            "status": str(tx.status),
            "type": str(tx.type),
            "sender_address": str(tx.sender_address),
            "nonce": tx.nonce,
            "max_fee": tx.max_fee,
            "version": tx.version,
            "calldata": tx.calldata,
        }
    
    async def get_transaction_receipt(self, tx_hash: str) -> Dict[str, Any]:
        """Get transaction receipt"""
        receipt = await self.client.get_transaction_receipt(tx_hash)
        return {
            "status": str(receipt.status),
            "block_number": receipt.block_number,
            "block_hash": str(receipt.block_hash),
            "transaction_hash": str(receipt.transaction_hash),
            "actual_fee": receipt.actual_fee,
            "events": receipt.events,
        }
    
    async def get_class_at(self, contract_address: str, block_id: str = "latest") -> Dict[str, Any]:
        """Get class at contract address"""
        return await self.client.get_class_at(contract_address, block_id)
    
    async def estimate_fee(
        self,
        calls: List[Dict[str, Any]],
        sender_address: str,
    ) -> Dict[str, int]:
        """Estimate fee for transaction"""
        account = Contract(
            address=int(sender_address, 16),
            abi=[{"name": "__default__", "type": "function"}],
            client=self.client
        )
        
        estimate = await account.estimate_fee(calls)
        return {
            "gas_consumed": estimate.gas_consumed,
            "gas_price": estimate.gas_price,
            "total_fee": estimate.total_fee,
        }
    
    async def get_storage_at(
        self,
        contract_address: str,
        key: int,
        block_id: str = "latest"
    ) -> int:
        """Get storage value"""
        return await self.client.get_storage_at(contract_address, key, block_id)
    
    async def get_events(
        self,
        from_block: Optional[str] = None,
        to_block: Optional[str] = None,
        address: Optional[str] = None,
        keys: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Get events"""
        filter_params = {}
        
        if from_block:
            filter_params["from_block"] = from_block
        if to_block:
            filter_params["to_block"] = to_block
        if address:
            filter_params["address"] = address
        if keys:
            filter_params["keys"] = keys
        
        return await self.client.get_events(filter_params)
    
    async def get_nonce(self, contract_address: str) -> int:
        """Get account nonce"""
        return await self.client.get_nonce(contract_address)
    
    async def call_contract(
        self,
        contract_address: str,
        function_name: str,
        calldata: List[int] = None,
        block_id: str = "latest"
    ) -> Dict[str, Any]:
        """Call contract function"""
        result = await self.client.call_contract(
            contract_address,
            function_name,
            calldata or [],
            block_id
        )
        return result


# Utility functions
async def check_network_status(rpc_url: str) -> Dict[str, Any]:
    """Check network status"""
    client = StarknetClient(rpc_url)
    
    try:
        block_number = await client.get_block_number()
        return {
            "status": "connected",
            "block_number": block_number,
            "rpc_url": rpc_url
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "rpc_url": rpc_url
        }


if __name__ == "__main__":
    async def test():
        client = StarknetClient()
        
        # Check status
        status = await check_network_status(client.rpc_url)
        print(f"Status: {status}")
        
        # Get block number
        block = await client.get_block_number()
        print(f"Current block: {block}")
    
    asyncio.run(test())
