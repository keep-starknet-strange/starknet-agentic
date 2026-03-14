# Datasets

This directory contains the audit-to-skills data pipeline outputs.

Pipeline stages:

1. `ingest` -> raw PDF + extracted text
2. `segment` -> traceable chunks with page bounds
3. `normalize` -> structured audit metadata + finding records
4. `distill` -> canonical vulnerability cards, fix patterns, and test recipes
5. `skillize` -> references consumed by module skills

Policy:

- Canonical source-of-truth is under `datasets/manifests`, `datasets/normalized`, and `datasets/distilled`.
- `cairo-auditor/references/audit-findings/source-cairo-security-import.md` is generated/compiled reference material and is not a manual ingestion source.

## Layout

- `audits/` raw and extracted source artifacts
- `manifests/` provenance metadata (`audits.jsonl`)
- `segments/` segmentation artifacts per audit
- `normalized/` audit metadata + finding records + schemas
- `distilled/` canonical reusable security content
