# @starknet-agentic/agent-passport

Passport conventions on top of ERC-8004 `IdentityRegistry`.

This is intentionally boring: it uses the existing `set_metadata/get_metadata` API and defines a tiny key convention so an agent can publish capabilities that are portable across surfaces.

## Convention (v0)

All values are JSON strings.

- `caps` (key): JSON array of capability names, example: `["swap","balance"]`
- `capability:<name>` (key): JSON object describing that capability

Example capability object:

```json
{
  "name": "swap",
  "description": "Swap tokens via AVNU",
  "endpoint": "mcp://@starknet-agentic/mcp-server/swap",
  "version": "1"
}
```

## Why this works

- Identity stays ERC-8004, so it’s the portable passport.
- Capabilities become discoverable via a single `caps` index.
- Everything stays upgradable: it’s metadata, not a fixed interface.

## Next steps (planned)

- Add a typed schema hash field (so clients can validate capability payload structure).
- Add tooling to publish a full capability set from a local `agent.json`.
- Add an optional onchain registry contract that supports enumeration without relying on the `caps` index.
