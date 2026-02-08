"""
Invoice Manager for Starknet Mini-Pay
Create and manage payment invoices/requests
"""

import json
import time
import uuid
import hashlib
from typing import Optional, Dict, Any
from dataclasses import dataclass, field, asdict
from enum import Enum
from datetime import datetime
import aiosqlite
import os


class InvoiceStatus(Enum):
    """Invoice status"""
    PENDING = "pending"
    PAID = "paid"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


@dataclass
class Invoice:
    """Invoice data structure"""
    id: str
    recipient_address: str
    payer_address: str  # Optional, None for open invoices
    amount: float
    token: str
    memo: str
    status: str
    created_at: int
    expires_at: int
    paid_at: Optional[int] = None
    tx_hash: Optional[str] = None
    
    def to_dict(self) -> dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict) -> "Invoice":
        return cls(**data)
    
    def is_expired(self) -> bool:
        """Check if invoice is expired"""
        return time.time() > self.expires_at
    
    def is_valid(self) -> bool:
        """Check if invoice is valid (not expired, not paid)"""
        return (
            self.status == InvoiceStatus.PENDING.value and
            not self.is_expired()
        )
    
    def remaining_seconds(self) -> int:
        """Get remaining time in seconds"""
        remaining = self.expires_at - int(time.time())
        return max(0, remaining)


