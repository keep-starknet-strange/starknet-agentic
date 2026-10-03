# noqa: D100, D205
"""Nonce replay store backed by Redis with TTL semantics."""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class NonceStore:
    """In-memory + Redis-backed one-time nonce tracker.

    Usage::

        store = NonceStore(redis_client, ttl=3600)
        assert store.consume("abc123")  # first use succeeds
        assert not store.consume("abc123")  # replay rejected
    """

    def __init__(self, redis_client: object, ttl: int = 3600) -> None:
        self._redis = redis_client
        self._ttl = ttl

    def _key(self, nonce: str) -> str:
        return f"starknet_agentic:nonce:{nonce}"

    def consume(self, nonce: str) -> bool:
        # noqa: D401
        """Return True if the nonce was new and has been recorded.

        False means either the nonce was already seen (replay) or Redis is
        unavailable and we must fail-closed.
        """
        try:
            # Redis SET NX EX is atomic: sets only if key does not exist.
            result = self._redis.set(  # type: ignore[attr-defined]
                self._key(nonce),
                "1",
                nx=True,
                ex=self._ttl,
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.error("nonce store error: %s", exc)
            return False
        if result is False:
            logger.warning("replayed nonce detected: %s", nonce)
            return False
        return True

    def is_known(self, nonce: str) -> bool:
        # noqa: D401
        """Lightweight check without side-effects (used for diagnostics)."""
        try:
            return bool(self._redis.get(self._key(nonce)))  # type: ignore[attr-defined]
        except Exception:
            return False
