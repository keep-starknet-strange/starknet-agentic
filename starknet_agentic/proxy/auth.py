# noqa: D100, D205
"""Authentication utilities for the signer-proxy."""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SignedRequest:
    """Parsed signed request from the MCP client."""

    nonce: str
    timestamp: float
    signature: str
    payload_hash: str


def compute_hmac(
    key: bytes,
    nonce: str,
    timestamp: float,
    payload_hash: str,
) -> str:
    # noqa: D401
    """Compute HMAC-SHA256 over nonce+timestamp+payload_hash."""
    message = f"{nonce}:{timestamp:.6f}:{payload_hash}".encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def verify_hmac(
    *,
    key: bytes,
    signed: SignedRequest,
    drift_seconds: float = 30.0,
) -> bool:
    # noqa: D401
    """Return True when the HMAC is valid and the timestamp is in bounds."""
    expected = compute_hmac(key, signed.nonce, signed.timestamp, signed.payload_hash)
    if not hmac.compare_digest(expected, signed.signature):
        return False
    now = time.time()
    if abs(now - signed.timestamp) > drift_seconds:
        logger.warning("timestamp drift %.2fs exceeds limit %.2fs", now - signed.timestamp, drift_seconds)
        return False
    return True
