# Scripts

Use scripts in this directory to transform raw audit text into normalized finding records.

## `quality/audit_local_repo.py`

Deterministic preflight scanner used by `cairo-auditor` in default/deep full-repo mode.

### Usage

```bash
python3 skills/cairo-auditor/scripts/quality/audit_local_repo.py \
  --repo-root /path/to/repo \
  --scan-id preflight \
  --output-dir /tmp
```

### Output

- Writes JSON + Markdown preflight artifacts to `--output-dir`.
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
