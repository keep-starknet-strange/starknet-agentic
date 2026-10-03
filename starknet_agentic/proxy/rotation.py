# noqa: D100, D205
"""Key-rotation helpers for the signer-proxy."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class RotationState:
    """Tracks current and candidate HMAC keys during rotation."""

    current_key: bytes
    candidate_key: Optional[bytes] = None
    rotated_at: Optional[float] = None


class KeyRotator:
    """Provides a safe transition between HMAC keys.

    Procedure (tested in staging):
    1. Load candidate key into ``candidate_key``.
    2. Announce rotation start so signers begin using the new key.
    3. Wait until drift window passes for old-key requests.
    4. Promote candidate → current, clear candidate.
    """

    def __init__(self, current_key: bytes) -> None:
        self._state = RotationState(current_key=current_key)

    @property
    def state(self) -> RotationState:
        return self._state

    def load_candidate(self, candidate: bytes) -> None:
        self._state.candidate_key = candidate
        logger.info("candidate HMAC key loaded for rotation")

    def promote_candidate(self) -> bytes:
        if self._state.candidate_key is None:
            raise RuntimeError("no candidate key to promote")
        old = self._state.current_key
        self._state.current_key = self._state.candidate_key
        self._state.candidate_key = None
        self._state.rotated_at = __import__("time").time()
        logger.info("HMAC key rotated: old=%s new=%s", old[:8], self._state.current_key[:8])
        return old

    def verify(self, key: bytes, value: bytes) -> bool:
        """Check a digest against the current (and candidate) keys."""
        import hmac as _hmac
        ok_current = _hmac.new(self._state.current_key, value, "sha256").hexdigest() == key
        if self._state.candidate_key is not None:
            ok_candidate = _hmac.new(self._state.candidate_key, value, "sha256").hexdigest() == key
            return ok_current or ok_candidate
        return ok_current
