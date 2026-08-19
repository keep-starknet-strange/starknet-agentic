# Preflight Fixtures

This directory holds deterministic fixtures for `skills/cairo-auditor/scripts/quality/audit_local_repo.py`.

## Run

```bash
python3 skills/cairo-auditor/tests/validate_preflight.py
python3 skills/cairo-auditor/tests/validate_deep_smoke.py
```

The check runs deterministic fixture repos:

- `insecure_upgrade_controller` (expects known upgrade-related findings)
- `secure_upgrade_controller` (expects zero findings)
- `insecure_embed_upgrade_controller` (same upgrade findings under `#[abi(embed_v0)]`)
- `insecure_per_item_upgrade_controller` (same upgrade findings under `#[abi(per_item)]`)
- `caller_read_without_auth` (ensures caller-read bookkeeping does not bypass auth checks)
- `guarded_upgrade_without_timelock` (ensures owner-guarded single-step upgrades do not trigger timelock finding)
- `unchecked_fee_bound` (ensures local preflight bridges into benchmark detector coverage)
- `adversarial_cross_function_vault` (intentionally not caught by preflight; used to validate deep-mode structured rendering and Agent 5 evidence tags)

`validate_deep_smoke.py` adds CI gating for deep-mode contract integrity by asserting:

- vulnerable fixture scan still produces at least one deterministic finding,
- adversarial fixture stays deterministic-clean,
- surface map generation exposes the cross-function payout path,
- structured report rendering can carry an Agent 5-only finding with `[ADVERSARIAL]`,
- deep integrity helper validates required artifacts,
- report contract still exposes execution integrity + trace sections,
- canonical ordering includes `Dropped Candidates`.
