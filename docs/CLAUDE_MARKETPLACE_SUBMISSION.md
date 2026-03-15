# Claude Marketplace Submission Runbook

This runbook is the production path for publishing the Starknet skills bundle
to the official Claude plugin directory flow.

## Official Submission Surface

- Directory repo: `anthropics/claude-plugins-official`
- Submission form: `https://docs.google.com/forms/d/e/1FAIpQLSfLBpiW2R5B3sArM_O4xY6rL95sp38h8f11ykhP4lA5KzR8aA/viewform`

## Pre-Submission Checklist

Run these from repository root:

```bash
python3 scripts/quality/validate_marketplace.py
python3 scripts/quality/validate_skills.py
python3 scripts/skills_manifest.py --check
python3 scripts/quality/check_codex_distribution.py
python3 -m unittest scripts/quality/test_codex_distribution.py
```

Ensure these files are current:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `VERSION`
- `skills/manifest.json`
- `skills/README.md` install docs

## Submission Steps

1. Publish or confirm a release tag/commit that install docs reference.
2. Submit plugin metadata through the official submission form.
3. Track review status and requested changes in a dedicated issue/PR.
4. After approval, verify install from a clean environment:
   - `/plugin marketplace add keep-starknet-strange/starknet-agentic`
   - `/plugin install starknet-agentic-skills@starknet-agentic-skills --scope local`
   - `/reload-plugins`
   - invoke `/starknet-agentic-skills:cairo-auditor`

## Maintenance Policy

- Any change to `.claude-plugin/**` must pass `validate_marketplace.py`.
- Any public install command changes must be mirrored in:
  - `README.md`
  - `skills/README.md`
  - `skills/cairo-auditor/README.md`
- Update this runbook when marketplace requirements change.

Last reviewed: `2026-03-15`.
