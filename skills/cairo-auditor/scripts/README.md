# Scripts

Use scripts in this directory to transform raw audit text into normalized finding records.

## `quality/audit_local_repo.py`

Deterministic preflight scanner used by `cairo-auditor` in default/deep full-repo mode.
When this skill is run from the full repository, it also loads the canonical
benchmark detector map from `scripts/quality/benchmark_cairo_auditor.py`.
Standalone skill installs keep the local parser detectors.

### Usage

```bash
python3 skills/cairo-auditor/scripts/quality/audit_local_repo.py \
  --repo-root /path/to/repo \
  --scan-id preflight \
  --output-dir /tmp
```

### Output

- Writes JSON + Markdown preflight artifacts to `--output-dir`.
- Artifact names follow `<scan-id>-YYYYMMDD-HHMMSSZ.json` and `<scan-id>-YYYYMMDD-HHMMSSZ.md`.
- Prints a compact JSON summary to stdout with:
  - `findings`
  - `class_counts`
  - `severity_counts`
  - artifact paths

### Parser Coverage

The preflight parser currently inspects externally callable functions declared via:

- legacy `#[external(v0)]` decorators
- modern `#[abi(embed_v0)]` impl blocks

Functions outside those patterns are not part of deterministic preflight coverage and should be
reviewed by vector/deep-agent passes.

## `doctor.sh`

One-command post-run validation for deep audits.

### Usage

```bash
bash skills/cairo-auditor/scripts/doctor.sh --report-dir .
```

Optional flags:

- `--workdir /path/to/workdir` (defaults to `$CAIRO_AUDITOR_WORKDIR` or `/tmp`)
- `--report-dir /path/to/repo`
- `--report /path/to/security-review-*.md`

### What it validates

- host capabilities artifact exists,
- vector bundle artifacts `1..4` exist with non-zero lines,
- report exists and includes `Execution Integrity` and `Execution Trace`.

## `quality/surface_map.py`

Builds a compact static map of Cairo functions, exposed entrypoints, storage
writes, external calls, auth guards, upgrade paths, session hooks, and local
call edges.

```bash
python3 skills/cairo-auditor/scripts/quality/surface_map.py \
  --repo-root /path/to/repo \
  --scope-file /tmp/cairo-audit-files.txt \
  --output-json /tmp/cairo-audit-surface-map.json \
  --output-md /tmp/cairo-audit-surface-map.md
```

Deep mode gives the Markdown map to Agent 5 before free-form adversarial
reasoning.

## `quality/structured_report.py`

Renders specialist JSON outputs into the canonical Markdown report after
deduplication and evidence-tag normalization.

```bash
python3 skills/cairo-auditor/scripts/quality/structured_report.py \
  --repo-root /path/to/repo \
  --mode deep \
  --workdir /tmp/cairo-auditor.run \
  --scope-file /tmp/cairo-auditor.run/cairo-audit-files.txt \
  --agent-output /tmp/cairo-auditor.run/cairo-audit-agent-5-findings.json \
  --output-md /tmp/cairo-auditor.run/security-review.md \
  --output-json /tmp/cairo-auditor.run/security-review.json
```

## `quality/deep_integrity.py`

Creates and validates deep-mode integrity artifacts.

```bash
python3 skills/cairo-auditor/scripts/quality/deep_integrity.py init \
  --workdir /tmp/cairo-auditor.run \
  --host codex \
  --vector-model gpt-5.4 \
  --adversarial-model gpt-5.4

python3 skills/cairo-auditor/scripts/quality/deep_integrity.py check \
  --workdir /tmp/cairo-auditor.run \
  --mode deep \
  --report /tmp/cairo-auditor.run/security-review.md
```
