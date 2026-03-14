# Default Workflow

1. Assumption inventory
- List network-related assumptions from contracts and tests.
- Mark each assumption as consensus rule, client behavior, or provider behavior.

1. Reality check
- Validate assumptions against current Starknet docs/runtime behavior.
- Flag assumptions that changed across recent protocol/toolchain versions.

1. Hardening
- Replace brittle assumptions with explicit guards.
- Add tests for timing and tx-metadata edge cases.
