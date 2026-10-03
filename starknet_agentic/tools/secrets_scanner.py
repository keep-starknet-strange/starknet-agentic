from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class LeakAction(str, Enum):
    BLOCK = "block"
    REDACT = "redact"
    WARN = "warn"


@dataclass
class PatternRule:
    pattern: re.Pattern[str]
    action: LeakAction
    description: str
    replacement: str = "****REDACTED****"


@dataclass
class SecretScanner:
    """Starknet-specific secret-leak scanner for MCP request/response boundaries."""

    _default_rules: list[PatternRule] = field(init=False)

    def __post_init__(self) -> None:
        self._default_rules = [
            # Private keys (felt252 hex format – 63-66 hex chars, Starknet common)
            PatternRule(
                re.compile(
                    r"(?i)\b(0x)?[0-9a-f]{60,66}\b",
                ),
                action=LeakAction.BLOCK,
                description="Starknet private key (raw hex)",
            ),
            # PK with common prefixes
            PatternRule(
                re.compile(
                    r"(?i)\b(?:private[_-]?key|priv[_-]?key|signer[_-]?key)\s*[:=]\s*[\"']?(0x[0-9a-f]{60,66})[\"']?",
                    re.IGNORECASE,
                ),
                action=LeakAction.BLOCK,
                description="PrivateKey assignment",
                replacement=r"\1 ****REDACTED****",
            ),
            # Starknet signer secrets in env vars
            PatternRule(
                re.compile(
                    r"(?i)\b(?:STARKNET_PRIVATE_KEY|STARKNET_SIGNER_KEY|SN_PRIVATE_KEY|STARKNET_ACCOUNT_PK)\b\s*[=:\s]+\S+",
                ),
                action=LeakAction.BLOCK,
                description="Starknet signer env secret",
                replacement=r"\g<0> ****REDACTED****",
            ),
            # Cairo felt private key patterns
            PatternRule(
                re.compile(
                    r"(?i)\b(?:account[_-]?pk|signer[_-]?secret|contract[_-]?owner[_-]?key)\s*[=:\s]+\S+",
                ),
                action=LeakAction.WARN,
                description="Potential account/signer secret",
                replacement=r"\g<0> ****REDACTED****",
            ),
            # Mnemonic phrases (BIP39-ish)
            PatternRule(
                re.compile(
                    r"(?i)\b(?:mnemonic|seed[_-]?phrase)\s*[=:\s]+[\"\']?[a-z0-9]{8,}(?:\s+[a-z0-9]{8,}){5,}[\"']?",
                ),
                action=LeakAction.BLOCK,
                description="Mnemonic / seed phrase",
            ),
            # Prompt-injection exfiltration patterns
            PatternRule(
                re.compile(
                    r"(?i)\b(?:exfil|leak|dump|steal|send.*to)\s*(?:https?://|curl|wget|nc\s|/dev/tcp)",
                ),
                action=LeakAction.BLOCK,
                description="Prompt-injection exfiltration attempt",
            ),
            # Data exfiltration via MCP response
            PatternRule(
                re.compile(
                    r"(?i)\b(?:password|secret|token|apiKey|apikey|api_key|access_token|auth_token)\s*[=:\s]+\S+",
                ),
                action=LeakAction.REDACT,
                description="Generic credential",
            ),
            # Starknet contract class hash (informational – may leak on chain but worth flagging in responses)
            PatternRule(
                re.compile(
                    r"(?i)\b(?:class[_-]?hash|casm[_-]?hash)\s*[=:\s]+\s*(0x[0-9a-f]{60,66})",
                ),
                action=LeakAction.WARN,
                description="Class hash exposure in response",
            ),
        ]

    def _rules(self) -> list[PatternRule]:
        return self._default_rules

    def scan(self, content: Any, context_label: str = "") -> tuple[bool, list[dict[str, Any]]]:
        """Scan a string/JSON-serialisable value for secret leaks.

        Returns:
            (blocked, findings) — blocked is True when at least one rule fires with
            action BLOCK.
        """
        text = self._to_text(content)
        findings: list[dict[str, Any]] = []

        for rule in self._rules():
            for match in rule.pattern.finditer(text):
                findings.append(
                    {
                        "description": rule.description,
                        "action": rule.action.value,
                        "match_start": match.start(),
                        "match_end": match.end(),
                        "matched_text": match.group(0),
                        "context": context_label,
                    }
                )

        blocked = any(f["action"] == LeakAction.BLOCK.value for f in findings)
        return blocked, findings

    def redact(self, content: Any) -> Any:
        """Return a redacted copy with known-secret substrings replaced."""
        text = self._to_text(content)
        for rule in self._rules():
            if rule.action == LeakAction.REDACT:
                text = rule.pattern.sub(lambda m: m.group(0)[: rule.match_length] + " ****REDACTED****", text)
        return self._from_text(text, content)

    # -- helpers ----------------------------------------------------------------

    @classmethod
    def _to_text(cls, content: Any) -> str:
        if isinstance(content, str):
            return content
        try:
            import json

            return json.dumps(content, ensure_ascii=False, sort_keys=True)
        except Exception:  # pragma: no cover
            return str(content)

    @classmethod
    def _from_text(cls, text: str, original: Any) -> Any:
        if isinstance(original, str):
            return text
        try:
            import json

            return json.loads(text)
        except Exception:  # pragma: no cover
            return text


def scan_request_args(args: Any, context_label: str = "request") -> tuple[bool, list[dict[str, Any]]]:
    scanner = SecretScanner()
    return scanner.scan(args, context_label=context_label)


def scan_response(response: Any, context_label: str = "response") -> tuple[bool, list[dict[str, Any]]]:
    scanner = SecretScanner()
    return scanner.scan(response, context_label=context_label)


def redact_response(response: Any) -> Any:
    scanner = SecretScanner()
    return scanner.redact(response)
