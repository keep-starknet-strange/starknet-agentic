#!/usr/bin/env python3
"""
Invoice Manager with InvoiceStatus enum
"""

from enum import Enum
from dataclasses import dataclass
from datetime import datetime


class InvoiceStatus(Enum):
    PENDING = "pending"
    PAID = "paid"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


@dataclass
class Invoice:
    id: str
    amount: float
    token: str
    description: str
    status: InvoiceStatus
    created_at: datetime


class InvoiceManager:
    def __init__(self):
        self.invoices = {}

    async def create_invoice(self, amount: float, token: str, description: str):
        import uuid
        inv = Invoice(id=str(uuid.uuid4())[:8], amount=amount, token=token, 
                      description=description, status=InvoiceStatus.PENDING, created_at=datetime.now())
        self.invoices[inv.id] = inv
        return inv


if __name__ == "__main__":
    import asyncio
    mgr = InvoiceManager()
    inv = asyncio.run(mgr.create_invoice(0.05, "ETH", "Service"))
    print(f"Created: {inv.id}")
