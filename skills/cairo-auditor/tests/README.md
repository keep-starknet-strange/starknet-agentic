# Preflight Fixtures

This directory holds deterministic fixtures for `skills/cairo-auditor/scripts/quality/audit_local_repo.py`.

## Run

```bash
python3 skills/cairo-auditor/tests/validate_preflight.py
```

The check runs deterministic fixture repos:

- `insecure_upgrade_controller` (expects known upgrade-related findings)
- `secure_upgrade_controller` (expects zero findings)
- `insecure_embed_upgrade_controller` (same upgrade findings under `#[abi(embed_v0)]`)
- `insecure_per_item_upgrade_controller` (same upgrade findings under `#[abi(per_item)]`)
- `caller_read_without_auth` (ensures caller-read bookkeeping does not bypass auth checks)
- `guarded_upgrade_without_timelock` (ensures owner-guarded single-step upgrades do not trigger timelock finding)
