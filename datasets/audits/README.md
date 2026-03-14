# Audit Ingest Artifacts

This directory contains stage-1 ingest artifacts:

- `raw/`: source PDFs
- `extracted/`: plain text extracted from source artifacts

For downstream stages, see:

- `../manifests/` for provenance registry
- `../segments/` for chunking outputs
- `../normalized/` for structured records
- `../distilled/` for skill-ready security artifacts

Rules:

- Do not commit confidential/private reports without explicit approval.
- Keep file names stable for reproducible manifests.
