# Semgrep Adapter Rules (Cairo Auditor)

This directory contains optional Semgrep rules used as an auxiliary detector layer.

Design goals:
- fail-open in CI/local runs when Semgrep is unavailable,
- fast pattern coverage for high-signal classes,
- no replacement for deterministic detector and FP gate workflow.

Important:
- All generic Semgrep rules in this directory are low-confidence triage hints.
- CEI-oriented matches require manual ordering validation.
- Access-control mutation matches require manual guard-path validation.

Runner:
- `scripts/quality/run_semgrep_cairo.py`
- `scripts/quality/check_semgrep_vector_coverage.py`

Default config:
- `skills/cairo-auditor/references/semgrep/rules/`

Rule packs:
- `rules/access-upgrade.yaml`
- `rules/external-calls.yaml`
- `rules/math-economic.yaml`
- `rules/storage-trust.yaml`

Coverage contract:
- `attack_vectors_core` metadata in Semgrep rules must cover core vectors `1..80`.
- CI enforces this via `scripts/quality/check_semgrep_vector_coverage.py`.
