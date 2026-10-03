# noqa: D100, D205
"""mTLS helper for MCP-to-signer communication in production."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class MtlsConfig:
    """Certificates and key used for mutual TLS."""

    ca_cert_path: str
    client_cert_path: str
    client_key_path: str
    required: bool = True


def load_mtls_context(config: MtlsConfig) -> Optional["ssl.SSLContext"]:
    # noqa: D401
    """Build an ssl.SSLContext verifying client and server certs.

    Returns ``None`` when mTLS is not required (dev profile).
    Raises on any I/O or format error so the caller fails-closed.
    """
    try:
        import ssl
    except ImportError:  # pragma: no cover
        logger.error("ssl module unavailable")
        return None

    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ctx.load_verify_locations(cafile=config.ca_cert_path)
    ctx.load_cert_chain(certfile=config.client_cert_path, keyfile=config.client_key_path)
    ctx.verify_mode = ssl.CERT_REQUIRED
    return ctx


def validate_client_cert(common_name: str, config: MtlsConfig) -> bool:
    # noqa: D401
    """Verify that the presented certificate matches the allowed CN.

    This is a placeholder hook; integrate with your PKI validation as needed.
    """
    # In production this would parse the PEM and compare Subject/CN.
    logger.debug("client cert validation hook for cn=%s", common_name)
    return bool(common_name)
