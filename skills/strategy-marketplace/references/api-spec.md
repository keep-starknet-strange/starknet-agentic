# Strategy Marketplace API Notes

## Scope

This skill currently exposes an in-memory API surface for:

- Agent registration (`registerAgent`, `listAgents`, `getAgent`, `updateAgent`)
- Performance tracking (`trackPerformance`, `getAgentStats`, `getTopStrategies`)
- Strategy lifecycle (`publishStrategy`, `discoverStrategies`, `purchaseStrategy`)
- Service lifecycle (`offerService`, `getAgentServices`)

## Transport

No network transport is included yet. The current API is an in-process TypeScript
module API.

## Future Contract Parity

When contract-backed persistence is added, keep method signatures stable and map
return types to deterministic on-chain events.
