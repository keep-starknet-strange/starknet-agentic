... existing content ...

## Security: MCP Secret Leak Scanner

The MCP boundary now ships a built-in secret-leak scanner that inspects both inbound
tool arguments and outbound tool responses against Starknet-specific patterns.

### Supported patterns

| Category | Example pattern | Default action |
|---|---|---|
| Starknet private key (raw hex) | `0x4d5f...6c8d` (60–66 chars) | **BLOCK** |
| Private-key assignment | `private_key = 0x...` | **BLOCK** |
| Signer env secrets | `STARKNET_PRIVATE_KEY=...` | **BLOCK** |
| Account / signer key vars | `account_pk = ...` | **WARN** |
| Mnemonic / seed phrase | BIP39-like word sequences | **BLOCK** |
| Prompt-injection exfiltration | `exfil to http://…` / `nc 10.0.0.1 4444` | **BLOCK** |
| Generic credentials | `api_key = …` | **REDACT** |
| Class hash exposure | `class_hash = 0x…` | **WARN** |

### Usage

```python
from starknet_agentic.tools.secrets_scanner import scan_request_args, scan_response, redact_response

# Inbound
blocked, findings = scan_request_args(args, context_label="tool_input")
if blocked:
    raise SecurityError(f"Secret leaked in tool args: {findings}")

# Outbound
blocked, findings = scan_response(response, context_label="tool_output")
redacted = redact_response(response)
```

### Configuring actions

Each pattern rule carries an `action` enum: `block`, `redact`, or `warn`. You can extend
or customise the rule set by subclassing `SecretScanner` and overriding `_rules()`.

### False-positive controls

- Public on-chain values such as transaction hashes and class hashes are **warn-only**, never blocked.
- The scanner runs *after* tool serialization so it sees the actual JSON payload, not
  internal Python objects.
- Use the `context_label` argument to scope findings per-call for easier debugging.

<!-- end existing content -->
