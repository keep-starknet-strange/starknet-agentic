---
name: agentic-documentation
description: Write API documentation that AI agents can parse and use. Structured error codes, versioning signals, machine-readable quick references, and headless API patterns. Essential for building agent-friendly tools and services.
license: MIT
metadata: {"author":"Zaia (spiritclawd)","version":"1.0.0","org":"keep-starknet-strange"}
keywords: [documentation, api, agents, error-codes, versioning, machine-readable, headless, automation]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Agentic Documentation Skill

Write documentation that AI agents can parse, understand, and use programmatically.

## The Problem

```
Human docs: "Click the button in the top right corner..."
Agent needs: "POST to /api/v1/button with {location: 'top-right'}"

Human docs: "Something went wrong"
Agent thinks: ??? (it just fails)

Human docs: "Check our changelog for updates"
Agent can't: Agents don't browse blogs
```

**Traditional documentation fails agents because it's written for human eyes, not machine parsing.**

## Patterns Included

| Pattern | Purpose | Status |
|---------|---------|--------|
| **Error Codes** | Machine-readable errors with retry logic | Ready |
| **Versioning** | Deprecation timelines, schema diffs | Ready |
| **API Quick Ref** | YAML/JSON endpoint specifications | Ready |
| **Headless APIs** | HTTP endpoints for agent control | Ready |

---

## Pattern 1: Machine-Readable Errors

### Structure

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "category": "throttling",
    "message": "You have exceeded the rate limit",
    "retryable": true,
    "retry_after": 45,
    "details": {
      "limit": 100,
      "window_seconds": 60,
      "current_count": 105
    },
    "documentation_url": "https://docs.example.com/errors/rate-limit",
    "request_id": "req_abc123"
  }
}
```

### Required Fields

| Field | Type | Purpose |
|-------|------|---------|
| `code` | string | SCREAMING_SNAKE_CASE identifier |
| `category` | string | auth, validation, throttling, resource, state |
| `message` | string | Human-readable (for logs) |
| `retryable` | boolean | Can agent retry? |
| `request_id` | string | Debugging trace |

### Categories

- **authentication** - AUTH_TOKEN_EXPIRED, AUTH_INSUFFICIENT_PERMISSIONS
- **validation** - VALIDATION_FAILED, VALIDATION_FIELD_MISSING
- **throttling** - RATE_LIMIT_EXCEEDED, QUOTA_EXCEEDED
- **resource** - RESOURCE_NOT_FOUND, RESOURCE_LOCKED
- **state** - INVALID_STATE_TRANSITION, PRECONDITION_FAILED

---

## Pattern 2: API Versioning for Agents

### Response Headers

```http
HTTP/1.1 200 OK
X-API-Version: 2.3.1
X-API-Version-Status: stable
X-Deprecated: false
```

### Deprecation Headers

```http
HTTP/1.1 200 OK
X-Deprecated: true
X-Deprecation-Date: 2026-06-01
X-Sunset: 2026-09-01
X-Deprecation-Migration: https://docs.example.com/migrations/v1-to-v2
```

### Version Endpoint

```json
GET /version

{
  "current_version": "2.3.1",
  "minimum_supported_version": "2.0.0",
  "versions": {
    "v1": {
      "status": "sunset",
      "sunset_date": "2026-09-01",
      "migration_guide": "https://docs.example.com/migrations/v1-to-v2"
    },
    "v2": {
      "status": "stable",
      "upcoming_changes": [
        {
          "date": "2026-04-01",
          "description": "Rate limit decrease",
          "affects": ["throttling"]
        }
      ]
    }
  }
}
```

### Agent Version Check

```python
class APIClient:
    def __init__(self, base_url, min_version="2.0.0"):
        self.version_info = requests.get(f"{base_url}/version").json()
        
        if not self._version_compatible(min_version):
            raise IncompatibleVersionError(...)
        
        if self.version_info.get("deprecations"):
            self._alert_operator()
```

---

## Pattern 3: Machine-Readable Quick Reference

### YAML Format

```yaml
# agent-quickstart.yaml
api:
  base_url: https://api.example.com/v1
  auth: Bearer token in Authorization header
  rate_limit: 100 requests/minute

endpoints:
  - name: create_resource
    method: POST
    path: /resources
    requires_auth: true
    request_schema: ./schemas/create_resource.json
    response_schema: ./schemas/resource.json
    errors:
      - VALIDATION_FAILED
      - AUTH_TOKEN_EXPIRED
      - QUOTA_EXCEEDED
```

### JSON Schema for Requests

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name", "type"],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "Resource name"
    },
    "type": {
      "type": "string",
      "enum": ["standard", "premium", "enterprise"],
      "description": "Resource tier"
    }
  }
}
```

---

## Pattern 4: Headless API Design

### Status Endpoint

```json
GET /status

{
  "status": "running",
  "version": "1.2.3",
  "uptime_seconds": 86400,
  "last_action": "process_item",
  "pending_actions": 3,
  "metrics": {
    "items_processed": 1523,
    "errors": 2
  }
}
```

### Command Endpoint

```json
POST /command
{
  "command": "execute",
  "params": {
    "action": "process_item",
    "item_id": "abc123"
  }
}

Response:
{
  "status": "queued",
  "command_id": "cmd_xyz789",
  "estimated_execution": "2026-03-05T14:30:05Z"
}
```

### Events (SSE)

```javascript
const events = new EventSource('/events');
events.onmessage = (e) => {
  const data = JSON.parse(e.data);
  // Handle: tick, action, error, state_change
};
```

---

## Implementation Checklist

### For API Providers

- [ ] Every error has a unique `code` in SCREAMING_SNAKE_CASE
- [ ] Errors include `retryable` boolean
- [ ] `retry_after` provided for throttling
- [ ] Version headers in every response
- [ ] `/version` endpoint with full info
- [ ] Deprecation headers on deprecated endpoints
- [ ] Machine-readable quick reference (YAML/JSON)
- [ ] JSON schemas for request/response

### For Agent Developers

- [ ] Check version on startup
- [ ] Parse deprecation headers
- [ ] Alert operators on warnings
- [ ] Implement retry with backoff
- [ ] Handle all error categories

---

## Testing Agent-Friendly APIs

```python
def test_error_is_parseable():
    response = client.post("/api/resource", json={"invalid": "data"})
    assert response.status_code == 400
    
    error = response.json()["error"]
    assert "code" in error
    assert "retryable" in error
    assert error["code"] == "VALIDATION_FAILED"
    assert isinstance(error["retryable"], bool)

def test_version_header_present():
    response = client.get("/api/status")
    assert "X-API-Version" in response.headers
```

---

## Examples in the Wild

- **Starknet MCP Server** - MCP tools with structured inputs/outputs
- **Axis (Eternum)** - Headless HTTP API for game agents
- **Anthropic API** - Error codes with type fields
- **Stripe API** - Version headers, machine-readable errors

---

## Resources

- [Error Codes Pattern (Full)](https://github.com/spiritclawd/agent-docs-patterns/blob/main/patterns/error-codes-pattern.md)
- [Versioning for Agents (Full)](https://github.com/spiritclawd/agent-docs-patterns/blob/main/patterns/versioning-for-agents.md)
- [Axis Headless API](https://github.com/spiritclawd/agent-docs-patterns/blob/main/patterns/axis/headless-api.md)

---

*Skill contributed by [Zaia](https://github.com/spiritclawd) - autonomous AI agent*  
*Contact: spirit@agentmail.to*
