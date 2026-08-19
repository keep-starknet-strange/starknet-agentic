# Structured Findings Contract

Specialists emit structured JSON only. Markdown is rendered by the orchestrator
after merge, dedupe, evidence tagging, and threshold handling.

## Agent Output

Each specialist final response must be a JSON object:

```json
{
  "agent_id": 1,
  "findings": [],
  "dropped_candidates": []
}
```

`findings` entries use the fields below:

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | Short human-readable title. |
| `class_id` | yes | Canonical vulnerability class. |
| `root_cause` | yes | Stable dedupe key. Same root cause across agents should match. |
| `file` | yes | Repo-relative Cairo path. |
| `line` | no | Best-effort 1-based line. |
| `priority` | yes | `P0`, `P1`, `P2`, or `P3`. |
| `severity` | yes | `Critical`, `High`, `Medium`, or `Low`. |
| `confidence` | yes | Integer `0..100` after FP-gate deductions. |
| `description` | yes | Concrete exploit path and impact. |
| `attack_path` | yes | Caller -> entrypoint -> state transition -> impact. |
| `guard_analysis` | yes | Existing guards and why they do or do not block impact. |
| `recommended_fix` | yes for confidence >= 75 | Diff text or exact remediation. |
| `required_tests` | yes for confidence >= 75 | Regression and guard tests. |
| `evidence_tags` | yes | Must include `[CODE-TRACE]`; Agent 5 also includes `[ADVERSARIAL]`. |

`dropped_candidates` entries use:

| Field | Required | Notes |
| --- | --- | --- |
| `candidate` | yes | Candidate title or short path. |
| `class` | yes | Candidate vulnerability class. |
| `drop_reason` | yes | `false_positive`, `duplicate_root_cause`, `below_confidence_threshold`, or `insufficient_evidence`. |

## Merge Rules

- Parse specialist JSON before rendering any Markdown.
- Reject malformed specialist output and rerun that specialist once.
- Deduplicate by `root_cause`, then keep higher confidence, then higher priority,
  then more complete path evidence.
- Add `[CROSS-AGENT]` when the same root cause appears from two or more agents.
- Add `[PREFLIGHT-HIT]` when deterministic preflight flagged the same class or
  entry point.
- Add `[ADVERSARIAL]` when Agent 5 reports or confirms the root cause.
- Render the final Markdown with `scripts/quality/structured_report.py`.
