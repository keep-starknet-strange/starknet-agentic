# Authoring to Audit Handoff

Use this handoff after implementing or modifying Cairo contracts.

## 1. Pre-Handoff Contract Checks

- Verify every state-mutating `#[external(v0)]` entrypoint has explicit access posture (guarded or intentionally public).
- Ensure time-based logic reads from `get_block_timestamp`, not calldata.
- Confirm upgrade paths validate non-zero class hash and enforce required delay/policy.

## 2. Test Gate Before Audit

- Run `snforge test`.
- Add/update regression tests for any changed auth, upgrade, or external-call flow.
- Keep at least one invariant/property test for core accounting paths.

## 3. Run Local Auditor

Deterministic pass:

```bash
python scripts/quality/audit_local_repo.py \
  --repo-root /path/to/repo \
  --scan-id handoff-audit \
  --write-findings-jsonl
```

Deterministic + Sierra confirmation:

```bash
python scripts/quality/audit_local_repo.py \
  --repo-root /path/to/repo \
  --scan-id handoff-audit-sierra \
  --sierra-confirm \
  --allow-build \
  --write-findings-jsonl
```

Warning: `--allow-build` may execute repository build steps/tooling.
Use build mode only on trusted code, or run in an isolated environment.

## 4. Apply Findings

- Prioritize by severity, then confidence.
- For each accepted finding: patch code + add a regression test.
- For each rejected finding: document explicit guard/path that blocks exploit.

## 5. Re-run and Freeze Evidence

- Re-run local audit until findings are expected.
- Keep generated `*.md`, `*.json`, and `*.jsonl` outputs as PR evidence artifacts.
