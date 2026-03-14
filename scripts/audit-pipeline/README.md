# Audit Pipeline Scripts

Prerequisite:

- `python3 -m pip install jsonschema`

## 1) Generate manifest hashes

```bash
python3 scripts/audit-pipeline/generate_manifest.py \
  --seed datasets/manifests/audit_metadata.seed.json \
  --output datasets/manifests/audits.jsonl
```

Seed rows require provenance rights fields:

- `source_sha256`
- `license`
- `usage_rights`
- `redaction_status`
- `extractor_version`

## 0) Ingest from a catalog list (wave imports)

Prerequisites:

- `pdftotext` (Poppler) or `mutool` (MuPDF) installed and available in `PATH`.
- `ingest_catalog.py` exits early if neither extractor is present.

```bash
python3 scripts/audit-pipeline/ingest_catalog.py \
  --catalog datasets/manifests/audit_catalog.json \
  --seed-out datasets/manifests/audit_metadata.seed.json \
  --report-out datasets/manifests/audit_ingest_report.jsonl
```

Notes:

- Only rows marked audited are attempted.
- Unsupported sources (e.g., HTML index pages, Drive links) are recorded in the report with explicit skip reasons.
- Content duplicates are deduplicated before seed generation (`duplicate_content_of:<audit_id>` in report).

## 2) Segment extracted text

```bash
python3 scripts/audit-pipeline/segment_text.py \
  --audit-id csc_vesu_update_2025_03 \
  --input datasets/audits/extracted/Vesu_Update_Audit_Report.txt \
  --output datasets/segments/csc_vesu_update_2025_03.jsonl
```

Notes:

- Table-of-contents noise, common watermark fragments, and oversized test-output sections are filtered automatically.
- Finding segments are expected to include `File(s):` markers for downstream normalization.
- Held-out audit IDs listed in `evals/heldout/audit_ids.txt` are blocked from segmentation output.

## 3) Validate normalized records

```bash
python3 scripts/audit-pipeline/validate_json.py \
  --schema datasets/normalized/audit.schema.json \
  --glob 'datasets/normalized/audits/*.json'

python3 scripts/audit-pipeline/validate_jsonl.py \
  --schema datasets/normalized/finding.schema.json \
  --jsonl datasets/normalized/findings/csc_vesu_update_2025_03.findings.jsonl
```

Notes:

- Validator reports malformed JSON line-by-line and rejects non-object JSON rows.
- Validator enforces held-out policy by rejecting records whose `audit_id` or `source_audit_id` appears in `evals/heldout/audit_ids.txt`.

## 3b) Normalize full corpus from extracted text

```bash
python3 scripts/audit-pipeline/normalize_corpus.py \
  --manifest datasets/manifests/audits.jsonl \
  --audits-dir datasets/normalized/audits \
  --findings-dir datasets/normalized/findings \
  --overwrite
```

Notes:

- This pass is heuristic and intended to bootstrap broad coverage quickly.
- Follow-up manual curation remains required for high-confidence distillation.

## 4) Verify no held-out leakage in datasets

```bash
python3 scripts/audit-pipeline/check_no_heldout_leak.py
```
