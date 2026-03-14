# External Repo Detector Sweep: Low-Profile Repos (2026-03-08)

## Scope

Scanned lower-profile public Starknet/Cairo repos:

1. `caddyfinance/Options-vault-contracts`
2. `salazarsebas/Zylith`
3. `cavos-labs/argus`
4. `rsodre/feral-forge`
5. `kiroshi-market/kiroshi-protocol`
6. `medialane-io/medialane-contracts`
7. `ForgeYields/starknet_vault_kit`
8. `StarkVote/starkvote`
9. `fatlabsxyz/tongo`

Detector classes:

- `AA-SELF-CALL-SESSION`
- `UNCHECKED_FEE_BOUND`
- `SHUTDOWN_OVERRIDE_PRECEDENCE`
- `SYSCALL_SELECTOR_FALLBACK_ASSUMPTION`

## Coverage

| Repo | Cairo files (all) | Cairo files (prod-only) |
| --- | ---: | ---: |
| Options-vault-contracts | 5 | 4 |
| Zylith | 47 | 39 |
| argus | 7 | 7 |
| feral-forge | 13 | 11 |
| kiroshi-protocol | 18 | 11 |
| medialane-contracts | 12 | 7 |
| starknet_vault_kit | 144 | 122 |
| starkvote | 82 | 66 |
| tongo | 48 | 31 |
| **Total** | **376** | **298** |

Prod-only excludes paths containing `test`, `tests`, `mock`, `mocks`.

## Results

- Full scan hits: **0**
- Production-only hits: **0**
- Confirmed vulnerabilities found by this detector set: **0**

## Interpretation

This confirms the current detector set is low-noise, but also narrow:

- It reliably catches the encoded benchmark classes.
- It does not yet catch a broad vulnerability surface in arbitrary real repos.

## Recommended next expansion

1. Add detector classes for authz/role bypass and replay/nonce misuse.
2. Add detectors for unsafe external-call assumptions beyond selector fallback.
3. Keep weekly external sweeps and track trend metrics (`hits`, `true positives`, `false positives`).
