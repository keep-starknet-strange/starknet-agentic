#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import dataclasses
import json
import os
import time
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal
from typing import Any, Dict

import aiohttp

from x10.perpetual.accounts import StarkPerpetualAccount
from x10.perpetual.configuration import MAINNET_CONFIG, TESTNET_CONFIG, EndpointConfig
from x10.perpetual.orders import OrderSide, TimeInForce
from x10.perpetual.trading_client import PerpetualTradingClient


def _parse_payload() -> Dict[str, Any]:
    raw = input()
    if not raw:
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Adapter payload must be a JSON object.")
    return payload


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _resolve_endpoint(base_url: str, api_prefix: str) -> EndpointConfig:
    seed = TESTNET_CONFIG if "sepolia" in base_url.lower() else MAINNET_CONFIG
    normalized_base = base_url[:-1] if base_url.endswith("/") else base_url
    normalized_prefix = api_prefix if api_prefix.startswith("/") else f"/{api_prefix}"
    return dataclasses.replace(seed, api_base_url=f"{normalized_base}{normalized_prefix}")


def _build_client(base_url: str, api_prefix: str) -> PerpetualTradingClient:
    api_key = _require_env("EXTENDED_API_KEY")
    public_key = _require_env("EXTENDED_PUBLIC_KEY")
    private_key = _require_env("EXTENDED_PRIVATE_KEY")
    vault_number = _require_env("EXTENDED_VAULT_NUMBER")

    endpoint = _resolve_endpoint(base_url, api_prefix)
    account = StarkPerpetualAccount(
        vault=int(vault_number),
        private_key=private_key,
        public_key=public_key,
        api_key=api_key,
    )

    return PerpetualTradingClient(endpoint_config=endpoint, stark_account=account)


async def _place_short(payload: Dict[str, Any]) -> Dict[str, Any]:
    market_name = str(payload["market"])
    notional_usd = Decimal(str(payload["notionalUsd"]))
    mark_price = Decimal(str(payload["markPrice"]))
    slippage_bps = Decimal(str(payload.get("slippageBps", 20)))
    poll_interval_ms = int(payload.get("pollIntervalMs", 350))
    poll_timeout_ms = int(payload.get("pollTimeoutMs", 12000))

    if notional_usd <= 0:
        raise ValueError("notionalUsd must be > 0")
    if mark_price <= 0:
        raise ValueError("markPrice must be > 0")

    client = _build_client(str(payload["baseUrl"]), str(payload["apiPrefix"]))
    try:
        markets = await client.markets_info.get_markets_dict()
        if market_name not in markets:
            raise ValueError(f"Unknown market: {market_name}")
        market = markets[market_name]

        qty = market.trading_config.round_order_size(notional_usd / mark_price, rounding_direction=ROUND_CEILING)
        if qty < market.trading_config.min_order_size:
            qty = market.trading_config.min_order_size

        price_multiplier = Decimal(1) - (slippage_bps / Decimal(10_000))
        if price_multiplier <= 0:
            raise ValueError("slippageBps is too large, resulting price would be <= 0")
        sell_price = market.trading_config.round_price(mark_price * price_multiplier, rounding_direction=ROUND_FLOOR)
        if sell_price <= 0:
            raise ValueError("Calculated sell price is <= 0")

        placed = await client.place_order(
            market_name=market_name,
            amount_of_synthetic=qty,
            price=sell_price,
            side=OrderSide.SELL,
            post_only=False,
            time_in_force=TimeInForce.IOC,
        )
        if placed.data is None:
            raise ValueError("Extended returned no placed order payload")

        order_id = placed.data.id
        external_id = placed.data.external_id
        deadline = time.monotonic() + (poll_timeout_ms / 1000)

        while time.monotonic() < deadline:
            try:
                order_response = await client.account.get_order_by_id(order_id)
            except Exception:
                await asyncio.sleep(poll_interval_ms / 1000)
                continue

            order = order_response.data
            if order is None:
                await asyncio.sleep(poll_interval_ms / 1000)
                continue

            status = str(order.status)
            status_reason = str(order.status_reason) if order.status_reason is not None else None
            filled_qty = Decimal(order.filled_qty) if order.filled_qty is not None else Decimal(0)
            average_price = Decimal(order.average_price) if order.average_price is not None else Decimal(order.price)
            filled_notional = filled_qty * average_price

            if status in {"FILLED", "PARTIALLY_FILLED"}:
                return {
                    "ok": True,
                    "action": "place_short",
                    "orderId": order_id,
                    "externalOrderId": external_id,
                    "status": status,
                    "statusReason": status_reason,
                    "qty": float(Decimal(order.qty)),
                    "filledQty": float(filled_qty),
                    "price": float(Decimal(order.price)),
                    "averagePrice": float(average_price),
                    "filledNotionalUsd": float(filled_notional),
                }

            if status in {"CANCELLED", "REJECTED", "EXPIRED"}:
                if filled_qty > 0:
                    return {
                        "ok": True,
                        "action": "place_short",
                        "orderId": order_id,
                        "externalOrderId": external_id,
                        "status": status,
                        "statusReason": status_reason,
                        "qty": float(Decimal(order.qty)),
                        "filledQty": float(filled_qty),
                        "price": float(Decimal(order.price)),
                        "averagePrice": float(average_price),
                        "filledNotionalUsd": float(filled_notional),
                    }
                reason_suffix = f" ({status_reason})" if status_reason else ""
                raise RuntimeError(f"Extended order {status} with no fill{reason_suffix}")

            await asyncio.sleep(poll_interval_ms / 1000)

        raise TimeoutError(f"Timed out waiting for Extended order fill (order_id={order_id})")
    finally:
        await client.close()


async def _cancel_all(payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _build_client(str(payload["baseUrl"]), str(payload["apiPrefix"]))
    try:
        await client.orders.mass_cancel(cancel_all=True)
    finally:
        await client.close()
    return {"ok": True, "action": "cancel_all"}


async def _arm_deadman(payload: Dict[str, Any]) -> Dict[str, Any]:
    seconds = int(payload["seconds"])
    if seconds <= 0:
        raise ValueError("seconds must be > 0")

    api_key = _require_env("EXTENDED_API_KEY")
    base_url = str(payload["baseUrl"])
    api_prefix = str(payload["apiPrefix"])
    endpoint = _resolve_endpoint(base_url, api_prefix)
    url = f"{endpoint.api_base_url}/user/deadmanswitch?countdownTime={seconds}"

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": api_key,
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers) as response:
            body = await response.text()
            if response.status > 299:
                raise RuntimeError(f"Dead-man switch request failed ({response.status}): {body}")
    return {"ok": True, "action": "arm_deadman_switch"}


async def _dispatch(action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if action == "place_short":
        return await _place_short(payload)
    if action == "cancel_all":
        return await _cancel_all(payload)
    if action == "arm_deadman_switch":
        return await _arm_deadman(payload)
    raise ValueError(f"Unsupported action: {action}")


async def _main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["place_short", "cancel_all", "arm_deadman_switch"])
    args = parser.parse_args()

    try:
        payload = _parse_payload()
        result = await _dispatch(args.action, payload)
        print(json.dumps(result))
        return 0
    except Exception as exc:  # pragma: no cover - surfaced to TS caller
        print(json.dumps({"ok": False, "action": args.action, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
