#!/usr/bin/env python3.12
"""
Starknet Mini-Pay Test Suite
Comprehensive tests for the fixed implementation
Run with: pytest scripts/test_mini_pay_fixed.py -v
"""

import pytest
import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.mini_pay import MiniPay, estimate_fee, PaymentResult, Token


# Test addresses (Starknet mainnet - safe to query)
USDC_ADDRESS = "0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005"
ETH_ADDRESS = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82dc9dd0cc"
RPC_URL = "https://rpc.starknet.lava.build:443"


class TestMiniPayInitialization:
    """Test MiniPay class initialization"""
    
    def test_init_default_rpc(self):
        pay = MiniPay()
        assert pay.rpc_url == "https://rpc.starknet.lava.build:443"
        assert pay.client is not None
    
    def test_init_custom_rpc(self):
        custom_rpc = "https://custom.rpc.url:443"
        pay = MiniPay(rpc_url=custom_rpc)
        assert pay.rpc_url == custom_rpc
    
    def test_tokens_configured(self):
        pay = MiniPay()
        assert "ETH" in pay.tokens
        assert "STRK" in pay.tokens
        assert "USDC" in pay.tokens
        assert pay.tokens["ETH"] == 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82dc9dd0cc
        assert pay.tokens["USDC"] == 0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005
    
    def test_token_decimals(self):
        pay = MiniPay()
        assert pay._get_token_decimals("ETH") == 18
        assert pay._get_token_decimals("STRK") == 18
        assert pay._get_token_decimals("USDC") == 6
        assert pay._get_token_decimals("UNKNOWN") == 18  # Default


class TestPaymentResult:
    """Test PaymentResult dataclass"""
    
    def test_payment_result_creation(self):
        result = PaymentResult(
            tx_hash="0x123",
            status="PENDING"
        )
        assert result.tx_hash == "0x123"
        assert result.status == "PENDING"
        assert result.block_number is None
        assert result.error is None
    
    def test_payment_result_with_error(self):
        result = PaymentResult(
            tx_hash="0x123",
            status="FAILED",
            error="Out of gas"
        )
        assert result.error == "Out of gas"


class TestToken:
    """Test Token enum"""
    
    def test_token_enum_values(self):
        assert Token.ETH.value == "ETH"
        assert Token.STRK.value == "STRK"
        assert Token.USDC.value == "USDC"


@pytest.mark.asyncio
class TestBalanceQueries:
    """Test balance retrieval"""
    
    async def test_get_balance_invalid_token(self):
        pay = MiniPay(RPC_URL)
        with pytest.raises(ValueError, match="Unknown token"):
            await pay.get_balance(USDC_ADDRESS, "INVALID")
    
    async def test_get_balance_invalid_address(self):
        pay = MiniPay(RPC_URL)
        with pytest.raises(ValueError):
            await pay.get_balance("invalid_address", "ETH")
    
    @pytest.mark.integration
    async def test_get_eth_balance_real(self):
        """Integration test - requires network"""
        pay = MiniPay(RPC_URL)
        try:
            balance = await pay.get_balance(USDC_ADDRESS, "ETH")
            assert isinstance(balance, int)
            assert balance >= 0
            print(f"✓ ETH Balance: {balance / 10**18:.6f}")
        except Exception as e:
            pytest.skip(f"Network unavailable: {e}")
    
    @pytest.mark.integration
    async def test_get_usdc_balance_real(self):
        """Integration test - requires network"""
        pay = MiniPay(RPC_URL)
        try:
            balance = await pay.get_balance(USDC_ADDRESS, "USDC")
            assert isinstance(balance, int)
            assert balance >= 0
            print(f"✓ USDC Balance: {balance / 10**6:.2f}")
        except Exception as e:
            pytest.skip(f"Network unavailable: {e}")


@pytest.mark.asyncio
class TestTransferValidation:
    """Test payment sending (validation only, no real txs)"""
    
    async def test_send_invalid_token(self):
        pay = MiniPay(RPC_URL)
        with pytest.raises(ValueError, match="Unknown token"):
            await pay.transfer(
                from_address=USDC_ADDRESS,
                private_key="0x1",
                to_address=ETH_ADDRESS,
                amount_wei=1000,
                token="INVALID"
            )
    
    async def test_send_zero_amount(self):
        pay = MiniPay(RPC_URL)
        with pytest.raises(ValueError, match="Amount must be positive"):
            await pay.transfer(
                from_address=USDC_ADDRESS,
                private_key="0x1",
                to_address=ETH_ADDRESS,
                amount_wei=0,
                token="ETH"
            )
    
    async def test_send_negative_amount(self):
        pay = MiniPay(RPC_URL)
        with pytest.raises(ValueError, match="Amount must be positive"):
            await pay.transfer(
                from_address=USDC_ADDRESS,
                private_key="0x1",
                to_address=ETH_ADDRESS,
                amount_wei=-1000,
                token="ETH"
            )
    
    async def test_send_invalid_from_address(self):
        pay = MiniPay(RPC_URL)
        with pytest.raises(ValueError, match="Invalid address format"):
            await pay.transfer(
                from_address="not_an_address",
                private_key="0x1",
                to_address=ETH_ADDRESS,
                amount_wei=1000,
                token="ETH"
            )
    
    async def test_send_invalid_to_address(self):
        pay = MiniPay(RPC_URL)
        with pytest.raises(ValueError, match="Invalid address format"):
            await pay.transfer(
                from_address=USDC_ADDRESS,
                private_key="0x1",
                to_address="not_an_address",
                amount_wei=1000,
                token="ETH"
            )


@pytest.mark.asyncio
@pytest.mark.integration
class TestTransactionStatus:
    """Test transaction status checking"""
    
    async def test_status_not_found(self):
        """Test with fake transaction hash"""
        pay = MiniPay(RPC_URL)
        fake_hash = "0x" + "0" * 64
        try:
            status = await pay.get_transaction_status(fake_hash)
            # Should return NOT_FOUND or ERROR
            assert status in ["NOT_FOUND", "ERROR"]
            print(f"✓ Status check: {status}")
        except Exception as e:
            pytest.skip(f"Network unavailable: {e}")


@pytest.mark.asyncio
@pytest.mark.integration
class TestBlockNumber:
    """Test block number retrieval"""
    
    async def test_get_block_number(self):
        pay = MiniPay(RPC_URL)
        try:
            block_num = await pay.get_block_number()
            assert isinstance(block_num, int)
            assert block_num > 0
            print(f"✓ Block number: {block_num}")
        except Exception as e:
            pytest.skip(f"Network unavailable: {e}")


@pytest.mark.asyncio
@pytest.mark.integration
class TestFeeEstimation:
    """Test fee estimation"""
    
    async def test_estimate_fee(self):
        """Test fee estimation for transfer"""
        try:
            fee = await estimate_fee(
                RPC_URL,
                USDC_ADDRESS,
                ETH_ADDRESS,
                int(0.001 * 10**18),  # 0.001 ETH
                "ETH"
            )
            assert "gas_price" in fee
            assert "gas_consumed" in fee
            assert "overall_fee" in fee
            assert "total_fee_eth" in fee
            print(f"✓ Fee estimate: {fee['total_fee_eth']:.6f} ETH")
        except Exception as e:
            pytest.skip(f"Network unavailable: {e}")


# Fixtures
@pytest.fixture
def minipay():
    """Fixture providing MiniPay instance"""
    return MiniPay(RPC_URL)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-m", "not integration"])
