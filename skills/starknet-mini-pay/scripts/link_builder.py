"""
Payment Link Builder for Starknet Mini-Pay
Create and parse payment links with wallet deep links

Payment Link Format:
    starknet:<address>?amount=<value>&memo=<text>&token=<TOKEN>
    
Example:
    starknet:0x123...?amount=0.5&memo=coffee&token=ETH

Wallet Deep Links:
    argent://starknet/pay?address=0x...&amount=0.5&memo=coffee
    braavos://starknet/pay?address=0x...&amount=0.5&memo=coffee
"""

from urllib.parse import urlencode, parse_qs, urlparse
from dataclasses import dataclass
from typing import Optional, Dict
from enum import Enum
import re


class InvoiceStatus(Enum):
    """Invoice status"""
    PENDING = "pending"
    PAID = "paid"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


@dataclass
class PaymentLinkData:
    """Parsed payment link data"""
    address: str
    amount: Optional[float] = None
    memo: Optional[str] = None
    token: str = "ETH"
    wallet: str = "generic"  # argent, braavos, generic
    
    def __str__(self):
        parts = [f"Address: {self.address[:16]}..."]
        if self.amount:
            parts.append(f"Amount: {self.amount} {self.token}")
        if self.memo:
            parts.append(f"Memo: {self.memo}")
        return "\n".join(parts)