class InvoiceManager:
    """Manage payment invoices"""
    
    DEFAULT_EXPIRY = 3600  # 1 hour in seconds
    DB_PATH = "invoices.db"
    
    # Expiry options in seconds
    EXPIRY_OPTIONS = {
        "15m": 15 * 60,
        "30m": 30 * 60,
        "1h": 60 * 60,
        "4h": 4 * 60 * 60,
        "24h": 24 * 60 * 60,
        "7d": 7 * 24 * 60 * 60,
    }
    
    def __init__(
        self,
        db_path: str = None,
        rpc_url: str = "https://rpc.starknet.lava.build:443",
        default_expiry: int = None
    ):
        """
        Initialize invoice manager
        
        Args:
            db_path: Path to SQLite database
            rpc_url: Starknet RPC URL
            default_expiry: Default expiry in seconds
        """
        self.db_path = db_path or self.DB_PATH
        self.rpc_url = rpc_url
        self.default_expiry = default_expiry or self.DEFAULT_EXPIRY
    
    async def initialize(self):
        """Initialize database"""
        self.db = await aiosqlite.connect(self.db_path)
        
        # Create invoices table
        await self.db.execute("""
            CREATE TABLE IF NOT EXISTS invoices (
                id TEXT PRIMARY KEY,
                recipient_address TEXT NOT NULL,
                payer_address TEXT,
                amount REAL NOT NULL,
                token TEXT NOT NULL,
                memo TEXT,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                paid_at INTEGER,
                tx_hash TEXT
            )
        """)
        
        # Create index on recipient_address
        await self.db.execute("""
            CREATE INDEX IF NOT EXISTS idx_recipient 
            ON invoices(recipient_address)
        """)
        
        # Create index on status
        await self.db.execute("""
            CREATE INDEX IF NOT EXISTS idx_status 
            ON invoices(status)
        """)
        
        await self.db.commit()
    
    async def close(self):
        """Close database connection"""
        if self.db:
            await self.db.close()
    
    async def create(
        self,
        payer_address: str,
        amount: float,
        token: str = "USDC",
        expiry_seconds: int = None,
        description: str = None,
        recipient_address: Optional[str] = None
    ) -> Invoice:
        """
        Create a new invoice
        
        Args:
            payer_address: Address that should pay (None for open invoice)
            amount: Amount requested
            token: Token symbol
            expiry_seconds: Expiry time in seconds
            description: Invoice description
            recipient_address: Optional specific recipient
        
        Returns:
            Invoice object
        """
        # Generate unique invoice ID
        invoice_id = self._generate_invoice_id(payer_address, amount)
        
        # Calculate expiry
        now = int(time.time())
        expiry = expiry_seconds or self.default_expiry
        expires_at = now + expiry
        
        invoice = Invoice(
            id=invoice_id,
            recipient_address=recipient_address or payer_address,
            payer_address=payer_address,
            amount=amount,
            token=token.upper(),
            memo=description or "",
            status=InvoiceStatus.PENDING.value,
            created_at=now,
            expires_at=expires_at,
        )
        
        # Save to database
        await self._save_invoice(invoice)
        
        return invoice
    
    async def get(self, invoice_id: str) -> Optional[Invoice]:
        """Get invoice by ID"""
        cursor = await self.db.execute(
            "SELECT * FROM invoices WHERE id = ?",
            (invoice_id,)
        )
        row = await cursor.fetchone()
        
        if row:
            return Invoice(
                id=row[0],
                recipient_address=row[1],
                payer_address=row[2],
                amount=row[3],
                token=row[4],
                memo=row[5],
                status=row[6],
                created_at=row[7],
                expires_at=row[8],
                paid_at=row[9],
                tx_hash=row[10]
            )
        return None
    
    async def get_by_address(self, address: str) -> list:
        """Get all invoices for an address"""
        cursor = await self.db.execute(
            "SELECT * FROM invoices WHERE recipient_address = ? ORDER BY created_at DESC",
            (address.lower(),)
        )
        rows = await cursor.fetchall()
        
        invoices = []
        for row in rows:
            invoices.append(Invoice(
                id=row[0],
                recipient_address=row[1],
                payer_address=row[2],
                amount=row[3],
                token=row[4],
                memo=row[5],
                status=row[6],
                created_at=row[7],
                expires_at=row[8],
                paid_at=row[9],
                tx_hash=row[10]
            ))
        return invoices
    
    async def mark_paid(
        self,
        invoice_id: str,
        tx_hash: str,
        payer_address: str = None
    ) -> Optional[Invoice]:
        """Mark invoice as paid"""
        invoice = await self.get(invoice_id)
        
        if not invoice:
            return None
        
        if invoice.status != InvoiceStatus.PENDING.value:
            return invoice
        
        # Check expiry
        if invoice.is_expired():
            invoice.status = InvoiceStatus.EXPIRED.value
        else:
            invoice.status = InvoiceStatus.PAID.value
            invoice.paid_at = int(time.time())
            invoice.tx_hash = tx_hash
        
        await self._update_invoice(invoice)
        
        return invoice
    
    async def cancel(self, invoice_id: str) -> Optional[Invoice]:
        """Cancel an invoice"""
        invoice = await self.get(invoice_id)
        
        if not invoice:
            return None
        
        if invoice.status == InvoiceStatus.PENDING.value:
            invoice.status = InvoiceStatus.CANCELLED.value
            await self._update_invoice(invoice)
        
        return invoice
    
    async def mark_expired(self) -> int:
        """Mark all expired pending invoices as expired"""
        now = int(time.time())
        
        cursor = await self.db.execute(
            "UPDATE invoices SET status = ? WHERE status = ? AND expires_at < ?",
            (InvoiceStatus.EXPIRED.value, InvoiceStatus.PENDING.value, now)
        )
        
        await self.db.commit()
        
        return cursor.rowcount
    
    async def cleanup(self, older_than_days: int = 30) -> int:
        """Delete old invoices (for expired/paid)"""
        cutoff = int(time.time()) - (older_than_days * 24 * 60 * 60)
        
        cursor = await self.db.execute(
            "DELETE FROM invoices WHERE created_at < ? AND status != ?",
            (cutoff, InvoiceStatus.PENDING.value)
        )
        
        await self.db.commit()
        
        return cursor.rowcount
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get invoice statistics"""
        stats = {
            "total": 0,
            "pending": 0,
            "paid": 0,
            "expired": 0,
            "cancelled": 0,
        }
        
        for status in InvoiceStatus:
            cursor = await self.db.execute(
                f"SELECT COUNT(*) FROM invoices WHERE status = ?",
                (status.value,)
            )
            row = await cursor.fetchone()
            stats[status.value] = row[0] if row else 0
        
        cursor = await self.db.execute("SELECT COUNT(*) FROM invoices")
        row = await cursor.fetchone()
        stats["total"] = row[0] if row else 0
        
        return stats
    
    def create_payment_url(self, invoice: Invoice) -> str:
        """Create payment URL for invoice"""
        from link_builder import PaymentLinkBuilder
        
        builder = PaymentLinkBuilder()
        
        return builder.create(
            address=invoice.recipient_address,
            amount=invoice.amount,
            memo=f"Invoice #{invoice.id[:8]}",
            token=invoice.token
        )
    
    def format_expiry(self, invoice: Invoice) -> str:
        """Format expiry time for display"""
        remaining = invoice.remaining_seconds()
        
        if invoice.status != InvoiceStatus.PENDING.value:
            return f"Status: {invoice.status}"
        
        if remaining <= 0:
            return "Expired"
        
        if remaining < 60:
            return f"{remaining}s left"
        elif remaining < 3600:
            return f"{remaining // 60}m left"
        elif remaining < 86400:
            return f"{remaining // 3600}h left"
        else:
            return f"{remaining // 86400}d left"
    
    def _generate_invoice_id(self, address: str, amount: float) -> str:
        """Generate unique invoice ID"""
        data = f"{address}-{amount}-{time.time()}-{uuid.uuid4()}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]
    
    async def _save_invoice(self, invoice: Invoice):
        """Save invoice to database"""
        await self.db.execute("""
            INSERT OR REPLACE INTO invoices 
            (id, recipient_address, payer_address, amount, token, memo, 
             status, created_at, expires_at, paid_at, tx_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            invoice.id,
            invoice.recipient_address.lower(),
            invoice.payer_address.lower() if invoice.payer_address else None,
            invoice.amount,
            invoice.token,
            invoice.memo,
            invoice.status,
            invoice.created_at,
            invoice.expires_at,
            invoice.paid_at,
            invoice.tx_hash
        ))
        await self.db.commit()
    
    async def _update_invoice(self, invoice: Invoice):
        """Update invoice in database"""
        await self.db.execute("""
            UPDATE invoices SET
                status = ?,
                paid_at = ?,
                tx_hash = ?
            WHERE id = ?
        """, (
            invoice.status,
            invoice.paid_at,
            invoice.tx_hash,
            invoice.id
        ))
        await self.db.commit()
    
    async def __aenter__(self):
        await self.initialize()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


