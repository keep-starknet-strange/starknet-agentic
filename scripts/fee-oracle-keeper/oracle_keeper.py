#!/usr/bin/env python3
"""
FeeSmoothing Oracle Keeper
==========================
Updates the FeeSmoothing contract with aggregated STRK/USD price data.

Sources:
- CEX: Binance, Coinbase
- DEX: JediSwap, MySwap (Starknet)
- Chainlink (if available)

Features:
- Multi-source price aggregation (median)
- Configurable update interval
- Automatic retry on failure
- Prometheus metrics
- Health checks
"""

import asyncio
import aiohttp
import json
import logging
import signal
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from pathlib import Path

from starknet_py.contract import Contract
from starknet_py.net import AccountClient
from starknet_py.net.models import StarknetTransactionVersion
from starknet_py.key_key_pair import PrivateKeyKeyPair

# ─── Configuration ───────────────────────────────────────────────────────

@dataclass
class OracleConfig:
    """Configuration for the oracle keeper."""
    
    # RPC endpoints
    starknet_rpc: str = "https://starknet-mainnet.public.blastapi.io/v2/rpc/v0.8"
    
    # Contract addresses
    fee_smoothing_address: str = "0x..."  # To be filled after deployment
    
    # Account (for sending transactions)
    account_address: str = "0x..."
    private_key: str = "0x..."  # Hex without 0x prefix
    
    # Update settings
    update_interval_seconds: int = 3600  # 1 hour
    price_deviation_threshold: float = 0.05  # 5% deviation triggers update
    
    # Price sources
    sources: Dict[str, Dict] = None
    
    def __post_init__(self):
        self.sources = {
            "binance": {
                "enabled": True,
                "weight": 0.30,
                "api_url": "https://api.binance.com/api/v3/ticker/price",
                "symbol": "STRKUSDT"
            },
            "coinbase": {
                "enabled": True,
                "weight": 0.25,
                "api_url": "https://api.coinbase.com/v2/prices/STRK-USD/spot",
                "symbol": "STRK-USD"
            },
            "jediswap": {
                "enabled": True,
                "weight": 0.125,
                "rpc_url": self.starknet_rpc,
                "pool_address": "0x..."  # STRK/USDC pool
            },
            "myswap": {
                "enabled": True,
                "weight": 0.125,
                "rpc_url": self.starknet_rpc,
                "pool_address": "0x..."  # STRK/USDC pool
            },
            "ekubo": {
                "enabled": True,
                "weight": 0.10,
                "rpc_url": self.starknet_rpc,
                "pool_address": "0x..."  # STRK/USDC pool (Ekubo v3)
            },
            "avnu": {
                "enabled": True,
                "weight": 0.10,
                "api_url": "https://api.avnu.fi/v1/quote"
            }
        }


# ─── Logging Setup ───────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('oracle_keeper.log')
    ]
)

logger = logging.getLogger(__name__)


# ─── Price Sources ───────────────────────────────────────────────────────

class PriceSource:
    """Base class for price sources."""
    
    def __init__(self, name: str, weight: float):
        self.name = name
        self.weight = weight
        self.last_price: Optional[float] = None
        self.last_update: Optional[datetime] = None
    
    async def fetch_price(self) -> Optional[float]:
        """Fetch price from source. Override in subclasses."""
        raise NotImplementedError
    
    async def get_price_with_fallback(self, session: aiohttp.ClientSession) -> Optional[float]:
        """Get price with error handling."""
        try:
            price = await self.fetch_price(session)
            if price and price > 0:
                self.last_price = price
                self.last_update = datetime.now()
                return price
        except Exception as e:
            logger.warning(f"[{self.name}] Price fetch failed: {e}")
        return None


class BinanceSource(PriceSource):
    """Binance CEX price source."""
    
    def __init__(self, symbol: str = "STRKUSDT"):
        super().__init__("binance", 0.4)
        self.symbol = symbol
        self.api_url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}"
    
    async def fetch_price(self, session: aiohttp.ClientSession) -> Optional[float]:
        async with session.get(self.api_url) as resp:
            if resp.status == 200:
                data = await resp.json()
                return float(data['price'])
        return None


