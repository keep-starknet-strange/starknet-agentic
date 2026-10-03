# noqa: D100, D205
"""Tests for proxy authentication, mTLS, nonce replay and key rotation."""
from __future__ import annotations

import time
from unittest.mock import MagicMock

import pytest

from starknet_agentic.proxy import (
    KeyRotator,
    MtlsConfig,
    NonceStore,
    ProxyConfig,
    SignerProxy,
    SignedRequest,
    compute_hmac,
    verify_hmac,
)


class FakeRedis:
    """Minimal Redis mock supporting SET NX EX and GET."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    def set(self, key: str, value: str, nx: bool = False, ex: int = 0) -> bool:
        if nx and key in self._store:
            return False
        self._store[key] = value
        return True

    def get(self, key: str) -> bytes | None:
        val = self._store.get(key)
        return val.encode() if val else None


KEY_A = b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
KEY_B = b"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"


def make_signed(nonce: str, ts: float, payload_hash: str, key: bytes = KEY_A) -> SignedRequest:
    return SignedRequest(
        nonce=nonce,
        timestamp=ts,
        payload_hash=payload_hash,
        signature=compute_hmac(key, nonce, ts, payload_hash),
    )


class TestHmac:
    def test_valid_signature(self) -> None:
        signed = make_signed("n1", time.time(), "ph1")
        assert verify_hmac(key=KEY_A, signed=signed, drift_seconds=60.0)

    def test_wrong_key_rejected(self) -> None:
        signed = make_signed("n1", time.time(), "ph1", key=KEY_B)
        assert not verify_hmac(key=KEY_A, signed=signed, drift_seconds=60.0)

    def test_drift_exceeds_window(self) -> None:
        signed = make_signed("n1", time.time() - 120.0, "ph1")
        assert not verify_hmac(key=KEY_A, signed=signed, drift_seconds=60.0)

    def test_missing_hmac_fails_closed(self) -> None:
        signed = SignedRequest(nonce="n1", timestamp=time.time(), payload_hash="ph1", signature="bad")
        assert not verify_hmac(key=KEY_A, signed=signed, drift_seconds=60.0)


class TestNonceReplay:
    def test_first_use_succeeds(self) -> None:
        store = NonceStore(FakeRedis(), ttl=60)
        assert store.consume("unique-nonce")

    def test_replay_rejected(self) -> None:
        store = NonceStore(FakeRedis(), ttl=60)
        assert store.consume("reuse")
        assert not store.consume("reuse")

    def test_redis_failure_fails_closed(self) -> None:
        bad = MagicMock()
        bad.set.side_effect = RuntimeError("boom")
        store = NonceStore(bad, ttl=60)
        assert not store.consume("any")


class TestSignerProxy:
    def test_full_auth_pass(self) -> None:
        store = NonceStore(FakeRedis(), ttl=60)
        config = ProxyConfig(
            hmac_key=KEY_A,
            mtls=MtlsConfig(ca_cert_path="/dev/null", client_cert_path="/dev/null", client_key_path="/dev/null", required=False),
            nonce_store=store,
            allow_insecure=True,
        )
        proxy = SignerProxy(config)
        signed = make_signed("n1", time.time(), "ph1")
        assert proxy.authenticate(signed)

    def test_replay_blocks_request(self) -> None:
        store = NonceStore(FakeRedis(), ttl=60)
        config = ProxyConfig(
            hmac_key=KEY_A,
            mtls=MtlsConfig(ca_cert_path="/dev/null", client_cert_path="/dev/null", client_key_path="/dev/null", required=False),
            nonce_store=store,
            allow_insecure=True,
        )
        proxy = SignerProxy(config)
        signed = make_signed("n1", time.time(), "ph1")
        assert proxy.authenticate(signed)
        assert not proxy.authenticate(signed)  # replay


class TestKeyRotation:
    def test_rotate_and_verify_old(self) -> None:
        rot = KeyRotator(KEY_A)
        rot.load_candidate(KEY_B)
        signed_b = make_signed("n1", time.time(), "ph1", key=KEY_B)
        assert rot.verify(signed_b.signature, f"{signed_b.nonce}:{signed_b.timestamp:.6f}:{signed_b.payload_hash}".encode())

    def test_promote(self) -> None:
        rot = KeyRotator(KEY_A)
        rot.load_candidate(KEY_B)
        old = rot.promote_candidate()
        assert old == KEY_A
        assert rot.state.current_key == KEY_B
        assert rot.state.candidate_key is None

    def test_promote_without_candidate_raises(self) -> None:
        rot = KeyRotator(KEY_A)
        with pytest.raises(RuntimeError, match="no candidate"):
            rot.promote_candidate()
