# Held-out Evaluation Set

This directory tracks evaluation inputs excluded from distillation/training artifacts.

Current held-out source:

- `evals/cases/case-aa-self-call-session.json`
- `evals/heldout/audit_ids.txt` (pipeline-enforced blocklist for audit IDs)
- `evals/heldout/cairo_auditor_llm_eval_cases.jsonl` (LLM-scored case pack kept outside distillation inputs)

Policy:

- Do not copy held-out records into any `datasets/*` artifact (`segments`, `normalized`, or `distilled`).
- Use held-out cases for regression checks of recall and false positives.