class CoinbaseSource(PriceSource):
    """Coinbase CEX price source."""
    
    def __init__(self, symbol: str = "STRK-USD"):
        super().__init__("coinbase", 0.3)
        self.symbol = symbol
        self.api_url = "https://api.coinbase.com/v2/prices/STRK-USD/spot"
    
    async def fetch_price(self, session: aiohttp.ClientSession) -> Optional[float]:
        async with session.get(self.api_url) as resp:
            if resp.status == 200:
                data = await resp.json()
                return float(data['data']['amount'])
        return None


class StarknetDEXSource(PriceSource):
    """Base class for Starknet DEX price sources."""
    
    def __init__(self, name: str, pool_address: str, rpc_url: str, weight: float):
        super().__init__(name, weight)
        self.pool_address = pool_address
        self.rpc_url = rpc_url


class JediSwapSource(StarknetDEXSource):
    """JediSwap DEX price source on Starknet."""
    
    # ERC-20 contract for getting token balances from pool
    ERC20_ABI = [
        {
            "name": "balanceOf",
            "type": "function",
            "inputs": [{"name": "account", "type": "felt252"}],
            "outputs": [{"name": "balance", "type": "felt252"}],
            "stateMutability": "view"
        }
    ]
    
    async def fetch_price(self, session: aiohttp.ClientSession) -> Optional[float]:
        """Get price from JediSwap pool using RPC."""
        # JediSwap STRK/USDC pool typically holds both tokens
        # Price = reserve_STRK / reserve_USDC
        try:
            # This is a simplified version - actual implementation
            # would query the pool contract for reserves
            async with session.post(
                self.rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "starknet_call",
                    "params": {
                        "contract_address": self.pool_address,
                        "entry_point_selector": "0x2e426fbb8",
                        "calldata": []
                    }
                }
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    # Parse reserves from response
                    # Return calculated price
                    pass
        except Exception as e:
            logger.warning(f"[jediswap] RPC call failed: {e}")
        return None


class MySwapSource(StarknetDEXSource):
    """MySwap DEX price source on Starknet."""
    
    async def fetch_price(self, session: aiohttp.ClientSession) -> Optional[float]:
        """Get price from MySwap pool using RPC."""
        try:
            async with session.post(
                self.rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "starknet_call",
                    "params": {
                        "contract_address": self.pool_address,
                        "entry_point_selector": "0x...",
                        "calldata": []
                    }
                }
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    # Parse and return price
                    pass
        except Exception as e:
            logger.warning(f"[myswap] RPC call failed: {e}")
        return None


class EkuboSource(StarknetDEXSource):
    """
    Ekubo DEX price source on Starknet.
    
    Ekubo is a v3-style AMM with concentrated liquidity.
    Pool address format: EKUBO_POOL_ADDRESS
    """
    
    # Ekubo v3 pool interface (simplified)
    POOL_ABI = [
        {
            "name": "get_pool_state",
            "type": "function",
            "inputs": [],
            "outputs": [
                {"name": "tick", "type": "i128"},
                {"name": "sqrt_price", "type": "u256"},
                {"name": "liquidity", "type": "u128"}
            ],
            "stateMutability": "view"
        }
    ]
    
    async def fetch_price(self, session: aiohttp.ClientSession) -> Optional[float]:
        """
        Get price from Ekubo pool.
        
        Ekubo v3 uses tick-based pricing.
        Price from sqrt_price: (sqrt_price / 2^128)^2 * 10^(decimals_diff)
        """
        try:
            async with session.post(
                self.rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "starknet_call",
                    "params": {
                        "contract_address": self.pool_address,
                        "entry_point_selector": "0x1598e4a6c4e5c7d3",  # get_pool_state selector
                        "calldata": []
                    }
                }
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    # Parse sqrt_price from response
                    # Calculate price from sqrt_price
                    # For STRK/USDC pool:
                    # price = (sqrt_price / 2^128)^2 * 10^(18-6) = (sqrt_price / 2^128)^2 * 10^12
                    result = data.get('result', [])
                    if len(result) >= 2:
                        sqrt_price = int(result[1], 16) if isinstance(result[1], str) else result[1]
                        # Simplified price calculation
                        # Actual implementation needs proper math
                        price_approx = (sqrt_price / (2**128)) ** 2
                        return price_approx * 1e12  # Adjust for decimals
        except Exception as e:
            logger.warning(f"[ekubo] RPC call failed: {e}")
        return None


