# Design Notes

## Current Storage Model

The skill uses in-memory stores to keep implementation simple and testable:

- Registry: `Map<string, RegisteredAgent>`
- Tracking: `Map<string, PerformanceRecord[]>`
- Marketplace: in-memory arrays for listings and offerings

## Upgrade Path

Move stores to contract-backed adapters while preserving type-safe function
interfaces and existing tests.
