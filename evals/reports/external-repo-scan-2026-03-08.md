# External Repo Detector Sweep (2026-03-08)

Machine-readable artifact:

- `evals/reports/data/external-repo-scan-2026-03-08.json`

Scanner metadata:

- scanner revision: `8221c25`
- detector source: `scripts/quality/benchmark_cairo_auditor.py`
- command profile: `external-sweep / prod-only excludes test/tests/mock/mocks`

## Scope

Scanned 5 public Cairo repositories:

1. `OpenZeppelin/cairo-contracts`
2. `atomiqlabs/atomiq-contracts-starknet`
3. `typhoonmixer/typhoon-contracts`
4. `karnotxyz/starknet_bridge`
5. `keep-starknet-strange/piltover`

Scanned refs:

1. `OpenZeppelin/cairo-contracts@2ce56dd7d736095e874e9649aec29d6bc90736cc`
2. `atomiqlabs/atomiq-contracts-starknet@b5875a031063c88563cb44c3afa0460abc2f7e2f`
3. `typhoonmixer/typhoon-contracts@e11dffbe1c8c4cc96eba91b5f300c82425f2ae4e`
4. `karnotxyz/starknet_bridge@44e2255dae07f64bdbec0c12c23d678f86c46fdc`
5. `keep-starknet-strange/piltover@658d707a5cc3ccc3e37b710609cbf0f83917a421`

Detector classes:

- `AA-SELF-CALL-SESSION`
- `UNCHECKED_FEE_BOUND`
- `SHUTDOWN_OVERRIDE_PRECEDENCE`
- `SYSCALL_SELECTOR_FALLBACK_ASSUMPTION`

## Coverage

| Repo | Cairo files (all) | Cairo files (prod-only) |
| --- | ---: | ---: |
| cairo-contracts | 307 | 156 |
| atomiq-contracts-starknet | 120 | 56 |
| typhoon-contracts | 16 | 12 |
| starknet_bridge | 43 | 18 |
| piltover | 25 | 15 |
| **Total** | **511** | **257** |

Prod-only excludes paths containing `test`, `tests`, `mock`, `mocks`.

## Results

### Production scan

- Hits: **0**
- Confirmed vulnerabilities found: **0**

### Full scan (including tests/mocks)

- Hits: **1**
- Candidate:
  - `AA-SELF-CALL-SESSION` in `cairo-contracts/packages/test_common/src/mocks/account.cairo`

## Triage

The single hit is a **false positive**:

- File is a test/mock account fixture, not production session-key account logic.
- Triggered because the detector is intentionally conservative (`__execute__` + `call_contract_syscall` + no explicit self-call guard).

## Conclusion

- Current detector set is useful as a **regression guard for known classes**.
- On this external sample, it did **not** produce actionable production vulnerabilities.
- The sweep still provided signal: false positives are currently limited (1 hit across 511 Cairo files, and 0 in prod-only scope).

## Recommended next pass

1. Add repository-level allow/deny context rules (e.g., ignore test/mocks by default).
2. Add two more detector classes with broader coverage (authz/nonce misuse and unsafe external call assumptions).
3. Run this scan weekly and track trend metrics (`hits`, `true positives`, `false positives`) per release.