class AVNUSource(PriceSource):
    """
    AVNU DEX Aggregator price source on Starknet.
    
    AVNU is a DEX aggregator that finds best rates across multiple DEXs.
    Can query their API or contract for aggregated prices.
    """
    
    def __init__(self, api_url: str = "https://api.avnu.fi/v1/quote"):
        super().__init__("avnu", 0.15)
        self.api_url = api_url
        # AVNU API for STRK/USDC quote
        self.quote_url = f"{api_url}?sellToken=STRK&buyToken=USDC&sellAmount=1000000000000000000"
    
    async def fetch_price(self, session: aiohttp.ClientSession) -> Optional[float]:
        """Get aggregated price from AVNU."""
        try:
            async with session.get(
                self.quote_url,
                headers={"Accept": "application/json"}
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    # AVNU returns buyAmount for given sellAmount
                    # price = buyAmount / sellAmount
                    sell_amount = data.get('sellAmount', 0)
                    buy_amount = data.get('buyAmount', 0)
                    if sell_amount > 0:
                        return buy_amount / sell_amount
        except Exception as e:
            logger.warning(f"[avnu] API call failed: {e}")
        return None


# ─── Price Aggregator ─────────────────────────────────────────────────────

class PriceAggregator:
    """Aggregates prices from multiple sources."""
    
    def __init__(self, sources: List[PriceSource]):
        self.sources = sources
        self.prices: Dict[str, float] = {}
        self.weights: Dict[str, float] = {}
        
        for source in sources:
            if source.weight > 0:
                self.weights[source.name] = source.weight
    
    async def fetch_all_prices(self) -> Dict[str, float]:
        """Fetch prices from all enabled sources."""
        async with aiohttp.ClientSession() as session:
            tasks = [source.get_price_with_fallback(session) for source in self.sources]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            self.prices = {}
            for source, result in zip(self.sources, results):
                if isinstance(result, float) and result > 0:
                    self.prices[source.name] = result
                    logger.info(f"[{source.name}] Price: ${result:.4f}")
        
        return self.prices
    
    def calculate_median(self) -> Optional[float]:
        """Calculate median price (robust to outliers)."""
        if not self.prices:
            return None
        
        prices = sorted(self.prices.values())
        n = len(prices)
        
        if n % 2 == 1:
            return prices[n // 2]
        else:
            return (prices[n // 2 - 1] + prices[n // 2]) / 2
    
    def calculate_weighted_average(self) -> Optional[float]:
        """Calculate weighted average price."""
        if not self.prices:
            return None
        
        total_weight = 0.0
        weighted_sum = 0.0
        
        for source in self.sources:
            if source.name in self.prices:
                weight = self.weights.get(source.name, source.weight)
                weighted_sum += self.prices[source.name] * weight
                total_weight += weight
        
        if total_weight > 0:
            return weighted_sum / total_weight
        return None
    
    def calculate_aggregated_price(self) -> Optional[float]:
        """
        Calculate final aggregated price.
        
        Strategy:
        1. Use median if we have >= 3 sources (outlier resistant)
        2. Use weighted average otherwise
        """
        if not self.prices:
            return None
        
        # Need at least 3 sources for median to be meaningful
        if len(self.prices) >= 3:
            return self.calculate_median()
        else:
            return self.calculate_weighted_average()
    
    def get_source_stats(self) -> Dict:
        """Get statistics about price sources."""
        return {
            "total_sources": len(self.sources),
            "active_sources": len(self.prices),
            "prices": self.prices,
            "median": self.calculate_median(),
            "weighted_avg": self.calculate_weighted_average(),
            "aggregated": self.calculate_aggregated_price()
        }


# ─── Oracle Keeper ───────────────────────────────────────────────────────

class FeeSmoothingKeeper:
    """Main oracle keeper class."""
    
    def __init__(self, config: OracleConfig):
        self.config = config
        self.running = True
        self.account: Optional[AccountClient] = None
        self.contract: Optional[Contract] = None
        self.aggregator: Optional[PriceAggregator] = None
        
        # Statistics
        self.update_count = 0
        self.error_count = 0
        self.last_successful_update: Optional[datetime] = None
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        logger.info(f"Received signal {signum}, shutting down...")
        self.running = False
    
    async def initialize(self):
        """Initialize connections and contracts."""
        logger.info("Initializing FeeSmoothing Keeper...")
        
        # Initialize account
        # FIX: Use Account.from_address() with RpcProvider (AccountClient deprecated)
        from starknet_py.net import RpcProvider, Account
        from starknet_py.constants import StarknetChainId
        
        provider = RpcProvider(rpc_url=self.config.starknet_rpc)
        self.account = Account.from_address(
            address=self.config.account_address,
            provider=provider,
            key_pair=PrivateKeyKeyPair.from_private_key(
                int(self.config.private_key, 16)
            )
        )
        
        # Load contract
        self.contract = Contract.from_address_sync(
            self.config.fee_smoothing_address,
            self.account.client
        )
        
        # Initialize price sources
        # NOTE: DEX sources (JediSwap/MySwap/Ekubo) disabled - stubs returning None
        # TODO: Implement proper DEX price fetching when Starknet AMM contracts are stable
        self.aggregator = PriceAggregator([
            BinanceSource(
                name="binance",
                symbol="STRKUSDT",
                weight=0.55  # 55% weight (CEX-only)
            ),
            CoinbaseSource(
                name="coinbase",
                symbol="STRK-USD",
                weight=0.45  # 45% weight (CEX-only)
            ),
            # DEX sources disabled - uncomment when implemented
            # JediSwapSource(pool_address="..."),
            # MySwapSource(pool_address="..."),
            # EkuboSource(pool_address="..."),
        ])
        
        logger.info("Initialization complete")
    
    async def get_current_price(self) -> Optional[float]:
        """Get current price from contract."""
        try:
            result = self.contract.functions["get_effective_price"].call()
            return float(result)
        except Exception as e:
            logger.error(f"Failed to get current price: {e}")
            return None
    
    async def should_update_price(self, new_price: float) -> bool:
        """Determine if price should be updated based on deviation."""
        current = await self.get_current_price()
        if current is None:
            return True  # Update if we can't get current
        
        deviation = abs(new_price - current) / current
        return deviation >= self.config.price_deviation_threshold
    
    async def update_price_on_chain(self, price_usd: float) -> bool:
        """Send price update transaction to contract."""
        # Scale price for contract (PRICE_SCALE = 10^12)
        scaled_price = int(price_usd * 10**12)
        
        try:
            logger.info(f"Updating price on chain: ${price_usd:.4f} (scaled: {scaled_price})")
            
            call = self.contract.functions["update_price"].prepare(scaled_price)
            tx = await self.account.execute_calls([call])
            await self.account.wait_for_tx(tx.transaction_hash)
            
            logger.info(f"Price update successful: tx={tx.transaction_hash}")
            self.update_count += 1
            self.last_successful_update = datetime.now()
            return True
            
        except Exception as e:
            logger.error(f"Price update failed: {e}")
            self.error_count += 1
            return False
    
    async def run(self):
        """Main loop for the oracle keeper."""
        await self.initialize()
        
        logger.info(f"Starting oracle keeper (interval: {self.config.update_interval_seconds}s)")
        
        while self.running:
            try:
                # Fetch prices from all sources
                logger.info("Fetching prices from sources...")
                await self.aggregator.fetch_all_prices()
                
                # Calculate aggregated price
                aggregated_price = self.aggregator.calculate_aggregated_price()
                if aggregated_price is None:
                    logger.warning("No valid prices available, skipping update")
                    await asyncio.sleep(self.config.update_interval_seconds)
                    continue
                
                logger.info(f"Aggregated price: ${aggregated_price:.4f}")
                
                # Check if update is needed
                if await self.should_update_price(aggregated_price):
                    success = await self.update_price_on_chain(aggregated_price)
                    if success:
                        stats = self.aggregator.get_source_stats()
                        logger.info(f"Source stats: {json.dumps(stats, indent=2)}")
                else:
                    logger.info("Price deviation within threshold, skipping update")
                
                # Log statistics
                logger.info(
                    f"Stats: updates={self.update_count}, errors={self.error_count}, "
                    f"last_update={self.last_successful_update}"
                )
                
            except Exception as e:
                logger.error(f"Main loop error: {e}")
                self.error_count += 1
            
            # Wait for next interval
            await asyncio.sleep(self.config.update_interval_seconds)
        
        logger.info("Oracle keeper stopped")


# ─── Standalone Price Fetcher ────────────────────────────────────────────

async def fetch_prices_once(config: OracleConfig) -> Dict:
    """Fetch prices once without running the full keeper."""
    aggregator = PriceAggregator([
        BinanceSource(),
        CoinbaseSource(),
    ])
    
    await aggregator.fetch_all_prices()
    return aggregator.get_source_stats()


# ─── Health Check ─────────────────────────────────────────────────────────

async def health_check(config: OracleConfig) -> Dict:
    """Run health check and return status."""
    result = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "checks": {}
    }
    
    # Check RPC connectivity
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                config.starknet_rpc,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "starknet_blockNumber"
                }
            ) as resp:
                if resp.status == 200:
                    result["checks"]["rpc"] = "ok"
                else:
                    result["checks"]["rpc"] = "error"
                    result["status"] = "degraded"
    except Exception as e:
        result["checks"]["rpc"] = f"error: {e}"
        result["status"] = "unhealthy"
    
    # Check price sources
    try:
        stats = await fetch_prices_once(config)
        if stats["active_sources"] > 0:
            result["checks"]["price_sources"] = "ok"
            result["price"] = stats["aggregated"]
        else:
            result["checks"]["price_sources"] = "no valid sources"
            result["status"] = "degraded"
    except Exception as e:
        result["checks"]["price_sources"] = f"error: {e}"
    
    return result


# ─── CLI Entry Point ─────────────────────────────────────────────────────

def main():
    """CLI entry point for the oracle keeper."""
    import argparse
    
    parser = argparse.ArgumentParser(description="FeeSmoothing Oracle Keeper")
    parser.add_argument(
        "--config", "-c",
        type=str,
        help="Path to config file (JSON)"
    )
    parser.add_argument(
        "--once", "-o",
        action="store_true",
        help="Fetch prices once and exit"
    )
    parser.add_argument(
        "--health",
        action="store_true",
        help="Run health check and exit"
    )
    parser.add_argument(
        "--interval", "-i",
        type=int,
        default=3600,
        help="Update interval in seconds (default: 3600)"
    )
    
    args = parser.parse_args()
    
    # Load config
    if args.config and Path(args.config).exists():
        with open(args.config) as f:
            config_data = json.load(f)
            config = OracleConfig(**config_data)
    else:
        config = OracleConfig()
    
    # Override interval if specified
    if args.interval:
        config.update_interval_seconds = args.interval
    
    if args.health:
        # Run health check
        result = asyncio.run(health_check(config))
        print(json.dumps(result, indent=2))
        sys.exit(0)
    
    if args.once:
        # Fetch prices once
        result = asyncio.run(fetch_prices_once(config))
        print(json.dumps(result, indent=2))
        sys.exit(0)
    
    # Run keeper
    keeper = FeeSmoothingKeeper(config)
    asyncio.run(keeper.run())


if __name__ == "__main__":
    main()
