"""
Starknet RPC Client wrapper for Mini-Pay
Low-level RPC interactions

Targets starknet-py 0.30.x, which speaks Starknet JSON-RPC spec 0.10.
Point it at a v0_10 endpoint, e.g.
https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10
"""

import asyncio
import dataclasses
from typing import Dict, Any, Optional, List, Union
from starknet_py.net.full_node_client import FullNodeClient
from starknet_py.net.account.account import Account
from starknet_py.net.client_models import (
    Call,
    PreConfirmedStarknetBlock,
    ResourceBoundsMapping,
    StarknetBlock,
)
from starknet_py.net.models import parse_address
from starknet_py.net.signer.base_signer import BaseSigner
from starknet_py.hash.selector import get_selector_from_name


DEFAULT_RPC_URL = "https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10"

BLOCK_TAGS = ("latest", "pre_confirmed", "l1_accepted")

BlockId = Union[int, str]


def _block_kwargs(block_id: BlockId) -> Dict[str, BlockId]:
    """Map a block number, tag or hash to starknet-py's block_number/block_hash kwargs"""
    if isinstance(block_id, int) or block_id in BLOCK_TAGS:
        return {"block_number": block_id}
    return {"block_hash": block_id}


def _enum_value(value: Any) -> Any:
    return value.value if value is not None and hasattr(value, "value") else value


class _EstimateOnlySigner(BaseSigner):
    """Signer that produces empty signatures, for fee estimation with skip_validate"""

    @property
    def public_key(self) -> int:
        return 0

    def sign_transaction(self, transaction) -> List[int]:
        return []

    def sign_message(self, typed_data, account_address: int) -> List[int]:
        raise NotImplementedError("Estimate-only signer cannot sign messages")


class StarknetClient:
    """Low-level Starknet RPC client"""

    def __init__(self, rpc_url: str = DEFAULT_RPC_URL):
        self.rpc_url = rpc_url
        self.client = FullNodeClient(node_url=rpc_url)

    async def get_spec_version(self) -> str:
        """Get the JSON-RPC spec version served by the node"""
        return await self.client.spec_version()

    async def get_block_number(self) -> int:
        """Get current block number"""
        return await self.client.get_block_number()

    async def get_block(
        self, block_id: BlockId = "latest"
    ) -> Union[StarknetBlock, PreConfirmedStarknetBlock]:
        """Get block by number, hash or tag"""
        return await self.client.get_block(**_block_kwargs(block_id))

    async def get_transaction(self, tx_hash: str) -> Dict[str, Any]:
        """Get transaction by hash"""
        tx = await self.client.get_transaction(tx_hash)
        status = await self.client.get_transaction_status(tx_hash)
        sender_address = getattr(tx, "sender_address", None)
        return {
            "hash": hex(tx.hash) if tx.hash is not None else tx_hash,
            "finality_status": _enum_value(status.finality_status),
            "execution_status": _enum_value(status.execution_status),
            "type": type(tx).__name__,
            "sender_address": hex(sender_address) if sender_address is not None else None,
            "nonce": getattr(tx, "nonce", None),
            "version": tx.version,
            "calldata": getattr(tx, "calldata", None),
        }

    async def get_transaction_receipt(self, tx_hash: str) -> Dict[str, Any]:
        """Get transaction receipt"""
        receipt = await self.client.get_transaction_receipt(tx_hash)
        return {
            "execution_status": _enum_value(receipt.execution_status),
            "finality_status": _enum_value(receipt.finality_status),
            "block_number": receipt.block_number,
            "block_hash": hex(receipt.block_hash) if receipt.block_hash is not None else None,
            "transaction_hash": hex(receipt.transaction_hash),
            "actual_fee": receipt.actual_fee.amount,
            "fee_unit": _enum_value(receipt.actual_fee.unit),
            "revert_reason": receipt.revert_reason,
            "events": receipt.events,
        }

    async def get_class_at(self, contract_address: str, block_id: BlockId = "latest"):
        """Get class at contract address"""
        return await self.client.get_class_at(contract_address, **_block_kwargs(block_id))

    async def estimate_fee(
        self,
        calls: List[Dict[str, Any]],
        sender_address: str,
    ) -> Dict[str, Any]:
        """
        Estimate fee for an invoke transaction from sender_address.

        Each call is a dict with contract_address, function_name and optional calldata.
        Signature validation is skipped, so no private key is needed. Fees are in STRK (FRI).
        """
        account = Account(
            address=sender_address,
            client=self.client,
            signer=_EstimateOnlySigner(),
        )
        prepared_calls = [
            Call(
                to_addr=parse_address(call["contract_address"]),
                selector=get_selector_from_name(call["function_name"]),
                calldata=list(call.get("calldata") or []),
            )
            for call in calls
        ]
        invoke = await account.sign_invoke_v3(
            prepared_calls,
            resource_bounds=ResourceBoundsMapping.init_with_zeros(),
        )
        estimate = await account.estimate_fee(invoke, skip_validate=True)
        return {
            "l1_gas_consumed": estimate.l1_gas_consumed,
            "l1_gas_price": estimate.l1_gas_price,
            "l2_gas_consumed": estimate.l2_gas_consumed,
            "l2_gas_price": estimate.l2_gas_price,
            "l1_data_gas_consumed": estimate.l1_data_gas_consumed,
            "l1_data_gas_price": estimate.l1_data_gas_price,
            "overall_fee": estimate.overall_fee,
            "unit": _enum_value(estimate.unit),
        }

    async def get_storage_at(
        self,
        contract_address: str,
        key: int,
        block_id: BlockId = "latest"
    ) -> int:
        """Get storage value"""
        return await self.client.get_storage_at(contract_address, key, **_block_kwargs(block_id))

    async def get_events(
        self,
        from_block: Optional[BlockId] = None,
        to_block: Optional[BlockId] = None,
        address: Optional[str] = None,
        keys: Optional[List[List[Union[int, str]]]] = None,
        chunk_size: int = 100,
        continuation_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get one chunk of events.

        from_block/to_block take block numbers or tags. keys match by position,
        e.g. [[selector]] filters on the first key. Pass the returned
        continuation_token back in to fetch the next chunk.
        """
        chunk = await self.client.get_events(
            address=address,
            keys=keys,
            from_block_number=from_block,
            to_block_number=to_block,
            chunk_size=chunk_size,
            continuation_token=continuation_token,
        )
        return {
            "events": [dataclasses.asdict(event) for event in chunk.events],
            "continuation_token": chunk.continuation_token,
        }

    async def get_nonce(self, contract_address: str) -> int:
        """Get account nonce"""
        return await self.client.get_contract_nonce(contract_address)

    async def call_contract(
        self,
        contract_address: str,
        function_name: str,
        calldata: List[int] = None,
        block_id: BlockId = "latest"
    ) -> List[int]:
        """Call contract function"""
        call = Call(
            to_addr=parse_address(contract_address),
            selector=get_selector_from_name(function_name),
            calldata=calldata or [],
        )
        return await self.client.call_contract(call, **_block_kwargs(block_id))


# Utility functions
async def check_network_status(rpc_url: str) -> Dict[str, Any]:
    """Check network status"""
    client = StarknetClient(rpc_url)

    try:
        block_number = await client.get_block_number()
        spec_version = await client.get_spec_version()
        return {
            "status": "connected",
            "block_number": block_number,
            "spec_version": spec_version,
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