# Invoice templates for different use cases
class InvoiceTemplates:
    """Pre-built invoice templates"""
    
    @staticmethod
    def coffee(amount: float = 0.02, expiry: str = "1h") -> dict:
        """Coffee payment invoice"""
        return {
            "template": "coffee",
            "amount": amount,
            "token": "ETH",
            "memo": "☕ Coffee",
            "expiry": InvoiceManager.EXPIRY_OPTIONS.get(expiry, 3600)
        }
    
    @staticmethod
    def lunch(amount: float = 0.1, expiry: str = "4h") -> dict:
        """Lunch payment invoice"""
        return {
            "template": "lunch",
            "amount": amount,
            "token": "ETH",
            "memo": "🍔 Lunch",
            "expiry": InvoiceManager.EXPIRY_OPTIONS.get(expiry, 14400)
        }
    
    @staticmethod
    def payment(
        description: str,
        amount: float,
        token: str = "USDC",
        expiry: str = "1h"
    ) -> dict:
        """Generic payment invoice"""
        return {
            "template": "payment",
            "description": description,
            "amount": amount,
            "token": token,
            "expiry": InvoiceManager.EXPIRY_OPTIONS.get(expiry, 3600)
        }


# Example usage
async def example():
    async with InvoiceManager() as manager:
        # Create invoice
        invoice = await manager.create(
            payer_address="0x123...",
            amount=25.00,
            token="USDC",
            description="Payment for consulting services",
            expiry_seconds=3600
        )
        
        print(f"Invoice Created: {invoice.id}")
        print(f"Amount: {invoice.amount} {invoice.token}")
        print(f"Expires: {manager.format_expiry(invoice)}")
        print(f"Payment URL: {manager.create_payment_url(invoice)}")
        
        # Get invoice
        fetched = await manager.get(invoice.id)
        print(f"Status: {fetched.status}")
        
        # Mark as paid
        paid = await manager.mark_paid(invoice.id, "0xabc...")
        print(f"Paid: {paid.status}")
        
        # Get stats
        stats = await manager.get_stats()
        print(f"Stats: {stats}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(example())
