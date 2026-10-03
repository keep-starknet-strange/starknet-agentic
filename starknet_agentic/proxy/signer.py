# noqa: D100, D205
"""Signer-proxy handler with auth + replay protection."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from .auth import SignedRequest, verify_hmac
from .mTLS import MtlsConfig, load_mtls_context
from .nonce import NonceStore

logger = logging.getLogger(__name__)


@dataclass
class ProxyConfig:
    """All configuration required by the signer-proxy."""

    hmac_key: bytes
    mtls: MtlsConfig
    nonce_store: NonceStore
    drift_seconds: float = 30.0
    allow_insecure: bool = False  # dev-only escape hatch


class SignerProxy:
    """Authenticates MCP requests before forwarding to the signer."""

    def __init__(self, config: ProxyConfig) -> None:
        self._config = config
        self._mtls_ctx = (
            None
            if config.allow_insecure or not config.mtls.required
            else load_mtls_context(config.mtls)
        )

    def authenticate(self, signed: SignedRequest) -> bool:
        # noqa: D401
        """Return True only when HMAC and nonce are valid."""
        if not self._config.nonce_store.consume(signed.nonce):
            logger.warning("nonce replay or store error for %s", signed.nonce)
            return False
        return verify_hmac(
            key=self._config.hmac_key,
            signed=signed,
            drift_seconds=self._config.drift_seconds,
        )

    def get_mtls_context(self) -> Optional[object]:
        return self._mtls_ctx