class PaymentLinkBuilder:
    """Build and parse Starknet payment links with wallet deep links"""
    
    PROTOCOL = "starknet"
    DEFAULT_TOKEN = "ETH"
    VALID_TOKENS = ["ETH", "STRK", "USDC"]
    
    # Wallet deep link schemas
    WALLET_SCHEMES = {
        "argent": "argent://starknet/pay",
        "braavos": "braavos://starknet/pay",
        "generic": "starknet://"
    }
    
    def create(
        self,
        address: str,
        amount: Optional[float] = None,
        memo: Optional[str] = None,
        token: str = "ETH"
    ) -> str:
        """
        Create a payment link
        
        Args:
            address: Recipient Starknet address (0x...)
            amount: Amount to request
            memo: Payment description/memo
            token: Token symbol
        
        Returns:
            Payment link URL
        """
        # Validate address format
        if not self._validate_address(address):
            raise ValueError(f"Invalid Starknet address: {address}")
        
        # Validate token
        token = token.upper()
        if token not in self.VALID_TOKENS:
            raise ValueError(f"Invalid token: {token}. Valid: {self.VALID_TOKENS}")
        
        # Build parameters
        params = {}
        
        if amount is not None and amount > 0:
            params["amount"] = str(amount)
        
        if memo:
            params["memo"] = str(memo)[:128]  # Limit memo length
        
        if token != self.DEFAULT_TOKEN:
            params["token"] = token
        
        # Build URL
        query_string = urlencode(params)
        
        if query_string:
            return f"{self.PROTOCOL}:{address}?{query_string}"
        else:
            return f"{self.PROTOCOL}:{address}"
    
    def create_wallet_deep_links(
        self,
        address: str,
        amount: Optional[float] = None,
        memo: Optional[str] = None,
        token: str = "ETH"
    ) -> Dict[str, str]:
        """
        Create deep links for specific wallets
        
        Args:
            address: Recipient address
            amount: Amount
            memo: Payment memo
            token: Token symbol
        
        Returns:
            Dict with 'argent', 'braavos', 'generic' keys
        """
        # Normalize address
        address = self._normalize_address(address)
        
        # Build params
        params = {
            "address": address
        }
        
        if amount is not None:
            params["amount"] = str(amount)
        
        if memo:
            params["memo"] = str(memo)[:128]
        
        if token.upper() != self.DEFAULT_TOKEN:
            params["token"] = token
        
        query_string = urlencode(params)
        full_params = f"?{query_string}"
        
        return {
            "argent": f"{self.WALLET_SCHEMES['argent']}{full_params}",
            "braavos": f"{self.WALLET_SCHEMES['braavos']}{full_params}",
            "generic": f"{self.WALLET_SCHEMES['generic']}{address}"
        }
    
    def create_argent_link(
        self,
        address: str,
        amount: Optional[float] = None,
        memo: Optional[str] = None
    ) -> str:
        """Create Argent X deep link"""
        return self.create_wallet_deep_links(address, amount, memo)["argent"]
    
    def create_braavos_link(
        self,
        address: str,
        amount: Optional[float] = None,
        memo: Optional[str] = None
    ) -> str:
        """Create Braavos deep link"""
        return self.create_wallet_deep_links(address, amount, memo)["braavos"]
    
    def parse(self, url: str) -> PaymentLinkData:
        """
        Parse a payment link
        
        Args:
            url: Payment link URL
        
        Returns:
            PaymentLinkData with parsed components
        """
        # Handle various formats
        if url.startswith(f"{self.PROTOCOL}:"):
            # starknet:0x123...?...
            full_url = f"{self.PROTOCOL}://{url[len(self.PROTOCOL)+1:]}"
        elif url.startswith("argent://") or url.startswith("braavos://"):
            # Wallet deep link
            return self._parse_wallet_link(url)
        elif url.startswith("0x") and "?" not in url:
            # Just an address
            return PaymentLinkData(address=url.lower())
        else:
            # Full URL format
            full_url = url
        
        parsed = urlparse(full_url)
        
        # Extract address (handle both path and netloc)
        if parsed.netloc:
            address = parsed.netloc
        else:
            address = parsed.path
        
        # Clean address
        address = address.strip()
        
        # Parse query parameters
        query = parse_qs(parsed.query)
        
        # Extract values
        amount_str = query.get("amount", [None])[0]
        amount = float(amount_str) if amount_str else None
        
        memo = query.get("memo", [None])[0]
        
        token = query.get("token", [self.DEFAULT_TOKEN])[0]
        
        return PaymentLinkData(
            address=self._normalize_address(address),
            amount=amount,
            memo=memo,
            token=token.upper()
        )
    
    def _parse_wallet_link(self, url: str) -> PaymentLinkData:
        """Parse wallet deep link (argent:// or braavos://)"""
        parsed = urlparse(url)
        
        # Extract address from query
        query = parse_qs(parsed.query)
        
        address = query.get("address", [None])[0]
        amount_str = query.get("amount", [None])[0]
        amount = float(amount_str) if amount_str else None
        memo = query.get("memo", [None])[0]
        
        # Determine wallet type
        scheme = parsed.scheme
        wallet = "argent" if "argent" in scheme else "braavos" if "braavos" in scheme else "generic"
        
        return PaymentLinkData(
            address=self._normalize_address(address) if address else "",
            amount=amount,
            memo=memo,
            wallet=wallet
        )
    
    def validate(self, url: str) -> bool:
        """
        Validate a payment link format
        
        Args:
            url: Payment link to validate
        
        Returns:
            True if valid, False otherwise
        """
        try:
            data = self.parse(url)
            return self._validate_address(data.address)
        except Exception:
            return False
    
    def create_invoice_url(
        self,
        invoice_id: str,
        address: str,
        amount: float,
        token: str = "ETH",
        memo: Optional[str] = None
    ) -> str:
        """
        Create an invoice/payment request URL
        
        Args:
            invoice_id: Unique invoice identifier
            address: Recipient address
            amount: Amount requested
            token: Token symbol
            memo: Invoice description
        
        Returns:
            Invoice URL
        """
        params = {
            "id": invoice_id,
            "amount": str(amount),
            "token": token,
        }
        
        if memo:
            params["memo"] = memo
        
        return f"{self.PROTOCOL}:invoice/{invoice_id}?{urlencode(params)}"
    
    def _validate_address(self, address: str) -> bool:
        """Validate Starknet address format"""
        if not address:
            return False
        
        # Remove 0x prefix for validation
        addr = address.lower().replace("0x", "")
        
        # Starknet addresses are 64 hex characters
        if len(addr) != 64:
            return False
        
        # Check all characters are valid hex
        return bool(re.match(r'^[0-9a-f]+$', addr))
    
    def _normalize_address(self, address: str) -> str:
        """Normalize address to lowercase with 0x prefix"""
        addr = address.strip().lower()
        if not addr.startswith("0x"):
            addr = f"0x{addr}"
        return addr
    
    def format_amount(self, amount: float, token: str = "ETH") -> str:
        """Format amount with appropriate decimals"""
        token = token.upper()
        
        if token == "USDC":
            return f"{amount:.2f}"
        elif token == "ETH":
            if amount < 0.01:
                return f"{amount:.6f}"
            else:
                return f"{amount:.4f}"
        else:
            return f"{amount:.4f}"
    
    def create_qr_string(self, address: str, amount: Optional[float] = None) -> str:
        """
        Create string suitable for QR code
        
        Args:
            address: Starknet address
            amount: Optional amount
        
        Returns:
            String for QR code generation
        """
        addr = self._normalize_address(address)
        
        if amount:
            return f"{addr}?amount={amount}"
        return addr


# Utility functions
def create_quick_link(address: str, amount: float, token: str = "ETH") -> str:
    """Quick helper to create a payment link"""
    builder = PaymentLinkBuilder()
    return builder.create(address, amount, token=token)


def parse_payment_url(url: str) -> dict:
    """Quick helper to parse a payment URL"""
    builder = PaymentLinkBuilder()
    data = builder.parse(url)
    return {
        "address": data.address,
        "amount": data.amount,
        "memo": data.memo,
        "token": data.token
    }


# Example usage
def example():
    builder = PaymentLinkBuilder()
    
    # Create payment link
    link = builder.create(
        address="0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005",
        amount=0.01,
        memo="Coffee",
        token="ETH"
    )
    print(f"Payment Link: {link}")
    
    # Create wallet deep links
    deep_links = builder.create_wallet_deep_links(
        address="0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005",
        amount=0.01,
        memo="Coffee"
    )
    print(f"\nWallet Deep Links:")
    print(f"  Argent: {deep_links['argent']}")
    print(f"  Braavos: {deep_links['braavos']}")
    
    # Parse link
    data = builder.parse(link)
    print(f"\nParsed: {data}")
    
    # Validate
    print(f"\nValid: {builder.validate(link)}")


if __name__ == "__main__":
    example()
