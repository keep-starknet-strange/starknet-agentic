# Audit Manifests

`audits.jsonl` is the canonical ingest/provenance registry.
`audit_catalog.json` is the broader intake inventory (includes rows that may be skipped due to source/rights constraints).
`audit_ingest_report.jsonl` records per-row ingest outcomes and skip reasons.

Ingest policy:

- canonical manifest deduplicates identical PDF content by hash
- skipped duplicates are tracked in `audit_ingest_report.jsonl` (`duplicate_content_of:<audit_id>`)

Each record must include:

- stable `audit_id`
- source URLs
- local artifact paths
- sha256 hashes for raw/extracted artifacts
- `source_sha256` for provenance verification
- project/auditor/date metadata
- rights metadata (`license`, `usage_rights`, `redaction_status`)
- extractor metadata (`extractor_version`)
- date precision preserved from source (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`)
