# @starknet-agentic/prediction-arb-scanner

Signals-only prediction market arbitrage scanner.

MVP0 goals:
- No execution
- Output stable Opportunity objects across venues
- Include Starknet-native hedge/collateral recipe strings (Ekubo/Re7/fallback)

Venues (planned):
- Polymarket (Gamma + CLOB)
- Limitless (SDK-first)
- Raize Club (Starknet-native venue)

## Development

```bash
pnpm -r build
pnpm -r test
```
