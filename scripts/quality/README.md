# Quality Scripts

- `validate_skills.py`: skill contract/lint checks for SKILL.md structure and links.
- `test_validate_skills.py`: regression tests for validator edge cases such as the root SKILL router.
- `validate_marketplace.py`: enforces `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` parity (name/version/source/description/author and skill path validity).
- `parity_check.py`: required repository parity and local tool checks.
- `check_codex_distribution.py`: validates Codex-facing install/discovery surface (`.agents/skills` symlinks, public-skill `openai.yaml`, and install docs markers).
- `test_codex_distribution.py`: regression tests for Codex distribution validation.
- `check_vulndb_parity.py`: enforces benchmark/detector class parity with `skills/cairo-auditor/references/vulnerability-db/`.
- `check_attack_vector_coverage.py`: enforces minimum attack-vector corpus size and unique vector IDs.
- `check_semgrep_vector_coverage.py`: enforces Semgrep `attack_vectors_core` metadata covers core vectors `1..80`.

## Cairo Auditor Benchmarks

- `benchmark_cairo_auditor.py`
  - deterministic detector benchmark over JSONL case packs
  - emits markdown scorecards
  - enforces precision/recall + per-class recall thresholds
- `score_external_triage.py`
  - computes precision/recall from manually labeled external findings
  - emits release scorecard + trend table
  - tracks labeled coverage against full findings and emits unlabeled backlog queue
- `check_manual_gold_recall.py`
  - validates recall against frozen manual gold findings
  - emits markdown/json recall reports
- `audit_local_repo.py`
  - single-entry local repo audit command
  - runs deterministic detectors on local `.cairo` files
  - optionally runs Sierra confirmation (`--sierra-confirm [--allow-build]`)
  - defaults to timestamped outputs under `<repo-root>/evals/reports/local/`
  - supports CI-friendly failure mode (`--fail-on-findings`)

## External Scan Tooling

- `scan_external_repos.py`
  - clones configured repos and scans production-scoped `.cairo` files
  - emits JSON/JSONL/markdown artifacts
  - isolates per-repo failures so one repo does not abort the full scan
- `compare_scan_artifacts.py`
  - compares two scan JSON artifacts
  - outputs class/file deltas and added/removed findings

## Contract-Skill Benchmarks

- `benchmark_contract_skills.py`
  - deterministic contract fixture benchmark for authoring/testing/toolchain skills
  - case pack: `evals/cases/contract_skill_benchmark.jsonl`
  - validates `scarb build`, `snforge test`, and source must-match/must-not-match assertions
  - reports security-class coverage (`auth`, `timelock`, `upgrade_safety`, etc.)
  - enforces precision/recall thresholds
  - supports reportable-gate thresholds (`--min-evaluated`, `--enforce-min-evaluated`)
  - defaults to `60` minimum evaluated cases for reportable interpretation
  - fails on zero evaluated cases unless `--allow-empty-evaluated` is explicitly set
- `mutation_test_contract_benchmark.py`
  - mutates secure fixtures and reruns the benchmark
  - every mutation must be caught by the benchmark gate
- `render_contract_benchmark_trend.py`
  - aggregates `evals/scorecards/v*-contract-skill-benchmark.md`
  - marks releases reportable/non-reportable by minimum-case policy
  - tracks consecutive reportable releases for KPI readiness
- `check_contract_kpi_release_gate.py`
  - enforces KPI publication policy
  - requires minimum consecutive reportable releases + explicit security signoff

## LLM and Sierra Signals

- `run_llm_eval.py`
  - held-out LLM evaluation tier via GitHub Models API
- `sierra_parallel_signal.py`
  - Sierra-native auxiliary confirmation pass
  - resolves workspace/member target directories via `scarb metadata`
  - in build mode, retries toolchains (`scarb`, and `asdf`-managed versions when available) and `--ignore-cairo-version` fallback
  - parses `.sierra.json`, `.starknet_artifacts.json`, and `*.contract_class.json`
  - emits function-order signal (`external_call` before `state_write`) for CEI triage
- `run_contract_generation_eval.py`
  - build-side contract generation quality evaluation
  - prompt pack: `evals/cases/contract_skill_generation_eval.jsonl`
  - generates fixture `src/lib.cairo`, then runs build/test/static policy checks
  - emits markdown/json reports with pass/vulnerability rates
  - intended as informative calibration telemetry (`continue-on-error` in workflow)
- `run_caracal_adapter.py`
  - optional Caracal adapter for Sierra-level auxiliary analysis
  - fail-open by default when Caracal is unavailable
- `run_semgrep_cairo.py`
  - optional Semgrep adapter using `skills/cairo-auditor/references/semgrep/rules/`
  - fail-open by default when Semgrep is unavailable

## Quick Start

Run a local deterministic audit:

```bash
python scripts/quality/audit_local_repo.py \
  --repo-root /path/to/your/cairo-repo \
  --scan-id local-audit
```

Run local audit + Sierra confirmation (build mode):

```bash
python scripts/quality/audit_local_repo.py \
  --repo-root /path/to/your/cairo-repo \
  --scan-id local-audit-sierra \
  --sierra-confirm \
  --allow-build
```

Warning: any command using `--allow-build` (for example `audit_local_repo.py` and
`run_caracal_adapter.py`) may execute repository build steps/tooling. Use build
mode only on trusted code, or run in an isolated environment.

Fail CI if any findings are detected:

```bash
python scripts/quality/audit_local_repo.py \
  --repo-root /path/to/your/cairo-repo \
  --scan-id local-audit-ci \
  --fail-on-findings
```

Write findings JSONL artifact:

```bash
python scripts/quality/audit_local_repo.py \
  --repo-root /path/to/your/cairo-repo \
  --scan-id local-audit-jsonl \
  --write-findings-jsonl
```

By default, the script writes:

- `evals/reports/local/<safe-scan-id>-<timestamp>.json`
- `evals/reports/local/<safe-scan-id>-<timestamp>.md`
- If a filename already exists, the script appends `-N` before extension to avoid overwrite.
  The script also slugifies `--scan-id` into `<safe-scan-id>` (lowercase alphanumeric with `-`/`_`,
  and repeated `-` runs are collapsed to a single dash).

JSONL behavior:

- `--write-findings-jsonl` writes to:
  `evals/reports/local/<safe-scan-id>-<timestamp>.findings.jsonl`
- `--output-findings-jsonl /custom/path/file.jsonl` writes to the provided path
  (and overrides the default location).

Run auxiliary adapters (optional, non-blocking):

```bash
python scripts/quality/run_caracal_adapter.py \
  --repo-root /path/to/your/cairo-repo \
  --allow-build \
  --output-json /path/to/output/caracal-adapter.json \
  --output-md /path/to/output/caracal-adapter.md

python scripts/quality/run_semgrep_cairo.py \
  --repo-root /path/to/your/cairo-repo \
  --output-json /path/to/output/semgrep-adapter.json \
  --output-md /path/to/output/semgrep-adapter.md
```

Exit code behavior:

- `0`: success
- `2`: findings present with `--fail-on-findings`
