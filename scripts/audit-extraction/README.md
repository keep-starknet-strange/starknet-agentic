# Audit Extraction

Utilities and templates to convert raw audit text into normalized records under `datasets/audits/`.

Suggested flow:

1. Parse raw audit text into candidate findings.
2. Normalize fields to schema.
3. Redact sensitive identifiers.
4. Validate record completeness.
5. Export to dataset and link to evaluator cases.

## Batch Download + Extract

Install tools:

- `pdftotext` (poppler)
- `mutool` (mupdf-tools, optional fallback)

Run:

```bash
scripts/audit-extraction/fetch-and-extract.sh scripts/audit-extraction/urls.example.txt
```

Notes:

- `datasets/audits/raw/` and `datasets/audits/extracted/` are local working dirs.
- GitHub `blob` URLs are converted automatically to raw download URLs.

## Next Pipeline Step

After extraction, use `scripts/audit-pipeline/` to:

1. generate manifest hashes
2. segment extracted text
3. validate normalized outputs
