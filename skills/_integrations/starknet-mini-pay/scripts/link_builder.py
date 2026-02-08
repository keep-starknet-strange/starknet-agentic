#!/usr/bin/env python3
"""
Payment Link Builder
"""

from urllib.parse import urlencode


class PaymentLinkBuilder:
    def create(self, address: str, amount: float = None, memo: str = None, token: str = "ETH"):
        params = {}
        if amount:
            params["amount"] = str(amount)
        if memo:
            params["memo"] = memo
        base = f"starknet:{address}"
        if params:
            return f"{base}?{urlencode(params)}"
        return base


if __name__ == "__main__":
    builder = PaymentLinkBuilder()
    print(builder.create("0x123", 0.01, "coffee"))
